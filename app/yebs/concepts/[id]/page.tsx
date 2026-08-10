"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BackLink, ErrorState, Field, LoadingBlock, Pill, PreviewBadge, SectionCard } from "../../components/ui";
import { Tabs } from "../../components/Tabs";
import { ScopedList } from "../../components/entities";
import { claimCard, relationCard, sourceCard } from "../../components/cards";
import { usePreview } from "../../components/preview";
import {
  getConcept,
  listClaims,
  listRelations,
  listSources,
  type ConceptDetail,
} from "../../yebsShowcaseApi";

export default function ConceptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { preview, withPreview } = usePreview();
  const [data, setData] = useState<ConceptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void getConcept(id, preview, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => ctrl.abort();
  }, [id, preview]);

  return (
    <div className="space-y-4">
      <BackLink href={withPreview("/yebs/concepts")}>Kavramlar</BackLink>
      {error ? (
        <ErrorState message={error} />
      ) : data === null ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black text-slate-900">{data.row.title}</h1>
            <Pill tone="emerald">{data.row.conceptTypeLabel}</Pill>
            {data.row.preview ? <PreviewBadge /> : null}
          </div>

          <Tabs
            tabs={[
              {
                key: "genel",
                label: "Genel",
                render: () => (
                  <SectionCard title="Adlar">
                    {data.labels.length === 0 ? (
                      <p className="text-sm text-slate-500">Bu kavrama ait etiket bulunmuyor.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.labels.map((l) => (
                          <li key={l.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{l.label}</span>
                            <Pill tone={l.isPrimary ? "emerald" : "slate"}>{l.labelKindLabel}</Pill>
                            <span className="text-xs text-slate-400">
                              {l.languageTag} · {l.scriptCode}
                              {l.transliterationScheme ? ` · ${l.transliterationScheme}` : ""}
                            </span>
                            {l.isPrimary ? <span className="text-[11px] font-bold text-emerald-700">Birincil</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </SectionCard>
                ),
              },
              {
                key: "bilgiler",
                label: "Kaynaklı Bilgiler",
                render: () => (
                  <ScopedList
                    load={(signal) => listClaims({ conceptId: id, preview, signal })}
                    renderCard={(cl) => claimCard(cl, withPreview)}
                    emptyTitle="Bu kavrama bağlı yayınlanmış kaynaklı bilgi bulunmuyor."
                  />
                ),
              },
              {
                key: "gelenek",
                label: "Gelenek / Ekol",
                render: () => (
                  <SectionCard>
                    {data.tradition ? (
                      <Field
                        label="Gelenek"
                        value={
                          <Link href={withPreview(`/yebs/traditions/${data.tradition.id}`)} className="text-emerald-700 no-underline hover:text-emerald-800">
                            {data.tradition.nameTr}
                          </Link>
                        }
                      />
                    ) : (
                      <p className="text-sm text-slate-500">Gelenek bilgisi görüntülenemedi.</p>
                    )}
                    <Field label="Ekol" value={data.school ? data.school.nameTr : "—"} />
                  </SectionCard>
                ),
              },
              {
                key: "iliskiler",
                label: "İlişkili Kavramlar",
                render: () => (
                  <ScopedList
                    load={(signal) => listRelations({ conceptId: id, preview, signal })}
                    renderCard={(r) => relationCard(r, withPreview)}
                    emptyTitle="Bu kavrama bağlı yayınlanmış ilişki bulunmuyor."
                  />
                ),
              },
              {
                key: "kaynaklar",
                label: "Kaynaklar",
                render: () =>
                  data.tradition ? (
                    <ScopedList
                      load={(signal) => listSources({ traditionContextId: data.tradition!.id, preview, signal })}
                      renderCard={(s) => sourceCard(s, withPreview)}
                      emptyTitle="İlgili gelenek bağlamında yayınlanmış kaynak bulunmuyor."
                    />
                  ) : (
                    <SectionCard>
                      <p className="text-sm text-slate-500">Kaynak bağlamı görüntülenemedi.</p>
                    </SectionCard>
                  ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
