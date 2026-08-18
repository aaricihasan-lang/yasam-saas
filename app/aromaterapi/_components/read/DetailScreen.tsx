"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import { ReadError } from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { downloadWord } from "@/lib/aromaterapi/wordExport";
import { useToast } from "@/components/ui/ToastProvider";

/** Detay ekranı tek-kayıt Word export butonu (çift-tık kilidi + toast). */
export function DetailWordButton({ url }: { url: string }) {
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  async function run() {
    if (exporting) return;
    setExporting(true);
    const { ok, error } = await downloadWord(url);
    setExporting(false);
    if (ok) showToast({ title: "Word hazırlandı", message: "Rapor indiriliyor.", type: "success" });
    else showToast({ title: "Word oluşturulamadı", message: error ?? "Rapor oluşturulamadı.", type: "error" });
  }
  return (
    <button type="button" onClick={() => void run()} disabled={exporting}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 text-[13px] font-black text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
      title="Bu kaydı Word'e aktar">
      📄 {exporting ? "Hazırlanıyor…" : "Word'e Aktar"}
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
}) {
  return (
    <AromaterapiSectionShell
      title={title}
      subtitle={subtitle}
      icon={icon}
      breadcrumbLeaf={breadcrumbLeaf}
      showNav={false}
      actions={
        <div className="flex flex-wrap items-center gap-2">
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
          title="Kayıt bulunamadı"
          message="Bu kayıt bulunamadı veya bu hesabın kütüphanesinde değil."
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
        <ReadError message={messageForCode(errorCode)} onRetry={onRetry} />
      ) : (
        children
      )}
    </AromaterapiSectionShell>
  );
}
