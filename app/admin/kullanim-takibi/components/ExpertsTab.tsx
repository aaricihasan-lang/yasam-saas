"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { statsApi } from "@/lib/admin/stats/statsClient";
import type { ExpertsData } from "@/lib/admin/stats/apiTypes";
import { formatRelativeTr } from "@/lib/admin/stats/uiFormat";
import { SectionCard, LoadingBlock, ErrorBlock, EmptyBlock, Pagination, StatusPill } from "./ui";

const STATUS_OPTS = [
  { k: "all", l: "Tümü" }, { k: "active", l: "Aktif" }, { k: "passive", l: "Pasif" },
  { k: "archive", l: "Arşiv" }, { k: "pending", l: "Onay bekleyen" },
];
const SORT_OPTS = [
  { k: "last_login", l: "Son giriş" }, { k: "created_at", l: "Kayıt tarihi" }, { k: "name", l: "Ad" },
];

export function ExpertsTab({ refreshKey, nowMs, onOpenExpert }: {
  refreshKey: number; nowMs: number; onOpenExpert: (id: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("last_login");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExpertsData | null>(null);
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
    statsApi.experts({ search: search || null, status, sort, page, pageSize: 25 }, signal)
      .then((r) => {
        if (signal.aborted || my !== reqId.current) return; // yarış: yalnız en son istek uygulanır
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

  return (
    <SectionCard
      title="Uzmanlar"
      subtitle={data?.note}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Ara</span>
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ad / e-posta ara" className="w-48 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400" />
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Ad Soyad</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Durum</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Son giriş</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Son görülme ~</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Erişilebilir modül</th>
                  <th scope="col" className="py-2 font-semibold"><span className="sr-only">Detay</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.userId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-3">
                      <button type="button" onClick={() => onOpenExpert(r.userId)} className="text-left font-semibold text-slate-800 hover:text-fuchsia-700 hover:underline">
                        {r.fullName || r.email || r.userId}
                      </button>
                      {r.isDemo ? <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">DEMO</span> : null}
                      {r.email ? <span className="block text-xs text-slate-400">{r.email}</span> : null}
                    </td>
                    <td className="py-2 pr-3"><StatusPill active={r.active} approvalStatus={r.approvalStatus} isArchived={r.isArchived} /></td>
                    <td className="py-2 pr-3 text-slate-700">{r.lastLoginAt ? formatRelativeTr(r.lastLoginAt, nowMs) : <span className="text-slate-400">—</span>}</td>
                    <td className="py-2 pr-3 text-slate-500">{r.lastSeenAt ? formatRelativeTr(r.lastSeenAt, nowMs) : <span className="text-slate-400">—</span>}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-700">{r.accessibleModuleCount}</td>
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
          <p className="mt-2 text-xs text-slate-400">Toplam {data.total} uzman · Son görülme ~ heartbeat (son giriş ile karıştırmayın).</p>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
        </>
      )}
    </SectionCard>
  );
}
