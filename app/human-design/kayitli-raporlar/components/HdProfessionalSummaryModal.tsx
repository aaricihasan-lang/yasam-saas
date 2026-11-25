"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HdProfessionalReportSummary } from "@/lib/human-design/reporting/reportSummary";

/**
 * P2-3 — Profesyonel rapor ÖZET görünümü (tüm platformlar; Android'de Word yerine).
 * Yalnız danışan/harita özeti + bölüm başlıkları gösterilir; yorum metni Word dosyasındadır.
 * I18N (HD-B): sistem metinleri `hd.proSummary` (TR bayt-eşit). Özetteki tip/otorite/merkez/kanal/kapı değerleri
 * sunucunun DONMUŞ rapor snapshot'ından gelir (rapor oluşturulduğu andaki TR etiket) → aynen gösterilir.
 */
type Props = { reportId: string; isAndroid: boolean; onClose: () => void };

function formatDate(val: string | null | undefined, withTime = false, dateLocale = "tr-TR"): string {
  if (!val) return "—";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  return d.toLocaleDateString(dateLocale, { day: "2-digit", month: "long", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-36 shrink-0 text-xs font-bold text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{value || "—"}</dd>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-black uppercase tracking-widest text-indigo-700">
        {label} ({items.length})
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <li key={it} className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-100">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HdProfessionalSummaryModal({ reportId, isAndroid, onClose }: Props) {
  const ts = useTranslations("hd.proSummary");
  const dateLocale = useLocale() === "tr" ? "tr-TR" : "en-GB";
  const dialogRef = useRef<HTMLDivElement>(null);
  useHdModalA11y(dialogRef, onClose);
  const [summary, setSummary] = useState<HdProfessionalReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const u = readYasamUser();
    const t = readSessionToken();
    fetch(`/api/hd/reports/professional/summary?id=${encodeURIComponent(reportId)}`, {
      headers: { "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) },
      cache: "no-store",
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: HdProfessionalReportSummary; error?: string };
        if (!alive) return;
        if (res.ok && j.ok && j.summary) setSummary(j.summary);
        else setError(j.error ?? ts("loadFailed", { status: res.status }));
      })
      .catch(() => alive && setError(ts("network")));
    return () => {
      alive = false;
    };
  }, [reportId, ts]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-4 sm:py-6">
      <button type="button" aria-label={ts("close")} onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hd-pro-ozet-title"
        tabIndex={-1}
        className="relative z-10 w-full max-w-2xl rounded-[28px] border-2 border-emerald-200/80 bg-white shadow-2xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 rounded-t-[26px] border-b border-emerald-100/80 bg-gradient-to-r from-emerald-50 to-teal-50/60 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">{ts("eyebrow")}</p>
            <h2 id="hd-pro-ozet-title" className="mt-0.5 text-base font-black text-slate-900 [overflow-wrap:anywhere] sm:text-lg">
              {summary?.title ?? ts("loading")}
            </h2>
            {summary && <p className="text-xs text-slate-500">{ts("createdAt", { date: formatDate(summary.generatedAt, true, dateLocale) })}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ts("close")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div className="max-h-[65dvh] space-y-5 overflow-y-auto p-5 sm:p-6">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>
          ) : !summary ? (
            <p className="text-sm text-slate-500">{ts("summaryLoading")}</p>
          ) : (
            <>
              <dl className="space-y-2">
                <Row label={ts("row.client")} value={summary.client.name} />
                <Row label={ts("row.birthDate")} value={summary.client.birthDate ? formatDate(summary.client.birthDate, false, dateLocale) : null} />
                <Row label={ts("row.birthTime")} value={summary.client.birthTime} />
                <Row label={ts("row.birthPlace")} value={summary.client.birthPlace} />
                <Row label={ts("row.type")} value={summary.type} />
                <Row label={ts("row.authority")} value={summary.authority} />
                <Row label={ts("row.profile")} value={summary.chart.profile} />
                <Row label={ts("row.definition")} value={summary.chart.definition} />
                <Row label={ts("row.bodygraph")} value={summary.hasChartImage ? ts("hasImage") : ts("noImage")} />
              </dl>
              <ListBlock label={ts("list.definedCenters")} items={summary.chart.definedCenters} />
              <ListBlock label={ts("list.channels")} items={summary.channels} />
              <ListBlock label={ts("list.gates")} items={summary.gates} />
              <ListBlock label={ts("list.hangingGates")} items={summary.hangingGates} />
              {summary.omittedCount > 0 && (
                <p className="text-xs text-amber-700">
                  {ts("omitted", { count: summary.omittedCount })}
                </p>
              )}
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-100">
                {isAndroid ? ts("androidNote") : ts("desktopNote")}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-[26px] border-t border-emerald-100/80 bg-slate-50/60 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            {ts("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
