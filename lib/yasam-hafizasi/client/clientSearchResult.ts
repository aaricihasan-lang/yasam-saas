/**
 * BF-14 Paket 1 — Client arama yanıt sözleşmesi + güvenli DTO (SAF).
 * Ham tenant_id/client_id/PII DÖNMEZ. isClientScoped:true. sourceLink allowlist.
 */
import { clientModuleLabel, clientSourceLinkFor, type ClientSourceModule } from "./clientSources";
import { normalizeSearchText } from "@/lib/yasam-hafizasi/search/normalize";
import { buildConceptSet } from "@/lib/yasam-hafizasi/search/conceptSet";
import { expandConcepts } from "@/lib/yasam-hafizasi/search/dictionaryExpansion";
import { buildTsQueryPlan } from "@/lib/yasam-hafizasi/search/tsQueryPlan";

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

/**
 * Legacy JSON-string içeriğini güvenli, insan-okur metne çevirir (UI'a HAM JSON / teknik
 * metadata SIZMAZ). Bazı eski kayıtlar (ör. client_notes.notlar) içeriği
 * `[{"id":"legacy","content":"...","createdAt":"","updatedAt":"..."}]` biçiminde saklar.
 *
 * Sözleşme:
 *   - Yalnız `[` veya `{` ile başlayan (JSON-benzeri) metinlerde ayrıştırma denenir.
 *   - Geçerli JSON dizisi/nesnesi ise SADECE `content` (string) alanları çıkarılır ve
 *     birleştirilir; id/createdAt/updatedAt ve BİLİNMEYEN alanlar UI'a ASLA dökülmez.
 *   - Dizi elemanı düz string ise o string kullanılır.
 *   - Parse başarısız → düz metin fallback (olduğu gibi).
 *   - JSON geçerli ama okunur içerik yoksa → boş string (ham JSON dump YOK).
 *   - JSON-benzeri değilse dokunulmaz (diğer kaynak tipleri bozulmaz).
 */
export function humanizeClientText(raw: string): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (s.length === 0) return raw;
  if (s[0] !== "[" && s[0] !== "{") return raw; // JSON-benzeri değil → düz metin
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return raw; // parse başarısız → plain-text fallback
  }
  const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const parts: string[] = [];
  for (const it of items) {
    if (typeof it === "string") {
      const t = it.trim();
      if (t.length > 0) parts.push(t);
    } else if (it && typeof it === "object" && !Array.isArray(it)) {
      const c = (it as Record<string, unknown>).content;
      if (typeof c === "string" && c.trim().length > 0) parts.push(c.trim());
      // content dışındaki alanlar (id/createdAt/updatedAt/bilinmeyen) UI'a ÇIKMAZ.
    }
  }
  return parts.join("\n"); // okunur içerik yoksa "" → çağıran boş sayar (ham JSON dökülmez)
}

/** humanize + boşsa null (title/snippet için). */
function humanizeOrNull(v: string | null): string | null {
  if (v === null) return null;
  const h = humanizeClientText(v).trim();
  return h.length > 0 ? h : null;
}

function asEvidence(v: unknown): ClientEvidence[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      kind: typeof e.kind === "string" ? e.kind : "",
      // Ham JSON/teknik metadata sızıntısını DTO katmanında güvenli biçimde temizle.
      text: typeof e.text === "string" ? humanizeClientText(e.text) : "",
    }))
    .filter((e) => e.text.trim().length > 0);
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

/**
 * H1 (owner 2026-11-04) — sağlık notu (client_notes.saglik_notu) arama/önizleme kapsamı DIŞI.
 * Kaynak tanımı artık bu kolonu indexlemez; ancak değişiklikten ÖNCE yazılmış index satırları
 * (veri değişikliği yapılmadan) hâlâ sağlık metnini taşıyabilir. Bu yardımcılar o satırları
 * sorgu anında güvenli hale getirir: sağlık kanıtı/önizlemesi düşürülür ve yalnız sağlık
 * metniyle eşleşen satır sonuçtan çıkarılır.
 */
const HEALTH_NOTE_TABLE = "client_notes";
const HEALTH_NOTE_ORIGIN = "saglik_notu";

function evidenceRecords(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((e): e is Record<string, unknown> => !!e && typeof e === "object") : [];
}

function isHealthEvidence(e: Record<string, unknown>): boolean {
  return e.origin === HEALTH_NOTE_ORIGIN;
}

type HealthStrippable = { source_table: unknown; snippet: unknown; evidence_fields: unknown };

function hasHealthEvidence(row: HealthStrippable): boolean {
  return row.source_table === HEALTH_NOTE_TABLE && evidenceRecords(row.evidence_fields).some(isHealthEvidence);
}

/**
 * Sağlık kanıtı ayıklanmış satır (diğer kaynak satırları AYNEN döner). Arama sonucu ve
 * snapshot (seçilen kaydın kaydı) aynı ayıklamayı kullanır.
 */
export function stripClientHealthNote<T extends HealthStrippable>(row: T): T {
  if (!hasHealthEvidence(row)) return row;
  const all = evidenceRecords(row.evidence_fields);
  const healthTexts = all
    .filter(isHealthEvidence)
    .map((e) => (typeof e.text === "string" ? e.text.trim() : ""))
    .filter((t) => t.length > 0);
  const allowed = all.filter((e) => !isHealthEvidence(e));
  let snippet = row.snippet;
  if (typeof snippet === "string" && healthTexts.includes(snippet.trim())) {
    const first = allowed.find((e) => typeof e.text === "string" && e.text.trim().length > 0);
    snippet = first && typeof first.text === "string" ? first.text : null;
  }
  return { ...row, snippet, evidence_fields: allowed };
}

/**
 * Satır YALNIZ sağlık notu metniyle mi eşleşti? DB araması `simple` config + prefix/phrase
 * OR tsquery'dir (stemmer yok); aynı saf adımlarla sorgu yeniden kurulur ve izinli metin
 * (başlık + sağlık dışı kanıt + etiketler) üzerinde doğrulanır. Sağlık kanıtı olmayan satırlar
 * için daima false (hiçbir kaynak satırı etkilenmez).
 */
export function isClientHealthOnlyMatch(row: ClientRpcRow, rawQuery: string): boolean {
  if (!hasHealthEvidence(row)) return false;
  const normalized = normalizeSearchText(rawQuery);
  const plan = buildTsQueryPlan(expandConcepts(buildConceptSet(rawQuery), normalized.normalizedText, []));
  if (plan.isEmpty) return false;
  const allowedText = [
    row.title ?? "",
    ...evidenceRecords(row.evidence_fields)
      .filter((e) => !isHealthEvidence(e))
      .map((e) => (typeof e.text === "string" ? e.text : "")),
    ...asTags(row.topic_tags),
  ].join(" ");
  const tokens = normalizeSearchText(allowedText).tokens;
  const matched = plan.clauses.some((c) => {
    const parts = c.term.split(" ").filter((t) => t.length > 0);
    if (c.kind === "prefix") return tokens.some((t) => t.startsWith(parts[0] ?? ""));
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      if (parts.every((p, j) => tokens[i + j] === p)) return true;
    }
    return false;
  });
  return !matched;
}

export function toClientSearchResult(rawRow: ClientRpcRow): ClientSearchResult | null {
  const mod = rawRow.source_module;
  if (!Object.prototype.hasOwnProperty.call(KNOWN_CLIENT_MODULES, mod)) {
    return null;
  }
  const row = stripClientHealthNote(rawRow);
  return {
    id: row.id,
    module: mod as ClientSourceModule,
    moduleLabel: clientModuleLabel(mod),
    sourceTable: row.source_table,
    sourceId: row.source_id,
    unitType: row.unit_type,
    // Ham JSON/teknik metadata title/snippet'e de sızabilir → aynı güvenli normalizasyon.
    title: humanizeOrNull(row.title),
    snippet: humanizeOrNull(row.snippet),
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
