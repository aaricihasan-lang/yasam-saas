"use client";

/**
 * USAGE360 2C — Uzman 360 detay görünümü (yalnız teknik kullanım sayıları).
 *
 * Bölümler bağımsız yüklenir: bir alt istek başarısız olursa yalnız o bölüm hata gösterir.
 * İçerik YOK: danışan/kayıt adı, form yanıtı, not, rapor metni, dosya adı, kayıt kimliği
 * hiçbir bölümde gösterilmez (API bu alanları zaten döndürmez).
 * null ≠ 0: ölçüm başlangıcından önceki dönem "Ölçülemiyor" olarak gösterilir.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { statsApi } from "@/lib/admin/stats/statsClient";
import type {
  ActivityData, ModulesData, StorageData, Usage360DetailData, Usage360TimelineRow, Usage360ModuleRow,
} from "@/lib/admin/stats/apiTypes";
import { formatBytes, formatDateTimeTr, formatRelativeTr, isLastSeenBackfillArtifact } from "@/lib/admin/stats/uiFormat";
import {
  ACTION_LABEL, BROWSER_LABEL, CHANNEL_LABEL, DOW_LABEL, ERROR_CLASS_LABEL, OS_LABEL,
  actionText, formatDayTr, formatDurationTr, formatTimeTr,
} from "@/lib/admin/stats/usage360Labels";
import type { Usage360Period } from "@/lib/admin/stats/usage360Period";
import { SectionCard, StatTile, LoadingBlock, ErrorBlock, EmptyBlock } from "./ui";
import { MetricValueView } from "./MetricValueView";

type Load<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ok"; data: T };

function useLoad<T>(fn: (signal: AbortSignal) => Promise<{ ok: true; data: T } | { ok: false; error: string }>, deps: unknown[]): [Load<T>, () => void] {
  const [st, setSt] = useState<Load<T>>({ state: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    queueMicrotask(() => { if (!ac.signal.aborted) setSt({ state: "loading" }); });
    fn(ac.signal)
      .then((r) => { if (!ac.signal.aborted) setSt(r.ok ? { state: "ok", data: r.data } : { state: "error", error: r.error }); })
      .catch((x) => { if ((x as { name?: string })?.name !== "AbortError" && !ac.signal.aborted) setSt({ state: "error", error: "İstek başarısız." }); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return [st, () => setTick((t) => t + 1)];
}

const n = (v: number) => v.toLocaleString("tr-TR");

function Block<T>({ load, retry, children }: { load: Load<T>; retry: () => void; children: (d: T) => React.ReactNode }) {
  if (load.state === "loading") return <LoadingBlock />;
  if (load.state === "error") return <ErrorBlock message={load.error} onRetry={retry} />;
  return <>{children(load.data)}</>;
}

const STATUS_BADGE: Record<Usage360ModuleRow["status"], { t: string; c: string }> = {
  actioned: { t: "İşlem yapıldı", c: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  opened_only: { t: "Yalnız açıldı", c: "bg-amber-50 text-amber-800 ring-amber-200" },
  never_opened: { t: "Ölçüm başlangıcından beri açılmadı", c: "bg-slate-100 text-slate-600 ring-slate-200" },
  not_measured: { t: "Dönemde iz yok / ölçülemiyor", c: "bg-slate-50 text-slate-500 ring-slate-200" },
};

function CoverageNote({ d }: { d: Usage360DetailData }) {
  if (d.coverage === "full") return null;
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="note">
      {d.measurementStart
        ? d.coverage === "none"
          ? `Seçili dönem Usage360 ölçüm başlangıcından (${d.measurementStart}) önce: ziyaret / aktif süre / modül kullanımı “Ölçülemiyor”.`
          : `Aktif süre, ziyaret ve ayrıntılı modül kullanım ölçümleri ${d.measurementStart} itibarıyla kullanılabilir; dönemin öncesi kapsanmaz.`
        : "Usage360 kullanım ölçümü henüz başlamadı (özellik kapalı): ziyaret / aktif süre / modül kullanımı “Ölçülemiyor”."}
    </p>
  );
}

function Heatmap({ cells }: { cells: Usage360DetailData["heatmap"] }) {
  const max = Math.max(1, ...cells.map((c) => c.days));
  const at = (dow: number, h: number) => cells.find((c) => c.dow === dow && c.hour === h)?.days ?? 0;
  const bucket = (lo: number, hi: number) => cells.filter((c) => c.hour >= lo && c.hour < hi).reduce((s, c) => s + c.days, 0);
  const totalAll = Math.max(1, cells.reduce((s, c) => s + c.days, 0));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px]" aria-label="Gün × saat kullanım yoğunluğu">
          <thead>
            <tr><th className="w-8" />{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="w-4 font-normal text-slate-400">{h % 3 === 0 ? h : ""}</th>)}</tr>
          </thead>
          <tbody>
            {DOW_LABEL.map((lbl, i) => (
              <tr key={lbl}>
                <th scope="row" className="pr-1 text-right font-medium text-slate-500">{lbl}</th>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = at(i + 1, h);
                  return <td key={h} title={`${lbl} ${String(h).padStart(2, "0")}:00 — ${v} gün`} className="h-4 w-4 rounded-sm"
                    style={{ backgroundColor: v ? `rgba(162, 28, 175, ${0.15 + 0.85 * (v / max)})` : "rgb(241 245 249)" }} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[[0, 6, "00–06"], [6, 12, "06–12"], [12, 18, "12–18"], [18, 24, "18–24"]].map(([lo, hi, l]) => (
          <div key={String(l)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="text-slate-500">{l}</span> <b className="tabular-nums">%{Math.round((bucket(Number(lo), Number(hi)) / totalAll) * 100)}</b>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">Hücre = o gün-saatte sinyal olan gün sayısı (TR saati). Yalnız teknik kullanım yoğunluğu; içerik yok.</p>
    </div>
  );
}

function Timeline({ userId, from, to }: { userId: string; from: string; to: string }) {
  const [rows, setRows] = useState<Usage360TimelineRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "more">("loading");
  const [err, setErr] = useState("");
  const [capped, setCapped] = useState(false);

  const tlFrom = useMemo(() => {
    // Ham olay sorgusu en fazla 90 gün: daha uzun dönemde son 90 gün gösterilir.
    const f = new Date(`${to}T00:00:00Z`); f.setUTCDate(f.getUTCDate() - 89);
    const lim = f.toISOString().slice(0, 10);
    return from < lim ? lim : from;
  }, [from, to]);

  const fetchPage = useCallback((c: string | null, signal?: AbortSignal) =>
    statsApi.usage360Timeline({ userId, from: tlFrom, to, cursor: c, limit: 50 }, signal), [userId, tlFrom, to]);

  useEffect(() => {
    const ac = new AbortController();
    queueMicrotask(() => { if (!ac.signal.aborted) { setState("loading"); setRows([]); setCursor(null); setCapped(tlFrom !== from); } });
    fetchPage(null, ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      if (!r.ok) { setErr(r.error); setState("error"); return; }
      setRows(r.data.rows); setCursor(r.data.nextCursor); setState("ok");
    }).catch(() => { /* abort */ });
    return () => ac.abort();
  }, [fetchPage, tlFrom, from]);

  const more = () => {
    if (!cursor) return;
    setState("more");
    fetchPage(cursor).then((r) => {
      if (!r.ok) { setErr(r.error); setState("error"); return; }
      setRows((prev) => [...prev, ...r.data.rows]); setCursor(r.data.nextCursor); setState("ok");
    }).catch(() => { setErr("Zaman çizelgesi alınamadı."); setState("error"); });
  };

  if (state === "loading") return <LoadingBlock />;
  if (state === "error" && rows.length === 0) return <ErrorBlock message={err} />;
  if (rows.length === 0) return <EmptyBlock title="Bu dönemde kayıtlı işlem yok" hint="Zaman çizelgesi yalnız ölçülen işlem türlerini gösterir." />;
  const dayOf = (iso: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" }).format(new Date(iso));
  return (
    <div>
      {capped ? <p className="mb-2 text-xs text-slate-400">Zaman çizelgesi en fazla 90 gün: {tlFrom} – {to}.</p> : null}
      <ol className="divide-y divide-slate-100 text-sm" data-testid="usage360-timeline">
        {rows.map((r, i) => {
          const day = dayOf(r.at);
          const head = i === 0 || dayOf(rows[i - 1].at) !== day ? day : null;
          return (
            <li key={`${r.at}-${i}`} className="py-1.5">
              {head ? <p className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{head}</p> : null}
              <span className="grid grid-cols-[3.2rem_1fr] gap-2 sm:grid-cols-[3.2rem_9rem_12rem_1fr]">
                <span className="tabular-nums text-slate-500">{formatTimeTr(r.at)}</span>
                <span className="hidden text-slate-500 sm:block">{r.channel ? CHANNEL_LABEL[r.channel] ?? r.channel : "—"}</span>
                <span className="font-medium text-slate-800">{r.label}</span>
                <span className={r.action === "action_failed" ? "text-rose-700" : "text-slate-700"}>
                  {actionText(r.action, r.subEntity, r.failedAction)}
                  {r.errorClass ? ` · ${ERROR_CLASS_LABEL[r.errorClass] ?? r.errorClass}` : ""}
                  {r.itemBucket && r.itemBucket !== "1" ? ` · ${r.itemBucket} öğe` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {cursor ? (
        <button type="button" onClick={more} disabled={state === "more"} className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {state === "more" ? "Yükleniyor…" : "Daha fazla (50)"}
        </button>
      ) : null}
      {state === "error" ? <p className="mt-2 text-sm text-rose-700">{err}</p> : null}
    </div>
  );
}

type SortKey = "actions" | "activeSeconds" | "moduleOpens";

export function Expert360View({ userId, period, refreshKey, nowMs }: { userId: string; period: Usage360Period; refreshKey: number; nowMs: number }) {
  const from = period.from ?? "", to = period.to ?? "";
  const [detail, retryDetail] = useLoad<Usage360DetailData>((s) => statsApi.usage360Detail({ userId, from, to }, s), [userId, from, to, refreshKey]);
  const [activity, retryActivity] = useLoad<ActivityData>((s) => statsApi.activity({ userId }, s), [userId, refreshKey]);
  const [modules, retryModules] = useLoad<ModulesData>((s) => statsApi.modules({ userId }, s), [userId, refreshKey]);
  const [storage, retryStorage] = useLoad<StorageData>((s) => statsApi.storage({ userId }, s), [userId, refreshKey]);
  const [modSort, setModSort] = useState<SortKey>("actions");

  if (period.invalid || !period.from || !period.to) {
    return <ErrorBlock message="Geçersiz tarih aralığı — başlangıç ve bitiş seçin (en fazla 366 gün)." />;
  }

  const recordCount = (key: string) => {
    if (modules.state !== "ok") return null;
    return modules.data.modules.find((m) => m.key === key)?.existingRecordCount ?? null;
  };

  return (
    <div className="space-y-5" data-testid="usage360-detail">
      {/* 1. ÖZET */}
      <SectionCard title="1 · Özet" subtitle={`${period.from} – ${period.to} (Türkiye takvim günü). ~ yaklaşık değerdir; skor/yorum üretilmez.`}>
        <Block load={detail} retry={retryDetail}>{(d) => {
          const none = d.coverage === "none";
          const v = (x: number) => (none ? "Ölçülemiyor" : n(x));
          const allowedCount = d.account.allowedModules.length;
          const channelTotal = d.channels.reduce((s, c) => s + c.visits, 0);
          return (
            <div className="space-y-3">
              <CoverageNote d={d} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatTile label="Etkileşimli kullanım günü" tone="violet" value={none ? "Ölçülemiyor" : `${d.totals.activeUsageDays} / ${period.days ?? "—"}`} hint="ping veya işlem olan TR günü" />
                <StatTile label="İşlem yapılan gün" value={none ? "Ölçülemiyor" : `${d.totals.actionDays} / ${period.days ?? "—"}`} />
                <StatTile label="Ziyaret" value={v(d.totals.visits)} hint="30 dk sessizlik = yeni ziyaret" />
                <StatTile label="Yaklaşık aktif süre (etkileşimli)" tone="emerald" value={none ? "Ölçülemiyor" : formatDurationTr(d.totals.activeSeconds)} />
                <StatTile label="Kullanılan / izinli modül" value={none ? "Ölçülemiyor" : `${d.modulesUsed} / ${allowedCount}`} />
                <StatTile label="Gerçek işlem yapılan modül" value={v(d.modulesWithActions)} />
                <StatTile label="Anlamlı işlem" tone="cyan" value={v(d.totals.actions)} hint="modül açılışı ve hata hariç" />
                <StatTile label="Oluşturma · Güncelleme · Silme" value={none ? "Ölçülemiyor" : `${n(d.totals.creates)} · ${n(d.totals.updates)} · ${n(d.totals.deletes)}`} />
                <StatTile label="Analiz" value={v(d.totals.analyses)} />
                <StatTile label="Rapor oluşturma · dışa aktarım" value={none ? "Ölçülemiyor" : `${n(d.totals.reportsGenerated)} · ${n(d.totals.reportsExported)}`} />
                <StatTile label="Yükleme" value={v(d.totals.uploads)} />
                <StatTile label="Başarısız işlem" tone={d.totals.failures > 0 ? "rose" : "slate"} value={v(d.totals.failures)} />
              </div>
              {!none && channelTotal > 0 ? (
                <p className="text-sm text-slate-600">Kanal (ziyaret): {d.channels.map((c) => `${CHANNEL_LABEL[c.channel] ?? c.channel} %${Math.round((c.visits / channelTotal) * 100)}`).join(" · ")}</p>
              ) : null}
            </div>
          );
        }}</Block>
      </SectionCard>

      {/* 2. HESAP VE ERİŞİM */}
      <SectionCard title="2 · Hesap ve erişim" subtitle="Giriş = başarılı kimlik doğrulama. Auth cihaz oturumu ≠ kullanım ziyareti.">
        <Block load={detail} retry={retryDetail}>{(d) => {
          const ageDays = d.account.createdAt ? Math.floor((nowMs - Date.parse(d.account.createdAt)) / 86_400_000) : null;
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatTile label="Hesap durumu" value={d.account.active ? "Aktif" : "Pasif"} hint={d.account.approvalStatus ?? undefined} />
                <StatTile label="Kayıt tarihi" value={d.account.createdAt ? formatDateTimeTr(d.account.createdAt) : "—"} hint={ageDays != null ? `hesap yaşı ${ageDays} gün` : undefined} />
                <StatTile label="Onay tarihi" value={d.account.approvedAt ? formatDateTimeTr(d.account.approvedAt) : "Ölçülemiyor"} />
                <StatTile label="Son giriş (auth)" value={d.account.lastLoginAt ? formatRelativeTr(d.account.lastLoginAt, nowMs) : "—"} />
                <StatTile label="Son aktivite (Usage360)" tone="emerald" value={d.measurementStart ? (d.account.lastActivityAt ? formatRelativeTr(d.account.lastActivityAt, nowMs) : "Ölçüm başlangıcından beri yok") : "Ölçülemiyor"} />
                <StatTile label="Aktif auth cihaz oturumu" value={d.account.activeAuthSessions == null ? "Ölçülemiyor" : n(d.account.activeAuthSessions)} hint="kullanım ziyareti değildir" />
                <StatTile label="İzinli modül" value={n(d.account.allowedModules.length)} />
                <Block load={activity} retry={retryActivity}>{(a) => (
                  <StatTile label="Son teknik temas ~ (ikincil)" value={<MetricValueView metric={a.lastSeenAt} />}
                    hint={isLastSeenBackfillArtifact(a.lastSeenAt.value) ? "27.09.2026 22:13 (TR) migration değeri — gerçek kullanım değil" : "korumalı sunucu isteği; etkileşim değil"} />
                )}</Block>
              </div>
              <p className="text-xs text-slate-500">İzinli modüller: {d.account.allowedModules.map((m) => m.label).join(", ") || "—"}</p>
            </div>
          );
        }}</Block>
      </SectionCard>

      {/* 3. BUGÜNKÜ AKTİVİTE — ayrı çağrı gerektirmez: dönem "Bugün" ise özetle aynıdır; değilse bugünün satırı günlük tablodan */}
      <SectionCard title="3 · Bugünkü aktivite" subtitle="Türkiye takvim günü.">
        <Block load={detail} retry={retryDetail}>{(d) => {
          const row = d.daily.find((x) => x.day === d.today);
          if (!d.measurementStart) return <EmptyBlock title="Ölçülemiyor" hint="Usage360 ölçümü henüz başlamadı." />;
          if (d.to < d.today) return <EmptyBlock title="Seçili dönem bugünü içermiyor" hint="Bugünü görmek için “Bugün” veya bugünü kapsayan bir dönem seçin." />;
          if (!row) return <EmptyBlock title="Bugün henüz etkileşim yok" />;
          const ch = d.today === d.from && d.today === d.to ? d.channels : [];
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatTile label="İlk / son aktivite" value={`${row.firstAt ? formatTimeTr(row.firstAt) : "—"} – ${row.lastAt ? formatTimeTr(row.lastAt) : "—"}`} />
                <StatTile label="Ziyaret" value={n(row.visits)} />
                <StatTile label="~Aktif süre" tone="emerald" value={formatDurationTr(row.activeSeconds)} />
                <StatTile label="Farklı modül · açılış" value={`${row.modulesUsed} · ${n(row.moduleOpens)}`} />
                <StatTile label="Anlamlı işlem" tone="cyan" value={n(row.actions)} />
                <StatTile label="C · U · D" value={`${n(row.creates)} · ${n(row.updates)} · ${n(row.deletes)}`} />
                <StatTile label="Analiz" value={n(row.analyses)} />
                <StatTile label="Rapor · dışa aktarım" value={`${n(row.reportsGenerated)} · ${n(row.reportsExported)}`} />
                <StatTile label="Yükleme" value={n(row.uploads)} />
                <StatTile label="Hata" tone={row.failures ? "rose" : "slate"} value={n(row.failures)} />
              </div>
              {ch.length ? <p className="text-sm text-slate-600">Kanal ziyaretleri: {ch.map((c) => `${CHANNEL_LABEL[c.channel] ?? c.channel}: ${c.visits}`).join(" · ")}</p>
                : <p className="text-xs text-slate-400">Kanal kırılımı için “Bugün” dönemini seçin (platform bölümü seçili dönemi gösterir).</p>}
            </div>
          );
        }}</Block>
      </SectionCard>

      {/* 4. GÜNLÜK AKTİVİTE */}
      <SectionCard title="4 · Günlük aktivite" subtitle="Gün gün (TR). Yalnız sayılar; içerik yok.">
        <Block load={detail} retry={retryDetail}>{(d) => {
          if (d.coverage === "none") return <EmptyBlock title="Ölçülemiyor" hint="Dönem ölçüm başlangıcından önce veya ölçüm başlamadı." />;
          if (d.daily.length === 0) return <EmptyBlock title="Bu dönemde etkileşim yok" />;
          const maxSec = Math.max(1, ...d.daily.map((x) => x.activeSeconds));
          return (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm" data-testid="usage360-daily">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  {["Tarih", "Ziyaret", "~Aktif süre", "Modül", "Açılış", "İşlem", "C", "U", "D", "Rapor", "Hata"].map((h) => <th key={h} scope="col" className="py-2 pr-3 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {d.daily.map((r) => (
                    <tr key={r.day} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-slate-700">{formatDayTr(r.day)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.visits}</td>
                      <td className="py-1.5 pr-3">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 rounded bg-slate-100"><span className="block h-1.5 rounded bg-fuchsia-500" style={{ width: `${Math.round((r.activeSeconds / maxSec) * 100)}%` }} /></span>
                          <span className="tabular-nums">{formatDurationTr(r.activeSeconds)}</span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.modulesUsed}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.moduleOpens}</td>
                      <td className="py-1.5 pr-3 tabular-nums font-semibold">{r.actions}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.creates}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.updates}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.deletes}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.reportsGenerated + r.reportsExported}</td>
                      <td className={`py-1.5 pr-3 tabular-nums ${r.failures ? "text-rose-700" : ""}`}>{r.failures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}</Block>
      </SectionCard>

      {/* 5. MODÜL KULLANIMI */}
      <SectionCard title="5 · Modül kullanımı" subtitle="Mevcut kayıt = anlık envanter, işlem sayısı DEĞİLDİR (admin kütüphane aktarımı hariç). Durum etiketleri objektiftir."
        right={
          <select value={modSort} onChange={(e) => setModSort(e.target.value as SortKey)} aria-label="Modül sıralaması" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="actions">Anlamlı işlem</option><option value="activeSeconds">~Aktif süre</option><option value="moduleOpens">Modül açılışı</option>
          </select>
        }>
        <Block load={detail} retry={retryDetail}>{(d) => {
          const rows = [...d.modules].sort((a, b) => b[modSort] - a[modSort] || a.label.localeCompare(b.label, "tr"));
          const allowed = rows.filter((r) => r.allowed);
          const cnt = (s: Usage360ModuleRow["status"]) => allowed.filter((r) => r.status === s).length;
          return (
            <div className="space-y-3">
              {d.measurementStart ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <StatTile label="Gerçek işlem yapılan" tone="emerald" value={n(cnt("actioned"))} />
                  <StatTile label="Açılmış, işlem yok" tone="amber" value={n(cnt("opened_only"))} />
                  <StatTile label="İzinli, ölçüm başlangıcından beri hiç açılmamış" value={n(cnt("never_opened"))} hint={`ölçüm başlangıcı ${d.measurementStart}`} />
                </div>
              ) : <CoverageNote d={d} />}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm" data-testid="usage360-modules">
                  <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    {["Modül", "Durum", "İlk / son (dönem)", "Aktif gün", "~Süre", "Açılış", "C", "U", "D", "Analiz", "Rapor", "Dışa akt.", "Yükl.", "Hata", "Son işlem", "Mevcut kayıt"].map((h) => <th key={h} scope="col" className="py-2 pr-2 font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const b = STATUS_BADGE[r.status];
                      const rc = recordCount(r.module);
                      return (
                        <tr key={r.module} className="border-b border-slate-100 align-top">
                          <td className="py-1.5 pr-2 font-medium text-slate-800">{r.label}{!r.allowed ? <span className="ml-1 text-[10px] text-slate-400">(izin yok)</span> : null}</td>
                          <td className="py-1.5 pr-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${b.c}`}>{b.t}</span></td>
                          <td className="py-1.5 pr-2 whitespace-nowrap text-xs text-slate-500">{r.firstAt ? formatDateTimeTr(r.firstAt) : "—"}<br />{r.lastAt ? formatDateTimeTr(r.lastAt) : ""}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.activeDays}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{formatDurationTr(r.activeSeconds)}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.moduleOpens}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.creates}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.updates}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.deletes}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.analyses}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.reportsGenerated}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.reportsExported}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.uploads}</td>
                          <td className={`py-1.5 pr-2 tabular-nums ${r.failures ? "text-rose-700" : ""}`}>{r.failures}</td>
                          <td className="py-1.5 pr-2 whitespace-nowrap text-xs text-slate-500">{r.lastActionAt ? formatRelativeTr(r.lastActionAt, nowMs) : "—"}</td>
                          <td className="py-1.5 pr-2 text-xs">{rc ? <MetricValueView metric={rc} /> : modules.state === "error" ? <button type="button" onClick={retryModules} className="text-rose-700 underline">yeniden dene</button> : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }}</Block>
      </SectionCard>

      {/* 6. PLATFORM / CİHAZ */}
      <SectionCard title="6 · Platform / cihaz" subtitle="Aile düzeyi (tam tarayıcı kimliği ve cihaz parmak izi tutulmaz).">
        <Block load={detail} retry={retryDetail}>{(d) => {
          if (d.coverage === "none") return <EmptyBlock title="Ölçülemiyor" />;
          if (d.channels.length === 0) return <EmptyBlock title="Bu dönemde platform verisi yok" />;
          return (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    {["Kanal", "Ziyaret", "~Aktif süre", "Modül açılışı", "Anlamlı işlem", "Son kullanım"].map((h) => <th key={h} scope="col" className="py-2 pr-3 font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>{d.channels.map((c) => (
                    <tr key={c.channel} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 font-medium text-slate-800">{CHANNEL_LABEL[c.channel] ?? c.channel}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{c.visits}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatDurationTr(c.activeSeconds)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{c.moduleOpens}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{c.actions}</td>
                      <td className="py-1.5 pr-3 text-xs text-slate-500">{c.lastAt ? formatRelativeTr(c.lastAt, nowMs) : "—"}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              {d.devices.length ? (
                <ul className="flex flex-wrap gap-1.5 text-xs">
                  {d.devices.map((x, i) => (
                    <li key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                      {OS_LABEL[x.osFamily] ?? x.osFamily} · {BROWSER_LABEL[x.browserFamily] ?? x.browserFamily}{x.appVersion ? ` · uygulama ${x.appVersion}` : ""} — {x.visits} ziyaret
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.channels.some((c) => c.channel === "android_webview_derived") ? <p className="text-xs text-amber-700">“Android WebView (türetilmiş)”: resmî uygulama tanımlayıcısı olmadan tespit edildi; kesin değildir.</p> : null}
            </div>
          );
        }}</Block>
      </SectionCard>

      {/* 7. ZAMAN ÇİZELGESİ */}
      <SectionCard title="7 · Aktivite zaman çizelgesi" subtitle="Saat · kanal · modül · işlem türü. Danışan/kayıt adı, form yanıtı, dosya adı, hata mesajı GÖSTERİLMEZ.">
        <Timeline userId={userId} from={period.from} to={period.to} />
      </SectionCard>

      {/* 8. SAAT YOĞUNLUĞU */}
      <SectionCard title="8 · Saat yoğunluğu" subtitle="Gün × saat (TR).">
        <Block load={detail} retry={retryDetail}>{(d) => d.coverage === "none" ? <EmptyBlock title="Ölçülemiyor" /> : d.heatmap.length === 0 ? <EmptyBlock title="Bu dönemde veri yok" /> : <Heatmap cells={d.heatmap} />}</Block>
      </SectionCard>

      {/* 9. YAKLAŞIK KONUM */}
      <SectionCard title="9 · Yaklaşık konum (IP tabanlı)" subtitle="Ülke / şehir düzeyi, ziyaret başına. GPS, koordinat ve ham IP YOK; şehir kesin konum değildir.">
        <Block load={detail} retry={retryDetail}>{(d) => d.coverage === "none" ? <EmptyBlock title="Ölçülemiyor" /> : d.locations.length === 0 ? <EmptyBlock title="Bu dönemde veri yok" /> : (
          <ul className="divide-y divide-slate-100 text-sm" data-testid="usage360-locations">
            {d.locations.map((l, i) => (
              <li key={i} className="flex justify-between py-1.5">
                <span className="text-slate-700">{l.country === "TR" ? "Türkiye" : l.country ?? "Bilinmiyor"} / {l.city ?? "Bilinmiyor"}</span>
                <span className="tabular-nums text-slate-500">{l.visits} ziyaret</span>
              </li>
            ))}
          </ul>
        )}</Block>
      </SectionCard>

      {/* 10. DEPOLAMA */}
      <SectionCard title="10 · Çalışma alanı depolaması" subtitle="Tenant bazlı anlık depolama; bir kullanım işlemi değildir.">
        <Block load={storage} retry={retryStorage}>{(s) => (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Fiziksel obje" value={<MetricValueView metric={s.objectCount} />} />
              <StatTile label="Toplam boyut" value={<MetricValueView metric={s.totalBytes} />} />
              <StatTile label="Boyutu bilinmeyen" value={<MetricValueView metric={s.missingSizeCount} />} hint="byte'a dahil değil" />
            </div>
            {Object.keys(s.byBucket).length ? (
              <ul className="text-sm text-slate-700">{Object.entries(s.byBucket).map(([b, v]) => (
                <li key={b} className="flex justify-between border-b border-slate-100 py-1"><span>{b}</span><span className="tabular-nums">{formatBytes(v.totalBytes)} · {v.objectCount} obje</span></li>
              ))}</ul>
            ) : <span className="text-slate-400">Veri yok</span>}
          </div>
        )}</Block>
      </SectionCard>

      {/* 11. TEKNİK HATALAR */}
      <SectionCard title="11 · Teknik hatalar" subtitle="Yalnız teknik sınıf (mesaj, stack, istek gövdesi, kayıt bilgisi YOK). Aynı hata 60 sn içinde tek sayılır.">
        <Block load={detail} retry={retryDetail}>{(d) => d.coverage === "none" ? <EmptyBlock title="Ölçülemiyor" /> : d.failures.length === 0 ? <EmptyBlock title="Bu dönemde başarısız işlem yok" /> : (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Toplam: <b className="tabular-nums">{d.failures.reduce((s, f) => s + f.count, 0)}</b> · son hata {formatRelativeTr(d.failures.map((f) => f.lastAt ?? "").sort().pop() || null, nowMs)}</p>
            <ul className="divide-y divide-slate-100 text-sm">
              {d.failures.map((f, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span className="text-slate-700">{f.label} · {ERROR_CLASS_LABEL[f.errorClass] ?? f.errorClass}</span>
                  <span className="tabular-nums text-slate-500">{f.count} · {f.lastAt ? formatRelativeTr(f.lastAt, nowMs) : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}</Block>
      </SectionCard>

      {/* 12. ÖLÇÜM AÇIKLAMALARI */}
      <SectionCard title="12 · Ölçüm açıklamaları">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li><b>Ziyaret</b>: auth oturumu içinde 30 dk sessizlikle ayrılan etkileşimli kullanım dilimi (uzun yaşayan giriş oturumu tek ziyaret değildir).</li>
          <li><b>Yaklaşık aktif süre</b>: sayfa görünür ve son 5 dk içinde etkileşim varken en fazla 60 saniyede bir sinyal; açık bırakılan sekme süre biriktirmez. Farklı cihazlarda eş zamanlı süreler toplanır.</li>
          <li><b>Anlamlı işlem</b>: {Object.entries(ACTION_LABEL).filter(([k]) => !["module_opened", "action_failed"].includes(k)).map(([, v]) => v.toLowerCase()).join(", ")}. Bir işlemin İÇERİĞİ değil, yalnız gerçekleştiği kaydedilir.</li>
          <li><b>Aktif gün</b>: etkileşim veya işlem olan Türkiye takvim günü. <b>Son giriş</b> başarılı kimlik doğrulamadır; <b>son teknik temas</b> ikincil bir sunucu temas zamanıdır (27.09.2026 22:13 değeri migration artefaktıdır).</li>
          <li><b>Mevcut kayıt</b>: modüldeki anlık envanter; işlem sayısı değildir, admin kütüphane aktarımı hariçtir.</li>
          <li>Ölçüm öncesi dönemler 0 değil “Ölçülemiyor” gösterilir; geçmiş veri uydurulmaz.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
