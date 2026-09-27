/**
 * MEM-012 — Public kayıt (/api/register) SAF doğrulama. Client + server + harness paylaşır.
 *
 * Politika (makul, satış öncesi): ad 2–120 karakter (kontrol karakteri yok); e-posta trim+lower,
 * ≤254, basit biçim; parola 8–128 karakter, en az bir harf + bir rakam, e-posta ile aynı değil.
 * Honeypot alanı (`website`) dolu gelirse bot kabul edilir (route sessizce kayıt oluşturmaz).
 */

export const REGISTER_NAME_MIN = 2;
export const REGISTER_NAME_MAX = 120;
export const REGISTER_EMAIL_MAX = 254;
export const REGISTER_PASSWORD_MIN = 8;
export const REGISTER_PASSWORD_MAX = 128;
export const REGISTER_HONEYPOT_FIELD = "website";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export type RegisterErrorCode =
  | "missing_fields"
  | "invalid_name"
  | "invalid_email"
  | "weak_password"
  | "invalid_request";

export type RegisterValidation =
  | { ok: true; bot: boolean; value: { fullName: string; email: string; password: string } }
  | { ok: false; code: RegisterErrorCode };

export function normalizeRegisterEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Parola politikası (UI anlık geri bildirim + server). */
export function passwordPolicyError(password: string, email = ""): RegisterErrorCode | null {
  if (password.length < REGISTER_PASSWORD_MIN || password.length > REGISTER_PASSWORD_MAX) return "weak_password";
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/[0-9]/.test(password)) return "weak_password";
  if (email && password.toLowerCase() === email.toLowerCase()) return "weak_password";
  return null;
}

export function validateRegisterBody(body: Record<string, unknown>): RegisterValidation {
  const allowed = new Set(["fullName", "email", "password", REGISTER_HONEYPOT_FIELD]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) return { ok: false, code: "invalid_request" };

  const hp = body[REGISTER_HONEYPOT_FIELD];
  if (hp !== undefined && typeof hp !== "string") return { ok: false, code: "invalid_request" };
  const bot = typeof hp === "string" && hp.trim() !== "";

  if (typeof body.fullName !== "string" || typeof body.email !== "string" || typeof body.password !== "string") {
    return { ok: false, code: "missing_fields" };
  }
  const fullName = body.fullName.trim().replace(/\s+/g, " ");
  const email = normalizeRegisterEmail(body.email);
  // Parola baş/son boşluktan KIRPILIR — giriş (credentialLogin) de kırptığı için tutarlı olmalı.
  const password = body.password.trim();
  if (!fullName || !email || !password) return { ok: false, code: "missing_fields" };
  if (fullName.length < REGISTER_NAME_MIN || fullName.length > REGISTER_NAME_MAX || CONTROL_RE.test(fullName)) {
    return { ok: false, code: "invalid_name" };
  }
  if (email.length > REGISTER_EMAIL_MAX || !EMAIL_RE.test(email)) return { ok: false, code: "invalid_email" };
  const pw = passwordPolicyError(password, email);
  if (pw) return { ok: false, code: pw };
  return { ok: true, bot, value: { fullName, email, password } };
}
