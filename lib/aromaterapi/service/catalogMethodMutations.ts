import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeMethodNoteHash,
  type MethodRevisionContent,
  type MethodStep,
} from "@/lib/aromaterapi/service/methodCanonical";

/**
 * Aromaterapi V2 — C3D-B2A katalog + method mutation server adapter (server-only).
 *
 * Sorumluluk sınırı:
 *   - Canonical create/update YALNIZ production SECURITY DEFINER RPC'leri ile (7 adet).
 *     Bu katman plant_taxa/preparations/method tablolarına DOĞRUDAN write YAPMAZ
 *     (write-gate: service_role bu tablolarda yalnız SELECT'e sahiptir).
 *   - Actor (userId/label) ve tenantId kullanıcı input'undan YAPISAL olarak ayrıdır;
 *     yalnız route'un verifyUserRequest guard'ından gelir.
 *   - note_hash İSTEMCİDEN alınmaz; yalnız burada (computeMethodNoteHash) üretilir.
 *   - Kullanıcı değerleri (metin/steps/reason) trim/coerce/truncate EDİLMEZ; RPC'ye
 *     orijinal biçimiyle iletilir. Nihai validation DB/RPC'dir.
 *   - Ham DB hata metni (message/details/hint) route'a/istemciye TAŞINMAZ; loglanır,
 *     yalnız stabil makine kodu döner.
 */

/** RPC'nin P0001 mesajları + native SQLSTATE'ten türetilen stabil kodlar. */
export type CatalogMethodErrorCode =
  | "AROMA_ACTOR_ID_REQUIRED"
  | "AROMA_ACTOR_LABEL_INVALID"
  | "AROMA_REASON_INVALID"
  | "AROMA_NOTE_HASH_INVALID"
  | "AROMA_TAXON_NOT_FOUND"
  | "AROMA_PREPARATION_NOT_FOUND"
  | "AROMA_SERIES_NOT_FOUND"
  | "AROMA_REVISION_NOT_FOUND"
  | "AROMA_PARENT_NOT_FOUND"
  | "AROMA_STALE"
  | "AROMA_REVISION_STALE"
  | "AROMA_PREPARATION_IDENTITY_LOCKED"
  | "AROMA_FAITHFUL_SOURCE_REQUIRED"
  | "AROMA_PASSAGE_SOURCE_MISMATCH"
  | "AROMA_FORBIDDEN_STATUS_TRANSITION"
  | "AROMA_CHECK_VIOLATION"
  | "AROMA_FK_VIOLATION"
  | "AROMA_UNIQUE_VIOLATION"
  | "AROMA_WRITE_FAILED";

/** Stabil kod → HTTP status (C3D-B2A kilitli sözleşme). */
export const CATALOG_METHOD_ERROR_HTTP: Readonly<Record<CatalogMethodErrorCode, number>> = {
  AROMA_ACTOR_ID_REQUIRED: 500,
  AROMA_ACTOR_LABEL_INVALID: 500,
  AROMA_REASON_INVALID: 400,
  AROMA_NOTE_HASH_INVALID: 422,
  AROMA_TAXON_NOT_FOUND: 404,
  AROMA_PREPARATION_NOT_FOUND: 404,
  AROMA_SERIES_NOT_FOUND: 404,
  AROMA_REVISION_NOT_FOUND: 404,
  AROMA_PARENT_NOT_FOUND: 404,
  AROMA_STALE: 409,
  AROMA_REVISION_STALE: 409,
  AROMA_PREPARATION_IDENTITY_LOCKED: 409,
  AROMA_FAITHFUL_SOURCE_REQUIRED: 422,
  AROMA_PASSAGE_SOURCE_MISMATCH: 422,
  AROMA_FORBIDDEN_STATUS_TRANSITION: 422,
  AROMA_CHECK_VIOLATION: 422,
  AROMA_FK_VIOLATION: 422,
  AROMA_UNIQUE_VIOLATION: 409,
  AROMA_WRITE_FAILED: 500,
};

/** RPC'nin RAISE EXCEPTION ... ERRCODE='P0001' mesajları — EXACT allowlist (Set.has). */
const RPC_P0001_CODES: ReadonlySet<CatalogMethodErrorCode> = new Set<CatalogMethodErrorCode>([
  "AROMA_ACTOR_ID_REQUIRED",
  "AROMA_ACTOR_LABEL_INVALID",
  "AROMA_REASON_INVALID",
  "AROMA_NOTE_HASH_INVALID",
  "AROMA_TAXON_NOT_FOUND",
  "AROMA_PREPARATION_NOT_FOUND",
  "AROMA_SERIES_NOT_FOUND",
  "AROMA_REVISION_NOT_FOUND",
  "AROMA_PARENT_NOT_FOUND",
  "AROMA_STALE",
  "AROMA_REVISION_STALE",
  "AROMA_PREPARATION_IDENTITY_LOCKED",
  "AROMA_FAITHFUL_SOURCE_REQUIRED",
  "AROMA_PASSAGE_SOURCE_MISMATCH",
  "AROMA_FORBIDDEN_STATUS_TRANSITION",
]);

/**
 * RPC hatasını EXACT eşitlikle stabil koda sınıflandırır.
 *   - Native SQLSTATE (error.code): 23514→CHECK, 23505→UNIQUE, 23503→FK.
 *   - P0001 kontrollü mesaj (error.message): Set.has ile TAM eşitlik (includes/regex YOK).
 *   - Tanınmayan → AROMA_WRITE_FAILED. Ham metin DÖNDÜRÜLMEZ.
 */
export function classifyCatalogMethodRpcError(error: unknown): CatalogMethodErrorCode {
  const sqlstate =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (sqlstate === "23514") return "AROMA_CHECK_VIOLATION";
  if (sqlstate === "23505") return "AROMA_UNIQUE_VIOLATION";
  if (sqlstate === "23503") return "AROMA_FK_VIOLATION";

  const message =
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  if (typeof message === "string" && RPC_P0001_CODES.has(message as CatalogMethodErrorCode)) {
    return message as CatalogMethodErrorCode;
  }
  return "AROMA_WRITE_FAILED";
}

/** Doğrulanmış actor/tenant bağlamı — yalnız route guard'ından. */
export type CatalogActor = {
  userId: string;
  label: string;
  tenantId: string;
};

/** Ortak başarı sonucu (no-op dahil). */
export type CatalogWriteResult =
  | {
      ok: true;
      entityId: string;
      noop: boolean;
      updatedAt: string | null;
      seriesId?: string;
      revisionId?: string;
      revision?: number;
      latestRevisionId?: string;
      latestRevision?: number;
      status?: string;
      archivedRevisionId?: string | null;
    }
  | { ok: false; code: CatalogMethodErrorCode };

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** RPC dönüşü tek jsonb object; array gelirse yalnız tek-eleman kabul. */
function normalizeResult(data: unknown): CatalogWriteResult {
  let obj: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) return { ok: false, code: "AROMA_WRITE_FAILED" };
    obj = data[0];
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, code: "AROMA_WRITE_FAILED" };
  }
  const row = obj as Record<string, unknown>;
  const entityId = asString(row.entity_id);
  if (!entityId) return { ok: false, code: "AROMA_WRITE_FAILED" };
  const updatedAt = asString(row.updated_at) ?? null;
  const result: CatalogWriteResult = {
    ok: true,
    entityId,
    noop: row.noop === true,
    updatedAt,
  };
  const seriesId = asString(row.series_id);
  const revisionId = asString(row.revision_id);
  const revision = asNumber(row.revision);
  const latestRevisionId = asString(row.latest_revision_id);
  const latestRevision = asNumber(row.latest_revision);
  const status = asString(row.status);
  if (seriesId) result.seriesId = seriesId;
  if (revisionId) result.revisionId = revisionId;
  if (revision !== undefined) result.revision = revision;
  if (latestRevisionId) result.latestRevisionId = latestRevisionId;
  if (latestRevision !== undefined) result.latestRevision = latestRevision;
  if (status) result.status = status;
  if ("archived_revision_id" in row) {
    result.archivedRevisionId = asString(row.archived_revision_id) ?? null;
  }
  return result;
}

function fail(context: string, error: unknown): CatalogWriteResult {
  console.error(`[aromaterapi:${context}] RPC failed:`, (error as { message?: unknown })?.message);
  return { ok: false, code: classifyCatalogMethodRpcError(error) };
}

// ─── Input tipleri (route tarafından şekli doğrulanmış, kullanıcı-editable alanlar) ───

export type CreatePlantTaxonInput = {
  genus: string;
  species: string;
  taxonRank: string;
  infraspecificEpithet: string | null;
  isHybrid: boolean;
  authorCitation: string | null;
  family: string;
  primaryCommonNameTr: string | null;
  reason: string | null;
};

export type UpdatePlantTaxonInput = CreatePlantTaxonInput & {
  status: string;
  expectedUpdatedAt: string | null;
  reason: string;
};

export type CreatePreparationInput = {
  taxonId: string;
  preparationType: string;
  plantPart: string;
  chemotype: string | null;
  reason: string | null;
};

export type UpdatePreparationInput = {
  taxonId: string;
  preparationType: string;
  plantPart: string;
  chemotype: string | null;
  status: string;
  expectedUpdatedAt: string | null;
  reason: string;
};

export type MethodSeriesInput = {
  preparationId: string;
  methodKind: string;
  sourceId: string | null;
  passageId: string | null;
  methodLang: string;
};

export type MethodRevisionInput = MethodRevisionContent & { reason: string | null };

// ─── Adapter fonksiyonları ───

export async function createPlantTaxon(
  db: SupabaseClient,
  actor: CatalogActor,
  input: CreatePlantTaxonInput,
): Promise<CatalogWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_create_plant_taxon_with_audit", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_genus: input.genus,
    p_species: input.species,
    p_taxon_rank: input.taxonRank,
    p_infraspecific_epithet: input.infraspecificEpithet,
    p_is_hybrid: input.isHybrid,
    p_author_citation: input.authorCitation,
    p_family: input.family,
    p_primary_common_name_tr: input.primaryCommonNameTr,
    p_reason: input.reason,
  });
  if (error) return fail("createPlantTaxon", error);
  return normalizeResult(data);
}

export async function updatePlantTaxon(
  db: SupabaseClient,
  actor: CatalogActor,
  taxonId: string,
  input: UpdatePlantTaxonInput,
): Promise<CatalogWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_update_plant_taxon_with_audit", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_taxon_id: taxonId,
    p_genus: input.genus,
    p_species: input.species,
    p_taxon_rank: input.taxonRank,
    p_infraspecific_epithet: input.infraspecificEpithet,
    p_is_hybrid: input.isHybrid,
    p_author_citation: input.authorCitation,
    p_family: input.family,
    p_primary_common_name_tr: input.primaryCommonNameTr,
    p_status: input.status,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason,
  });
  if (error) return fail("updatePlantTaxon", error);
  return normalizeResult(data);
}

export async function createPreparation(
  db: SupabaseClient,
  actor: CatalogActor,
  input: CreatePreparationInput,
): Promise<CatalogWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_create_preparation_with_audit", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_taxon_id: input.taxonId,
    p_preparation_type: input.preparationType,
    p_plant_part: input.plantPart,
    p_chemotype: input.chemotype,
    p_reason: input.reason,
  });
  if (error) return fail("createPreparation", error);
  return normalizeResult(data);
}

export async function updatePreparation(
  db: SupabaseClient,
  actor: CatalogActor,
  preparationId: string,
  input: UpdatePreparationInput,
): Promise<CatalogWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_update_preparation_with_audit", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_preparation_id: preparationId,
    p_taxon_id: input.taxonId,
    p_preparation_type: input.preparationType,
    p_plant_part: input.plantPart,
    p_chemotype: input.chemotype,
    p_status: input.status,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason,
  });
  if (error) return fail("updatePreparation", error);
  return normalizeResult(data);
}

/** Method içerik param'ları — RPC p_ isimlerine map (note_hash server-üretimli). */
function methodContentParams(content: MethodRevisionContent): Record<string, unknown> {
  const steps: MethodStep[] | null = content.steps ? [...content.steps] : null;
  return {
    p_plant_part_used: content.plant_part_used,
    p_material_state: content.material_state,
    p_method_text: content.method_text,
    p_equipment: content.equipment,
    p_amount_ratio: content.amount_ratio,
    p_solvent_carrier: content.solvent_carrier,
    p_duration_text: content.duration_text,
    p_temperature_text: content.temperature_text,
    p_steps: steps,
    p_filtration: content.filtration,
    p_resting: content.resting,
    p_storage: content.storage,
    p_quality_notes: content.quality_notes,
    p_safety_notes: content.safety_notes,
    p_note_hash: computeMethodNoteHash(content),
  };
}

export async function createMethodSeriesWithFirstRevision(
  db: SupabaseClient,
  actor: CatalogActor,
  series: MethodSeriesInput,
  revision: MethodRevisionInput,
): Promise<CatalogWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_create_method_series_with_first_revision", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_preparation_id: series.preparationId,
    p_method_kind: series.methodKind,
    p_source_id: series.sourceId,
    p_passage_id: series.passageId,
    p_method_lang: series.methodLang,
    ...methodContentParams(revision),
    p_reason: revision.reason,
  });
  if (error) return fail("createMethodSeries", error);
  return normalizeResult(data);
}

export async function appendMethodRevision(
  db: SupabaseClient,
  actor: CatalogActor,
  seriesId: string,
  revision: MethodRevisionContent & { reason: string },
  expectedLatestRevision: number,
): Promise<CatalogWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_append_method_revision", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_series_id: seriesId,
    ...methodContentParams(revision),
    p_expected_latest_revision: expectedLatestRevision,
    p_reason: revision.reason,
  });
  if (error) return fail("appendMethodRevision", error);
  return normalizeResult(data);
}

export type StatusTransitionInput = {
  targetStatus: string;
  expectedUpdatedAt: string | null;
  reason: string;
};

export async function transitionMethodRevisionStatus(
  db: SupabaseClient,
  actor: CatalogActor,
  seriesId: string,
  revisionId: string,
  input: StatusTransitionInput,
): Promise<CatalogWriteResult> {
  const { data, error } = await db.rpc("aromatherapy_transition_method_revision_status", {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    p_series_id: seriesId,
    p_revision_id: revisionId,
    p_target_status: input.targetStatus,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason,
  });
  if (error) return fail("transitionMethodRevisionStatus", error);
  return normalizeResult(data);
}
