"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { statsApi } from "@/lib/admin/stats/statsClient";
import type { Usage360ExpertRow, Usage360ExpertsData } from "@/lib/admin/stats/apiTypes";
import { formatRelativeTr, isLastSeenBackfillArtifact } from "@/lib/admin/stats/uiFormat";
import { CHANNEL_LABEL, CHANNEL_SHORT, channelShares, formatDurationTr } from "@/lib/admin/stats/usage360Labels";
import { SectionCard, LoadingBlock, ErrorBlock, EmptyBlock, Pagination, StatusPill } from "./ui";

const STATUS_OPTS = [
  { k: "all", l: "Tümü" }, { k: "active", l: "Aktif" }, { k: "passive", l: "Pasif" },
  { k: "archive", l: "Arşiv" }, { k: "pending", l: "Onay bekleyen" },
];
const SORT_OPTS = [
  { k: "last_activity", l: "Son aktivite" }, { k: "name", l: "Ad" }, { k: "last_login", l: "Son giriş" },
  { k: "today_actions", l: "Bugün işlem" }, { k: "d7", l: "7g aktif gün" }, { k: "d30", l: "30g aktif gün" },
  { k: "created_at", l: "Kayıt tarihi" },
];

function Rel({ iso, nowMs }: { iso: string | null; nowMs: number }) {
  return iso ? <span title={new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}>{formatRelativeTr(iso, nowMs)}</span> : <span className="text-slate-400">—</span>;
}

/** Ölçüm yoksa sayıları 0 değil "Ölçülemiyor" göster (null ≠ 0). */
function TodayCell({ r, measured }: { r: Usage360ExpertRow; measured: boolean }) {
  if (!measured) return <span className="text-xs text-slate-400">Ölçülemiyor</span>;
  const t = r.today;
  if (t.visits === 0 && t.actions === 0 && t.activeSeconds === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className="whitespace-nowrap text-xs tabular-nums text-slate-700" title="ziyaret · yaklaşık aktif süre · kullanılan modül · anlamlı işlem">
      <b>{t.visits}</b> ziyaret · {formatDurationTr(t.activeSeconds)} · <b>{t.modules}</b> modül · <b>{t.actions}</b> işlem
    </span>
  );
}

function ChannelMini({ map }: { map: Record<string, number> }) {
  const shares = channelShares(map);
  if (shares.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shares.slice(0, 3).map((s) => (
        <span key={s.channel} title={`${CHANNEL_LABEL[s.channel] ?? s.channel}: ${s.visits} ziyaret (30 gün)`}
          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
          {CHANNEL_SHORT[s.channel] ?? s.channel} %{s.pct}
        </span>
      ))}
    </span>
  );
}

export function ExpertsTab({ refreshKey, nowMs, onOpenExpert }: {
  refreshKey: number; nowMs: number; onOpenExpert: (id: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("last_activity");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Usage360ExpertsData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [retry, setRetry] = useState(0);
  const reqId = useRef(0);

  // Arama debounce (250ms) — eski yanıt yeni seçimi ezmesin (reqId + abort).
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback((signal: AbortSignal) => {
    const my = ++reqId.current;
    queueMicrotask(() => { if (!signal.aborted) setState("loading"); });
    statsApi.usage360Experts({ search: search || null, status, sort, page, pageSize: 25 }, signal)
      .then((r) => {
        if (signal.aborted || my !== reqId.current) return;
        if (!r.ok) { setErr(r.error); setState("error"); return; }
        setData(r.data); setState("ok");
      })
      .catch((x) => { if ((x as { name?: string })?.name !== "AbortError" && my === reqId.current) { setErr("Liste alınamadı."); setState("error"); } });
  }, [search, status, sort, page]);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load, refreshKey, retry]);

  const measured = !!data?.measurementStart;
  const subtitle = data
    ? measured
      ? `Son aktivite, ziyaret, ~aktif süre ve aktif gün Usage360 ölçümüdür (${data.measurementStart} itibarıyla). "Bugün" = Türkiye takvim günü (${data.today}). 7g/30g = bugün dahil son 7/30 gün.`
      : "Usage360 kullanım ölçümü henüz başlamadı: son aktivite / bugün / aktif gün “Ölçülemiyor”. Son giriş başarılı kimlik doğrulamadır."
    : undefined;

  return (
    <SectionCard
      title="Uzmanlar"
      subtitle={subtitle}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Ara</span>
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ad / e-posta ara" className="w-44 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 sm:w-48" />
          </label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Durum filtresi" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            {STATUS_OPTS.map((o) => <option key={o.k} value={o.k}>{o.l}</option>)}
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sıralama" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            {SORT_OPTS.map((o) => <option key={o.k} value={o.k}>{o.l}</option>)}
          </select>
        </div>
      }
    >
      {state === "loading" ? <LoadingBlock /> :
       state === "error" ? <ErrorBlock message={err || "Liste yüklenemedi."} onRetry={() => setRetry((r) => r + 1)} /> :
       !data || data.rows.length === 0 ? <EmptyBlock title="Uzman bulunamadı" hint="Filtre/aramaya uyan kayıt yok." /> : (
        <>
          {/* Masaüstü: kompakt tablo */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-left text-sm" data-testid="usage360-experts-table">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Uzman</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Son giriş</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Son aktivite</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Bugün</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">7g</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">30g</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Kanal (30g)</th>
                  <th scope="col" className="py-2 font-semibold"><span className="sr-only">Detay</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.userId} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="py-2 pr-3">
                      <span className="block font-medium text-slate-800">{r.fullName || "—"}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <StatusPill active={r.active} approvalStatus={r.approvalStatus} isArchived={r.isArchived} />
                        {r.isDemo ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">DEMO</span> : null}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700"><Rel iso={r.lastLoginAt} nowMs={nowMs} /></td>
                    <td className="py-2 pr-3 text-slate-800">
                      {measured ? <Rel iso={r.lastActivityAt} nowMs={nowMs} /> : <span className="text-xs text-slate-400">Ölçülemiyor</span>}
                      {r.lastSeenAt ? (
                        <span className="mt-0.5 block text-[11px] text-slate-400" title="Son teknik temas: korumalı sunucu isteği; kullanıcı etkileşimi değildir.">
                          teknik temas ~ {formatRelativeTr(r.lastSeenAt, nowMs)}{isLastSeenBackfillArtifact(r.lastSeenAt) ? " (artefakt)" : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3"><TodayCell r={r} measured={measured} /></td>
                    <td className="py-2 pr-3 tabular-nums text-slate-700">{measured ? `${r.d7ActiveDays}/7` : "—"}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-700">{measured ? `${r.d30ActiveDays}/30` : "—"}</td>
                    <td className="py-2 pr-3"><ChannelMini map={r.channelVisits30d} /></td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => onOpenExpert(r.userId)} aria-label={`${r.fullName || "uzman"} detayı`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        Detay <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil / tablet: kart listesi (yatay taşan tablo yok) */}
          <ul className="space-y-2 lg:hidden" data-testid="usage360-experts-cards">
            {data.rows.map((r) => (
              <li key={r.userId}>
                <button type="button" onClick={() => onOpenExpert(r.userId)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{r.fullName || "—"}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5"><StatusPill active={r.active} approvalStatus={r.approvalStatus} isArchived={r.isArchived} /></span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  </span>
                  <span className="mt-2 block text-xs text-slate-600">
                    Son aktivite: {measured ? <Rel iso={r.lastActivityAt} nowMs={nowMs} /> : "Ölçülemiyor"} · Son giriş: <Rel iso={r.lastLoginAt} nowMs={nowMs} />
                  </span>
                  <span className="mt-1 block text-xs text-slate-700">Bugün: <TodayCell r={r} measured={measured} /></span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>7g: <b className="tabular-nums">{measured ? `${r.d7ActiveDays}/7` : "—"}</b> aktif gün</span>
                    <span>30g: <b className="tabular-nums">{measured ? `${r.d30ActiveDays}/30` : "—"}</b> aktif gün</span>
                    <ChannelMini map={r.channelVisits30d} />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-400">Toplam {data.total} uzman · ~ yaklaşık değerdir · aktif gün = etkileşimli kullanım olan Türkiye takvim günü.</p>
            <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
          </div>
        </>
      )}
    </SectionCard>
  );
}
