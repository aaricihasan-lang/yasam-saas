"use client";

import { use, useEffect, useState } from "react";
import { BackLink, ErrorState, Field, LoadingBlock, Pill, PreviewBadge, SectionCard } from "../../components/ui";
import { Tabs } from "../../components/Tabs";
import { ScopedList } from "../../components/entities";
import { claimCard, conceptCard, relationCard, sourceCard } from "../../components/cards";
import { usePreview } from "../../components/preview";
import {
  getTradition,
  listClaims,
  listConcepts,
  listRelations,
  listSources,
  type ApiResult,
  type ClaimDTO,
  type ListEnvelope,
  type RelationDTO,
  type TraditionDTO,
} from "../../yebsShowcaseApi";

/** Bir geleneğin kavramları üzerinden claim/relation toplayan yardımcı yükleyiciler. */
async function aggregateClaims(traditionId: string, preview: boolean, signal: AbortSignal): Promise<ApiResult<ListEnvelope<ClaimDTO>>> {
  const cs = await listConcepts({ traditionId, preview, signal });
  if (!cs.ok) return cs;
  const per = await Promise.all(cs.data.rows.map((c) => listClaims({ conceptId: c.id, preview, signal })));
  const rows: ClaimDTO[] = [];
  for (const r of per) if (r.ok) rows.push(...r.data.rows);
  return { ok: true, data: { rows, count: rows.length, view: cs.data.view } };
}

async function aggregateRelations(traditionId: string, preview: boolean, signal: AbortSignal): Promise<ApiResult<ListEnvelope<RelationDTO>>> {
  const cs = await listConcepts({ traditionId, preview, signal });
  if (!cs.ok) return cs;
  const per = await Promise.all(cs.data.rows.map((c) => listRelations({ conceptId: c.id, preview, signal })));
  const seen = new Set<string>();
  const rows: RelationDTO[] = [];
  for (const r of per) if (r.ok) for (const row of r.data.rows) if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
  return { ok: true, data: { rows, count: rows.length, view: cs.data.view } };
}

export default function TraditionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { preview, withPreview } = usePreview();
  const [row, setRow] = useState<TraditionDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void getTradition(id, preview, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res.ok) setRow(res.data);
      else setError(res.error);
    });
    return () => ctrl.abort();
  }, [id, preview]);

  return (
    <div className="space-y-4">
      <BackLink href={withPreview("/yebs/traditions")}>Gelenekler</BackLink>
      {error ? (
        <ErrorState message={error} />
      ) : row === null ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black text-slate-900">{row.nameTr}</h1>
            <Pill tone="violet">{row.traditionTypeLabel}</Pill>
            {row.preview ? <PreviewBadge /> : null}
          </div>

          <Tabs
            tabs={[
              {
                key: "genel",
                label: "Genel Bakış",
                render: () => (
                  <SectionCard>
                    <Field label="Türkçe ad" value={row.nameTr} />
                    <Field label="Özgün ad" value={row.nativeName} />
                    <Field
                      label="Dil / Yazı"
                      value={row.nativeLanguageTag ? `${row.nativeLanguageTag}${row.nativeScriptCode ? ` · ${row.nativeScriptCode}` : ""}` : null}
                    />
                    <Field label="Gelenek türü" value={row.traditionTypeLabel} />
                  </SectionCard>
                ),
              },
              {
                key: "kavramlar",
                label: "Kavramlar",
                render: () => (
                  <ScopedList
                    load={(signal) => listConcepts({ traditionId: id, preview, signal })}
                    renderCard={(c) => conceptCard(c, withPreview)}
                    emptyTitle="Bu geleneğe bağlı yayınlanmış kavram bulunmuyor."
                  />
                ),
              },
              {
                key: "kaynaklar",
                label: "Kaynaklar",
                render: () => (
                  <ScopedList
                    load={(signal) => listSources({ traditionContextId: id, preview, signal })}
                    renderCard={(s) => sourceCard(s, withPreview)}
                    emptyTitle="Bu geleneğe bağlı yayınlanmış kaynak bulunmuyor."
                  />
                ),
              },
              {
                key: "bilgiler",
                label: "Kaynaklı Bilgiler",
                render: () => (
                  <ScopedList
                    load={(signal) => aggregateClaims(id, preview, signal)}
                    renderCard={(cl) => claimCard(cl, withPreview)}
                    emptyTitle="Bu geleneğe bağlı yayınlanmış kaynaklı bilgi bulunmuyor."
                  />
                ),
              },
              {
                key: "iliskiler",
                label: "İlişkiler",
                render: () => (
                  <ScopedList
                    load={(signal) => aggregateRelations(id, preview, signal)}
                    renderCard={(r) => relationCard(r, withPreview)}
                    emptyTitle="Bu geleneğe bağlı yayınlanmış ilişki bulunmuyor."
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
