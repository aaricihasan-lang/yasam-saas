/**
 * Faz G — Admin yönetim işlem geçmişi (audit) yazma katmanı.
 *
 * Bu dosya YALNIZCA ALTYAPIDIR. Mevcut route'lara audit çağrısı bu fazda
 * EKLENMEZ; B/C/D/E/F/I fazlarında `writeAdminAudit` çağrılacaktır.
 *
 * Güvenlik ilkeleri (BAĞLAYICI):
 *   - FAIL-CLOSED / REDDET (redakte ETME): payload içinde yasaklı bir anahtar
 *     (parola/hash/token/cookie/authorization/service_role veya danışan PII /
 *     özel çalışma içeriği) bulunursa payload TAMAMEN REDDEDİLİR — DB'ye hiçbir
 *     insert gönderilmez ve kontrollü bir AdminAuditError fırlatılır. Redaksiyon
 *     yoktur (yanlışlıkla hassas veriyle çağrı = programlama hatası; sessizce
 *     temizleyip kaydetmek yerine hata verilir).
 *   - Hassas DEĞER asla hata mesajına / loga yazılmaz; yalnız normalize edilmiş
 *     anahtar ADI veya genel hata kodu gösterilir. Ham payload hiçbir yere loglanmaz.
 *   - Kontrol tüm jsonb alanlarında (old_value/new_value/result/context) ve
 *     üst düzey + iç içe nesne + dizi içindeki nesnelerde çalışır.
 *   - `writeAdminAudit` varsayılan olarak FAIL-CLOSED: doğrulama hatası, DB insert
 *     hatası veya doğrulanamayan insert sonucunda THROW eder. Sessiz catch veya
 *     `{ok:false}` ile devam YOKTUR. Best-effort modu bu fazda YOKTUR.
 *   - Yalnız server-side (service_role db) kullanılır.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Sabit işlem sözleşmesi ──────────────────────────────────────────────────
// ⚠️ Bu liste, 20260903000000_admin_audit_log.sql içindeki CHECK ile BİREBİR
//    aynı olmalıdır (harness doğrular).
export const ADMIN_AUDIT_ACTIONS = [
  "user_created",
  "user_activated",
  "user_deactivated",
  "user_approved",
  "user_rejected",
  "password_changed_by_admin",
  "all_sessions_terminated",
  "single_session_terminated",
  "desktop_limit_changed",
  "mobile_limit_changed",
  "tablet_limit_changed",
  "total_session_limit_changed",
  "module_enabled",
  "module_disabled",
  "payment_status_changed",
  "role_changed",
  "workspace_viewed",
  "user_deleted",
  "user_archived",
  "main_admin_critical_action",
  // FAZ 1 / P4 — admin kütüphane hediyesi (bağımsız snapshot aktarımı).
  // ⚠️ 20260925000000_admin_library_transfer_provenance.sql CHECK süperseti ile
  //    BİREBİR aynı olmalı (harness doğrular).
  "library_transfer_completed",
  "library_transfer_failed",
  "library_transfer_retried",
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

const ACTION_SET: ReadonlySet<string> = new Set(ADMIN_AUDIT_ACTIONS);

export function isAdminAuditAction(value: unknown): value is AdminAuditAction {
  return typeof value === "string" && ACTION_SET.has(value);
}

// ─── Kontrollü hata ──────────────────────────────────────────────────────────
export type AdminAuditErrorCode =
  | "invalid_action"
  | "invalid_actor"
  | "invalid_target"
  | "forbidden_field"
  | "payload_too_large"
  | "payload_too_deep"
  | "payload_unserializable"
  | "db_error"
  | "insert_unverified";

/**
 * Audit yazımı için kontrollü hata. Mesaj yalnız güvenli bilgi taşır
 * (normalize anahtar adı / genel kod); hassas DEĞER ASLA taşımaz.
 */
export class AdminAuditError extends Error {
  readonly code: AdminAuditErrorCode;
  readonly field?: string;
  readonly keyLabel?: string;
  constructor(
    code: AdminAuditErrorCode,
    message: string,
    opts?: { field?: string; keyLabel?: string },
  ) {
    super(message);
    this.name = "AdminAuditError";
    this.code = code;
    this.field = opts?.field;
    this.keyLabel = opts?.keyLabel;
  }
}

// ─── Yasaklı anahtar desenleri ───────────────────────────────────────────────
// Anahtar ADI bu desenlerden birine uyarsa payload REDDEDİLİR (redaksiyon YOK).
const SECRET_KEY_RE =
  /(pass(word|wd|_?hash)?|pwd|\bhash\b|token|secret|cookie|authorization|bearer|service_?role|api_?key|private_?key|refresh|access_?token|session_?token|credential|auth_?header)/i;

// Baş sınırı (^|_) ile kelime içinde yanlış eşleşme önlenir; ekli biçimler
// ("analiz_note", "saglik_notu", "client_email") yakalanır.
const PII_KEY_RE =
  /(^|_)(e_?mail|e_?posta|phone|telefon|gsm|mobil_?no|address|adres|tc_?kimlik|kimlik_?no|saglik|health|analiz_?not|analysis_?note|note_?content|homework_?content|odev_?icerik|full_?name|ad_?soyad|first_?name|last_?name|soyad|isim)/i;

export function isForbiddenAuditKey(key: string): boolean {
  return SECRET_KEY_RE.test(key) || PII_KEY_RE.test(key);
}

/** Anahtar adını hata mesajı için güvenli hale getirir (yalnız ad; DEĞER yok). */
function normalizeKeyLabel(key: string): string {
  return String(key).toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
}

// ─── Sınırlar ────────────────────────────────────────────────────────────────
const MAX_DEPTH = 10;
const MAX_SERIALIZED_BYTES = 8 * 1024; // 8 KB

/**
 * Yasaklı anahtar / aşırı derinlik taraması — bulursa THROW.
 * Değeri serileştirmez (hassas veri geçici bir string'e bile kopyalanmaz).
 */
function scanForbidden(value: unknown, field: string, depth: number): void {
  if (value === null || typeof value !== "object") return;
  if (depth > MAX_DEPTH) {
    throw new AdminAuditError("payload_too_deep", `audit ${field} çok derin (>${MAX_DEPTH})`, { field });
  }
  if (value instanceof Date) return;
  if (Array.isArray(value)) {
    for (const item of value) scanForbidden(item, field, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenAuditKey(k)) {
      const keyLabel = normalizeKeyLabel(k);
      throw new AdminAuditError(
        "forbidden_field",
        `audit ${field} yasaklı alan içeriyor: ${keyLabel}`,
        { field, keyLabel },
      );
    }
    scanForbidden(v, field, depth + 1);
  }
}

/**
 * Bir jsonb alanını doğrular. Sorun varsa THROW (fail-closed):
 *   - yasaklı anahtar → forbidden_field
 *   - aşırı derinlik → payload_too_deep
 *   - serileştirilemez → payload_unserializable
 *   - boyut aşımı → payload_too_large
 * Sorun yoksa DEPOLANACAK değeri döner (null/undefined → null).
 */
export function assertAuditFieldSafe(value: unknown, field: string): unknown {
  if (value === undefined || value === null) return null;

  // 1) Önce yasaklı-anahtar/derinlik taraması — hassas payload serileştirilmez.
  scanForbidden(value, field, 0);

  // 2) Serileştirilebilirlik + boyut (hata mesajı yalnız uzunluk taşır, değer değil).
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new AdminAuditError("payload_unserializable", `audit ${field} serileştirilemedi`, { field });
  }
  if (serialized === undefined) return null; // fonksiyon/symbol vb.
  if (serialized.length > MAX_SERIALIZED_BYTES) {
    throw new AdminAuditError(
      "payload_too_large",
      `audit ${field} boyut sınırını aştı (${serialized.length} > ${MAX_SERIALIZED_BYTES})`,
      { field },
    );
  }
  return value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WriteAdminAuditParams = {
  actorAdminId: string;
  action: AdminAuditAction;
  targetUserId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  result?: unknown;
  context?: unknown;
  reason?: string | null;
  actorIsMainAdmin?: boolean;
};

/**
 * Güvenli audit yazımı — FAIL-CLOSED.
 *
 * Başarıda yeni kaydın id'sini döner. Aşağıdaki durumlarda `AdminAuditError`
 * FIRLATIR (asla sessizce yutmaz, `{ok:false}` ile devam etmez):
 *   - geçersiz action / actorAdminId / targetUserId
 *   - yasaklı alan / aşırı büyük / aşırı derin / serileştirilemez payload
 *   - DB insert hatası
 *   - insert sonucu doğrulanamazsa (id dönmezse)
 *
 * Çağıran, bu hatayı bilinçli olarak ele almalıdır (audit yazılamıyorsa işlem
 * güvenli tarafta durdurulur/geri alınır). Best-effort/salt-okuma senaryoları
 * ayrı ürün/plan onayıyla, ayrı bir API ile eklenecektir — burada YOK.
 */
export async function writeAdminAudit(
  db: SupabaseClient,
  params: WriteAdminAuditParams,
): Promise<{ id: string }> {
  if (!isAdminAuditAction(params.action)) {
    throw new AdminAuditError("invalid_action", `Geçersiz audit action: ${normalizeKeyLabel(String(params.action))}`);
  }
  if (typeof params.actorAdminId !== "string" || !UUID_RE.test(params.actorAdminId)) {
    throw new AdminAuditError("invalid_actor", "actorAdminId geçerli bir uuid olmalı.");
  }
  if (params.targetUserId != null && (typeof params.targetUserId !== "string" || !UUID_RE.test(params.targetUserId))) {
    throw new AdminAuditError("invalid_target", "targetUserId geçerli bir uuid olmalı.");
  }

  const reason =
    typeof params.reason === "string" && params.reason.trim() !== ""
      ? params.reason.trim().slice(0, 1000)
      : null;

  // Her jsonb alanı fail-closed doğrulanır — yasaklı alan varsa BURADA throw eder
  // ve insert'e HİÇ ulaşılmaz.
  const payload = {
    actor_admin_id: params.actorAdminId,
    actor_is_main_admin: params.actorIsMainAdmin === true,
    target_user_id: params.targetUserId ?? null,
    action: params.action,
    old_value: assertAuditFieldSafe(params.oldValue, "old_value"),
    new_value: assertAuditFieldSafe(params.newValue, "new_value"),
    result: assertAuditFieldSafe(params.result, "result"),
    context: assertAuditFieldSafe(params.context, "context"),
    reason,
  };

  const { data, error } = await db
    .from("admin_audit_log")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    // error.message forbidden DEĞER içermez (yasaklı payload insert'e ulaşmaz).
    throw new AdminAuditError("db_error", `audit insert başarısız: ${error.message}`);
  }
  const insertedId = (data as { id?: unknown } | null)?.id;
  if (insertedId == null) {
    throw new AdminAuditError("insert_unverified", "audit insert sonucu doğrulanamadı (id dönmedi).");
  }
  return { id: String(insertedId) };
}
