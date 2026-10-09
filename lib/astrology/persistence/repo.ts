// Astroloji — KALICILIK (YALNIZ SUNUCU; service_role + uygulama katmanı tenant filtresi).
//
// Kurallar:
//   • Her sorgu `.eq("tenant_id", tenantId)` taşır (assertTenant fail-closed).
//   • Aşama 7A: profil / revizyon / sağlayıcı sonucu / yorum sorguları AYRICA
//     `.eq("owner_user_id", ownerUserId)` taşır (assertOwner fail-closed). Tenant tek başına uzman
//     sınırı DEĞİLDİR (users.tenant_id tekil değil); başka uzmanın kaydı = yok (404). DB'de bileşik
//     FK'ler (20271101000300) aynı kuralı ikinci katman olarak zorlar.
//   • `raw_response` OKUMA sorgularında SEÇİLMEZ (RESULT_SAFE_COLUMNS). Ham yanıt yalnız INSERT
//     edilir; istemciye giden hiçbir yol onu okumaz.
//   • Yorum katmanı ayrı fonksiyonla, yalnız görünürlük kararı "visible" ise okunur.
//   • Ham DB hatası istemciye dönmez (safeDbError); loga yalnız kod + bağlam yazılır.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { BirthDataInput } from "../birth/profileInput";

assertServerOnly("lib/astrology/persistence/repo");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function assertTenant(tenantId: string, ctx: string): void {
  if (!isUuid(tenantId)) throw new Error(`[astro] tenant invariant ihlali (${ctx})`);
}

function assertOwner(tenantId: string, ownerUserId: string, ctx: string): void {
  assertTenant(tenantId, ctx);
  if (!isUuid(ownerUserId)) throw new Error(`[astro] uzman invariant ihlali (${ctx})`);
}

export type DbErr = { code?: string; message?: string } | null | undefined;

/** Tablo/fonksiyon yok (migration uygulanmamış) mı? */
export function isSchemaMissing(err: DbErr): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "42883" ||
    err.code === "PGRST202" ||
    err.code === "PGRST205" ||
    /relation .* does not exist|Could not find the (table|function)/i.test(err.message ?? "")
  );
}

export function isUniqueViolation(err: DbErr): boolean {
  return !!err && err.code === "23505";
}

export function logAstroDbError(context: string, err: DbErr): void {
  // PII yok: yalnız Postgres/PostgREST kodu + bağlam.
  console.error(`[astro] db error (${context})`, { code: err?.code ?? "unknown" });
}

// ─── Danışan ─────────────────────────────────────────────────────────────────

export async function findTenantClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ row: { id: string; ad: string | null; soyad: string | null } | null; error: DbErr }> {
  assertTenant(tenantId, "findTenantClient");
  if (!isUuid(clientId)) return { row: null, error: null };
  const { data, error } = await db.from("clients").select("id, ad, soyad").eq("tenant_id", tenantId).eq("id", clientId).maybeSingle();
  return { row: (data as { id: string; ad: string | null; soyad: string | null } | null) ?? null, error };
}

// ─── Profil + revizyon ───────────────────────────────────────────────────────

export type ProfileRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  label: string;
  current_revision: number;
  created_at: string;
  updated_at: string;
};

export type RevisionRow = {
  id: string;
  profile_id: string;
  revision: number;
  birth_date: string;
  birth_time: string | null;
  time_known: boolean;
  time_accuracy: string;
  location_id: string | null;
  location_label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  dst_choice: string;
  utc_offset_seconds: number;
  birth_utc: string;
  change_note: string | null;
  created_at: string;
};

const PROFILE_COLUMNS = "id, tenant_id, client_id, label, current_revision, created_at, updated_at";
const REVISION_COLUMNS =
  "id, profile_id, revision, birth_date, birth_time, time_known, time_accuracy, location_id, location_label, latitude, longitude, timezone, dst_choice, utc_offset_seconds, birth_utc, change_note, created_at";

export async function listProfiles(db: SupabaseClient, tenantId: string, ownerUserId: string): Promise<{ rows: ProfileRow[]; error: DbErr }> {
  assertOwner(tenantId, ownerUserId, "listProfiles");
  const { data, error } = await db
    .from("astro_birth_profiles")
    .select(PROFILE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(200);
  return { rows: (data as ProfileRow[] | null) ?? [], error };
}

export async function getProfile(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  profileId: string,
): Promise<{ row: ProfileRow | null; error: DbErr }> {
  assertOwner(tenantId, ownerUserId, "getProfile");
  if (!isUuid(profileId)) return { row: null, error: null };
  const { data, error } = await db
    .from("astro_birth_profiles")
    .select(PROFILE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", ownerUserId)
    .eq("id", profileId)
    .maybeSingle();
  return { row: (data as ProfileRow | null) ?? null, error };
}

export async function listRevisions(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  profileIds: string[],
): Promise<{ rows: RevisionRow[]; error: DbErr }> {
  assertOwner(tenantId, ownerUserId, "listRevisions");
  const ids = profileIds.filter(isUuid);
  if (ids.length === 0) return { rows: [], error: null };
  const { data, error } = await db
    .from("astro_birth_profile_revisions")
    .select(REVISION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", ownerUserId)
    .in("profile_id", ids)
    .order("revision", { ascending: false })
    .limit(2000);
  return { rows: (data as RevisionRow[] | null) ?? [], error };
}

export async function getRevision(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  profileId: string,
  revision: number,
): Promise<{ row: RevisionRow | null; error: DbErr }> {
  assertOwner(tenantId, ownerUserId, "getRevision");
  if (!isUuid(profileId) || !Number.isInteger(revision) || revision < 1) return { row: null, error: null };
  const { data, error } = await db
    .from("astro_birth_profile_revisions")
    .select(REVISION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", ownerUserId)
    .eq("profile_id", profileId)
    .eq("revision", revision)
    .maybeSingle();
  return { row: (data as RevisionRow | null) ?? null, error };
}

function birthRpcArgs(b: BirthDataInput) {
  return {
    p_birth_date: b.birthDate,
    p_birth_time: b.birthTime,
    p_time_known: b.timeKnown,
    p_time_accuracy: b.timeAccuracy,
    p_location_id: b.location.id,
    p_location_label: b.location.label,
    p_latitude: b.location.latitude,
    p_longitude: b.location.longitude,
    p_timezone: b.location.timezone,
    p_dst_choice: b.dstChoice,
    p_utc_offset_seconds: b.utcOffsetSeconds,
    p_birth_utc: b.birthUtcIso,
  };
}

export async function createProfileRpc(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  clientId: string | null,
  label: string,
  birth: BirthDataInput,
): Promise<{ profileId: string | null; error: DbErr }> {
  assertTenant(tenantId, "createProfile");
  const { data, error } = await db.rpc("astro_profile_create", {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_client_id: clientId,
    p_label: label,
    ...birthRpcArgs(birth),
  });
  const pid = (data as { profile_id?: unknown } | null)?.profile_id;
  return { profileId: isUuid(pid) ? pid : null, error };
}

export async function appendRevisionRpc(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  profileId: string,
  expectedRevision: number,
  birth: BirthDataInput,
  changeNote: string | null,
): Promise<{ revision: number | null; error: DbErr }> {
  assertTenant(tenantId, "appendRevision");
  const { data, error } = await db.rpc("astro_profile_append_revision", {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_profile_id: profileId,
    p_expected_revision: expectedRevision,
    ...birthRpcArgs(birth),
    p_change_note: changeNote,
  });
  const rev = (data as { revision?: unknown } | null)?.revision;
  return { revision: typeof rev === "number" ? rev : null, error };
}

// ─── Sağlayıcı sonuçları (A katmanı) ─────────────────────────────────────────

/** raw_response BİLİNÇLİ OLARAK YOK. */
const RESULT_SAFE_COLUMNS =
  "id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider, provider_api_version, adapter_version, endpoint, input_hash, technical, technical_schema, projection_version, unmapped_fields, created_at";

export type ResultRow = {
  id: string;
  profile_id: string;
  profile_revision: number;
  partner_profile_id?: string | null;
  partner_profile_revision?: number | null;
  technique: string;
  provider: string;
  provider_api_version: string;
  adapter_version: string;
  endpoint: string;
  input_hash: string;
  technical: Record<string, unknown>;
  technical_schema: string;
  projection_version: string;
  unmapped_fields: string[];
  created_at: string;
};

/** Önbellek araması — uzman kapsamlı (aynı tenant'taki başka uzmanın sonucu yeniden KULLANILMAZ). */
export async function findResultsByHashes(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  hashes: string[],
): Promise<{ rows: ResultRow[]; error: DbErr }> {
  assertOwner(tenantId, ownerUserId, "findResultsByHashes");
  const hs = hashes.filter((h) => /^[0-9a-f]{64}$/.test(h));
  if (hs.length === 0) return { rows: [], error: null };
  const { data, error } = await db
    .from("astro_provider_results")
    .select(RESULT_SAFE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", ownerUserId)
    .in("input_hash", hs);
  return { rows: (data as ResultRow[] | null) ?? [], error };
}

export async function getResultById(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  id: string,
): Promise<{ row: ResultRow | null; error: DbErr }> {
  assertOwner(tenantId, ownerUserId, "getResultById");
  if (!isUuid(id)) return { row: null, error: null };
  const { data, error } = await db
    .from("astro_provider_results")
    .select(RESULT_SAFE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", ownerUserId)
    .eq("id", id)
    .maybeSingle();
  return { row: (data as ResultRow | null) ?? null, error };
}

export type NewResult = {
  id: string;
  profileId: string;
  profileRevision: number;
  partnerProfileId?: string | null;
  partnerProfileRevision?: number | null;
  technique: string;
  provider: string;
  providerApiVersion: string;
  adapterVersion: string;
  endpoint: string;
  input: Record<string, unknown>;
  inputHash: string;
  raw: unknown;
  technical: unknown;
  technicalSchema: string;
  projectionVersion: string;
  unmappedFields: string[];
};

export async function insertResult(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  r: NewResult,
): Promise<{ error: DbErr }> {
  assertOwner(tenantId, userId, "insertResult");
  const { error } = await db
    .from("astro_provider_results")
    .insert({
      id: r.id,
      tenant_id: tenantId,
      owner_user_id: userId,
      profile_id: r.profileId,
      profile_revision: r.profileRevision,
      partner_profile_id: r.partnerProfileId ?? null,
      partner_profile_revision: r.partnerProfileRevision ?? null,
      technique: r.technique,
      provider: r.provider,
      provider_api_version: r.providerApiVersion,
      adapter_version: r.adapterVersion,
      endpoint: r.endpoint,
      input: r.input,
      input_hash: r.inputHash,
      raw_response: r.raw,
      technical: r.technical,
      technical_schema: r.technicalSchema,
      projection_version: r.projectionVersion,
      unmapped_fields: r.unmappedFields.slice(0, 200),
      created_by_user_id: userId,
    })
    .select("id")
    .single();
  return { error };
}

// ─── Sağlayıcı yorumu (B katmanı) ────────────────────────────────────────────

export async function insertInterpretation(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  resultId: string,
  provider: string,
  lang: string,
  contentSchema: string | null,
  projectionVersion: string,
  content: unknown,
): Promise<{ error: DbErr }> {
  if (contentSchema === null || content === null || content === undefined) return { error: null };
  assertOwner(tenantId, ownerUserId, "insertInterpretation");
  const { error } = await db
    .from("astro_provider_interpretations")
    .insert({
      tenant_id: tenantId,
      owner_user_id: ownerUserId,
      result_id: resultId,
      provider,
      lang,
      content_schema: contentSchema,
      projection_version: projectionVersion,
      content,
    })
    .select("id")
    .single();
  return { error };
}

export async function getInterpretation(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  resultId: string,
  projectionVersion: string,
): Promise<{ row: { provider: string; lang: string; content_schema: string; content: Record<string, unknown> } | null; error: DbErr }> {
  assertOwner(tenantId, ownerUserId, "getInterpretation");
  if (!isUuid(resultId)) return { row: null, error: null };
  const { data, error } = await db
    .from("astro_provider_interpretations")
    .select("provider, lang, content_schema, content")
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", ownerUserId)
    .eq("result_id", resultId)
    .eq("projection_version", projectionVersion)
    .maybeSingle();
  return { row: (data as { provider: string; lang: string; content_schema: string; content: Record<string, unknown> } | null) ?? null, error };
}

// ─── Eşlenmemiş sağlayıcı alanları (yalnız YOL; değer ASLA) ──────────────────

const PATH_SAFE = /[^A-Za-z0-9_.[\]:]/g;

/** Alan yolunu DB kısıtıyla uyumlu güvenli biçime getirir (değer içeremez; yalnız yol karakterleri). */
export function sanitizeFieldPath(p: string): string {
  return p.replace(PATH_SAFE, "_").slice(0, 200);
}

export async function touchUnmappedFields(db: SupabaseClient, provider: string, endpoint: string, paths: string[]): Promise<void> {
  const clean = [...new Set(paths.map(sanitizeFieldPath).filter((p) => p.length > 0))].slice(0, 200);
  if (clean.length === 0) return;
  try {
    const { error } = await db.rpc("astro_unmapped_touch", { p_provider: provider, p_endpoint: endpoint, p_paths: clean });
    if (error && !isSchemaMissing(error)) logAstroDbError("unmapped.touch", error);
  } catch {
    /* denetim kaydı best-effort; hesap akışını bozmaz */
  }
}

export const UNMAPPED_CLASSES = ["unclassified", "technical", "interpretation", "ignored", "unverified"] as const;
export type UnmappedClass = (typeof UNMAPPED_CLASSES)[number];

export type UnmappedRow = {
  id: string;
  provider: string;
  endpoint: string;
  field_path: string;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
  classification: UnmappedClass;
  classified_at: string | null;
};

export async function listUnmappedFields(db: SupabaseClient): Promise<{ rows: UnmappedRow[]; error: DbErr }> {
  const { data, error } = await db
    .from("astro_unmapped_fields")
    .select("id, provider, endpoint, field_path, first_seen_at, last_seen_at, seen_count, classification, classified_at")
    .order("last_seen_at", { ascending: false })
    .limit(500);
  return { rows: (data as UnmappedRow[] | null) ?? [], error };
}

export async function classifyUnmappedField(db: SupabaseClient, id: string, classification: UnmappedClass): Promise<{ found: boolean; error: DbErr }> {
  if (!isUuid(id)) return { found: false, error: null };
  const { data, error } = await db
    .from("astro_unmapped_fields")
    .update({ classification, classified_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  return { found: ((data as { id: string }[] | null) ?? []).length === 1, error };
}
