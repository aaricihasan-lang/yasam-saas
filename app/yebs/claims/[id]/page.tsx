"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BackLink, ErrorState, Field, LoadingBlock, Pill, PreviewBadge, SectionCard } from "../../components/ui";
import { EvidenceList } from "../../components/entities";
import { usePreview } from "../../components/preview";
import { getClaim, type ClaimDetail } from "../../yebsShowcaseApi";

export default function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { preview, withPreview } = usePreview();
  const [data, setData] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void getClaim(id, preview, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => ctrl.abort();
  }, [id, preview]);

  return (
    <div className="space-y-4">
      <BackLink href={withPreview("/yebs/claims")}>Kaynaklı Bilgiler</BackLink>
      {error ? (
        <ErrorState message={error} />
      ) : data === null ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="emerald">{data.row.claimTypeLabel}</Pill>
            <Pill tone="violet">{data.row.evidenceLayerLabel}</Pill>
            <Pill tone="slate">{data.row.provenanceLabel}</Pill>
            {data.row.preview ? <PreviewBadge /> : null}
          </div>

          <SectionCard title="Bilgi">
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-slate-800">{data.row.claimText}</p>
            {data.row.safetyTopic ? <div className="mt-3"><Field label="Güvenlik konusu" value={data.row.safetyTopic} /></div> : null}
            {data.concept ? (
              <div className="mt-3">
                <Field
                  label="Kavram"
                  value={
                    <Link href={withPreview(`/yebs/concepts/${data.concept.id}`)} className="text-emerald-700 no-underline hover:text-emerald-800">
                      {data.concept.title}
                    </Link>
                  }
                />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Kaynaklar">
            <EvidenceList items={data.evidence} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
