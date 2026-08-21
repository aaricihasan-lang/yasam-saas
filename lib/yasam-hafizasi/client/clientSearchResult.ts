/**
 * BF-14 Paket 1 — Client arama yanıt sözleşmesi + güvenli DTO (SAF).
 * Ham tenant_id/client_id/PII DÖNMEZ. isClientScoped:true. sourceLink allowlist.
 */
import { clientModuleLabel, clientSourceLinkFor, type ClientSourceModule } from "./clientSources";

export interface ClientEvidence {
  kind: string;
  text: string;
}
export interface ClientRelation {
  kind: string;
  targetLabel: string;
}

export interface ClientSearchResult {
  id: string;
  module: ClientSourceModule;
  moduleLabel: string;
  sourceTable: string;
  sourceId: string;
  unitType: string;
  title: string | null;
  snippet: string | null;
  evidence: ClientEvidence[];
  topicTags: string[];
  relations: ClientRelation[];
  occurredAt: string | null;
  updatedAt: string | null;
  isClientScoped: true;
  snapshotEligible: boolean;
  sourceAvailable: boolean;
  sourceLink: string | null;
}

export interface ClientFacet {
  module: ClientSourceModule;
  moduleLabel: string;
  count: number;
}

export type ClientEmptyReason = "no-query" | "no-results" | "filtered";

export interface ClientSearchResponse {
  ok: boolean;
  /** Şema/RPC henüz uygulanmadı (dormant) veya flag/demo kapalı → arama yapılmadı. */
  disabled?: boolean;
  reason?: "not-active" | "flag-disabled" | "demo";
  query: string;
  total: number;
  facets: ClientFacet[];
  results: ClientSearchResult[];
  emptyReason?: ClientEmptyReason;
  code?: string;
}

/** RPC satırı (yh_search_client_candidates RETURNS TABLE alt kümesi). */
export interface ClientRpcRow {
  id: string;
  source_module: string;
  source_table: string;
  source_id: string;
  unit_type: string;
  title: string | null;
  snippet: string | null;
  evidence_fields: unknown;
  topic_tags: unknown;
  expert_relations: unknown;
  occurred_at: string | null;
  source_updated_at: string | null;
}

function asEvidence(v: unknown): ClientEvidence[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ kind: typeof e.kind === "string" ? e.kind : "", text: typeof e.text === "string" ? e.text : "" }))
    .filter((e) => e.text.length > 0);
}
function asRelations(v: unknown): ClientRelation[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      kind: typeof e.kind === "string" ? e.kind : "",
      targetLabel: typeof e.targetLabel === "string" ? e.targetLabel : "",
    }));
}
function asTags(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** RPC satırı → güvenli DTO. module bilinmiyorsa null döner (fail-closed eleme). */
const KNOWN_CLIENT_MODULES: Record<string, 1> = {
  danisan_kombinasyon: 1,
  danisan_tas: 1,
  danisan_seans: 1,
  danisan_odev: 1,
  danisan_not: 1,
  randevu: 1,
  human_design: 1,
};

export function toClientSearchResult(row: ClientRpcRow): ClientSearchResult | null {
  const mod = row.source_module;
  if (!Object.prototype.hasOwnProperty.call(KNOWN_CLIENT_MODULES, mod)) {
    return null;
  }
  return {
    id: row.id,
    module: mod as ClientSourceModule,
    moduleLabel: clientModuleLabel(mod),
    sourceTable: row.source_table,
    sourceId: row.source_id,
    unitType: row.unit_type,
    title: row.title,
    snippet: row.snippet,
    evidence: asEvidence(row.evidence_fields),
    topicTags: asTags(row.topic_tags),
    relations: asRelations(row.expert_relations),
    occurredAt: row.occurred_at,
    updatedAt: row.source_updated_at,
    isClientScoped: true,
    snapshotEligible: true,
    sourceAvailable: true,
    sourceLink: clientSourceLinkFor(mod),
  };
}

export function computeClientFacets(results: readonly ClientSearchResult[]): ClientFacet[] {
  const counts = new Map<ClientSourceModule, number>();
  for (const r of results) counts.set(r.module, (counts.get(r.module) ?? 0) + 1);
  return [...counts.entries()]
    .map(([module, count]) => ({ module, moduleLabel: clientModuleLabel(module), count }))
    .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module));
}

export function filterClientByModules(
  results: readonly ClientSearchResult[],
  modules: readonly ClientSourceModule[] | undefined,
): ClientSearchResult[] {
  if (!modules || modules.length === 0) return [...results];
  const set = new Set<ClientSourceModule>(modules);
  return results.filter((r) => set.has(r.module));
}
