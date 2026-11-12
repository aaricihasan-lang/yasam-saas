"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Üye Detayı V2 — 7 günlük deneme yönetimi (Deneme Üyeleri ekranıyla AYNI uçlar, AYNI istek gövdeleri, AYNI koşullar).
 *   Okuma : GET  /api/admin/trials?status=all&q=<e-posta>  → satır kimliğe göre seçilir (yeni uç YOK)
 *   İşlem : PATCH /api/admin/trials/[id]  { action: "limits" | "review" | "clear_review" | "suspend" | "resume" | "dismiss_pro_request" }
 * Yetki ve doğrulama sunucudadır (verifyAdminRequest + SECURITY DEFINER RPC; modül limiti ortak limiti aşamaz — DB doğrular).
 * Deneme Üyeleri ekranı değişmez; burası yalnız aynı işlemlere detaydan erişimdir.
 */
export type TrialPhase = "not_started" | "active" | "expired" | "review" | "suspended" | "converted";
type CreditModule = "astrology" | "human_design" | "numerology";
export type TrialRow = {
  id: string;
  email: string | null;
  phase: TrialPhase;
  trial_ends_at: string | null;
  review_reason: string | null;
  risk_flags: string[];
  daily_limit: number;
  module_limits: Partial<Record<CreditModule, number>>;
  pro_request_at: string | null;
  used_total: number;
  used_by_module: Partial<Record<CreditModule, number>>;
};
const CREDIT_LABEL: Record<CreditModule, string> = { astrology: "Gökyüzü Atlası", human_design: "Human Design", numerology: "Numeroloji" };
const PHASE_LABEL: Record<TrialPhase, string> = {
  not_started: "Başlamamış",
  active: "Aktif",
  expired: "Süresi dolmuş",
  review: "İncelemede",
  suspended: "Durdurulmuş",
  converted: "Pro'ya geçti",
};

type Notify = (type: "success" | "error", message: string) => void;
type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; row: TrialRow };

/** Detay sayfası tek kez çağırır; iki sunum parçası (kredi / durum) aynı satırı paylaşır. */
export function useTrialManagement(opts: {
  enabled: boolean;
  userId: string;
  email: string;
  headers: (json: boolean) => Record<string, string>;
  notify: Notify;
  /** Başarılı işlemden sonra (ör. üye bilgisini yeniden yükle). */
  onChanged?: () => void;
}) {
  const { enabled, userId, email, headers, notify, onChanged } = opts;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const qs = new URLSearchParams({ status: "all", q: email.slice(0, 100) });
    fetch(`/api/admin/trials?${qs.toString()}`, { headers: headers(false), cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { rows?: TrialRow[]; error?: string };
        if (!alive) return;
        if (!r.ok) return setState({ kind: "error", message: j.error ?? "Deneme bilgisi okunamadı." });
        const row = (j.rows ?? []).find((x) => x.id === userId);
        setState(row ? { kind: "ready", row } : { kind: "missing" });
      })
      .catch(() => alive && setState({ kind: "error", message: "Sunucuya ulaşılamadı." }));
    return () => {
      alive = false;
    };
  }, [enabled, userId, email, headers, tick]);

  const act = useCallback(
    async (body: Record<string, unknown>, okMsg: string): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      try {
        const r = await fetch(`/api/admin/trials/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: headers(true),
          body: JSON.stringify(body),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) {
          notify("error", j.error ?? "İşlem tamamlanamadı.");
          return false;
        }
        notify("success", okMsg);
        setTick((x) => x + 1);
        onChanged?.();
        return true;
      } catch {
        notify("error", "Sunucuya ulaşılamadı.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, userId, headers, notify, onChanged],
  );

  return { state, busy, act };
}

type Mgmt = ReturnType<typeof useTrialManagement>;

function StateNote({ state }: { state: State }) {
  if (state.kind === "loading") return <p className="text-sm font-medium text-slate-500">Deneme bilgisi yükleniyor…</p>;
  if (state.kind === "missing")
    return (
      <p className="text-sm font-medium text-slate-600">
        Bu hesap için deneme kaydı bulunamadı.{" "}
        <Link href="/admin/deneme-uyeleri" className="font-black underline underline-offset-2">Deneme Üyeleri</Link>
      </p>
    );
  if (state.kind === "error") return <p className="text-sm font-bold text-rose-800" role="alert">{state.message}</p>;
  return null;
}

/** Modüller ve Kredi sekmesi: günlük ortak Roxy kredisi + üyeye özel limitler. */
export function TrialCreditPanel({ mgmt }: { mgmt: Mgmt }) {
  const { state, busy, act } = mgmt;
  const row = state.kind === "ready" ? state.row : null;
  const [draft, setDraft] = useState<{ key: string; daily: string; mods: Record<CreditModule, string> } | null>(null);
  const rowKey = row ? `${row.id}:${row.daily_limit}:${JSON.stringify(row.module_limits)}` : "";
  const cur =
    draft && draft.key === rowKey
      ? draft
      : row
        ? {
            key: rowKey,
            daily: String(row.daily_limit),
            mods: {
              astrology: row.module_limits.astrology == null ? "" : String(row.module_limits.astrology),
              human_design: row.module_limits.human_design == null ? "" : String(row.module_limits.human_design),
              numerology: row.module_limits.numerology == null ? "" : String(row.module_limits.numerology),
            },
          }
        : null;
  if (!row || !cur) return <StateNote state={state} />;
  const save = () => {
    const moduleLimits: Record<string, number> = {};
    for (const [k, v] of Object.entries(cur.mods)) if (v.trim() !== "") moduleLimits[k] = Number(v);
    void act({ action: "limits", dailyLimit: Number(cur.daily), moduleLimits }, "Kredi limitleri kaydedildi.");
  };
  const pct = row.daily_limit > 0 ? Math.min(100, Math.round((row.used_total / row.daily_limit) * 100)) : 100;
  return (
    <div className="grid gap-3" data-trial-credit>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-slate-700">Bugün kullanılan</span>
        <b className="tabular-nums text-slate-900">
          {row.used_total} / {row.daily_limit}
        </b>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`Bugün ${row.used_total} / ${row.daily_limit} kredi`}>
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs font-medium text-slate-600">
        Modül bazında bugün:{" "}
        {(Object.keys(CREDIT_LABEL) as CreditModule[]).map((k) => `${CREDIT_LABEL[k]} ${row.used_by_module[k] ?? 0}`).join(" · ")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Günlük ortak kredi (0–1000)
          <input
            inputMode="numeric"
            value={cur.daily}
            onChange={(e) => setDraft({ ...cur, daily: e.target.value.replace(/\D/g, "") })}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold tabular-nums"
          />
        </label>
        {(Object.keys(CREDIT_LABEL) as CreditModule[]).map((k) => (
          <label key={k} className="grid gap-1 text-xs font-bold text-slate-700">
            {CREDIT_LABEL[k]} (isteğe bağlı)
            <input
              inputMode="numeric"
              placeholder="boş = modül limiti yok"
              value={cur.mods[k]}
              onChange={(e) => setDraft({ ...cur, mods: { ...cur.mods, [k]: e.target.value.replace(/\D/g, "") } })}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold tabular-nums"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">
          Modül limiti günlük ortak limiti aşamaz (sunucu doğrular). Değişiklik deneme yönetim kaydına yazılır.
        </span>
        <button
          type="button"
          disabled={busy || cur.daily === ""}
          onClick={save}
          className="inline-flex h-10 items-center rounded-xl border-2 border-violet-600 bg-violet-600 px-4 text-sm font-black text-white disabled:opacity-50"
        >
          Limitleri kaydet
        </button>
      </div>
    </div>
  );
}

/** Gelişmiş sekmesi: inceleme / deneme erişimini durdur-sürdür / Pro talebini kapat (Deneme Üyeleri ile aynı koşullar). */
export function TrialStatePanel({ mgmt }: { mgmt: Mgmt }) {
  const { state, busy, act } = mgmt;
  if (state.kind !== "ready") return <StateNote state={state} />;
  const r = state.row;
  const btn = "inline-flex h-10 items-center rounded-xl border-2 px-4 text-sm font-black disabled:opacity-50";
  return (
    <div className="grid gap-3" data-trial-state={r.phase}>
      <p className="text-sm font-semibold text-slate-700">
        Deneme durumu: <b className="text-slate-900">{PHASE_LABEL[r.phase]}</b>
        {r.pro_request_at ? " · açık Pro talebi var" : ""}
        {r.review_reason ? ` · ${r.review_reason}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {r.phase === "review" ? (
          <button type="button" disabled={busy} onClick={() => void act({ action: "clear_review" }, "İnceleme kaldırıldı.")} className={`${btn} border-slate-300 bg-white text-slate-800`}>
            İncelemeyi kaldır
          </button>
        ) : r.phase === "active" || r.phase === "not_started" ? (
          <button type="button" disabled={busy} onClick={() => void act({ action: "review", reason: "Yönetici incelemesi" }, "Hesap incelemeye alındı.")} className={`${btn} border-rose-200 bg-rose-50 text-rose-800`}>
            İncelemeye al
          </button>
        ) : null}
        {r.phase === "suspended" ? (
          <button type="button" disabled={busy} onClick={() => void act({ action: "resume" }, "Deneme erişimi sürdürüldü (süre uzamaz).")} className={`${btn} border-slate-300 bg-white text-slate-800`}>
            Erişimi sürdür
          </button>
        ) : r.phase !== "expired" ? (
          <button type="button" disabled={busy} onClick={() => void act({ action: "suspend" }, "Deneme erişimi durduruldu.")} className={`${btn} border-slate-300 bg-white text-slate-800`}>
            Deneme erişimini durdur
          </button>
        ) : null}
        {r.pro_request_at ? (
          <button type="button" disabled={busy} onClick={() => void act({ action: "dismiss_pro_request" }, "Pro talebi kapatıldı.")} className={`${btn} border-slate-300 bg-white text-slate-800`}>
            Pro talebini kapat
          </button>
        ) : null}
      </div>
      <p className="text-xs font-medium text-slate-500">
        Deneme süresi hiçbir işlemle uzamaz veya yeniden başlamaz. Aynı işlemler Deneme Üyeleri ekranında da kullanılabilir.
      </p>
    </div>
  );
}
