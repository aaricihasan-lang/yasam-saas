"use client";

import { useTranslations } from "next-intl";
import { useAromaReadError } from "@/lib/aromaterapi/useAromaterapiModuleText";
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
  const t = useTranslations("aromatherapy.knowledge.form.pages");
  const readError = useAromaReadError();
  const fetcher = useCallback((signal: AbortSignal) => fetchKnowledgeRecord(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } =
    useAromaterapiDetail<KnowledgeRecordDetail>(fetcher, id);

  return (
    <AromaterapiSectionShell
      title={t("editTitle")}
      subtitle={t("editSubtitle")}
      icon="📑"
      breadcrumbLeaf={t("editLeaf")}
      actions={
        <Link
          href={id ? `/aromaterapi/bilgi-kayitlari/${id}` : "/aromaterapi/bilgi-kayitlari"}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          {t("backRecord")}
        </Link>
      }
    >
      {loading ? (
        <AromaterapiDetailSkeleton />
      ) : notFound ? (
        <AromaterapiEmptyState
          variant="empty"
          icon="🔎"
          title={t("notFound")}
          message={t("notFoundBody")}
          action={
            <Link
              href="/aromaterapi/bilgi-kayitlari"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800"
            >
              {t("backRecords")}
            </Link>
          }
        />
      ) : errorCode ? (
        <ReadError message={readError(errorCode)} onRetry={retry} />
      ) : data ? (
        <KnowledgeRecordForm mode="edit" initial={data} isDemo={isDemo} />
      ) : null}
    </AromaterapiSectionShell>
  );
}
