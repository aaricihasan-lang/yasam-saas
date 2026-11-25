"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import { useEnumLabel } from "@/lib/aromaterapi/useEnumLabel";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { DetailScreen } from "@/app/aromaterapi/_components/read/DetailScreen";
import { AromaterapiDeleteAction } from "@/app/aromaterapi/_components/write/AromaterapiDeleteAction";
import {
  DetailField,
  DetailSection,
  MetaChip,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { useAromaterapiDetail } from "@/app/aromaterapi/_components/read/useAromaterapiDetail";
import { PreparationMethodList } from "@/app/aromaterapi/katalog/_components/PreparationMethodList";
import { fetchPreparation } from "@/lib/aromaterapi/catalogData";
import { readYasamUser } from "@/lib/auth/yasamUser";
import type { PreparationDetail } from "@/lib/aromaterapi/readTypes";
import { CATALOG_STATUS_TR, PREPARATION_TYPE_TR } from "@/lib/aromaterapi/readLabels";

/**
 * Preparat detay — künye + bağlı bitki + üretim/elde ediliş yöntemleri (C3D-B2B) +
 * ilişkili bilgi kaydı sayısı. Yöntem bölümü artık gerçek verilerle doldurulur
 * (method series/revision); düzenleme ve "Yeni Üretim Yöntemi" akışları bağlanır.
 */
export default function PreparatDetayPage() {
  const enumLabel = useEnumLabel();
  const t = useTranslations("aromatherapy.catalog.prep");
  const locale = useLocale() as ActiveLocale;
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const isDemo = readYasamUser()?.is_demo_account === true;
  const fetcher = useCallback((signal: AbortSignal) => fetchPreparation(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } = useAromaterapiDetail<PreparationDetail>(
    fetcher,
    id,
  );

  const typeLabel = data ? enumLabel(PREPARATION_TYPE_TR, data.preparation_type) : t("fallbackTitle");

  return (
    <DetailScreen
      title={typeLabel}
      subtitle={data?.taxon_canonical_name ?? undefined}
      icon="⚗️"
      breadcrumbLeaf={t("fallbackTitle")}
      backHref="/aromaterapi/katalog?tab=preparatlar"
      backLabel={t("back")}
      wordExportUrl={id ? `/api/aromaterapi/preparations/${id}/word-report` : undefined}
      extraActions={
        data ? (
          <AromaterapiDeleteAction
            kind="preparation"
            id={data.id}
            updatedAt={data.updated_at}
            recordLabel={
              <>
                {typeLabel}
                {data.taxon_canonical_name ? <> · <span className="italic">{data.taxon_canonical_name}</span></> : null}
              </>
            }
            entityNoun={t("noun")}
            listHref="/aromaterapi/katalog?tab=preparatlar"
            isDemo={isDemo}
            onReload={retry}
          />
        ) : undefined
      }
      loading={loading}
      notFound={notFound}
      errorCode={errorCode}
      onRetry={retry}
    >
      {data ? (
        <div className="space-y-4">
          {!isDemo ? (
            <div className="flex justify-end">
              <Link
                href={`/aromaterapi/katalog/preparatlar/${data.id}/duzenle`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                {t("edit")}
              </Link>
            </div>
          ) : null}

          <DetailSection title={t("general")}>
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailField label={t("type")} value={typeLabel} />
              <DetailField label={t("plantPart")} value={data.plant_part} />
              <DetailField label={t("chemotype")} value={data.chemotype ?? "—"} />
              <DetailField
                label={t("status")}
                value={<MetaChip tone="teal">{enumLabel(CATALOG_STATUS_TR, data.status)}</MetaChip>}
              />
            </dl>
          </DetailSection>

          <DetailSection title={t("linkedPlant")}>
            {data.taxon ? (
              <Link
                href={`/aromaterapi/katalog/bitkiler/${data.taxon.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-teal-100/70 bg-white/90 px-3.5 py-3 shadow-sm transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-black italic text-slate-800 [overflow-wrap:anywhere]">
                    {data.taxon.canonical_name}
                  </span>
                  <span className="block text-[11.5px] font-semibold text-slate-400">
                    {data.taxon.family}
                  </span>
                </span>
                <span aria-hidden className="text-teal-400">
                  →
                </span>
              </Link>
            ) : (
              <p className="py-3 text-center text-[13px] font-semibold text-slate-400">
                {t("noPlant")}
              </p>
            )}
          </DetailSection>

          <DetailSection
            title={t("methods")}
            hint={t("methodsHint")}
          >
            <PreparationMethodList preparationId={data.id} isDemo={isDemo} />
          </DetailSection>

          <DetailSection title={t("knowledge")}>
            {data.knowledge_record_count > 0 ? (
              <Link
                href={`/aromaterapi/bilgi-kayitlari?preparation_id=${data.id}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                {t("viewKnowledge", { n: data.knowledge_record_count, count: formatNumber(data.knowledge_record_count, undefined, locale) })}
              </Link>
            ) : (
              <p className="py-3 text-center text-[13px] font-semibold text-slate-400">
                {t("noKnowledge")}
              </p>
            )}
          </DetailSection>
        </div>
      ) : null}
    </DetailScreen>
  );
}
