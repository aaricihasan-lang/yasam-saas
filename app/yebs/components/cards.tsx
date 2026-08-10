"use client";

import type { ReactNode } from "react";
import { EntityCard, Pill } from "./ui";
import type { ClaimDTO, ConceptDTO, RelationDTO, SourceDTO, TraditionDTO } from "../yebsShowcaseApi";

type WithPreview = (href: string) => string;

export function traditionCard(t: TraditionDTO, wp: WithPreview): ReactNode {
  return (
    <EntityCard
      href={wp(`/yebs/traditions/${t.id}`)}
      emoji="🏛️"
      title={t.nameTr}
      subtitle={t.nativeName ?? undefined}
      preview={t.preview}
      meta={<Pill tone="violet">{t.traditionTypeLabel}</Pill>}
    />
  );
}

export function conceptCard(c: ConceptDTO, wp: WithPreview): ReactNode {
  return (
    <EntityCard
      href={wp(`/yebs/concepts/${c.id}`)}
      emoji="🧩"
      title={c.title}
      subtitle={<span className="text-xs text-slate-400">{c.slug}</span>}
      preview={c.preview}
      meta={<Pill tone="emerald">{c.conceptTypeLabel}</Pill>}
    />
  );
}

export function sourceCard(s: SourceDTO, wp: WithPreview): ReactNode {
  const author = s.authors ?? s.organization ?? null;
  return (
    <EntityCard
      href={wp(`/yebs/sources/${s.id}`)}
      emoji="📚"
      title={s.title}
      subtitle={
        <span className="text-sm text-slate-600">
          {author ? `${author}` : ""}
          {author && s.publicationYear ? " · " : ""}
          {s.publicationYear ?? ""}
        </span>
      }
      preview={s.preview}
      meta={<Pill tone="slate">{s.sourceTypeLabel}</Pill>}
    />
  );
}

export function claimCard(cl: ClaimDTO, wp: WithPreview): ReactNode {
  return (
    <EntityCard
      href={wp(`/yebs/claims/${cl.id}`)}
      emoji="📝"
      title={cl.claimText}
      preview={cl.preview}
      meta={
        <>
          <Pill tone="emerald">{cl.claimTypeLabel}</Pill>
          <Pill tone="violet">{cl.evidenceLayerLabel}</Pill>
        </>
      }
    />
  );
}

export function relationCard(r: RelationDTO, wp: WithPreview): ReactNode {
  return (
    <EntityCard
      href={wp(`/yebs/relations/${r.id}`)}
      emoji="🔗"
      title={`${r.sourceConceptTitle} → ${r.targetConceptTitle}`}
      subtitle={<span className="text-sm text-slate-600">{r.relationTypeLabel}</span>}
      preview={r.preview}
      meta={<Pill tone="emerald">{r.relationTypeLabel}</Pill>}
    />
  );
}
