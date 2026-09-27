/**
 * ÜYE YÖNETİMİ FAZ 1 — admin üye uçları için SAF istek doğrulama (MEM-011) + RPC hata eşleme.
 *
 * - Geçersiz UUID / bilinmeyen enum / aşırı uzun isim / geçersiz e-posta → 400.
 * - MEM-002: profil düzenleme yolu `active` KABUL ETMEZ (sessiz yok sayma değil, 400) —
 *   aktif/pasif yalnız dedicated durum işlemiyle (status route → atomik RPC) değişir.
 * - DB ham hata mesajı istemciye SIZDIRILMAZ; iş kuralı çakışması 409, geçersiz girdi 400.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const PROFILE_NAME_MAX = 120;
export const PROFILE_EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

export type ManagedRole = "admin" | "expert";

export type ProfileEditValidation =
  | { ok: true; value: { fullName: string; email: string; role: ManagedRole } }
  | { ok: false; error: string };

/** Profil düzenleme gövdesi: yalnız fullName + email + role. `active` → hata. */
export function validateProfileEdit(body: Record<string, unknown>): ProfileEditValidation {
  if ("active" in body) {
    return {
      ok: false,
      error: "Aktif/Pasif durumu bu formdan değiştirilemez; “Aktif Yap / Pasif Yap” işlemini kullanın.",
    };
  }
  const allowed = new Set(["action", "fullName", "email", "role"]);
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) return { ok: false, error: "Beklenmeyen alan." };
  }
  if (typeof body.fullName !== "string" || typeof body.email !== "string") {
    return { ok: false, error: "Ad ve e-posta zorunludur." };
  }
  const fullName = body.fullName.trim();
  const email = body.email.trim().toLowerCase();
  if (!fullName || !email) return { ok: false, error: "Ad ve e-posta zorunludur." };
  if (fullName.length > PROFILE_NAME_MAX || CONTROL_CHARS_RE.test(fullName)) {
    return { ok: false, error: `Ad soyad en fazla ${PROFILE_NAME_MAX} karakter olmalı ve kontrol karakteri içermemelidir.` };
  }
  if (email.length > PROFILE_EMAIL_MAX || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Geçerli bir e-posta adresi girin." };
  }
  if (body.role !== "admin" && body.role !== "expert") {
    return { ok: false, error: "Geçersiz rol. Kabul edilenler: admin, expert" };
  }
  return { ok: true, value: { fullName, email, role: body.role } };
}

/** Migration 20270128 hata kodları → HTTP. Ham mesaj ASLA dönmez. */
export function rpcErrorStatus(error: unknown): 400 | 409 | 500 {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "UY001" || code === "UY002") return 409;
  if (code === "UY003") return 400;
  return 500;
}
