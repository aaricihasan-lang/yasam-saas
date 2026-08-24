"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { clientResultDisplayTitle, type ClientSourceModule } from "@/lib/yasam-hafizasi/client/clientSources";
import {
  filterTenantByModules,
  type TenantClientSearchResponse,
  type TenantClientSearchResult,
} from "@/lib/yasam-hafizasi/client/tenantClientSearchResult";
import { fetchTenantClientYhSearch } from "@/lib/yasam-hafizasi/client/tenantClientSearchApiClient";
import { YH_MAX_QUERY_LENGTH } from "@/lib/yasam-hafizasi/search/queryPipeline";
import { ResultsSkeleton, WorkspaceEmpty } from "./WorkspaceStates";

type Status = "idle" | "loading" | "done" | "error" | "disabled";

/** Reason-aware "kapalı/etkin değil" kopyası (safe-empty; asla hata gösterme). */
const DISABLED_COPY: Record<string, { icon: string; title: string; message: string }> = {
  "not-active": {
    icon: "🔒",
    title: "Danışan Hafızası henüz etkin değil",
    message: "Bu özellik etkinleştirildiğinde danışan geçmişinizde arama yapabilirsiniz.",
  },
  "flag-disabled": {
    icon: "🔒",
    title: "Yaşam Hafızası bu hesapta henüz aktif değil",
    message: "Bu özellik hesabınız için etkinleştirildiğinde arama yapabilirsiniz.",
  },
  demo: {
    icon: "🧪",
    title: "Demo hesabında kullanılamaz",
    message: "Demo hesaplarında danışan hafızası araması yapılmaz.",
  },
};

/**
 * TENANT-WIDE Danışan Hafızası paneli — uzmanın KENDİ tenant'ındaki tüm danışan
 * geçmişinde arar (POST /api/yasam-hafizasi/client-search). Professional panelle AYNI
 * premium görsel dil; ek olarak danışan adı + olay tarihi gösterir. tenantId/clientId
 * ASLA gönderilmez (server session'dan çözülür).
 */
export function ClientMemoryPanel() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<TenantClientSearchResponse | null>(null);
  const [selectedModules, setSelectedModules] = useState<ClientSourceModule[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<TenantClientSearchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (query: string, from: string, to: string) => {
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
      const res = await fetchTenantClientYhSearch(
        { q: trimmed, dateFrom: from || undefined, dateTo: to || undefined },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setResponse(res);
      if (res.disabled) setStatus("disabled");
      else if (!res.ok) setStatus("error");
      else setStatus("done");
    },
    [],
  );

  const toggleModule = useCallback((m: ClientSourceModule) => {
    setSelectedModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }, []);

  const displayed = useMemo(
    () => (response ? filterTenantByModules(response.results, selectedModules) : []),
    [response, selectedModules],
  );

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Kendi danışanlarınızın geçmiş kayıtlarında (seans, not, ödev, taş, kombinasyon, randevu)
        arayın. Yalnız kendi tenant kapsamınızdaki danışanlar görünür.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(q, dateFrom, dateTo);
        }}
        className="mb-4 flex items-stretch gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={YH_MAX_QUERY_LENGTH}
            aria-label="Danışan Hafızası araması"
            placeholder="Ara: danışan geçmişi, seans notu, ödev, taş, konu…"
            className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 pl-11 pr-4 text-base text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <button type="submit" className="btn-primary inline-flex min-h-[48px] items-center rounded-2xl px-5 text-sm">
          Ara
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="text-[11px] font-black uppercase tracking-wider text-slate-500" htmlFor="yh-cm-from">
          Tarih
        </label>
        <input
          id="yh-cm-from"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Başlangıç tarihi"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 sm:flex-none"
        />
        <span className="text-slate-400" aria-hidden>–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Bitiş tarihi"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 sm:flex-none"
        />
        {(dateFrom || dateTo) && submitted ? (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              void runSearch(submitted, "", "");
            }}
            className="text-xs font-semibold text-slate-500 hover:text-violet-700"
          >
            Tarihi temizle
          </button>
        ) : null}
      </div>

      {status === "idle" ? <WorkspaceEmpty variant="client-cold-start" /> : null}
      {status === "loading" ? <ResultsSkeleton /> : null}
      {status === "disabled" && response ? (
        <DisabledCard reason={response.reason} />
      ) : null}
      {status === "error" ? (
        <WorkspaceEmpty
          variant="error"
          action={
            <button
              type="button"
              onClick={() => void runSearch(submitted, dateFrom, dateTo)}
              className="btn-primary inline-flex items-center rounded-xl px-4 py-2 text-sm"
            >
              Tekrar dene
            </button>
          }
        />
      ) : null}

      {status === "done" && response ? (
        response.results.length === 0 ? (
          <WorkspaceEmpty variant="no-results" />
        ) : (
          <>
            {response.facets.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Modüller</span>
                  <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-0.5">
                    {response.facets.map((f) => {
                      const active = selectedModules.includes(f.module);
                      return (
                        <button
                          key={f.module}
                          type="button"
                          onClick={() => toggleModule(f.module)}
                          aria-pressed={active}
                          className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition ${
                            active
                              ? "border-violet-300 bg-violet-600 text-white shadow"
                              : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"
                          }`}
                        >
                          {f.moduleLabel}
                          <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>
                            {f.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedModules.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedModules([])}
                      className="text-xs font-semibold text-slate-500 hover:text-violet-700"
                    >
                      Temizle
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <p className="mb-2 text-sm text-slate-500">
              <span className="font-bold text-slate-700">{displayed.length}</span> sonuç
              {selectedModules.length > 0 ? " (filtreli)" : ""}
            </p>

            {displayed.length === 0 ? (
              <WorkspaceEmpty variant="filtered" />
            ) : (
              <div className="space-y-3">
                {displayed.map((r) => (
                  <ClientResultCard key={r.id} result={r} onOpen={setSelected} />
                ))}
              </div>
            )}
          </>
        )
      ) : null}

      <ClientResultDrawer result={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DisabledCard({ reason }: { reason?: "not-active" | "flag-disabled" | "demo" }) {
  const c = DISABLED_COPY[reason ?? "not-active"] ?? DISABLED_COPY["not-active"]!;
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/80 bg-white/80 p-8 text-center shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-emerald-100 text-2xl">
        <span aria-hidden>{c.icon}</span>
      </div>
      <h2 className="text-lg font-black text-slate-800">{c.title}</h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-600">{c.message}</p>
    </div>
  );
}

function ClientResultCard({
  result,
  onOpen,
}: {
  result: TenantClientSearchResult;
  onOpen: (r: TenantClientSearchResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="block w-full rounded-2xl border border-white/80 bg-white/85 p-4 text-left shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-700">
          {result.moduleLabel}
        </span>
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          {result.clientName}
        </span>
        {result.occurredAt ? (
          <span className="text-[11px] text-slate-400">{result.occurredAt.slice(0, 10)}</span>
        ) : null}
      </div>
      <h3 className="line-clamp-1 text-base font-bold text-slate-900">{clientResultDisplayTitle(result.module, result.title)}</h3>
      {result.snippet ? (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">{result.snippet}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-slate-400">Danışan: {result.clientName}</p>
    </button>
  );
}

function ClientResultDrawer({
  result,
  onClose,
}: {
  result: TenantClientSearchResult | null;
  onClose: () => void;
}) {
  if (!result) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Danışan kaydı detayı">
      <button type="button" aria-label="Kapat" onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl sm:rounded-l-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
          <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-700">
            {result.moduleLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <span className="mb-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {result.clientName}
            </span>
            <h2 className="text-xl font-black text-slate-900">{clientResultDisplayTitle(result.module, result.title)}</h2>
            {result.occurredAt ? (
              <p className="mt-1 text-sm text-slate-500">Tarih: {result.occurredAt.slice(0, 10)}</p>
            ) : null}
          </div>

          {result.snippet ? <p className="text-sm leading-relaxed text-slate-700">{result.snippet}</p> : null}

          {result.evidence.length > 0 ? (
            <section>
              <h3 className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">Eşleşen içerik</h3>
              <ul className="space-y-1.5">
                {result.evidence.slice(0, 8).map((e, i) => (
                  <li key={`${e.kind}-${i}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {e.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.topicTags.length > 0 ? (
            <section>
              <h3 className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">Konular</h3>
              <div className="flex flex-wrap gap-1.5">
                {result.topicTags.map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    #{t}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {!result.sourceAvailable ? (
            <p className="text-sm text-amber-700">Kaynak kaydı artık mevcut değil (snapshot korundu).</p>
          ) : null}

          {result.clientDeepLink ? (
            <Link
              href={result.clientDeepLink}
              className="btn-primary inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm"
            >
              {result.clientName} · {result.moduleLabel} kaydına git
            </Link>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
