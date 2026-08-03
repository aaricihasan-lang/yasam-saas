"use client";

// ============================================================
// YEBS A8 — İddia (claim) listesi
// Filtreler: q (claim_text arama) + status + concept_id. Server offset pagination.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { YebsPageShell, StatusBadge } from "@/app/admin/yebs/components/primitives";
import { useYebsList, ListLayout } from "@/app/admin/yebs/components/list";
import { ConceptPicker } from "@/app/admin/yebs/components/pickers";
import { claimsApi } from "@/app/admin/yebs/adminYebsApi";
import type { ClaimRow } from "@/lib/yebs/ui/types";
import { CLAIMLIKE_STATUSES } from "@/lib/yebs/ui/types";
import { CLAIM_TYPE_LABEL, EVIDENCE_LAYER_LABEL, statusMeta } from "@/lib/yebs/ui/statusDictionary";

function truncate(s: string, n = 90): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default function ClaimsListPage() {
  const sp = useSearchParams();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(sp.get("status") ?? "");
  const [conceptId, setConceptId] = useState<string | null>(sp.get("concept_id"));
  const [conceptLabel, setConceptLabel] = useState<string | null>(null);

  // q debounce (Türkçe-güvenli: backend arındırır)
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const fetcher = useCallback(
    (offset: number, limit: number, signal: AbortSignal) =>
      claimsApi.list({ q: q || undefined, status: status || undefined, concept_id: conceptId || undefined, limit, offset }, signal),
    [q, status, conceptId],
  );

  const resetKey = useMemo(() => `${q}|${status}|${conceptId ?? ""}`, [q, status, conceptId]);
  const state = useYebsList<ClaimRow>(fetcher, resetKey);

  return (
    <YebsPageShell>
      <ListLayout<ClaimRow>
        title="İddialar"
        subtitle="Kavramlara bağlı kaynaklı iddialar — kalite ve yayın yönetimi."
        newHref="/admin/yebs/claims/new"
        toolbar={
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="İddia metninde ara…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 lg:col-span-2" />
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              <option value="">Tüm durumlar</option>
              {CLAIMLIKE_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
            </select>
            <ConceptPicker label="Kavram filtresi" value={conceptId} valueLabel={conceptLabel}
              onPick={(id, d) => { setConceptId(id); setConceptLabel(d); }} />
          </div>
        }
        state={state}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/yebs/claims/${r.id}`}
        columns={[
          { key: "text", header: "İddia", cell: (r) => truncate(r.claim_text) },
          { key: "type", header: "Tür", cell: (r) => CLAIM_TYPE_LABEL[r.claim_type] ?? r.claim_type },
          { key: "layer", header: "Kanıt Katmanı", cell: (r) => EVIDENCE_LAYER_LABEL[r.evidence_layer] ?? r.evidence_layer },
          { key: "status", header: "Durum", cell: (r) => <StatusBadge status={r.status} /> },
        ]}
        renderCard={(r) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">{truncate(r.claim_text, 60)}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-500">
              <span>{CLAIM_TYPE_LABEL[r.claim_type] ?? r.claim_type}</span>
              <span>{EVIDENCE_LAYER_LABEL[r.evidence_layer] ?? r.evidence_layer}</span>
            </div>
          </div>
        )}
      />
    </YebsPageShell>
  );
}
