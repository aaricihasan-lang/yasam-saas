import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSourceValues, EMPTY_SOURCE_VALUES, type RawSourceInput } from "./sources";
import { ANAMNEZ_BUCKET, anamnesisPrefix, clientAnamnesisPrefix, isUnderClientPrefix } from "./storage";
import { isUuid } from "./validate";
import type { SourceMeta, SourceValues } from "./types";

/**
 * Anamnez route'larının ORTAK sunucu yardımcıları (service_role `guard.db` ile çağrılır).
 *
 * Kimlik/tenant ÇÖZÜMÜ route'larda `requireModuleAccess(req, "clients")` ile yapılır (envanter
 * harness'i her route dosyasında doğrudan çağrı arar). Buradaki her sorgu tenant_id + client_id
 * (+ anamnez id) ile filtrelenir; eşleşme yoksa null → route 404 döner (varlık sızdırılmaz).
 * Cevap içerikleri / PII LOGLANMAZ.
 */

export const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export type AnamnezErrorCode =
  | "NOT_FOUND"
  | "INVALID"
  | "DEMO_READ_ONLY"
  | "NOT_READY"
  | "LOCKED"
  | "CONFLICT"
  | "DRAFT_EXISTS"
  | "PREVIOUS_REQUIRED"
  | "CONFIRM_REQUIRED"
  | "LIMIT_REACHED"
  | "INVALID_TYPE"
  | "TOO_LARGE"
  | "EMPTY"
  | "UPLOAD_MISSING"
  | "STORAGE_FAILED"
  | "RATE_LIMITED";

export function anamnezJson(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function anamnezError(code: AnamnezErrorCode, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return anamnezJson({ ok: false, code, ...extra }, status);
}

export const notFound = () => anamnezError("NOT_FOUND", 404);
export const notReady = () => anamnezError("NOT_READY", 503);
export const demoReadOnly = () => anamnezError("DEMO_READ_ONLY", 403);

type DbError = { code?: string; message?: string } | null | undefined;

/** Migration henüz uygulanmadıysa (tablo yok) → 503 NOT_READY. */
export function isMissingRelation(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /client_anamne/.test(msg) && /does not exist|schema cache/i.test(msg);
}

/** Bucket henüz oluşturulmadıysa. */
export function isMissingBucket(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? "");
  const status = (error as { statusCode?: string | number; status?: number })?.statusCode ?? (error as { status?: number })?.status;
  return /bucket not found/i.test(msg) || String(status) === "404" && /bucket/i.test(msg);
}

export const ANAMNEZ_LIST_COLUMNS =
  "id, kind, title, assessment_date, status, template_version, revision, created_at, updated_at, completed_at, source_links";

export const ANAMNEZ_FULL_COLUMNS =
  "id, client_id, kind, title, assessment_date, status, template_key, template_version, form_custom, answers, source_links, client_snapshot, based_on_anamnesis_id, revision, created_at, updated_at, completed_at";

export const ATTACHMENT_COLUMNS = "id, original_name, size_bytes, created_at";

export const HISTORY_LIMIT = 50;

export type ClientRow = { id: string; ad: string | null; soyad: string | null; dogum: string | null; kan: string | null };

/** Danışan bu tenant'a ait mi? (IDOR kapısı) — yabancı/yok → null. */
export async function loadClientInTenant(db: SupabaseClient, tenantId: string, clientId: string): Promise<ClientRow | null> {
  if (!isUuid(clientId)) return null;
  const { data, error } = await db
    .from("clients")
    .select("id, ad, soyad, dogum, kan")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ClientRow;
}

/** Anamnez satırı yalnız tenant + danışan + id üçlüsüyle okunur. */
export async function loadAnamnesis<T = Record<string, unknown>>(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  anamnesisId: string,
  columns: string,
): Promise<{ row: T | null; error: DbError }> {
  if (!isUuid(anamnesisId)) return { row: null, error: null };
  const { data, error } = await db
    .from("client_anamneses")
    .select(columns)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("id", anamnesisId)
    .maybeSingle();
  return { row: (data as T | null) ?? null, error };
}

/**
 * Eşlenmiş kaynakların güncel değerleri — YALNIZ eşlenmiş kolonlar okunur (telefon/adres/
 * notlar/legacy clients.saglik/email OKUNMAZ). Beslenme tabloları okunamazsa kaynak yok sayılır.
 */
export async function fetchSourceValues(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  kan: string | null,
): Promise<{ values: SourceValues; meta: SourceMeta }> {
  const [profileRes, measRes, allergenRes] = await Promise.all([
    db
      .from("nutrition_client_profiles")
      .select("activity_level, dietary_pattern, daily_meal_count, water_note, lifestyle_note, updated_at")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .maybeSingle(),
    db
      .from("nutrition_client_measurements")
      .select("height_cm, weight_kg, measured_at")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .order("measured_at", { ascending: false })
      .limit(20),
    db
      .from("nutrition_client_allergens")
      .select("allergen_id, custom_label, note")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .limit(100),
  ]);

  const profile = profileRes.error ? null : ((profileRes.data as RawSourceInput["profile"] & { updated_at?: string }) ?? null);
  const measurements = measRes.error ? [] : ((measRes.data ?? []) as RawSourceInput["measurements"]);
  const allergenRows = allergenRes.error
    ? []
    : ((allergenRes.data ?? []) as Array<{ allergen_id: string | null; custom_label: string | null; note: string | null }>);

  const ids = Array.from(new Set(allergenRows.map((a) => a.allergen_id).filter((x): x is string => !!x)));
  const catalog = new Map<string, { code: string; name_tr: string; name_en: string }>();
  if (ids.length) {
    const { data, error } = await db.from("nutrition_allergens").select("id, code, name_tr, name_en").in("id", ids);
    if (!error) for (const r of (data ?? []) as Array<{ id: string; code: string; name_tr: string; name_en: string }>) catalog.set(r.id, r);
  }
  const allergens: RawSourceInput["allergens"] = allergenRows.map((a) => {
    const c = a.allergen_id ? catalog.get(a.allergen_id) : undefined;
    return {
      code: c?.code ?? null,
      custom_label: a.custom_label,
      name_tr: c?.name_tr ?? null,
      name_en: c?.name_en ?? null,
      note: a.note,
    };
  }).filter((a) => a.code || a.custom_label);

  const values = buildSourceValues({ kan, profile, measurements, allergens });
  const heightAt = measurements.find((m) => values["nutrition.height_cm"] !== null && m.height_cm != null)?.measured_at;
  const weightAt = measurements.find((m) => values["nutrition.weight_kg"] !== null && m.weight_kg != null)?.measured_at;
  return {
    values,
    meta: {
      nutritionProfileUpdatedAt: typeof profile?.updated_at === "string" ? profile.updated_at : null,
      heightMeasuredAt: typeof heightAt === "string" ? heightAt : null,
      weightMeasuredAt: typeof weightAt === "string" ? weightAt : null,
    },
  };
}

export { EMPTY_SOURCE_VALUES };

/** client_notes.saglik_notu — YALNIZ salt-okunur referans (ayrıştırılmaz). */
export async function fetchHealthNoteReference(db: SupabaseClient, tenantId: string, clientId: string): Promise<string | null> {
  const { data, error } = await db
    .from("client_notes")
    .select("saglik_notu")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const v = (data as { saglik_notu?: unknown }).saglik_notu;
  return typeof v === "string" && v.trim() ? v : null;
}

/** KVKK özel nitelikli veri açık rızası (mevcut client_consents). Tablo yoksa null (bilinmiyor). */
export async function fetchExplicitConsent(db: SupabaseClient, tenantId: string, clientId: string): Promise<boolean | null> {
  const { data, error } = await db
    .from("client_consents")
    .select("status, recorded_at")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("consent_type", "acik_riza_ozel_nitelikli")
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const latest = ((data ?? []) as Array<{ status: string }>)[0];
  return latest?.status === "granted";
}

// ─── Storage yardımcıları ────────────────────────────────────────────────────

/**
 * Bir anamnezin (veya tüm danışan anamnezlerinin) Storage nesne yolları. DB satırları +
 * önek listelemesi birleştirilir (finalize edilmemiş yetim yüklemeler de yakalanır).
 * Tüm yollar SUNUCUDA tenant/danışan önekinden türetilir → yabancı tenant yoluna dokunulamaz.
 */
export async function collectAnamnesisObjectPaths(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  anamnesisId?: string,
): Promise<{ ok: true; paths: string[] } | { ok: false }> {
  const paths = new Set<string>();

  let q = db.from("client_anamnesis_attachments").select("storage_path").eq("tenant_id", tenantId).eq("client_id", clientId);
  if (anamnesisId) q = q.eq("anamnesis_id", anamnesisId);
  const { data, error } = await q.limit(1000);
  if (error && !isMissingRelation(error)) return { ok: false };
  for (const r of (data ?? []) as Array<{ storage_path: string }>) {
    if (isUnderClientPrefix(r.storage_path, tenantId, clientId)) paths.add(r.storage_path);
  }

  const bucket = db.storage.from(ANAMNEZ_BUCKET);
  const folders: string[] = [];
  if (anamnesisId) {
    folders.push(anamnesisPrefix(tenantId, clientId, anamnesisId).replace(/\/$/, ""));
  } else {
    const base = clientAnamnesisPrefix(tenantId, clientId).replace(/\/$/, "");
    const { data: top, error: topErr } = await bucket.list(base, { limit: 1000 });
    if (topErr) {
      if (isMissingBucket(topErr)) return { ok: true, paths: Array.from(paths) };
      return { ok: false };
    }
    for (const e of top ?? []) if (e.name && isUuid(e.name)) folders.push(`${base}/${e.name}`);
  }
  for (const folder of folders) {
    const { data: objs, error: listErr } = await bucket.list(folder, { limit: 1000 });
    if (listErr) {
      if (isMissingBucket(listErr)) continue;
      return { ok: false };
    }
    for (const o of objs ?? []) {
      const p = `${folder}/${o.name}`;
      if (o.name && isUnderClientPrefix(p, tenantId, clientId)) paths.add(p);
    }
  }
  return { ok: true, paths: Array.from(paths) };
}

/** Nesneleri sil; hata → false (çağıran DB silmesini YAPMAZ → sessiz yetim dosya oluşmaz). */
export async function removeObjects(db: SupabaseClient, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(ANAMNEZ_BUCKET).remove(paths.slice(i, i + 100));
    if (error && !isMissingBucket(error)) return false;
  }
  return true;
}

/** Minimal yapılandırılmış olay logu — yalnız kimlikler/sayılar; sağlık içeriği/PII YOK. */
export function logAnamnezEvent(event: string, fields: Record<string, string | number | boolean | null>): void {
  console.info(JSON.stringify({ evt: `anamnez.${event}`, ts: new Date().toISOString(), ...fields }));
}
