import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTraditionalCuppingDatesForYear, SELECTION_SOURCE_SUNNAH } from "./traditionalDays";

/**
 * KUPA & HACAMAT — server CRUD yardımcıları.
 *
 * Güvenlik sözleşmesi:
 *   - Ham DB hatası ASLA client'a dönmez → sabit güvenli mesaj (bilgi sızıntısı yok).
 *     (Mevcut bazı modül route'ları ham DB hata metnini sızdırıyor; Kupa bunu YAPMAZ.)
 *   - tenant_id her zaman server tarafından yazılır; body'den gelen tenant_id/id
 *     yok sayılır (pickWritable allowlist dışında bırakır).
 *   - Tüm okuma/güncelleme/silme tenant_id ile bağlıdır (cross-tenant IDOR engeli).
 */

const DB_FAIL = "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
const NOT_FOUND = "Kayıt bu hesaba ait değil veya bulunamadı.";

export function cuppingError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Yalnız allowlist alanlarını al (tenant_id/id/provenance vb. ASLA). */
export function pickWritable(
  body: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; response: NextResponse };

export async function parseJsonBody(req: Request): Promise<Ok<Record<string, unknown>> | Fail> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      return { ok: false, response: cuppingError(400, "Geçersiz istek gövdesi.") };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, response: cuppingError(400, "Geçersiz istek gövdesi.") };
  }
}

export type ListOptions = {
  orderBy?: string;
  ascending?: boolean;
  eqFilters?: Record<string, string>;
};

export async function listEntity(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  opts?: ListOptions,
): Promise<Ok<Record<string, unknown>[]> | Fail> {
  let q = db.from(table).select("*").eq("tenant_id", tenantId);
  if (opts?.eqFilters) {
    for (const [k, v] of Object.entries(opts.eqFilters)) q = q.eq(k, v);
  }
  if (opts?.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending ?? true });
  const { data, error } = await q;
  if (error) return { ok: false, response: cuppingError(500, DB_FAIL) };
  return { ok: true, data: (data ?? []) as Record<string, unknown>[] };
}

export async function getEntity(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  id: string,
): Promise<Ok<Record<string, unknown>> | Fail> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return { ok: false, response: cuppingError(500, DB_FAIL) };
  if (!data) return { ok: false, response: cuppingError(404, NOT_FOUND) };
  return { ok: true, data: data as Record<string, unknown> };
}

export async function insertEntity(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  fields: Record<string, unknown>,
): Promise<Ok<Record<string, unknown>> | Fail> {
  const { data, error } = await db
    .from(table)
    .insert({ ...fields, tenant_id: tenantId })
    .select()
    .single();
  if (error) return { ok: false, response: cuppingError(500, DB_FAIL) };
  return { ok: true, data: data as Record<string, unknown> };
}

export async function updateEntity(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<Ok<Record<string, unknown>> | Fail> {
  const { data, error } = await db
    .from(table)
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) return { ok: false, response: cuppingError(500, DB_FAIL) };
  if (!data) return { ok: false, response: cuppingError(404, NOT_FOUND) };
  return { ok: true, data: data as Record<string, unknown> };
}

export async function deleteEntity(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  id: string,
): Promise<Ok<number> | Fail> {
  const { data, error } = await db
    .from(table)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return { ok: false, response: cuppingError(500, DB_FAIL) };
  return { ok: true, data: data?.length ?? 0 };
}

/**
 * Bir FK referansının aynı tenant'a ait GERÇEK bir kayda işaret ettiğini doğrular
 * (cross-tenant FK enjeksiyonunu engeller — ör. başka tenant'ın point_id'sine placement).
 */
export async function assertOwnedRef(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  id: unknown,
): Promise<boolean> {
  if (typeof id !== "string" || !id) return false;
  const { data, error } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

/**
 * FAZ 5 / AŞAMA 3 — Bir plan yılının otomatik geleneksel günlerini (Sünnet/Altın) plana
 * `sunnah_auto` kökeniyle ekler. Kural lib/cupping/traditionalDays.ts'ten TÜRETİLİR
 * (17/19/21 + izinli haftagünü; 17+Salı=Altın). Kozmik'e DOKUNMAZ.
 *
 * IDEMPOTENT + MANUEL-KORUR: UNIQUE(tenant,plan,date) çakışmaları YOKSAYILIR
 *   (ignoreDuplicates) → hâlihazırda VAR olan gün (manuel VEYA otomatik) DEĞİŞTİRİLMEZ;
 *   yalnız EKSİK aday günler eklenir. Formüle uyan MANUEL bir gün manuel KALIR (asla
 *   sunnah_auto'ya çevrilmez — manuel kazanır). Kozmik/Word/appointment yan-etkisi YOK.
 */
export async function seedSunnahAutoDays(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  planId: string,
  year: number,
): Promise<Ok<{ inserted: number; skippedExisting: number }> | Fail> {
  const dates = getTraditionalCuppingDatesForYear(year);
  if (dates.length === 0) return { ok: true, data: { inserted: 0, skippedExisting: 0 } };
  const rows = dates.map((d) => ({
    tenant_id: tenantId,
    plan_id: planId,
    gregorian_date: d.gregorian_date,
    selection_source: SELECTION_SOURCE_SUNNAH,
  }));
  const { data, error } = await db
    .from(table)
    .upsert(rows, { onConflict: "tenant_id,plan_id,gregorian_date", ignoreDuplicates: true })
    .select("id");
  if (error) return { ok: false, response: cuppingError(500, DB_FAIL) };
  const inserted = data?.length ?? 0;
  return { ok: true, data: { inserted, skippedExisting: rows.length - inserted } };
}

/**
 * Bir kompozit üyeliğin (ör. bir point'in AYNI protokolün cupping_protocol_points
 * setinde olması) GERÇEK olduğunu doğrular — V2 step referential integrity için.
 * Herhangi bir filtre değeri boş/geçersizse false (cast paniği yok).
 */
export async function assertCompositeRef(
  db: SupabaseClient,
  table: string,
  filters: Record<string, unknown>,
): Promise<boolean> {
  let q = db.from(table).select("id");
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v !== "string" || !v) return false;
    q = q.eq(k, v);
  }
  const { data, error } = await q.maybeSingle();
  return !error && !!data;
}
