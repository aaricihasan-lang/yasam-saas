"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BackLink, ErrorState, LoadingBlock, Pill, PreviewBadge, SectionCard } from "../../components/ui";
import { EvidenceList } from "../../components/entities";
import { usePreview } from "../../components/preview";
import { getRelation, type RelationDetail } from "../../yebsShowcaseApi";

export default function RelationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { preview, withPreview } = usePreview();
  const [data, setData] = useState<RelationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void getRelation(id, preview, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => ctrl.abort();
  }, [id, preview]);

  return (
    <div className="space-y-4">
      <BackLink href={withPreview("/yebs/relations")}>İlişkiler</BackLink>
      {error ? (
        <ErrorState message={error} />
      ) : data === null ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-black text-slate-900">İlişki</h1>
            <Pill tone="emerald">{data.row.relationTypeLabel}</Pill>
            {data.row.preview ? <PreviewBadge /> : null}
          </div>

          <SectionCard>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={withPreview(`/yebs/concepts/${data.row.sourceConceptId}`)} className="rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 no-underline hover:bg-emerald-100">
                {data.row.sourceConceptTitle}
              </Link>
              <span className="text-slate-400">→</span>
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[12px] font-semibold text-violet-800">{data.row.relationTypeLabel}</span>
              <span className="text-slate-400">→</span>
              <Link href={withPreview(`/yebs/concepts/${data.row.targetConceptId}`)} className="rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 no-underline hover:bg-emerald-100">
                {data.row.targetConceptTitle}
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Kaynaklar">
            <EvidenceList items={data.evidence} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
