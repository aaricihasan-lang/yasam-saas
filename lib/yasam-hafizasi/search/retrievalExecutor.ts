/**
 * Yaşam Hafızası™ — Retrieval Executor (Sprint 2 / S2.19A, saf orkestrasyon).
 *
 * S2.18 `RetrievalQueryDescriptor`'ı tüketip, enjekte edilen RPC portu üzerinden dönen
 * ham satırları güvenli `Candidate[]`'a çevirir ve mevcut S2.13 `evaluateVisibility`
 * fonksiyonunu **post-fetch defence-in-depth** olarak uygular. Bu dosya SAFTIR:
 * DB / Supabase / fetch / env / SQL / ranking hesabı İÇERMEZ (RPC + stone erişimi enjekte
 * port'lardan gelir; gerçek Supabase implementasyonu `supabaseRetrievalAdapter.ts`).
 *
 * SÖZLEŞME (kilitli):
 *   - `descriptor.kind==='noop'` → **DB çağrısı YAPILMAZ**; `{kind:'noop', reason}`.
 *   - `descriptor.kind==='query'` → RPC portu çağrılır. Hata → `{kind:'error', code}`
 *     (ham DB mesajı bu katmana ULAŞMAZ; port sabit kod döndürür). Başarı → satırlar
 *     maplenir + görünürlük savunmasından geçer → `{kind:'results', candidates}`.
 *   - **Sıralama TS'te YENİDEN HESAPLANMAZ.** RPC zaten ts_rank DESC + tie-breaker ile
 *     sıralı döndürür; executor satır SIRASINI KORUR (yalnız görünmez/bozuk satırı eler).
 *   - **Fail-closed satır elemesi:** kritik kimlik/güvenlik alanı (id/tenant/module/source_id)
 *     bozuk → yalnız o satır düşer (tüm sorgu HATA yapmaz). Koleksiyon (evidence/tags/
 *     relations) bozuk → güvenli boş koleksiyon (satır düşmez; Gate downstream tarar).
 *   - **Visibility yeniden İCAT EDİLMEZ:** `evaluateVisibility` (S2.13) olduğu gibi çağrılır;
 *     `Candidate → VisibilityCandidate` dönüşümü demo'yu `YH_DEMO_TENANT_ID`'den türetir
 *     (index'te demo-source kolonu yok → `isDemoSource=false`), PII'yi kesin-false kuralıyla.
 *   - **Blanket try/catch YOK.** RPC portu transport hatasını kendi sonucuna çevirir;
 *     stone portu hatasını `evaluateVisibility` fail-closed yakalar. Executor throw etmez.
 */

import type { RetrievalQueryDescriptor, RetrievalQueryNoopReason } from "./retrievalQuery";
import {
  evaluateVisibility,
  type VisibilityContext,
  type VisibilityCandidate,
  type StoneExclusionPort,
} from "./visibilityScope";
import type { Candidate, EvidenceField, ExpertRelation, EvidenceType } from "./types";
import { YH_DEMO_TENANT_ID, YH_SOURCE_MODULES, type YhSourceModule } from "../config";

/** Sınırlı, sabit hata kodu (ham DB/RPC mesajı ASLA sızmaz). */
export type RetrievalErrorCode = "retrieval-execution-failed";

/** RPC portuna geçen typed parametreler (weights [A,B,C,D] doğal sırasında). */
export interface RetrievalRpcParams {
  readonly tsquery: string;
  readonly sessionTenantId: string;
  readonly allowShared: boolean;
  /** [A, B, C, D] — YH_TSV_WEIGHTS doğal sırası; PG {D,C,B,A} dönüşümü RPC içinde. */
  readonly weights: readonly [number, number, number, number];
  readonly limit: number;
}

/** RPC portu sonucu — fail-closed union (ham mesaj taşımaz). */
export type RetrievalRpcResult =
  | { readonly ok: true; readonly rows: readonly unknown[] }
  | { readonly ok: false; readonly code: RetrievalErrorCode };

/** RPC portu — gerçek Supabase `.rpc()` çağrısı adapter'da; burada yalnız enjekte edilir. */
export type RetrievalRpcPort = (params: RetrievalRpcParams) => Promise<RetrievalRpcResult>;

/** Retrieval execution sonucu — fail-closed discriminated union. */
export type RetrievalExecutionResult =
  | { readonly kind: "noop"; readonly reason: RetrievalQueryNoopReason }
  | { readonly kind: "results"; readonly candidates: readonly Candidate[] }
  | { readonly kind: "error"; readonly code: RetrievalErrorCode };

// ─── Saf alan yardımcıları ────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? v : null;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function isYhSourceModule(v: unknown): v is YhSourceModule {
  return typeof v === "string" && (YH_SOURCE_MODULES as readonly string[]).includes(v);
}

function toEvidenceField(v: unknown): EvidenceField | null {
  if (!isRecord(v)) return null;
  const origin = v.origin;
  const kind = v.kind;
  const text = v.text;
  if (typeof origin !== "string" || typeof kind !== "string" || typeof text !== "string") {
    return null;
  }
  const field: EvidenceField = {
    origin,
    kind: kind as EvidenceType, // stored by indexer; Gate (S2.20) yeniden doğrular
    text,
  };
  return typeof v.sectionRef === "string"
    ? { ...field, sectionRef: v.sectionRef }
    : field;
}

function toExpertRelation(v: unknown): ExpertRelation | null {
  if (!isRecord(v)) return null;
  const kind = v.kind;
  const targetLabel = v.targetLabel ?? v.target_label;
  if (typeof kind !== "string" || typeof targetLabel !== "string") return null;
  return { kind, targetLabel };
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function toEvidenceFields(v: unknown): EvidenceField[] {
  if (!Array.isArray(v)) return [];
  const out: EvidenceField[] = [];
  for (const el of v) {
    const f = toEvidenceField(el);
    if (f !== null) out.push(f);
  }
  return out;
}

function toExpertRelations(v: unknown): ExpertRelation[] {
  if (!Array.isArray(v)) return [];
  const out: ExpertRelation[] = [];
  for (const el of v) {
    const r = toExpertRelation(el);
    if (r !== null) out.push(r);
  }
  return out;
}

function toTsRank(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Satır → Candidate (saf; kritik alan bozuk → null=satır düş) ───────────────

/**
 * RPC satırını güvenli `Candidate`'a çevirir. Kritik kimlik/güvenlik alanları
 * (id, tenant biçimi, source_module allowlist, source_table, source_id, unit_type)
 * geçersizse `null` döner (fail-closed satır elemesi). Koleksiyonlar bozuksa boş.
 */
export function mapRowToCandidate(row: unknown): Candidate | null {
  if (!isRecord(row)) return null;

  const id = asNonEmptyString(row.id);
  if (id === null) return null;

  // tenant: `null` (shared) VEYA boş-olmayan string; aksi (boş/geçersiz) → satır düş.
  const tenantIsNull = row.tenant_id === null;
  const tenantId = tenantIsNull ? null : asNonEmptyString(row.tenant_id);
  if (!tenantIsNull && tenantId === null) return null;

  if (!isYhSourceModule(row.source_module)) return null;
  const sourceModule = row.source_module;

  const sourceTable = asNonEmptyString(row.source_table);
  if (sourceTable === null) return null;
  const sourceId = asNonEmptyString(row.source_id);
  if (sourceId === null) return null;
  const unitType = asNonEmptyString(row.unit_type);
  if (unitType === null) return null;

  return {
    id,
    tenantId,
    sourceModule,
    sourceTable,
    sourceId,
    unitType,
    sectionRef: asStringOrNull(row.section_ref),
    groupKey: asStringOrNull(row.group_key),
    title: asStringOrNull(row.title),
    snippet: asStringOrNull(row.snippet),
    evidenceFields: toEvidenceFields(row.evidence_fields),
    topicTags: toStringArray(row.topic_tags),
    expertRelations: toExpertRelations(row.expert_relations),
    tsRank: toTsRank(row.rank),
    sourceUpdatedAt: asStringOrNull(row.source_updated_at),
  };
}

/**
 * RPC satırından S2.13 `VisibilityCandidate` türetir (post-fetch savunma girdisi).
 * Demo `YH_DEMO_TENANT_ID`'den türetilir; index'te demo-source kolonu yok → false.
 * PII yalnız kesin `false` ilerler (aksi → fail-closed görünmez). Kimlik bozuk → null.
 */
export function buildVisibilityCandidate(row: unknown): VisibilityCandidate | null {
  if (!isRecord(row)) return null;

  const tenantIsNull = row.tenant_id === null;
  const tenantId = tenantIsNull ? null : asNonEmptyString(row.tenant_id);
  if (!tenantIsNull && tenantId === null) return null;

  if (!isYhSourceModule(row.source_module)) return null;
  const sourceId = asNonEmptyString(row.source_id);
  if (sourceId === null) return null;

  return {
    tenantId,
    // Yalnız kesin false ilerler; non-bool/true → true → evaluateVisibility gizler.
    isClientPii: row.is_client_pii === false ? false : true,
    isDemoTenant: tenantId === YH_DEMO_TENANT_ID,
    isDemoSource: false,
    sourceModule: row.source_module,
    sourceId,
  };
}

// ─── Orkestrasyon (saf; enjekte port'lar) ─────────────────────────────────────

/**
 * Descriptor'ı çalıştırır: noop → DB çağrısı yok; query → RPC portu + satır map +
 * `evaluateVisibility` post-fetch savunması. Sıralama RPC'den gelir (yeniden hesaplanmaz).
 * Throw etmez; RPC/stone hataları port sözleşmeleriyle fail-closed'a çevrilir.
 */
export async function executeRetrieval(
  descriptor: RetrievalQueryDescriptor,
  rpc: RetrievalRpcPort,
  stoneExclusionPort: StoneExclusionPort,
): Promise<RetrievalExecutionResult> {
  if (descriptor.kind === "noop") {
    return { kind: "noop", reason: descriptor.reason };
  }

  const params: RetrievalRpcParams = {
    tsquery: descriptor.tsquery,
    sessionTenantId: descriptor.visibility.sessionTenantId,
    allowShared: descriptor.visibility.allowShared,
    weights: [
      descriptor.ranking.weights.A,
      descriptor.ranking.weights.B,
      descriptor.ranking.weights.C,
      descriptor.ranking.weights.D,
    ],
    limit: descriptor.limit.value,
  };

  const rpcResult = await rpc(params);
  if (!rpcResult.ok) {
    return { kind: "error", code: rpcResult.code };
  }

  const context: VisibilityContext = descriptor.visibility;
  const candidates: Candidate[] = [];
  for (const row of rpcResult.rows) {
    const candidate = mapRowToCandidate(row);
    if (candidate === null) continue; // bozuk kritik alan → satır düş (fail-closed)
    const visCandidate = buildVisibilityCandidate(row);
    if (visCandidate === null) continue;
    // evaluateVisibility (S2.13) fail-closed'dır: stone port hatası/non-bool → görünmez.
    const decision = await evaluateVisibility(visCandidate, context, stoneExclusionPort);
    if (decision.visible) candidates.push(candidate);
  }

  return { kind: "results", candidates };
}
