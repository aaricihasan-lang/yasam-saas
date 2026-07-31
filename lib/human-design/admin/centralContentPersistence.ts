/**
 * HD FAZ-2 — Merkezî İçerik Admin hattı · Persistence (server-only, service_role)
 * ==============================================================================
 *
 * YALNIZ verifyAdminRequest'ten gelen service-role DB client ile çalışır. Tenant
 * persistence'tan (lib/human-design/api/knowledgePersistence.ts) TAMAMEN AYRIDIR.
 *
 * KULLANILMAZ: tenant_id, verifyUserRequest, /api/hd/knowledge,
 *   human_design_knowledge_records, human_design_knowledge_sources.
 *
 * Hash: özgün metin + çeviri hash'i server-side Node crypto SHA-256 ile hesaplanır
 *   (client hash'e GÜVENİLMEZ). FK bağımlılık ihlali (RESTRICT) → 409 dependency_conflict.
 *
 * Canonical KİMLİK için create/update/delete YOKTUR (kalıcı registry).
 *
 * AUDIT ATOMİKLİĞİ (dürüst not): mutation ve audit AYRI Supabase statement'larıdır
 *   (aynı PostgreSQL transaction'ında DEĞİL). Audit FAIL-CLOSED'dır (hata sessizce
 *   yutulmaz), ancak "atomik audit" iddia edilmez. SECURITY DEFINER RPC'ye
 *   dönüştürme bu fazın kapsamı dışıdır.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HdAuditAction,
  HdAuditResourceKind,
  HdCanonicalContentRow,
  HdCanonicalEntityRow,
  HdContentEvidenceRow,
  HdEntityKind,
  HdFaithfulTranslationRow,
  HdOriginalTextRow,
  HdPersistResult,
  HdSourcePassageRow,
  HdSourceRow,
} from "./centralContentTypes";
import { writeHdContentAudit } from "./centralContentAudit";

// ── SHA-256 (server-side; birebir UTF-8 byte) ───────────────────────────────
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ── Supabase hata eşleme ────────────────────────────────────────────────────
type PgErr = { code?: string; message?: string } | null;
function mapError(error: PgErr): HdPersistResult<never> {
  const code = error?.code;
  if (code === "23503") {
    // FK ihlali: RESTRICT (silinemez bağımlı) veya eksik parent.
    return { ok: false, error: { code: "dependency_conflict", message: "Bağımlı kayıt(lar) mevcut veya referans eksik." } };
  }
  if (code === "23505") {
    return { ok: false, error: { code: "validation", message: "Benzersizlik kısıtı ihlali (kayıt zaten var)." } };
  }
  if (code === "23514") {
    return { ok: false, error: { code: "validation", message: "Kayıt kısıt (CHECK) doğrulamasını geçmedi." } };
  }
  return { ok: false, error: { code: "db_error", message: error?.message ?? "Bilinmeyen DB hatası." } };
}

// ── Audit yardımcı (mutation sonrası; fail-closed) ──────────────────────────
async function audit(
  db: SupabaseClient,
  actorAdminId: string,
  action: HdAuditAction,
  resourceKind: HdAuditResourceKind,
  resourceId: string,
  extra?: { canonicalEntityId?: string | null; canonicalKey?: string | null; changedFields?: string[]; context?: Record<string, unknown> },
): Promise<void> {
  await writeHdContentAudit(db, {
    actor_admin_id: actorAdminId,
    action,
    resource_kind: resourceKind,
    resource_id: resourceId,
    canonical_entity_id: extra?.canonicalEntityId ?? null,
    canonical_key: extra?.canonicalKey ?? null,
    changed_fields: extra?.changedFields ?? [],
    context: extra?.context ?? {},
  });
}

// ── Canonical kimlik (SALT-OKUMA; write YOK) ────────────────────────────────
export async function listCanonical(
  db: SupabaseClient,
  entityKind?: HdEntityKind,
): Promise<HdPersistResult<HdCanonicalEntityRow[]>> {
  let q = db.from("hd_canonical_entities").select("id, entity_kind, canonical_key, name_tr, name_original, status, version, created_at, updated_at");
  if (entityKind) q = q.eq("entity_kind", entityKind);
  const { data, error } = await q.order("canonical_key", { ascending: true });
  if (error) return mapError(error);
  return { ok: true, data: (data ?? []) as HdCanonicalEntityRow[] };
}

export async function getCanonicalDetail(
  db: SupabaseClient,
  entityId: string,
): Promise<HdPersistResult<HdCanonicalEntityRow>> {
  const { data, error } = await db
    .from("hd_canonical_entities")
    .select("id, entity_kind, canonical_key, name_tr, name_original, status, version, created_at, updated_at")
    .eq("id", entityId)
    .maybeSingle();
  if (error) return mapError(error);
  if (!data) return { ok: false, error: { code: "not_found", message: "Canonical kimlik bulunamadı." } };
  return { ok: true, data: data as HdCanonicalEntityRow };
}

// ── Kaynaklandırılmış Ana Metin (hd_canonical_content) ──────────────────────
const CONTENT_WRITABLE = [
  "general_description", "report_text", "status", "is_ai_generated", "human_approved_at",
  "strategy_text", "signature_text", "not_self_text",
  "decision_mechanism", "application_text", "caution_notes",
  "general_theme", "full_channel_text", "hanging_gate_context",
] as const;

function pickContent(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CONTENT_WRITABLE) if (k in body) out[k] = body[k];
  return out;
}

export async function getContentByEntity(
  db: SupabaseClient,
  entityId: string,
): Promise<HdPersistResult<HdCanonicalContentRow | null>> {
  const { data, error } = await db.from("hd_canonical_content").select("*").eq("entity_id", entityId).maybeSingle();
  if (error) return mapError(error);
  return { ok: true, data: (data as HdCanonicalContentRow | null) ?? null };
}

export async function createContent(
  db: SupabaseClient,
  actorAdminId: string,
  entity: HdCanonicalEntityRow,
  body: Record<string, unknown>,
): Promise<HdPersistResult<{ id: string }>> {
  const payload = {
    ...pickContent(body),
    entity_id: entity.id,
    entity_kind: entity.entity_kind,
    canonical_key: entity.canonical_key,
  };
  const { data, error } = await db.from("hd_canonical_content").insert(payload).select("id").maybeSingle();
  if (error) return mapError(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: { code: "db_error", message: "İçerik oluşturulamadı." } };
  await audit(db, actorAdminId, "created", "canonical_content", id, {
    canonicalEntityId: entity.id, canonicalKey: entity.canonical_key, changedFields: Object.keys(pickContent(body)),
    context: { entity_kind: entity.entity_kind, status: (body.status as string) ?? "draft" },
  });
  return { ok: true, data: { id } };
}

export async function updateContent(
  db: SupabaseClient,
  actorAdminId: string,
  id: string,
  entity: HdCanonicalEntityRow,
  body: Record<string, unknown>,
): Promise<HdPersistResult<{ id: string }>> {
  const patch = pickContent(body);
  const { data, error } = await db.from("hd_canonical_content").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return mapError(error);
  if (!data) return { ok: false, error: { code: "not_found", message: "İçerik kaydı bulunamadı." } };
  await audit(db, actorAdminId, "updated", "canonical_content", id, {
    canonicalEntityId: entity.id, canonicalKey: entity.canonical_key, changedFields: Object.keys(patch),
    context: { entity_kind: entity.entity_kind },
  });
  return { ok: true, data: { id } };
}

export async function publishContent(
  db: SupabaseClient,
  actorAdminId: string,
  id: string,
  entity: HdCanonicalEntityRow,
): Promise<HdPersistResult<{ id: string }>> {
  // status=published DB CHECK'leri (published_common + published_typed) uygular;
  // eksik alan → 23514 → validation.
  const { data, error } = await db
    .from("hd_canonical_content")
    .update({ status: "published", human_approved_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return mapError(error);
  if (!data) return { ok: false, error: { code: "not_found", message: "İçerik kaydı bulunamadı." } };
  await audit(db, actorAdminId, "published", "canonical_content", id, {
    canonicalEntityId: entity.id, canonicalKey: entity.canonical_key, changedFields: ["status", "human_approved_at"],
    context: { entity_kind: entity.entity_kind, status: "published" },
  });
  return { ok: true, data: { id } };
}

export async function deleteContent(
  db: SupabaseClient,
  actorAdminId: string,
  id: string,
): Promise<HdPersistResult<{ id: string }>> {
  const { data, error } = await db.from("hd_canonical_content").delete().eq("id", id).select("id").maybeSingle();
  if (error) return mapError(error);
  if (!data) return { ok: false, error: { code: "not_found", message: "İçerik kaydı bulunamadı." } };
  await audit(db, actorAdminId, "deleted", "canonical_content", id);
  return { ok: true, data: { id } };
}

// ── Generic kaynak-katmanı CRUD (source / passage / original_text) ──────────
async function genericDelete(
  db: SupabaseClient,
  actorAdminId: string,
  table: string,
  resourceKind: HdAuditResourceKind,
  id: string,
): Promise<HdPersistResult<{ id: string }>> {
  const { data, error } = await db.from(table).delete().eq("id", id).select("id").maybeSingle();
  if (error) return mapError(error); // RESTRICT bağımlısı → 23503 → 409
  if (!data) return { ok: false, error: { code: "not_found", message: "Kayıt bulunamadı." } };
  await audit(db, actorAdminId, "deleted", resourceKind, id);
  return { ok: true, data: { id } };
}

export async function deleteSource(db: SupabaseClient, a: string, id: string) {
  return genericDelete(db, a, "hd_sources", "source", id);
}
export async function deletePassage(db: SupabaseClient, a: string, id: string) {
  return genericDelete(db, a, "hd_source_passages", "source_passage", id);
}
export async function deleteOriginalText(db: SupabaseClient, a: string, id: string) {
  return genericDelete(db, a, "hd_original_texts", "original_text", id);
}
export async function deleteTranslation(db: SupabaseClient, a: string, id: string) {
  return genericDelete(db, a, "hd_faithful_translations", "faithful_translation", id);
}
export async function deleteEvidence(db: SupabaseClient, a: string, id: string) {
  return genericDelete(db, a, "hd_content_evidence", "content_evidence", id);
}

export async function listSources(db: SupabaseClient): Promise<HdPersistResult<HdSourceRow[]>> {
  const { data, error } = await db.from("hd_sources").select("*").order("created_at", { ascending: false });
  if (error) return mapError(error);
  return { ok: true, data: (data ?? []) as HdSourceRow[] };
}

export async function listPassages(db: SupabaseClient, sourceId: string): Promise<HdPersistResult<HdSourcePassageRow[]>> {
  const { data, error } = await db.from("hd_source_passages").select("*").eq("source_id", sourceId).order("sort_order", { ascending: true });
  if (error) return mapError(error);
  return { ok: true, data: (data ?? []) as HdSourcePassageRow[] };
}

/** Özgün metin oluştur — content_hash SERVER-SIDE hesaplanır (client hash yok sayılır). */
export async function createOriginalText(
  db: SupabaseClient,
  actorAdminId: string,
  body: Record<string, unknown>,
): Promise<HdPersistResult<{ id: string }>> {
  const text = typeof body.original_text === "string" ? body.original_text : "";
  if (text.trim() === "") return { ok: false, error: { code: "validation", message: "original_text boş olamaz." } };
  const payload = {
    passage_id: body.passage_id,
    language_tag: body.language_tag,
    script_code: body.script_code,
    original_text: text,
    content_hash: sha256Hex(text), // server-side; client'a güvenilmez
    capture_method: body.capture_method ?? "manual_transcription",
  };
  const { data, error } = await db.from("hd_original_texts").insert(payload).select("id").maybeSingle();
  if (error) return mapError(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: { code: "db_error", message: "Özgün metin oluşturulamadı." } };
  await audit(db, actorAdminId, "created", "original_text", id, { context: { content_hash: payload.content_hash } });
  return { ok: true, data: { id } };
}

/** Sadık çeviri oluştur — translation_hash SERVER-SIDE; özgün-metin sürümüne pinlenir. */
export async function createTranslation(
  db: SupabaseClient,
  actorAdminId: string,
  body: Record<string, unknown>,
): Promise<HdPersistResult<{ id: string }>> {
  const originalTextId = body.original_text_id;
  if (typeof originalTextId !== "string") {
    return { ok: false, error: { code: "validation", message: "original_text_id gerekli." } };
  }
  // Özgün-metin sürümünü oku → pin alanlarını DB'den al (client'a güvenilmez).
  const { data: ot, error: otErr } = await db
    .from("hd_original_texts")
    .select("id, content_hash, language_tag, script_code")
    .eq("id", originalTextId)
    .maybeSingle();
  if (otErr) return mapError(otErr);
  if (!ot) return { ok: false, error: { code: "not_found", message: "Özgün metin sürümü bulunamadı." } };
  const o = ot as { id: string; content_hash: string; language_tag: string; script_code: string };

  const text = typeof body.translation_text === "string" ? body.translation_text : "";
  const payload = {
    original_text_id: o.id,
    source_content_hash: o.content_hash,
    source_language_tag: o.language_tag,
    source_script_code: o.script_code,
    target_language_tag: body.target_language_tag ?? "tr",
    translation_text: text,
    translation_hash: sha256Hex(text), // server-side
    status: body.status ?? "draft",
  };
  const { data, error } = await db.from("hd_faithful_translations").insert(payload).select("id").maybeSingle();
  if (error) return mapError(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: { code: "db_error", message: "Çeviri oluşturulamadı." } };
  await audit(db, actorAdminId, "created", "faithful_translation", id, {
    changedFields: ["translation_text", "status"], context: { source_content_hash: o.content_hash, status: payload.status as string },
  });
  return { ok: true, data: { id } };
}

// ── Generic create/update (source / passage / original_text / translation) ──
async function genericCreate(
  db: SupabaseClient,
  actorAdminId: string,
  table: string,
  resourceKind: HdAuditResourceKind,
  payload: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<HdPersistResult<{ id: string }>> {
  const { data, error } = await db.from(table).insert(payload).select("id").maybeSingle();
  if (error) return mapError(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: { code: "db_error", message: "Kayıt oluşturulamadı." } };
  await audit(db, actorAdminId, "created", resourceKind, id, { changedFields: Object.keys(payload), context: context ?? {} });
  return { ok: true, data: { id } };
}

async function genericUpdate(
  db: SupabaseClient,
  actorAdminId: string,
  table: string,
  resourceKind: HdAuditResourceKind,
  id: string,
  patch: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<HdPersistResult<{ id: string }>> {
  const { data, error } = await db.from(table).update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return mapError(error);
  if (!data) return { ok: false, error: { code: "not_found", message: "Kayıt bulunamadı." } };
  await audit(db, actorAdminId, "updated", resourceKind, id, { changedFields: Object.keys(patch), context: context ?? {} });
  return { ok: true, data: { id } };
}

const SOURCE_WRITABLE = [
  "source_type", "title", "authors", "organization", "rights_status",
  "internal_use_allowed", "expert_delivery_allowed", "private_report_use_allowed",
  "public_display_allowed", "commercial_use_allowed", "status",
] as const;
const PASSAGE_WRITABLE = [
  "source_id", "locator_kind", "locator_label", "locator_value", "passage_kind",
  "source_specific_note", "rights_note", "status",
] as const;

function pickKeys(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

export async function createSource(db: SupabaseClient, a: string, body: Record<string, unknown>) {
  return genericCreate(db, a, "hd_sources", "source", pickKeys(body, SOURCE_WRITABLE), { rights_status: body.rights_status as string });
}
export async function updateSource(db: SupabaseClient, a: string, id: string, body: Record<string, unknown>) {
  return genericUpdate(db, a, "hd_sources", "source", id, pickKeys(body, SOURCE_WRITABLE));
}
export async function createPassage(db: SupabaseClient, a: string, body: Record<string, unknown>) {
  return genericCreate(db, a, "hd_source_passages", "source_passage", pickKeys(body, PASSAGE_WRITABLE));
}
export async function updatePassage(db: SupabaseClient, a: string, id: string, body: Record<string, unknown>) {
  return genericUpdate(db, a, "hd_source_passages", "source_passage", id, pickKeys(body, PASSAGE_WRITABLE));
}
export async function updateOriginalText(db: SupabaseClient, a: string, id: string, body: Record<string, unknown>) {
  // Metin değişirse content_hash yeniden hesaplanır (server-side).
  const patch: Record<string, unknown> = {};
  if (typeof body.original_text === "string") {
    patch.original_text = body.original_text;
    patch.content_hash = sha256Hex(body.original_text);
  }
  if (typeof body.status === "string") patch.status = body.status;
  return genericUpdate(db, a, "hd_original_texts", "original_text", id, patch);
}
export async function updateTranslation(db: SupabaseClient, a: string, id: string, body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (typeof body.translation_text === "string") {
    patch.translation_text = body.translation_text;
    patch.translation_hash = sha256Hex(body.translation_text);
  }
  if (typeof body.status === "string") patch.status = body.status;
  return genericUpdate(db, a, "hd_faithful_translations", "faithful_translation", id, patch);
}

export async function getRow(
  db: SupabaseClient,
  table: string,
  id: string,
): Promise<HdPersistResult<Record<string, unknown>>> {
  const { data, error } = await db.from(table).select("*").eq("id", id).maybeSingle();
  if (error) return mapError(error);
  if (!data) return { ok: false, error: { code: "not_found", message: "Kayıt bulunamadı." } };
  return { ok: true, data: data as Record<string, unknown> };
}

export async function listOriginalTexts(db: SupabaseClient, passageId: string): Promise<HdPersistResult<HdOriginalTextRow[]>> {
  const { data, error } = await db.from("hd_original_texts").select("*").eq("passage_id", passageId).order("revision", { ascending: true });
  if (error) return mapError(error);
  return { ok: true, data: (data ?? []) as HdOriginalTextRow[] };
}
export async function listTranslations(db: SupabaseClient, originalTextId: string): Promise<HdPersistResult<HdFaithfulTranslationRow[]>> {
  const { data, error } = await db.from("hd_faithful_translations").select("*").eq("original_text_id", originalTextId).order("revision", { ascending: true });
  if (error) return mapError(error);
  return { ok: true, data: (data ?? []) as HdFaithfulTranslationRow[] };
}
export async function listEvidence(db: SupabaseClient, contentId: string): Promise<HdPersistResult<HdContentEvidenceRow[]>> {
  const { data, error } = await db.from("hd_content_evidence").select("*").eq("content_id", contentId).order("sort_order", { ascending: true });
  if (error) return mapError(error);
  return { ok: true, data: (data ?? []) as HdContentEvidenceRow[] };
}

/** Evidence oluştur (içerik ↔ pasaj). */
export async function createEvidence(
  db: SupabaseClient,
  actorAdminId: string,
  body: Record<string, unknown>,
): Promise<HdPersistResult<{ id: string }>> {
  const payload = {
    content_id: body.content_id,
    passage_id: body.passage_id,
    relation_type: body.relation_type,
    is_primary: body.is_primary === true,
    is_single_source: body.is_single_source === true,
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
    editorial_note: typeof body.editorial_note === "string" ? body.editorial_note : null,
  };
  const { data, error } = await db.from("hd_content_evidence").insert(payload).select("id").maybeSingle();
  if (error) return mapError(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: { code: "db_error", message: "Kanıt bağı oluşturulamadı." } };
  await audit(db, actorAdminId, "created", "content_evidence", id, {
    changedFields: ["relation_type"], context: { relation_type: body.relation_type as string, is_single_source: payload.is_single_source },
  });
  return { ok: true, data: { id } };
}
