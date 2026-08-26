"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import type { ClientSourceModule } from "@/lib/yasam-hafizasi/client/clientSources";
import {
  filterClientByModules,
  type ClientSearchResponse,
  type ClientSearchResult,
} from "@/lib/yasam-hafizasi/client/clientSearchResult";
import { fetchClientYhSearch } from "@/lib/yasam-hafizasi/client/clientSearchApiClient";
import { BirthDateInput } from "@/components/ui/BirthDateInput";

type Status = "idle" | "loading" | "done" | "error" | "disabled";

const DISABLED_REASONS = ["not-active", "flag-disabled", "demo"] as const;

/**
 * BF-14 Paket 1 — Danışan Yolculuğu içinde DANIŞAN-scoped Yaşam Hafızası sekmesi.
 * Danışan adı prop'tan (ownership-doğrulanmış client kaydından) gelir; index'ten DEĞİL.
 * Seçim foundation'ı var; canlı "Rapora ekle" aksiyonu Paket 2'de (burada devre dışı).
 */
export default function ClientMemoryTab({ clientId }: { clientId: string; clientName?: string }) {
  const t = useTranslations("clients.memory");
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<ClientSearchResponse | null>(null);
  const [selectedModules, setSelectedModules] = useState<ClientSourceModule[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detail, setDetail] = useState<ClientSearchResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        setStatus("idle");
        setResponse(null);
        setSubmitted("");
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSubmitted(trimmed);
      setStatus("loading");
      const res = await fetchClientYhSearch(
        clientId,
        { q: trimmed, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setResponse(res);
      if (res.disabled) setStatus("disabled");
      else if (!res.ok) setStatus("error");
      else setStatus("done");
    },
    [clientId, dateFrom, dateTo],
  );

  const displayed = useMemo(
    () => (response ? filterClientByModules(response.results, selectedModules) : []),
    [response, selectedModules],
  );

  const toggleModule = (m: ClientSourceModule) =>
    setSelectedModules((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="w-full">
      <p className="mb-3 text-sm text-slate-500">
        {t("intro")}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(q);
        }}
        className="mb-3 flex items-stretch gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            aria-label={t("searchAria")}
            placeholder={t("searchPlaceholder")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-base outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <button type="submit" className="btn-primary inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm">
          {t("searchButton")}
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="text-slate-500">{t("dateLabel")}</label>
        {/* Global tarih sözleşmesi: görünen format DD.MM.YYYY (tüm locale). Native
            <input type="date"> tarayıcı locale'ine göre mm/dd/yyyy gösterebildiğinden
            kontrollü maskeli bileşen kullanılır; saklanan değer ISO yyyy-mm-dd kalır. */}
        <BirthDateInput value={dateFrom} onChange={setDateFrom} ariaLabel={t("dateFromAria")} className="w-32 rounded-lg border border-slate-200 px-2 py-1" />
        <span className="text-slate-400">–</span>
        <BirthDateInput value={dateTo} onChange={setDateTo} ariaLabel={t("dateToAria")} className="w-32 rounded-lg border border-slate-200 px-2 py-1" />
      </div>

      {status === "idle" ? <StateCard icon="🔎" title={t("states.idleTitle")} msg={t("states.idleMsg")} /> : null}
      {status === "loading" ? <Skeleton /> : null}
      {status === "disabled" && response ? (() => {
        const reason = (DISABLED_REASONS as readonly string[]).includes(response.reason ?? "")
          ? (response.reason as string)
          : "not-active";
        const hasReason = t.has(`disabled.${reason}.title`);
        return (
          <StateCard
            icon="🔒"
            title={hasReason ? t(`disabled.${reason}.title`) : t("disabled.fallbackTitle")}
            msg={hasReason ? t(`disabled.${reason}.msg`) : ""}
          />
        );
      })() : null}
      {status === "error" ? (
        <StateCard icon="⚠️" title={t("states.errorTitle")} msg={t("states.errorMsg")} action={<button type="button" onClick={() => void runSearch(submitted)} className="btn-primary inline-flex items-center rounded-lg px-3 py-1.5 text-sm">{t("states.retry")}</button>} />
      ) : null}

      {status === "done" && response ? (
        response.results.length === 0 ? (
          <StateCard icon="🗂️" title={t("states.emptyTitle")} msg={t("states.emptyMsg")} />
        ) : (
          <>
            {response.facets.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {response.facets.map((f) => {
                  const active = selectedModules.includes(f.module);
                  return (
                    <button key={f.module} type="button" onClick={() => toggleModule(f.module)} aria-pressed={active}
                      className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${active ? "border-violet-300 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                      {f.moduleLabel}<span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{f.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="mb-2 text-sm text-slate-500">{t.rich("resultsCount", { count: displayed.length, b: (chunks) => <span className="font-bold text-slate-700">{chunks}</span> })}</p>
            {displayed.length === 0 ? (
              <StateCard icon="🧭" title={t("states.filteredEmptyTitle")} msg={t("states.filteredEmptyMsg")} />
            ) : (
              <div className="space-y-2">
                {displayed.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => togglePick(r.id)} aria-label={t("pickAria")} className="mt-1 h-4 w-4 accent-violet-600" />
                    <button type="button" onClick={() => setDetail(r)} className="min-w-0 flex-1 text-left">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black uppercase text-violet-700">{r.moduleLabel}</span>
                        {r.occurredAt ? <span className="text-[11px] text-slate-400">{r.occurredAt.slice(0, 10)}</span> : null}
                      </div>
                      <h4 className="line-clamp-1 text-sm font-bold text-slate-900">{r.title ?? t("recordFallbackTitle")}</h4>
                      {r.snippet ? <p className="line-clamp-1 text-sm text-slate-600">{r.snippet}</p> : null}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {picked.size > 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-violet-300 bg-violet-50/60 px-3 py-2 text-sm text-violet-700">
                {t.rich("pickedBanner", { count: picked.size, b: (chunks) => <span className="font-semibold">{chunks}</span> })}
              </div>
            ) : null}
          </>
        )
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t("detailDialogAria")}>
          <button type="button" aria-label={t("close")} onClick={() => setDetail(null)} className="absolute inset-0 bg-slate-900/30" />
          <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black uppercase text-violet-700">{detail.moduleLabel}</span>
              <button type="button" onClick={() => setDetail(null)} aria-label={t("close")} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <div className="space-y-3 px-4 py-4">
              <h3 className="text-xl font-black text-slate-900">{detail.title ?? t("recordFallbackTitle")}</h3>
              {detail.occurredAt ? <p className="text-sm text-slate-500">{t("detailDateLabel", { date: detail.occurredAt.slice(0, 10) })}</p> : null}
              {detail.snippet ? <p className="text-sm text-slate-700">{detail.snippet}</p> : null}
              {detail.evidence.length > 0 ? (
                <ul className="space-y-1.5">
                  {detail.evidence.slice(0, 8).map((e, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.text}</li>
                  ))}
                </ul>
              ) : null}
              {detail.topicTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detail.topicTags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{tag}</span>)}
                </div>
              ) : null}
              {!detail.sourceAvailable ? <p className="text-sm text-amber-700">{t("sourceGone")}</p> : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 h-3 w-20 rounded-full bg-slate-200" />
          <div className="h-4 w-2/3 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function StateCard({ icon, title, msg, action }: { icon: string; title: string; msg: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
      <div className="mb-2 text-2xl" aria-hidden>{icon}</div>
      <h3 className="text-base font-black text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{msg}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
