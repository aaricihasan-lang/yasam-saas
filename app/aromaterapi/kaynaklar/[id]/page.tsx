"use client";

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
import { messageForCode } from "@/lib/aromaterapi/readClient";
import type { PassageListItem, SourceDetail } from "@/lib/aromaterapi/readTypes";
import { SOURCE_STATUS_TR, SOURCE_TYPE_TR, tr } from "@/lib/aromaterapi/readLabels";

const PASSAGE_PAGE = 25;

/** Kaynak detay — künye + pasajlar (katman açılımı) + bağlı bilgi kaydı özeti. */
export default function KaynakDetayPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const fetcher = useCallback((signal: AbortSignal) => fetchSource(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } = useAromaterapiDetail<SourceDetail>(
    fetcher,
    id,
  );

  return (
    <DetailScreen
      title={data?.title ?? "Kaynak Detayı"}
      subtitle={data ? tr.label(SOURCE_TYPE_TR, data.source_type) : undefined}
      icon="📜"
      breadcrumbLeaf="Kaynak Detayı"
      backHref="/aromaterapi/kaynaklar"
      backLabel="Kaynaklara dön"
      wordExportUrl={id ? `/api/aromaterapi/sources/${id}/word-report` : undefined}
      loading={loading}
      notFound={notFound}
      errorCode={errorCode}
      onRetry={retry}
    >
      {data ? (
        <div className="space-y-4">
          <DetailSection title="Künye">
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailField label="Başlık" value={data.title} />
              <DetailField label="Tür" value={tr.label(SOURCE_TYPE_TR, data.source_type)} />
              {data.authors ? <DetailField label="Yazar(lar)" value={data.authors} /> : null}
              {data.organization ? <DetailField label="Kurum" value={data.organization} /> : null}
              {data.publication_year ? (
                <DetailField label="Yayın Yılı" value={data.publication_year} />
              ) : null}
              {data.doi ? <DetailField label="DOI" value={data.doi} /> : null}
              {data.pmid ? <DetailField label="PMID" value={data.pmid} /> : null}
              {data.isbn ? <DetailField label="ISBN" value={data.isbn} /> : null}
              {data.document_no ? <DetailField label="Belge No" value={data.document_no} /> : null}
              {data.url ? (
                <DetailField
                  label="URL"
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
                label="Durum"
                value={<MetaChip tone="amber">{tr.label(SOURCE_STATUS_TR, data.status)}</MetaChip>}
              />
            </dl>
            {data.notes ? (
              <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Not</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] font-medium leading-relaxed text-slate-700">
                  {data.notes}
                </p>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection
            title="Pasajlar"
            hint="Her pasaj açıldığında özgün metin, sadık çeviri ve editoryal katmanlar ayrı gösterilir."
          >
            <SourcePassagesPanel sourceId={data.id} total={data.passage_count} />
          </DetailSection>

          <DetailSection title="Bağlı Bilgi Kayıtları">
            {data.knowledge_record_count > 0 ? (
              <p className="text-[13.5px] font-semibold text-slate-600">
                Bu kaynağa dayanan{" "}
                <span className="font-black text-emerald-700">
                  {data.knowledge_record_count.toLocaleString("tr-TR")}
                </span>{" "}
                bilgi kaydı bulunuyor.
              </p>
            ) : (
              <p className="py-2 text-center text-[13px] font-semibold text-slate-400">
                Bu kaynağa dayanan bilgi kaydı bulunmuyor.
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
    return <p className="py-4 text-center text-[13px] font-semibold text-slate-400">Pasajlar yükleniyor…</p>;
  }
  if (errorCode && rows.length === 0) {
    return (
      <p role="alert" className="py-4 text-center text-[13px] font-bold text-rose-600">
        {messageForCode(errorCode)}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[13px] font-semibold text-slate-400">
        Bu kaynağa bağlı pasaj kaydı bulunmuyor.
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
            {loading ? "Yükleniyor…" : "Daha fazla pasaj"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
