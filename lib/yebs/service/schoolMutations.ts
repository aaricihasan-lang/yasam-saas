import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A1W (yebs_schools) MUTATION servis katmanı.
 *
 * Sorumluluk sınırı:
 *   - Yalnız yazma: createSchool. Salt-okunur A1R servisi
 *     (lib/yebs/service/schools.ts) DEĞİŞTİRİLMEZ; bu dosya ondan ayrıdır.
 *   - Canonical create YALNIZ production SECURITY DEFINER RPC
 *     public.yebs_create_school_with_audit üzerinden yapılır. Bu katman
 *     yebs_schools'a DOĞRUDAN insert/update/delete/upsert YAPMAZ (write-gate:
 *     service_role tabloda yalnız SELECT'e sahiptir).
 *   - Actor kimliği (actorAdminId) kullanıcı input'undan YAPISAL olarak ayrıdır;
 *     yalnız güvenilir kaynaktan (route'un verifyAdminRequest → guard.adminId)
 *     gelir. request_id / operation_id server-side üretilir (istemci veremez).
 *   - Kullanıcı değerleri (tradition_id/slug/name/native/reason) trim/lowercase/
 *     truncate/coerce EDİLMEZ; RPC'ye orijinal biçimiyle iletilir. Canonical
 *     validation'ın nihai kaynağı DB/RPC'dir.
 *   - Ham DB hata metni (message/details/hint/constraint) route'a/istemciye
 *     TAŞINMAZ; server-side loglanır ve yalnız stabil bir makine kodu döner.
 *
 * Güvenlik: `import "server-only"` — istemci paketine sızma build-time engellenir.
 */

/**
 * RPC dönüşü public.yebs_schools canonical satırı (D2 20260726220031 kolonları).
 * Read servisini (schools.ts) DEĞİŞTİRMEMEK adına burada exact lokal tip/guard
 * tanımlanır (bilinçli, izole).
 */
export type YebsSchoolRow = {
  id: string;
  tradition_id: string;
  slug: string;
  name_tr: string;
  native_name: string | null;
  native_language_tag: string | null;
  native_script_code: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

/** POST body'den route tarafından doğrulanmış, kullanıcı-editable create alanları. */
export type CreateSchoolInput = {
  traditionId: string;
  slug: string;
  nameTr: string;
  nativeName: string | null;
  nativeLanguageTag: string | null;
  nativeScriptCode: string | null;
  reason: string | null;
};

/**
 * Stabil hata kodları. İlk dokuz kod RPC'nin kontrollü SQLSTATE P0001 mesajlarıyla
 * EXACT eşitlikle sınıflandırılır; tanınmayan her şey CREATE_FAILED'e düşer.
 */
export type CreateSchoolErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_TRADITION_ID_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_SCHOOL_INPUT"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_PARENT_TRADITION_NOT_FOUND"
  | "YEBS_SCHOOL_DUPLICATE"
  | "YEBS_SCHOOL_CREATE_FAILED";

export type CreateSchoolResult =
  | { ok: true; row: YebsSchoolRow }
  | { ok: false; code: CreateSchoolErrorCode };

/**
 * RPC'nin kontrollü hata mesajları — EXACT allowlist (Set). Sınıflandırma yalnız
 * tam eşitlikle (Set.has) yapılır; includes/startsWith/endsWith/regex KULLANILMAZ.
 */
const RPC_ERROR_CODES: ReadonlySet<CreateSchoolErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_TRADITION_ID_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_SCHOOL_INPUT",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_PARENT_TRADITION_NOT_FOUND",
  "YEBS_SCHOOL_DUPLICATE",
]);

/**
 * RPC hatasını EXACT eşitlikle (Set.has) stabil koda sınıflandırır.
 * Ham mesaj yalnız sınıflandırma için okunur; DÖNDÜRÜLMEZ. Tanınmayan (P0001
 * dahil) her şey generic CREATE_FAILED'e düşer.
 */
function classifyRpcError(error: { message?: unknown }): CreateSchoolErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && RPC_ERROR_CODES.has(msg as CreateSchoolErrorCode)) {
    return msg as CreateSchoolErrorCode;
  }
  return "YEBS_SCHOOL_CREATE_FAILED";
}

/** Canonical satırın en az beklenen alanları + geçerli string `id` taşıdığını doğrular. */
function isCanonicalSchoolRow(value: unknown): value is YebsSchoolRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.tradition_id === "string" &&
    typeof r.slug === "string" &&
    typeof r.name_tr === "string" &&
    typeof r.status === "string" &&
    typeof r.created_at === "string" &&
    typeof r.updated_at === "string"
  );
}

/**
 * Yeni ekol kaydını audit'li ve atomik olarak oluşturur.
 *
 * @param db           service_role client (route'un guard.db'si)
 * @param actorAdminId doğrulanmış admin ID (route'un guard.adminId'si) — güvenilir,
 *                     kullanıcı input'undan yapısal olarak ayrı
 * @param input        route tarafından doğrulanmış kullanıcı-editable alanlar
 */
export async function createSchool(
  db: SupabaseClient,
  actorAdminId: string,
  input: CreateSchoolInput,
): Promise<CreateSchoolResult> {
  // request_id / operation_id server-side, iki AYRI UUID (istemci veremez).
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_create_school_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_tradition_id: input.traditionId,
    p_slug: input.slug,
    p_name_tr: input.nameTr,
    p_native_name: input.nativeName,
    p_native_language_tag: input.nativeLanguageTag,
    p_native_script_code: input.nativeScriptCode,
    p_reason: input.reason,
  });

  if (error) {
    // Ham message/details/hint/constraint yalnız server log'a; istemciye gitmez.
    console.error("[yebs] createSchool RPC failed:", error.message);
    return { ok: false, code: classifyRpcError(error) };
  }

  // Canonical dönüş: tek object; array gelirse yalnız EXACT tek elemanlı kabul.
  let row: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      console.error("[yebs] createSchool beklenmeyen dönüş kardinalitesi:", data.length);
      return { ok: false, code: "YEBS_SCHOOL_CREATE_FAILED" };
    }
    row = data[0];
  }

  if (!isCanonicalSchoolRow(row)) {
    console.error("[yebs] createSchool beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_SCHOOL_CREATE_FAILED" };
  }

  return { ok: true, row };
}

/* ============================================================
 * API-A1U — audit'li School UPDATE (partial JSONB patch)
 *
 * createSchool davranışı DEĞİŞTİRİLMEZ; aşağıdakiler additiftir.
 * Canonical update yalnız SECURITY DEFINER RPC
 * public.yebs_update_school_with_audit üzerinden yapılır (doğrudan tablo
 * mutasyonu YOK). Actor ayrı güvenilir parametredir; request/operation ID
 * server-side üretilir. Değerler coerce EDİLMEZ. tradition_id ve status
 * güncellenemez (patch whitelist dışı; reparent/transition kapsam dışı).
 * ============================================================ */

/**
 * Route tarafından doğrulanmış partial patch: yalnız PRESENT canonical anahtarlar
 * taşınır. Required alanlar (slug/name_tr) present ise string; nullable native
 * alanlar present ise string veya null. Omitted anahtar hiç bulunmaz (mevcut değer
 * korunur). Coercion route'ta da YAPILMAZ.
 */
export type UpdateSchoolPatch = {
  slug?: string;
  name_tr?: string;
  native_name?: string | null;
  native_language_tag?: string | null;
  native_script_code?: string | null;
};

/** Update için stabil hata kodları (create'ten AYRI union). */
export type UpdateSchoolErrorCode =
  | "YEBS_REQUEST_ID_REQUIRED"
  | "YEBS_OPERATION_ID_REQUIRED"
  | "YEBS_SCHOOL_ID_REQUIRED"
  | "YEBS_EXPECTED_UPDATED_AT_REQUIRED"
  | "YEBS_REASON_INVALID"
  | "YEBS_INVALID_PATCH"
  | "YEBS_ADMIN_NOT_FOUND"
  | "YEBS_ADMIN_NOT_ACTIVE"
  | "YEBS_SCHOOL_NOT_FOUND"
  | "YEBS_SCHOOL_STATUS_LOCKED"
  | "YEBS_SCHOOL_STALE_UPDATE"
  | "YEBS_SCHOOL_NO_CHANGES"
  | "YEBS_SCHOOL_DUPLICATE"
  | "YEBS_INVALID_SCHOOL_INPUT"
  | "YEBS_SCHOOL_UPDATE_FAILED";

export type UpdateSchoolResult =
  | { ok: true; row: YebsSchoolRow }
  | { ok: false; code: UpdateSchoolErrorCode };

/**
 * Update RPC'nin kontrollü mesajları — EXACT allowlist (Set). Sınıflandırma yalnız
 * tam eşitlikle (Set.has); includes/startsWith/endsWith/regex KULLANILMAZ.
 */
const UPDATE_RPC_ERROR_CODES: ReadonlySet<UpdateSchoolErrorCode> = new Set([
  "YEBS_REQUEST_ID_REQUIRED",
  "YEBS_OPERATION_ID_REQUIRED",
  "YEBS_SCHOOL_ID_REQUIRED",
  "YEBS_EXPECTED_UPDATED_AT_REQUIRED",
  "YEBS_REASON_INVALID",
  "YEBS_INVALID_PATCH",
  "YEBS_ADMIN_NOT_FOUND",
  "YEBS_ADMIN_NOT_ACTIVE",
  "YEBS_SCHOOL_NOT_FOUND",
  "YEBS_SCHOOL_STATUS_LOCKED",
  "YEBS_SCHOOL_STALE_UPDATE",
  "YEBS_SCHOOL_NO_CHANGES",
  "YEBS_SCHOOL_DUPLICATE",
  "YEBS_INVALID_SCHOOL_INPUT",
]);

function classifyUpdateRpcError(error: { message?: unknown }): UpdateSchoolErrorCode {
  const msg = error?.message;
  if (typeof msg === "string" && UPDATE_RPC_ERROR_CODES.has(msg as UpdateSchoolErrorCode)) {
    return msg as UpdateSchoolErrorCode;
  }
  return "YEBS_SCHOOL_UPDATE_FAILED";
}

/**
 * Mevcut ekol kaydını audit'li ve atomik olarak günceller.
 *
 * @param db                service_role client (route'un guard.db'si)
 * @param actorAdminId      doğrulanmış admin ID (guard.adminId) — güvenilir, ayrı
 * @param schoolId          hedef canonical satır id'si (route'ta UUID doğrulanmış)
 * @param expectedUpdatedAt optimistic concurrency token'ı (GET'ten alınan orijinal
 *                          ISO string; değiştirilmeden iletilir)
 * @param patch             yalnız present canonical anahtarları taşıyan partial patch
 * @param reason            zorunlu audit gerekçesi (orijinal string)
 */
export async function updateSchool(
  db: SupabaseClient,
  actorAdminId: string,
  schoolId: string,
  expectedUpdatedAt: string,
  patch: UpdateSchoolPatch,
  reason: string,
): Promise<UpdateSchoolResult> {
  // request_id / operation_id server-side, iki AYRI UUID (istemci veremez).
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const { data, error } = await db.rpc("yebs_update_school_with_audit", {
    p_actor_admin_id: actorAdminId,
    p_request_id: requestId,
    p_operation_id: operationId,
    p_school_id: schoolId,
    p_expected_updated_at: expectedUpdatedAt,
    p_patch: patch,
    p_reason: reason,
  });

  if (error) {
    // Ham message/details/hint/constraint yalnız server log'a; istemciye gitmez.
    console.error("[yebs] updateSchool RPC failed:", error.message);
    return { ok: false, code: classifyUpdateRpcError(error) };
  }

  // Canonical dönüş: tek object; array gelirse yalnız EXACT tek elemanlı kabul.
  let row: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      console.error("[yebs] updateSchool beklenmeyen dönüş kardinalitesi:", data.length);
      return { ok: false, code: "YEBS_SCHOOL_UPDATE_FAILED" };
    }
    row = data[0];
  }

  if (!isCanonicalSchoolRow(row)) {
    console.error("[yebs] updateSchool beklenmeyen dönüş biçimi");
    return { ok: false, code: "YEBS_SCHOOL_UPDATE_FAILED" };
  }

  return { ok: true, row };
}
