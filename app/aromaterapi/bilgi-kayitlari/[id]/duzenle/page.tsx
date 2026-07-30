"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { ReadError } from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { useAromaterapiDetail } from "@/app/aromaterapi/_components/read/useAromaterapiDetail";
import { KnowledgeRecordForm } from "@/app/aromaterapi/_components/write/KnowledgeRecordForm";
import { fetchKnowledgeRecord } from "@/lib/aromaterapi/claimData";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import { readYasamUser } from "@/lib/auth/yasamUser";
import type { KnowledgeRecordDetail } from "@/lib/aromaterapi/readTypes";

/**
 * Bilgi Kaydını Düzenle — C3D-D edit ekranı. GET ile hydrate edilir; mevcut C2T PATCH
 * motoruna bağlanır (reason zorunlu, expected_updated_at, 409 conflict, child
 * preserve/clear/replace). Out-of-tenant/eksik → varlık sızdırmayan 404 ekranı.
 */
export default function BilgiKaydiDuzenlePage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const isDemo = readYasamUser()?.is_demo_account === true;
  const fetcher = useCallback((signal: AbortSignal) => fetchKnowledgeRecord(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } =
    useAromaterapiDetail<KnowledgeRecordDetail>(fetcher, id);

  return (
    <AromaterapiSectionShell
      title="Bilgi Kaydını Düzenle"
      subtitle="Değişiklik yaparken bir gerekçe girmeniz gerekir."
      icon="📑"
      breadcrumbLeaf="Düzenle"
      showNav={false}
      actions={
        <Link
          href={id ? `/aromaterapi/bilgi-kayitlari/${id}` : "/aromaterapi/bilgi-kayitlari"}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          ← Kayda dön
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
              href="/aromaterapi/bilgi-kayitlari"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800"
            >
              Bilgi Kayıtlarına dön
            </Link>
          }
        />
      ) : errorCode ? (
        <ReadError message={messageForCode(errorCode)} onRetry={retry} />
      ) : data ? (
        <KnowledgeRecordForm mode="edit" initial={data} isDemo={isDemo} />
      ) : null}
    </AromaterapiSectionShell>
  );
}
