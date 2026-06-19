"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { MONTH_NAMES_TR } from "@/lib/cosmic/hacamat";

// ─── İçerik ───────────────────────────────────────────────────────────────────

function ReportView() {
  const params   = useSearchParams();
  const rawMonth = parseInt(params.get("month") ?? "", 10);
  const rawYear  = parseInt(params.get("year")  ?? "", 10);
  const month    = isNaN(rawMonth) ? new Date().getMonth()    : Math.min(11, Math.max(0, rawMonth));
  const year     = isNaN(rawYear)  ? new Date().getFullYear() : rawYear;

  const mm         = String(month + 1).padStart(2, "0");
  const pdfViewUrl = `/api/hacamat/pdf-report?month=${month}&year=${year}&disposition=inline`;
  const pdfDlUrl   = `/api/hacamat/pdf-report?month=${month}&year=${year}`;
  const wordDlUrl  = `/api/hacamat/word-report?month=${month}&year=${year}`;
  const pdfFile    = `hacamat-takvimi-${year}-${mm}.pdf`;
  const wordFile   = `hacamat-takvimi-${year}-${mm}.docx`;
  const monthLabel = `${MONTH_NAMES_TR[month] ?? ""} ${year}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
      <div className="px-4 pt-4 pb-8 sm:px-6 lg:px-8">

        {/* Başlık satırı */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/dashboard/cosmic-calendar/hacamat"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm no-underline transition hover:bg-white hover:text-teal-700"
          >
            <ArrowLeft className="h-3 w-3" /> Geri
          </Link>
          <h1 className="truncate text-sm font-black text-slate-800">{monthLabel} Hacamat Raporu</h1>
        </div>

        {/* İndirme / Açma linkleri — md ve üzerinde görünür */}
        <div className="mb-4 hidden gap-2 md:flex md:justify-end">
          {/* PDF aç (sistem PDF görüntüleyicisi) */}
          <a
            href={pdfViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-3 text-[12px] font-black text-teal-700 shadow-sm transition hover:bg-teal-50 active:scale-[0.98] sm:w-auto sm:py-2.5"
          >
            <FileText className="h-4 w-4" />
            PDF Aç
          </a>

          {/* PDF indir */}
          <a
            href={pdfDlUrl}
            download={pdfFile}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-[12px] font-black text-teal-800 shadow-sm transition hover:bg-teal-100 active:scale-[0.98] sm:w-auto sm:py-2.5"
          >
            <Download className="h-4 w-4" />
            PDF İndir
          </a>

          {/* Word indir */}
          <a
            href={wordDlUrl}
            download={wordFile}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-700 px-5 py-3 text-[12px] font-black text-white shadow-lg shadow-teal-300/30 transition hover:from-teal-700 hover:to-emerald-800 active:scale-[0.98] sm:w-auto sm:py-2.5"
          >
            <FileText className="h-4 w-4" />
            Word İndir
          </a>
        </div>

        {/* PDF önizleme — <object> ile, fallback yerleşik */}
        <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📄 PDF Önizleme</span>
            <span className="text-[9px] text-slate-400">— {monthLabel}</span>
          </div>

          {/* object tag: Chrome/Firefox/Edge/Android Chrome'da PDF gösterir */}
          <object
            data={pdfViewUrl}
            type="application/pdf"
            className="w-full"
            style={{ minHeight: "75vh" }}
          >
            {/* Fallback: iOS Safari, bazı Android WebView'lar <object> desteklemez */}
            <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-100 text-3xl shadow-sm">
                📄
              </div>
              <div className="max-w-xs">
                <p className="text-[13px] font-black text-slate-800">PDF bu cihazda görüntülenemiyor.</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                  Yukarıdaki <strong className="text-teal-700">PDF Aç</strong> butonuna dokunarak
                  sisteminizin PDF görüntüleyicisinde açabilirsiniz.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <a
                  href={pdfViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-[13px] font-black text-white shadow-md active:scale-[0.98]"
                >
                  <FileText className="h-4 w-4" /> PDF Aç
                </a>
                <a
                  href={pdfDlUrl}
                  download={pdfFile}
                  className="flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-5 py-3 text-[13px] font-black text-teal-700 active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" /> PDF İndir
                </a>
              </div>
            </div>
          </object>
        </div>

      </div>
    </main>
  );
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function HacamatReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)]">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-teal-300 border-t-teal-600" />
            <p className="text-[11px] text-slate-400">Rapor hazırlanıyor…</p>
          </div>
        </div>
      }
    >
      <ReportView />
    </Suspense>
  );
}
