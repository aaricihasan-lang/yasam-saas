"use client";

import { useEffect, useRef, useState } from "react";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HdProfessionalReportSummary } from "@/lib/human-design/reporting/reportSummary";

/**
 * P2-3 — Profesyonel rapor ÖZET görünümü (tüm platformlar; Android'de Word yerine).
 * Yalnız danışan/harita özeti + bölüm başlıkları gösterilir; yorum metni Word dosyasındadır.
 */
type Props = { reportId: string; isAndroid: boolean; onClose: () => void };

function formatDate(val: string | null | undefined, withTime = false): string {
  if (!val) return "—";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
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
        else setError(j.error ?? `Özet yüklenemedi (HTTP ${res.status}).`);
      })
      .catch(() => alive && setError("Ağ hatası. Bağlantını kontrol et."));
    return () => {
      alive = false;
    };
  }, [reportId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-4 sm:py-6">
      <button type="button" aria-label="Kapat" onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" />
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
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Profesyonel Rapor Özeti</p>
            <h2 id="hd-pro-ozet-title" className="mt-0.5 text-base font-black text-slate-900 [overflow-wrap:anywhere] sm:text-lg">
              {summary?.title ?? "Yükleniyor…"}
            </h2>
            {summary && <p className="text-xs text-slate-500">Oluşturma: {formatDate(summary.generatedAt, true)}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div className="max-h-[65dvh] space-y-5 overflow-y-auto p-5 sm:p-6">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>
          ) : !summary ? (
            <p className="text-sm text-slate-500">Özet yükleniyor…</p>
          ) : (
            <>
              <dl className="space-y-2">
                <Row label="Danışan" value={summary.client.name} />
                <Row label="Doğum tarihi" value={summary.client.birthDate ? formatDate(summary.client.birthDate) : null} />
                <Row label="Doğum saati" value={summary.client.birthTime} />
                <Row label="Doğum yeri" value={summary.client.birthPlace} />
                <Row label="Tip" value={summary.type} />
                <Row label="Otorite" value={summary.authority} />
                <Row label="Profil" value={summary.chart.profile} />
                <Row label="Tanım" value={summary.chart.definition} />
                <Row label="BodyGraph görseli" value={summary.hasChartImage ? "Raporda var" : "Yok"} />
              </dl>
              <ListBlock label="Tanımlı merkezler" items={summary.chart.definedCenters} />
              <ListBlock label="Kanal bölümleri" items={summary.channels} />
              <ListBlock label="Kapı bölümleri" items={summary.gates} />
              <ListBlock label="Asılı kapılar" items={summary.hangingGates} />
              {summary.omittedCount > 0 && (
                <p className="text-xs text-amber-700">
                  {summary.omittedCount} bölüm, içeriği henüz yayımlanmadığı için rapora alınmadı.
                </p>
              )}
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-100">
                {isAndroid
                  ? "Bu raporun tam yorum metni Word belgesindedir. Word dosyası bu cihazda indirilemez; bilgisayardan Kayıtlı Raporlar ekranında “Word İndir” ile alabilirsiniz."
                  : "Bu raporun tam yorum metni Word belgesindedir; “Word İndir” ile indirebilirsiniz."}
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
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
