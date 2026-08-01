/**
 * Faz 1 / P2 — Hesap müdahaleleri için ortak güvenlik yardımcıları.
 *
 * Üç eylem bunları paylaşır:
 *   A. Kullanıcıyı pasife alma  (status route toggle_active)
 *   B. Admin tarafından şifre sıfırlama  (password route)
 *   C. Tüm cihazlardan çıkış  (logout-all route)
 *
 * OTURUM GEÇERSİZLEŞTİRME SÖZLEŞMESİ (kanıtlanmış davranışa dayanır):
 *   - Oturum = public.user_sessions satırı; opaque UUID token; aktiflik YALNIZ
 *     is_active=true. verifyUserRequest/verifyAdminRequest her istekte
 *     getActiveSessionUserId(is_active=true) + users.active=true kontrol eder.
 *   - Bu yüzden bir oturumu geçersizleştirmek = is_active=false yapmak. Tek UPDATE
 *     statement atomiktir; revoke edilen satır hiçbir kod yolunda tekrar true olmaz;
 *     JWT/refresh yoktur → eski token sessizce canlanamaz. Sadece yeni bir login
 *     (parola + active kontrolü) yeni satır üretir.
 *   - Deterministik no-op: aktif oturum yoksa 0 satır güncellenir, 0 döner.
 *
 * Yalnız server-side (service_role db) kullanılır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireMainAdminForAdminTarget,
  resolveIsSuperAdmin,
  type MainAdminGuardResult,
} from "@/lib/admin/adminGuards";

/** Oturum sonlandırma nedenleri (user_sessions.end_reason — serbest metin). */
export const SESSION_END_REASON = {
  deactivated: "admin_deactivated",
  passwordReset: "admin_password_reset",
  logoutAll: "admin_logout_all",
} as const;

/** Logout-all ikinci onay için zorunlu tam metin (Türkçe karakter korunur). */
export const LOGOUT_ALL_CONFIRM_PHRASE = "ÇIKIŞ YAPTIR";

/** İstemciden gelen onay metnini doğrular: baş/son boşluk kırpılır, ardından
 *  BÜYÜK/küçük harf toleransı OLMADAN tam eşleşme aranır. */
export function isLogoutAllConfirmValid(value: unknown): boolean {
  return typeof value === "string" && value.trim() === LOGOUT_ALL_CONFIRM_PHRASE;
}

/** Şifre politikası — repo standardıyla (settings/change-password) uyumlu: min 6. */
export const MIN_PASSWORD_LENGTH = 6;

export type PasswordValidation =
  | { ok: true; value: string }
  | { ok: false; status: number; error: string };

export function validateNewPassword(raw: unknown): PasswordValidation {
  const value = String(raw ?? "").trim();
  if (!value) {
    return { ok: false, status: 400, error: "Yeni şifre giriniz." };
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 422,
      error: `Yeni şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`,
    };
  }
  return { ok: true, value };
}

/** Sınırlı JSON gövde okuma — body-size + content-type + malformed koruması. */
export type JsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: number; error: string };

const MAX_BODY_BYTES = 8 * 1024; // 8 KB — hesap müdahale gövdeleri küçüktür.

export async function readLimitedJsonBody(req: Request): Promise<JsonBodyResult> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return { ok: false, status: 400, error: "İçerik türü application/json olmalı." };
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "İstek gövdesi çok büyük." };
  }
  if (raw.trim() === "") return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "Geçersiz istek gövdesi." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Geçersiz JSON gövdesi." };
  }
}

/**
 * P2 hesap eylemi hedef kapısı — üç katman (savunma derinliği):
 *   1) Kendi hesabına uygulama YASAK (self-block). Pasife alma/şifre/logout-all
 *      hepsinde admin kendine bu akışı uygulayamaz.
 *   2) requireMainAdminForAdminTarget — hedef admin ise yalnız ana yönetici; normal
 *      admin başka admini yönetemez (P1 korunur).
 *   3) Ana yönetici (is_super_admin) hedef olarak MUTLAK korunur — hiçbir P2 hesap
 *      eylemi ana yöneticiye uygulanamaz (pasife alınamaz / şifresi sıfırlanamaz /
 *      cihazlardan çıkarılamaz).
 */
export async function requireP2AccountActionTarget(
  db: SupabaseClient,
  actorAdminId: string,
  targetUserId: string,
): Promise<MainAdminGuardResult> {
  if (actorAdminId === targetUserId) {
    return {
      ok: false,
      status: 403,
      error: "Bu işlemi kendi hesabınıza bu ekrandan uygulayamazsınız.",
    };
  }
  const adminTarget = await requireMainAdminForAdminTarget(db, actorAdminId, targetUserId);
  if (!adminTarget.ok) return adminTarget;

  const targetIsSuper = await resolveIsSuperAdmin(db, targetUserId);
  if (targetIsSuper) {
    return { ok: false, status: 403, error: "Ana yönetici hesabına bu işlem uygulanamaz." };
  }
  return { ok: true };
}

/** Hedef kullanıcının var olduğunu doğrular (yoksa 404). */
export async function ensureTargetExists(
  db: SupabaseClient,
  targetUserId: string,
): Promise<MainAdminGuardResult> {
  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Kullanıcı doğrulanamadı." };
  if (!data) return { ok: false, status: 404, error: "Kullanıcı bulunamadı." };
  return { ok: true };
}

/** Audit için actor'ın ana yönetici olup olmadığını çözer (bayrak). */
export async function resolveActorIsMainAdmin(
  db: SupabaseClient,
  actorAdminId: string,
): Promise<boolean> {
  return resolveIsSuperAdmin(db, actorAdminId);
}

/** Session revoke sırasında DB hatası — route 500'e eşler. */
export class SessionRevokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionRevokeError";
  }
}

/**
 * Kullanıcının TÜM aktif oturumlarını geçersizleştirir (tek atomik UPDATE).
 * Döner: geçersizleştirilen oturum sayısı (deterministik; aktif yoksa 0).
 * DB hatasında SessionRevokeError fırlatır (fail-closed: route 500 verir).
 */
export async function revokeAllActiveSessions(
  db: SupabaseClient,
  userId: string,
  reason: string,
): Promise<number> {
  const { data, error } = await db
    .from("user_sessions")
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
      end_reason: reason,
    })
    .eq("user_id", userId)
    .eq("is_active", true)
    .select("id");

  if (error) throw new SessionRevokeError(error.message);
  return Array.isArray(data) ? data.length : 0;
}

/** no-store JSON yanıt yardımcı — hassas admin yanıtları cache'lenmez. */
export function jsonNoStore(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
