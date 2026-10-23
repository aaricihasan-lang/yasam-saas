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
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

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
  // Not: "Rapora ekle" seçim akışı (checkbox + picked) henüz gerçek sonuç üretmediğinden
  // kullanıcıya gösterilmiyor (spec §9). Rapora kayıt ekleme resmi yolu MemoryPicker'dır
  // ("🧠 Yaşam Hafızası'ndan Seç"). Arama + görüntüleme aynen korunur.

  return (
    <div className="w-full">
      <p className={`${dyp.kDesc} mb-3`}>
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8592a6]" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            aria-label={t("searchAria")}
            placeholder={t("searchPlaceholder")}
            className={`${dyp.kInput} h-11 w-full !pl-11 !text-base`}
          />
        </div>
        <button type="submit" className={`${dyp.kBtnPrimary} inline-flex min-h-[44px] items-center`}>
          {t("searchButton")}
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className={dyp.kLabel}>{t("dateLabel")}</label>
        {/* Global tarih sözleşmesi: görünen format DD.MM.YYYY (tüm locale). Native
            <input type="date"> tarayıcı locale'ine göre mm/dd/yyyy gösterebildiğinden
            kontrollü maskeli bileşen kullanılır; saklanan değer ISO yyyy-mm-dd kalır. */}
        <BirthDateInput value={dateFrom} onChange={setDateFrom} ariaLabel={t("dateFromAria")} className={`${dyp.kInput} w-32 !px-2 !py-1`} />
        <span className="text-[#8592a6]">–</span>
        <BirthDateInput value={dateTo} onChange={setDateTo} ariaLabel={t("dateToAria")} className={`${dyp.kInput} w-32 !px-2 !py-1`} />
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
        <StateCard icon="⚠️" title={t("states.errorTitle")} msg={t("states.errorMsg")} action={<button type="button" onClick={() => void runSearch(submitted)} className={`${dyp.kBtnPrimary} ${dyp.kBtnSm} inline-flex items-center`}>{t("states.retry")}</button>} />
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
                      className={`${active ? dyp.kBtnPrimary : dyp.kBtnSecondary} ${dyp.kBtnSm} inline-flex min-h-[34px] items-center gap-1.5 !rounded-full`}>
                      {f.moduleLabel}<span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-[#f2f4f7] text-[#55637a]"}`}>{f.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className={`${dyp.kMeta} mb-2`}>{t.rich("resultsCount", { count: displayed.length, b: (chunks) => <span className="font-bold text-[#1f3050]">{chunks}</span> })}</p>
            {displayed.length === 0 ? (
              <StateCard icon="🧭" title={t("states.filteredEmptyTitle")} msg={t("states.filteredEmptyMsg")} />
            ) : (
              <div className="space-y-2">
                {displayed.map((r) => (
                  <div key={r.id} className={`${dyp.kCard} flex items-start gap-2 !p-3`}>
                    <button type="button" onClick={() => setDetail(r)} className="min-w-0 flex-1 text-left">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={dyp.kChipTeal}>{r.moduleLabel}</span>
                        {r.occurredAt ? <span className={`${dyp.kMeta} !text-[11px]`}>{r.occurredAt.slice(0, 10)}</span> : null}
                      </div>
                      <h4 className="line-clamp-1 text-sm font-bold text-[#0f1d36]">{r.title ?? t("recordFallbackTitle")}</h4>
                      {r.snippet ? <p className="line-clamp-1 text-sm text-[#55637a]">{r.snippet}</p> : null}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t("detailDialogAria")}>
          <button type="button" aria-label={t("close")} onClick={() => setDetail(null)} className={`${dyp.kOverlay} absolute inset-0`} />
          <aside className={`${dyp.kModal} relative flex h-full w-full max-w-md flex-col overflow-y-auto !rounded-none`}>
            <div className={`${dyp.kModalHead} flex items-center justify-between`}>
              <span className={dyp.kChipTeal}>{detail.moduleLabel}</span>
              <button type="button" onClick={() => setDetail(null)} aria-label={t("close")} className={`${dyp.kBtnGhost} inline-flex h-9 w-9 items-center justify-center !p-0 !text-[#55637a]`}><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <div className="space-y-3 px-4 py-4">
              <h3 className={dyp.kTitle}>{detail.title ?? t("recordFallbackTitle")}</h3>
              {detail.occurredAt ? <p className={dyp.kMeta}>{t("detailDateLabel", { date: detail.occurredAt.slice(0, 10) })}</p> : null}
              {detail.snippet ? <p className={dyp.kFieldText}>{detail.snippet}</p> : null}
              {detail.evidence.length > 0 ? (
                <ul className="space-y-1.5">
                  {detail.evidence.slice(0, 8).map((e, i) => (
                    <li key={i} className={`${dyp.kField} ${dyp.kFieldText}`}>{e.text}</li>
                  ))}
                </ul>
              ) : null}
              {detail.topicTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detail.topicTags.map((tag) => <span key={tag} className={dyp.kChip}>#{tag}</span>)}
                </div>
              ) : null}
              {!detail.sourceAvailable ? <p className={dyp.kAlertWarn}>{t("sourceGone")}</p> : null}
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
        <div key={i} className={`${dyp.kCard} animate-pulse !p-3`}>
          <div className="mb-2 h-3 w-20 rounded-full bg-[#e3e7ee]" />
          <div className="h-4 w-2/3 rounded bg-[#e3e7ee]" />
        </div>
      ))}
    </div>
  );
}

function StateCard({ icon, title, msg, action }: { icon: string; title: string; msg: string; action?: React.ReactNode }) {
  return (
    <div className={`${dyp.kCardMuted} flex min-h-[220px] flex-col items-center justify-center !p-8 text-center`}>
      <div className="mb-2 text-2xl" aria-hidden>{icon}</div>
      <h3 className={dyp.kSubtitle}>{title}</h3>
      <p className={`${dyp.kDesc} mt-1 max-w-md`}>{msg}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
