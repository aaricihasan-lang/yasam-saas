"use client";

import { useTranslations } from "next-intl";
import { useAromaApiError, useAromaReadError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { ReadError } from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { downloadWord } from "@/lib/aromaterapi/wordExport";
import { useToast } from "@/components/ui/ToastProvider";

/** Detay ekranı tek-kayıt Word export butonu (çift-tık kilidi + toast). */
export function DetailWordButton({ url }: { url: string }) {
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const t = useTranslations("aromatherapy.shared");
  const apiError = useAromaApiError();
  async function run() {
    if (exporting) return;
    setExporting(true);
    const { ok, error, errorCode } = await downloadWord(url);
    setExporting(false);
    if (ok) showToast({ title: t("wordReadyTitle"), message: t("wordReadyBody"), type: "success" });
    // wordExport hata metni (Türkçe/sunucu) tr'de birebir; diğer dilde dil-bağımsız koddan çeviri (yoksa genel metin).
    else showToast({ title: t("wordFailedTitle"), message: apiError.text(error, errorCode, t("wordFailedBody")), type: "error" });
  }
  return (
    <button type="button" onClick={() => void run()} disabled={exporting}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 text-[13px] font-black text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
      title={t("wordTitle")}>
      📄 {exporting ? t("wordBusy") : t("word")}
    </button>
  );
}

/**
 * Aromaterapi V2 — C3C detay ekranı kabuğu. SectionShell içinde loading/notFound/
 * error/başarılı durumlarını yönetir; başlık üstünde geri bağlantısı gösterir.
 */
export function DetailScreen({
  title,
  subtitle,
  icon,
  breadcrumbLeaf,
  backHref,
  backLabel,
  loading,
  notFound,
  errorCode,
  onRetry,
  children,
  wordExportUrl,
  extraActions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  breadcrumbLeaf?: string;
  backHref: string;
  backLabel: string;
  loading: boolean;
  notFound: boolean;
  errorCode: string | null;
  onRetry: () => void;
  children: ReactNode;
  /** Verilirse başlıkta tek-kayıt "Word'e Aktar" butonu gösterilir. */
  wordExportUrl?: string;
  /**
   * Başlık eylem alanına eklenecek ek butonlar (ör. Düzenle / Arşivle / Sil). Yalnız kayıt
   * yüklendiğinde (loading/notFound değilken) gösterilir; demo gizleme çağıranın sorumluluğu.
   */
  extraActions?: ReactNode;
}) {
  const t = useTranslations("aromatherapy.shared");
  const readError = useAromaReadError();
  return (
    <AromaterapiSectionShell
      title={title}
      subtitle={subtitle}
      icon={icon}
      breadcrumbLeaf={breadcrumbLeaf}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {extraActions && !loading && !notFound && !errorCode ? extraActions : null}
          {wordExportUrl && !loading && !notFound ? <DetailWordButton url={wordExportUrl} /> : null}
          <Link
            href={backHref}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
          >
            ← {backLabel}
          </Link>
        </div>
      }
    >
      {loading ? (
        <AromaterapiDetailSkeleton />
      ) : notFound ? (
        <AromaterapiEmptyState
          variant="empty"
          icon="🔎"
          title={t("notFoundTitle")}
          message={t("notFoundBody")}
          action={
            <Link
              href={backHref}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800"
            >
              {backLabel}
            </Link>
          }
        />
      ) : errorCode ? (
        <ReadError message={readError(errorCode)} onRetry={onRetry} />
      ) : (
        children
      )}
    </AromaterapiSectionShell>
  );
}
