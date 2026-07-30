import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A4A (yebs_claims) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (A4AR):
 *   - Yalnız okuma: listClaims + getClaimById.
 *   - Admin doğrulaması route sorumluluğu (verifyAdminRequest).
 *   - Yalnız enjekte edilen `db` (service_role); ham DB hata metni route'a taşınmaz.
 *   - Canonical row guard (fail-closed): beklenen 11 alanı taşımayan satır OKUMA
 *     HATASI olarak reddedilir; bozuk/kısmi satır istemciye gitmez.
 *   - Mutation YOK; JOIN YOK; Concept adı/label, Claim Sources gömme veya source
 *     kullanım sayısı DÖNMEZ.
 *   - Claim = saf editöryal/kanonik iddia gövdesi; source/pasaj/çeviri burada yok.
 *
 * Güvenlik: `import "server-only"`.
 */

/** D6 canonical kolonlar — AÇIK liste. select("*") YOK. */
export const YEBS_CLAIM_COLUMNS =
  "id, concept_id, claim_type, claim_text, provenance_kind, evidence_layer, outcome_type, safety_topic, status, created_at, updated_at";

/** D6 claim_type CHECK değer kümesi (6). */
export const YEBS_CLAIM_TYPES = [
  "identity",
  "function",
  "relationship",
  "practice",
  "safety",
  "research_finding",
] as const;
export type YebsClaimType = (typeof YEBS_CLAIM_TYPES)[number];

/** D6 provenance_kind CHECK değer kümesi (4). */
export const YEBS_CLAIM_PROVENANCE_KINDS = [
  "source_original",
  "faithful_translation",
  "editorial_explanation",
  "editorial_interpretation",
] as const;
export type YebsClaimProvenanceKind = (typeof YEBS_CLAIM_PROVENANCE_KINDS)[number];

/** D6 evidence_layer CHECK değer kümesi (9). */
export const YEBS_CLAIM_EVIDENCE_LAYERS = [
  "classical_textual",
  "traditional",
  "ethnographic",
  "clinical",
  "experimental",
  "scientific_review",
  "regulatory",
  "experiential",
  "energetic_metaphysical",
] as const;
export type YebsClaimEvidenceLayer = (typeof YEBS_CLAIM_EVIDENCE_LAYERS)[number];

/** D6 status CHECK değer kümesi (7). */
export const YEBS_CLAIM_STATUSES = [
  "draft",
  "under_review",
  "needs_verification",
  "verified",
  "approved",
  "published",
  "archived",
] as const;
export type YebsClaimStatus = (typeof YEBS_CLAIM_STATUSES)[number];

/**
 * D6 outcome_type CHECK değerlerinin BİRLEŞİMİ (yalnız okuma filtresi doğrulaması).
 * Coupling (safety-zorunlu / research-opsiyonel / diğer-NULL) create/update RPC'de
 * uygulanır; okuma filtresi yalnız değerin bilinen kümede olduğunu doğrular.
 */
export const YEBS_CLAIM_OUTCOME_TYPES = [
  // safety kümesi (8)
  "harm_shown",
  "risk_suspected",
  "contraindicated",
  "source_does_not_recommend",
  "not_classified_as_risk",
  "insufficient_data",
  "conflicting",
  "unknown",
  // research_finding kümesi (safety ile ortak olmayanlar)
  "positive_finding",
  "no_effect_found",
  "mixed_findings",
  "no_study_done",
] as const;
export type YebsClaimOutcomeType = (typeof YEBS_CLAIM_OUTCOME_TYPES)[number];

export type YebsClaimRow = {
  id: string;
  concept_id: string;
  claim_type: string;
  claim_text: string;
  provenance_kind: string;
  evidence_layer: string;
  outcome_type: string | null;
  safety_topic: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ListClaimsFilters = {
  limit: number;
  offset: number;
  /** Route tarafında trim + 100 + PostgREST özel karakter arındırma yapılmış. */
  q?: string;
  conceptId?: string;
  claimType?: YebsClaimType;
  provenanceKind?: YebsClaimProvenanceKind;
  evidenceLayer?: YebsClaimEvidenceLayer;
  status?: YebsClaimStatus;
  outcomeType?: YebsClaimOutcomeType;
  safetyTopic?: string;
};

export type ListClaimsResult =
  | { ok: true; rows: YebsClaimRow[]; count: number }
  | { ok: false; code: "YEBS_CLAIMS_LIST_FAILED" };

export type GetClaimResult =
  | { ok: true; row: YebsClaimRow }
  | { ok: false; code: "YEBS_CLAIM_NOT_FOUND" | "YEBS_CLAIM_READ_FAILED" };

/** Canonical row guard (fail-closed): 11 alanın exact tip sözleşmesi. */
function isCanonicalClaimRow(value: unknown): value is YebsClaimRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(o.id) &&
    isStr(o.concept_id) &&
    isStr(o.claim_type) &&
    isStr(o.claim_text) &&
    isStr(o.provenance_kind) &&
    isStr(o.evidence_layer) &&
    isStrOrNull(o.outcome_type) &&
    isStrOrNull(o.safety_topic) &&
    isStr(o.status) &&
    isStr(o.created_at) &&
    isStr(o.updated_at)
  );
}

/**
 * Claim kayıtlarını salt-okunur listeler.
 * Deterministik sıra: created_at DESC, id DESC. JOIN yok; canonical 11 alan.
 * `q` yalnız claim_text üzerinde ilike arar.
 */
export async function listClaims(
  db: SupabaseClient,
  filters: ListClaimsFilters,
): Promise<ListClaimsResult> {
  let query = db
    .from("yebs_claims")
    .select(YEBS_CLAIM_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.conceptId) query = query.eq("concept_id", filters.conceptId);
  if (filters.claimType) query = query.eq("claim_type", filters.claimType);
  if (filters.provenanceKind) query = query.eq("provenance_kind", filters.provenanceKind);
  if (filters.evidenceLayer) query = query.eq("evidence_layer", filters.evidenceLayer);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.outcomeType) query = query.eq("outcome_type", filters.outcomeType);
  if (filters.safetyTopic) query = query.eq("safety_topic", filters.safetyTopic);

  if (filters.q) {
    // filters.q ön-arındırılmıştır (route). YALNIZ claim_text araması.
    query = query.ilike("claim_text", `%${filters.q}%`);
  }

  const { data, error, count } = await query.range(
    filters.offset,
    filters.offset + filters.limit - 1,
  );

  if (error) {
    console.error("[yebs] listClaims failed:", error.message);
    return { ok: false, code: "YEBS_CLAIMS_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalClaimRow)) {
    console.error("[yebs] listClaims: canonical row guard failed");
    return { ok: false, code: "YEBS_CLAIMS_LIST_FAILED" };
  }

  return { ok: true, rows: rows as YebsClaimRow[], count: count ?? 0 };
}

/**
 * Tek Claim kaydını salt-okunur getirir. UUID doğrulaması route sorumluluğu.
 * Kayıt yoksa NOT_FOUND, DB/bozuk satırda READ_FAILED. JOIN yok.
 */
export async function getClaimById(
  db: SupabaseClient,
  id: string,
): Promise<GetClaimResult> {
  const { data, error } = await db
    .from("yebs_claims")
    .select(YEBS_CLAIM_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getClaimById failed:", error.message);
    return { ok: false, code: "YEBS_CLAIM_READ_FAILED" };
  }
  if (!data) {
    return { ok: false, code: "YEBS_CLAIM_NOT_FOUND" };
  }
  if (!isCanonicalClaimRow(data)) {
    console.error("[yebs] getClaimById: canonical row guard failed");
    return { ok: false, code: "YEBS_CLAIM_READ_FAILED" };
  }
  return { ok: true, row: data };
}
