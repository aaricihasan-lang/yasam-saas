"use client";

/**
 * Yaşam Hafızası™ — Kapsam & Replay (yalnız ana yönetici).
 *
 * Mesleki Hafıza kapsamını kaynak × gerçek tenant bazında ölçer; YALNIZ açık bulunan
 * kombinasyonlarda historical replay olaylarını outbox'a ekler ve kuyruğu süre bütçesiyle işler.
 * Index'e doğrudan yazmaz; her olay worker'ın güvenlik kapılarından geçer. Sonuçlar
 * (indexed / deindexed / dışlandı) outbox `last_outcome` dağılımında görünür.
 */

import { useCallback, useMemo, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { YH_REPLAY_SOURCE_KEYS, type YhReplayMode } from "@/lib/yasam-hafizasi/replay/replayRequest";

type CoverageRow = {
  tenantId: string;
  sourceRows: number;
  eligible: number;
  indexed: number;
  missing: number;
  stale: number;
};
type ProgressRow = { status: string | null; outcome: string | null; replay: boolean; n: number };

function headers(): Record<string, string> {
  const u = readYasamUser();
  const h: Record<string, string> = { "x-admin-id": u?.id ?? "", "Content-Type": "application/json" };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  return h;
}

async function call<T>(body: Record<string, unknown>): Promise<{ ok: boolean; data?: T; code?: string }> {
  try {
    const res = await fetch("/api/admin/yasam-hafizasi/replay", { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json || json.ok !== true) {
      const code = json && typeof json.error === "object" && json.error !== null ? String((json.error as { code?: unknown }).code ?? "") : "";
      return { ok: false, code: code || `http-${res.status}` };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: "network" };
  }
}

export default function YasamHafizasiReplayPage() {
  useBfcacheRefresh();
  const ownTenant = useMemo(() => readYasamUser()?.tenant_id ?? null, []);
  const [sourceKey, setSourceKey] = useState<string>(YH_REPLAY_SOURCE_KEYS[0]);
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressRow[] | null>(null);

  const note = useCallback((line: string) => setLog((l) => [`${new Date().toLocaleTimeString("tr-TR")} · ${line}`, ...l].slice(0, 200)), []);

  const measure = useCallback(async () => {
    setBusy("coverage");
    const r = await call<{ rows: CoverageRow[] }>({ action: "coverage", sourceKey });
    setBusy(null);
    if (!r.ok || !r.data) { note(`Kapsam ölçülemedi (${r.code})`); return; }
    setRows(r.data.rows);
    note(`${sourceKey}: ${r.data.rows.length} gerçek tenant ölçüldü`);
  }, [sourceKey, note]);

  const enqueueAll = useCallback(async (tenantId: string, mode: YhReplayMode) => {
    setBusy(`enqueue:${tenantId}:${mode}`);
    let afterId: string | null = null;
    let total = 0;
    for (let page = 0; page < 200; page += 1) {
      const r: { ok: boolean; data?: { enqueued: number; lastId: string | null; done: boolean }; code?: string } =
        await call({ action: "enqueue", sourceKey, tenantId, mode, limit: 200, afterId });
      if (!r.ok || !r.data) { note(`Kuyruğa alma durdu (${r.code})`); break; }
      total += r.data.enqueued;
      afterId = r.data.lastId;
      if (r.data.done || afterId === null) break;
    }
    setBusy(null);
    note(`${sourceKey} · ${tenantId.slice(0, 8)} · ${mode}: ${total} olay kuyruğa alındı`);
  }, [sourceKey, note]);

  const drain = useCallback(async () => {
    setBusy("drain");
    for (let round = 0; round < 100; round += 1) {
      const r = await call<{ claimed: number; completed: number; failedPermanent: number; failedTransient: number; outcomes: Record<string, number>; hasMore: boolean }>({ action: "drain", maxEvents: 500 });
      if (!r.ok || !r.data) { note(`İşleme durdu (${r.code})`); break; }
      const o = Object.entries(r.data.outcomes ?? {}).map(([k, v]) => `${k}=${v}`).join(", ");
      note(`İşlendi: ${r.data.claimed} (tamam ${r.data.completed}, kalıcı hata ${r.data.failedPermanent}, geçici ${r.data.failedTransient}) ${o}`);
      if (r.data.failedPermanent > 0) { note("Kalıcı hata var — devam etmeden önce inceleyin."); break; }
      if (!r.data.hasMore) break;
    }
    setBusy(null);
  }, [note]);

  const loadProgress = useCallback(async () => {
    setBusy("progress");
    const r = await call<{ rows: ProgressRow[] }>({ action: "progress", sourceKey });
    setBusy(null);
    if (!r.ok || !r.data) { note(`İlerleme okunamadı (${r.code})`); return; }
    setProgress(r.data.rows);
  }, [sourceKey, note]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Yaşam Hafızası · Kapsam &amp; Replay</h1>
        <p className="mt-1 text-sm text-slate-600">
          Yalnız açığı olan kaynak × uzman kombinasyonlarını kuyruğa alın. Index&apos;e doğrudan yazılmaz;
          her kayıt güvenlik kapılarından geçer. Kör tam replay yapmayın (owner tenant hariç).
        </p>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="yh-src">Kaynak</label>
        <select id="yh-src" value={sourceKey} onChange={(e) => { setSourceKey(e.target.value); setRows(null); setProgress(null); }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {YH_REPLAY_SOURCE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => void measure()}>Kapsamı ölç</button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => void drain()}>Kuyruğu işle</button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => void loadProgress()}>Sonuç dağılımı</button>
        {busy ? <span className="text-xs text-slate-500" aria-live="polite">Çalışıyor…</span> : null}
      </section>

      {rows ? (
        <div className="mb-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Tenant</th><th className="px-3 py-2">Kaynak</th><th className="px-3 py-2">Uygun</th>
                <th className="px-3 py-2">İndeksli</th><th className="px-3 py-2">Eksik</th><th className="px-3 py-2">Bayat</th><th className="px-3 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOwner = ownTenant !== null && r.tenantId === ownTenant;
                return (
                  <tr key={r.tenantId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{r.tenantId.slice(0, 8)}{isOwner ? " (siz)" : ""}</td>
                    <td className="px-3 py-2">{r.sourceRows}</td><td className="px-3 py-2">{r.eligible}</td>
                    <td className="px-3 py-2">{r.indexed}</td>
                    <td className={`px-3 py-2 ${r.missing > 0 ? "font-semibold text-amber-700" : ""}`}>{r.missing}</td>
                    <td className={`px-3 py-2 ${r.stale > 0 ? "font-semibold text-rose-700" : ""}`}>{r.stale}</td>
                    <td className="flex flex-wrap gap-1 px-3 py-2">
                      {r.missing > 0 ? <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void enqueueAll(r.tenantId, "missing")}>Eksikleri kuyruğa al</button> : null}
                      {isOwner && r.eligible > 0 ? <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void enqueueAll(r.tenantId, "all")}>Tümünü kuyruğa al</button> : null}
                      {r.stale > 0 ? <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void enqueueAll(r.tenantId, "orphans")}>Bayatları temizle</button> : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-3 text-slate-500">Gerçek kullanıcılı tenant bulunamadı.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {progress ? (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <h2 className="mb-2 font-semibold text-slate-800">Outbox sonuç dağılımı · {sourceKey}</h2>
          <ul className="space-y-0.5 font-mono text-xs">
            {progress.map((p, i) => <li key={i}>{p.status ?? "-"} · {p.outcome ?? "-"} · {p.replay ? "replay" : "cdc"} · {p.n}</li>)}
            {progress.length === 0 ? <li>Kayıt yok</li> : null}
          </ul>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">İşlem günlüğü</h2>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto font-mono text-xs text-slate-700">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </section>
    </main>
  );
}
