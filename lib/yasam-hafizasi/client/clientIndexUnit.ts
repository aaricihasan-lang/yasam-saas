/**
 * BF-14 Paket 1 — Client index unit builder (SAF; DORMANT).
 *
 * Bir kaynak satırından PII-siz, client-scoped index birimi üretir. YALNIZ config'in
 * güvenli kolon dizilerini okur (piiDenylist kolonlarına ASLA dokunmaz → yapısal
 * PII güvenliği). Evidence Gate: kanıt yoksa `null` (index'e girmez).
 *
 * Bu Paket 1'de canlı worker'a BAĞLANMAZ (dormant); harness ile doğrulanır.
 */
import { createHash } from "node:crypto";
import type { ClientSourceConfig } from "./clientSources";

export interface ClientEvidenceField {
  origin: string;
  kind: "title" | "paragraph" | "tag";
  text: string;
}

export interface ClientIndexUnit {
  tenantId: string;
  clientId: string;
  sourceModule: string;
  sourceTable: string;
  sourceId: string;
  unitType: "record";
  groupKey: string;
  title: string | null;
  titleSource: string | null;
  snippet: string | null;
  snippetOrigin: string | null;
  searchText: string | null;
  topicTags: string[];
  evidenceFields: ClientEvidenceField[];
  occurredAt: string | null;
  sourceUpdatedAt: string | null;
  contentHash: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstNonEmpty(cols: readonly string[], row: Record<string, unknown>): { text: string; origin: string } | null {
  for (const col of cols) {
    const v = row[col];
    if (typeof v === "string" && v.trim().length > 0) return { text: v, origin: col };
  }
  return null;
}

function multiValues(cols: readonly string[], row: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const col of cols) {
    const v = row[col];
    const parts: string[] = Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : typeof v === "string"
        ? v.split(/[|,/]+/)
        : [];
    for (const p of parts) {
      const t = p.trim();
      if (t.length > 0 && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v;
  if (v instanceof Date) return v.toISOString();
  return null;
}

function computeContentHash(parts: {
  title: string | null;
  snippet: string | null;
  evidence: ClientEvidenceField[];
  topicTags: string[];
}): string {
  const canonical = JSON.stringify({
    title: parts.title,
    snippet: parts.snippet,
    evidence: parts.evidence.map((e) => [e.origin, e.kind, e.text]),
    topicTags: [...parts.topicTags],
  });
  return createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex");
}

/**
 * Kaynak satırı → ClientIndexUnit | null. tenant/client dışarıdan (server-doğrulanmış)
 * verilir; row'dan PII okunmaz. Kanıt yoksa null.
 */
export function buildClientIndexUnit(
  config: ClientSourceConfig,
  row: Record<string, unknown>,
  scope: { tenantId: string; clientId: string },
): ClientIndexUnit | null {
  const rawId = row[config.primaryKey];
  const sourceId = typeof rawId === "string" ? rawId : "";
  if (!UUID_RE.test(sourceId)) return null;
  if (!UUID_RE.test(scope.tenantId) || !UUID_RE.test(scope.clientId)) return null;

  const evidence: ClientEvidenceField[] = [];

  const titlePick = firstNonEmpty(config.titleColumns, row);
  for (const col of config.titleColumns) {
    const v = row[col];
    if (typeof v === "string" && v.trim().length > 0) {
      evidence.push({ origin: col, kind: "title", text: v });
    }
  }
  for (const col of config.searchTextColumns) {
    const v = row[col];
    if (typeof v === "string" && v.trim().length > 0) {
      evidence.push({ origin: col, kind: "paragraph", text: v });
    }
  }
  const topicTags = multiValues(config.topicTagsColumns, row);
  for (const t of topicTags) evidence.push({ origin: "topic", kind: "tag", text: t });

  // Evidence Gate (INV-1): kanıt yoksa index'e giremez.
  if (evidence.length === 0) return null;

  const snippetPick = firstNonEmpty(config.snippetColumns, row);
  const title = titlePick?.text ?? null;
  const snippet = snippetPick?.text ?? null;

  const searchTextParts = [
    ...(title ? [title] : []),
    ...(snippet ? [snippet] : []),
    ...topicTags,
    ...config.searchTextColumns
      .map((c) => row[c])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
  ];
  const searchText = searchTextParts.length > 0 ? searchTextParts.join(" ") : null;

  return {
    tenantId: scope.tenantId,
    clientId: scope.clientId,
    sourceModule: config.sourceModule,
    sourceTable: config.tableName,
    sourceId,
    unitType: "record",
    groupKey: `${config.sourceKey}:${sourceId}`,
    title,
    titleSource: titlePick?.origin ?? null,
    snippet,
    snippetOrigin: snippetPick?.origin ?? null,
    searchText,
    topicTags,
    evidenceFields: evidence,
    occurredAt: config.occurredAtColumn ? isoOrNull(row[config.occurredAtColumn]) : null,
    sourceUpdatedAt: config.updatedAtColumn ? isoOrNull(row[config.updatedAtColumn]) : null,
    contentHash: computeContentHash({ title, snippet, evidence, topicTags }),
  };
}

/** ClientIndexUnit → client_index DB satırı (snake_case; search_tsv DB trigger'ında). */
export function toClientIndexDbRow(unit: ClientIndexUnit): Record<string, unknown> {
  return {
    tenant_id: unit.tenantId,
    client_id: unit.clientId,
    source_module: unit.sourceModule,
    source_table: unit.sourceTable,
    source_id: unit.sourceId,
    unit_type: unit.unitType,
    section_ref: null,
    group_key: unit.groupKey,
    title: unit.title,
    title_source: unit.titleSource,
    snippet: unit.snippet,
    snippet_origin: unit.snippetOrigin,
    search_text: unit.searchText,
    evidence_fields: unit.evidenceFields,
    topic_tags: unit.topicTags,
    expert_relations: [],
    occurred_at: unit.occurredAt,
    source_updated_at: unit.sourceUpdatedAt,
    content_hash: unit.contentHash,
    is_client_pii: false,
  };
}
