"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { MONTH_NAMES_TR } from "@/lib/cosmic/hacamat";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import { useIsAndroidApp } from "@/hooks/useIsAndroidApp";
import { isAndroidAppClient } from "@/lib/platform/outputSupport";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { runInEffect } from "@/lib/runInEffect";

/**
 * FAZ1 FINAL HARDENING (AUTH): rapor GET uçları artık kimlik + modül kapısı ister.
 * iframe / <object data> / <a href> istek başlığı taşıyamadığı için dosyalar
 * fetch (x-user-id + x-session-token) → blob → object URL ile gösterilir/indirilir.
 */
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-user-id": readYasamUser()?.id ?? "" };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  return h;
}

function reportErrorMessage(status: number): string {
  if (status === 401) return "Oturumunuz doğrulanamadı. Lütfen yeniden giriş yapın.";
  if (status === 403) return "Bu rapor hesabınız için kullanılamıyor.";
  if (status === 429) return "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.";
  return "Rapor hazırlanamadı. Lütfen tekrar deneyin.";
}

// ─── İçerik ───────────────────────────────────────────────────────────────────

function ReportView() {
  const params   = useSearchParams();
  const isAndroid = useIsAndroid();
  // Android uygulama WebView'inde blob: önizleme (<object>), window.open(blob) ve blob
  // indirme çalışmaz → PDF Aç/İndir + önizleme yerine kısa bilgi notu (plan §4.6).
  // Android Chrome / iOS / masaüstünde mevcut davranış aynen korunur.
  const isAndroidApp = useIsAndroidApp();
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

  // Önizleme PDF'i: kimlikli fetch → blob → object URL (değişimde/unmount'ta revoke).
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionError, setActionError]   = useState<string | null>(null);
  const [busy, setBusy]                 = useState<"pdf" | "word" | null>(null);

  useEffect(() => {
    // Android uygulamasında önizleme gösterilmez → PDF hiç üretilmez/çekilmez.
    if (isAndroidAppClient()) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    runInEffect(() => {
      setPdfObjectUrl(null);
      setPreviewError(null);
    });
    (async () => {
      try {
        const res = await fetch(pdfViewUrl, { headers: authHeaders(), cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setPreviewError(reportErrorMessage(res.status));
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(createdUrl);
      } catch {
        if (!cancelled) setPreviewError("Bağlantı hatası. Rapor yüklenemedi.");
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [pdfViewUrl]);

  const openPdf = useCallback(() => {
    if (pdfObjectUrl) window.open(pdfObjectUrl, "_blank", "noopener,noreferrer");
  }, [pdfObjectUrl]);

  const download = useCallback(async (kind: "pdf" | "word") => {
    if (busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      const res = await fetch(kind === "pdf" ? pdfDlUrl : wordDlUrl, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        setActionError(reportErrorMessage(res.status));
        return;
      }
      await downloadFileResponse(res, kind === "pdf" ? pdfFile : wordFile);
    } catch {
      setActionError("Bağlantı hatası. Dosya indirilemedi.");
    } finally {
      setBusy(null);
    }
  }, [busy, pdfDlUrl, wordDlUrl, pdfFile, wordFile]);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
      <div className="px-4 pt-4 pb-8 sm:px-6 lg:px-8">

        {/* Başlık satırı */}
        <div className="mb-2 flex items-center justify-between gap-3">
          <h1 className="truncate text-sm font-black text-slate-800">{monthLabel} Hacamat Raporu</h1>
        </div>

        {/* ── Kapsam Uyarısı ── */}
        <p className="mb-4 rounded-[12px] border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[10px] leading-relaxed text-amber-800" role="note">
          ⚠ <strong>Geleneksel bilgi / takvimsel yardımcıdır; sağlık veya dini uygunluk iddiası değildir.</strong>
        </p>

        {actionError && (
          <p className="mb-3 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700" role="alert">
            {actionError}
          </p>
        )}

        {/* Android uygulaması: bu çıktılar desteklenmez → yalnız bilgi notu */}
        {isAndroidApp && (
          <p className="mb-4 rounded-[12px] border border-slate-200 bg-white/80 px-3 py-3 text-[12px] font-semibold leading-relaxed text-slate-700" role="note">
            Bu çıktı uygulamada desteklenmiyor; tarayıcıdan veya bilgisayardan açın.
          </p>
        )}

        {/* İndirme / Açma butonları — md ve üzerinde görünür */}
        {!isAndroidApp && (
        <div className="no-android-app mb-4 hidden gap-2 md:flex md:justify-end">
          {/* PDF aç (sistem PDF görüntüleyicisi) */}
          <button
            type="button"
            onClick={openPdf}
            disabled={!pdfObjectUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-3 text-[12px] font-black text-teal-700 shadow-sm transition hover:bg-teal-50 active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:py-2.5"
          >
            <FileText className="h-4 w-4" />
            PDF Aç
          </button>

          {/* PDF indir */}
          <button
            type="button"
            onClick={() => void download("pdf")}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-[12px] font-black text-teal-800 shadow-sm transition hover:bg-teal-100 active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:py-2.5"
          >
            <Download className="h-4 w-4" />
            {busy === "pdf" ? "Hazırlanıyor…" : "PDF İndir"}
          </button>

          {/* Word indir */}
          {!isAndroid && (
            <button
              type="button"
              onClick={() => void download("word")}
              disabled={busy !== null}
              className="no-android flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-700 px-5 py-3 text-[12px] font-black text-white shadow-lg shadow-teal-300/30 transition hover:from-teal-700 hover:to-emerald-800 active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:py-2.5"
            >
              <FileText className="h-4 w-4" />
              {busy === "word" ? "Hazırlanıyor…" : "Word İndir"}
            </button>
          )}
        </div>
        )}

        {/* PDF önizleme — <object> (blob: URL) ile, fallback yerleşik */}
        {!isAndroidApp && (
        <div className="no-android-app overflow-hidden rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📄 PDF Önizleme</span>
            <span className="text-[9px] text-slate-400">— {monthLabel}</span>
          </div>

          {previewError ? (
            <p className="px-4 py-12 text-center text-[12px] font-semibold text-rose-700" role="alert">
              {previewError}
            </p>
          ) : !pdfObjectUrl ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-300 border-t-teal-600" />
              <p className="text-[11px] text-slate-400">Rapor hazırlanıyor…</p>
            </div>
          ) : (
            /* object tag: Chrome/Firefox/Edge/Android Chrome'da PDF gösterir */
            <object
              data={pdfObjectUrl}
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
                    Aşağıdaki <strong className="text-teal-700">PDF Aç</strong> butonuna dokunarak
                    sisteminizin PDF görüntüleyicisinde açabilirsiniz.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={openPdf}
                    className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-[13px] font-black text-white shadow-md active:scale-[0.98]"
                  >
                    <FileText className="h-4 w-4" /> PDF Aç
                  </button>
                  <button
                    type="button"
                    onClick={() => void download("pdf")}
                    disabled={busy !== null}
                    className="flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-5 py-3 text-[13px] font-black text-teal-700 active:scale-[0.98] disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" /> {busy === "pdf" ? "Hazırlanıyor…" : "PDF İndir"}
                  </button>
                </div>
              </div>
            </object>
          )}
        </div>
        )}

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
