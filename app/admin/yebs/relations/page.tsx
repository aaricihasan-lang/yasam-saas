"use client";

// ============================================================
// YEBS A8 — Kavram İlişkisi (relation) listesi
// Filtreler: concept_id + relation_type + status + has_sources.
// Serbest metin arama YOK, DELETE YOK. Server offset pagination.
// ============================================================

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { YebsPageShell, StatusBadge } from "@/app/admin/yebs/components/primitives";
import { useYebsList, ListLayout } from "@/app/admin/yebs/components/list";
import { ConceptPicker } from "@/app/admin/yebs/components/pickers";
import { relationsApi } from "@/app/admin/yebs/adminYebsApi";
import type { ConceptRelationRow } from "@/lib/yebs/ui/types";
import { CLAIMLIKE_STATUSES, RELATION_TYPES } from "@/lib/yebs/ui/types";
import { RELATION_TYPE_LABEL, statusMeta } from "@/lib/yebs/ui/statusDictionary";

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export default function RelationsListPage() {
  const sp = useSearchParams();
  const [conceptId, setConceptId] = useState<string | null>(sp.get("concept_id"));
  const [conceptLabel, setConceptLabel] = useState<string | null>(null);
  const [relationType, setRelationType] = useState<string>(sp.get("relation_type") ?? "");
  const [status, setStatus] = useState<string>(sp.get("status") ?? "");
  const [hasSources, setHasSources] = useState<string>(sp.get("has_sources") ?? "");

  const fetcher = useCallback(
    (offset: number, limit: number, signal: AbortSignal) =>
      relationsApi.list({
        concept_id: conceptId || undefined,
        relation_type: relationType || undefined,
        status: status || undefined,
        has_sources: hasSources || undefined,
        limit, offset,
      }, signal),
    [conceptId, relationType, status, hasSources],
  );

  const resetKey = useMemo(() => `${conceptId ?? ""}|${relationType}|${status}|${hasSources}`, [conceptId, relationType, status, hasSources]);
  const state = useYebsList<ConceptRelationRow>(fetcher, resetKey);

  return (
    <YebsPageShell>
      <ListLayout<ConceptRelationRow>
        title="İlişkiler"
        subtitle="Kavramlar arası kaynaklı ilişkiler — yön kayıt-yönlüdür (otomatik ters kayıt yok)."
        newHref="/admin/yebs/relations/new"
        toolbar={
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ConceptPicker label="Kavram filtresi (kaynak/hedef)" value={conceptId} valueLabel={conceptLabel}
              onPick={(id, d) => { setConceptId(id); setConceptLabel(d); }} />
            <select value={relationType} onChange={(e) => setRelationType(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              <option value="">Tüm ilişki türleri</option>
              {RELATION_TYPES.map((t) => <option key={t} value={t}>{RELATION_TYPE_LABEL[t] ?? t}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              <option value="">Tüm durumlar</option>
              {CLAIMLIKE_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
            </select>
            <select value={hasSources} onChange={(e) => setHasSources(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              <option value="">Kanıt: tümü</option>
              <option value="true">Kanıtı olanlar</option>
              <option value="false">Kanıtı olmayanlar</option>
            </select>
          </div>
        }
        state={state}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/yebs/relations/${r.id}`}
        columns={[
          { key: "rel", header: "İlişki", cell: (r) => (
            <span className="font-mono text-xs">{shortId(r.source_concept_id)} → {shortId(r.target_concept_id)}</span>
          ) },
          { key: "type", header: "Tür", cell: (r) => RELATION_TYPE_LABEL[r.relation_type] ?? r.relation_type },
          { key: "status", header: "Durum", cell: (r) => <StatusBadge status={r.status} /> },
        ]}
        renderCard={(r) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-slate-800">{shortId(r.source_concept_id)} → {shortId(r.target_concept_id)}</span>
              <StatusBadge status={r.status} />
            </div>
            <span className="text-[11px] text-slate-500">{RELATION_TYPE_LABEL[r.relation_type] ?? r.relation_type}</span>
          </div>
        )}
      />
    </YebsPageShell>
  );
}
