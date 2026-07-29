"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import { ReadError } from "@/app/aromaterapi/_components/read/ReadPrimitives";

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
}) {
  return (
    <AromaterapiSectionShell
      title={title}
      subtitle={subtitle}
      icon={icon}
      breadcrumbLeaf={breadcrumbLeaf}
      showNav={false}
      actions={
        <Link
          href={backHref}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          ← {backLabel}
        </Link>
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
