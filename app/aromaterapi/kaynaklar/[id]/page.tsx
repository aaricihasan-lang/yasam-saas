"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import { useAromaReadError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import { useEnumLabel } from "@/lib/aromaterapi/useEnumLabel";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailScreen } from "@/app/aromaterapi/_components/read/DetailScreen";
import {
  DetailField,
  DetailSection,
  MetaChip,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { PassageAccordionItem } from "@/app/aromaterapi/_components/read/PassageAccordionItem";
import { useAromaterapiDetail } from "@/app/aromaterapi/_components/read/useAromaterapiDetail";
import { fetchSource, fetchSourcePassageList } from "@/lib/aromaterapi/sourceData";
import type { PassageListItem, SourceDetail } from "@/lib/aromaterapi/readTypes";
import { SOURCE_STATUS_TR, SOURCE_TYPE_TR } from "@/lib/aromaterapi/readLabels";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { KaynakDetailActions } from "@/app/aromaterapi/kaynaklar/_components/KaynakDetailActions";

const PASSAGE_PAGE = 25;

/** Kaynak detay — künye + pasajlar (katman açılımı) + bağlı bilgi kaydı özeti + Düzenle/Arşivle/Sil. */
export default function KaynakDetayPage() {
  const enumLabel = useEnumLabel();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const fetcher = useCallback((signal: AbortSignal) => fetchSource(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } = useAromaterapiDetail<SourceDetail>(
    fetcher,
    id,
  );
  const isDemo = readYasamUser()?.is_demo_account === true;
  const t = useTranslations("aromatherapy.sources.detail");
  const locale = useLocale() as ActiveLocale;

  return (
    <DetailScreen
      title={data?.title ?? t("fallbackTitle")}
      subtitle={data ? enumLabel(SOURCE_TYPE_TR, data.source_type) : undefined}
      icon="📜"
      breadcrumbLeaf={t("fallbackTitle")}
      backHref="/aromaterapi/kaynaklar"
      backLabel={t("back")}
      wordExportUrl={id ? `/api/aromaterapi/sources/${id}/word-report` : undefined}
      extraActions={data ? <KaynakDetailActions data={data} isDemo={isDemo} onChanged={retry} /> : undefined}
      loading={loading}
      notFound={notFound}
      errorCode={errorCode}
      onRetry={retry}
    >
      {data ? (
        <div className="space-y-4">
          <DetailSection title={t("citation")}>
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailField label={t("title")} value={data.title} />
              <DetailField label={t("type")} value={enumLabel(SOURCE_TYPE_TR, data.source_type)} />
              {data.authors ? <DetailField label={t("authors")} value={data.authors} /> : null}
              {data.organization ? <DetailField label={t("organization")} value={data.organization} /> : null}
              {data.publication_year ? (
                <DetailField label={t("year")} value={data.publication_year} />
              ) : null}
              {data.doi ? <DetailField label={t("doi")} value={data.doi} /> : null}
              {data.pmid ? <DetailField label={t("pmid")} value={data.pmid} /> : null}
              {data.isbn ? <DetailField label={t("isbn")} value={data.isbn} /> : null}
              {data.document_no ? <DetailField label={t("documentNo")} value={data.document_no} /> : null}
              {data.url ? (
                <DetailField
                  label={t("url")}
                  value={
                    <a
                      href={data.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="font-bold text-violet-700 underline [overflow-wrap:anywhere] hover:text-violet-900"
                    >
                      {data.url}
                    </a>
                  }
                />
              ) : null}
              <DetailField
                label={t("status")}
                value={<MetaChip tone="amber">{enumLabel(SOURCE_STATUS_TR, data.status)}</MetaChip>}
              />
            </dl>
            {data.notes ? (
              <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{t("note")}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] font-medium leading-relaxed text-slate-700">
                  {data.notes}
                </p>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection
            title={t("passages")}
            hint={t("passagesHint")}
          >
            <SourcePassagesPanel sourceId={data.id} total={data.passage_count} />
          </DetailSection>

          <DetailSection title={t("linkedKnowledge")}>
            {data.knowledge_record_count > 0 ? (
              <p className="text-[13.5px] font-semibold text-slate-600">
                {t.rich("knowledgeCount", {
                  n: data.knowledge_record_count,
                  count: formatNumber(data.knowledge_record_count, undefined, locale),
                  b: (c) => <span className="font-black text-emerald-700">{c}</span>,
                })}
              </p>
            ) : (
              <p className="py-2 text-center text-[13px] font-semibold text-slate-400">
                {t("noKnowledge")}
              </p>
            )}
          </DetailSection>
        </div>
      ) : null}
    </DetailScreen>
  );
}

function SourcePassagesPanel({ sourceId, total }: { sourceId: string; total: number }) {
  const [rows, setRows] = useState<PassageListItem[]>([]);
  const [page, setPage] = useState(1);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loadedTotal, setLoadedTotal] = useState(total);
  const [fetchedPage, setFetchedPage] = useState(0);
  const seen = useRef(new Set<string>());
  // loading türetilir: istenen sayfa henüz yüklenmediyse. Effect'te senkron
  // setState YOK (tüm setState async .then içinde).
  const loading = fetchedPage < page;
  const t = useTranslations("aromatherapy.sources.detail");
  const readError = useAromaReadError();

  useEffect(() => {
    const controller = new AbortController();
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("limit", String(PASSAGE_PAGE));
    fetchSourcePassageList(sourceId, sp, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok && res.envelope) {
        setLoadedTotal(res.envelope.total);
        setErrorCode(null);
        setRows((prev) => {
          const next = page === 1 ? [] : [...prev];
          for (const r of res.envelope!.rows) {
            if (!seen.current.has(r.id)) {
              seen.current.add(r.id);
              next.push(r);
            }
          }
          return next;
        });
        setFetchedPage(page);
      } else if (res.errorCode) {
        setErrorCode(res.errorCode);
        setFetchedPage(page);
      }
    });
    return () => controller.abort();
  }, [sourceId, page]);

  if (loading && rows.length === 0) {
    return <p className="py-4 text-center text-[13px] font-semibold text-slate-400">{t("passagesLoading")}</p>;
  }
  if (errorCode && rows.length === 0) {
    return (
      <p role="alert" className="py-4 text-center text-[13px] font-bold text-rose-600">
        {readError(errorCode)}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[13px] font-semibold text-slate-400">
        {t("noPassages")}
      </p>
    );
  }

  const hasMore = rows.length < loadedTotal;
  return (
    <div className="space-y-2">
      {rows.map((p) => (
        <PassageAccordionItem key={p.id} passage={p} />
      ))}
      {hasMore ? (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setPage((n) => n + 1)}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-violet-200 bg-white px-4 text-[13px] font-black text-violet-700 shadow-sm transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:opacity-50"
          >
            {loading ? t("loading") : t("morePassages")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
