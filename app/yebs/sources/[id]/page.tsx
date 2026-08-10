"use client";

import { use, useEffect, useState } from "react";
import { BackLink, ErrorState, Field, LoadingBlock, Pill, PreviewBadge, SectionCard } from "../../components/ui";
import { usePreview } from "../../components/preview";
import { getSource, type SourceDTO } from "../../yebsShowcaseApi";

export default function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { preview, withPreview } = usePreview();
  const [row, setRow] = useState<SourceDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void getSource(id, preview, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res.ok) setRow(res.data);
      else setError(res.error);
    });
    return () => ctrl.abort();
  }, [id, preview]);

  return (
    <div className="space-y-4">
      <BackLink href={withPreview("/yebs/sources")}>Kaynaklar</BackLink>
      {error ? (
        <ErrorState message={error} />
      ) : row === null ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black text-slate-900">{row.title}</h1>
            <Pill tone="slate">{row.sourceTypeLabel}</Pill>
            {row.preview ? <PreviewBadge /> : null}
          </div>

          <SectionCard title="Künye">
            <Field label="Yazar(lar)" value={row.authors} />
            <Field label="Kurum" value={row.organization} />
            <Field label="Yayınevi" value={row.publisher} />
            <Field label="Yayın yılı" value={row.publicationYear !== null ? String(row.publicationYear) : null} />
            <Field label="Tarihlendirme notu" value={row.datingNote} />
            <Field label="Baskı" value={row.edition} />
            <Field label="Dil" value={row.languageTag} />
            <Field label="Belge no" value={row.documentNo} />
            <Field label="Erişim tarihi" value={row.accessedOn} />
          </SectionCard>

          <SectionCard title="Tanımlayıcılar">
            <Field label="DOI" value={row.doi} />
            <Field label="PMID" value={row.pmid} />
            <Field label="ISBN" value={row.isbn} />
            <Field
              label="Bağlantı"
              value={
                row.url ? (
                  <a href={row.url} target="_blank" rel="noopener noreferrer" className="break-all text-emerald-700 no-underline hover:text-emerald-800">
                    {row.url}
                  </a>
                ) : null
              }
            />
          </SectionCard>

          {row.notes ? (
            <SectionCard title="Notlar">
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{row.notes}</p>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
