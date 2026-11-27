/**
 * GİRİŞ GÜVENLİĞİ F2-B — ortak MFA challenge yardımcıları (yalnız server-side / API route).
 *
 * Akış: parola doğru → auth_mfa_begin (oturum AÇILMAZ) → ikinci doğrulama (F2-C QR / F2-D e-posta;
 * auth_mfa_mark_verified yalnız o yöntemlerin DB fonksiyonlarından) → auth_finalize_login → oturum.
 *
 * TARAYICI BAĞLAMA: challenge yalnız onu başlatan istemcide tamamlanabilir.
 *   - Web: 256 bit rastgele sır HttpOnly + Secure + SameSite=Strict `__Host-yasam_mfa` çerezinde;
 *     JS görmez. DB'de yalnız sha256 özeti (auth_mfa_challenges.browser_secret_hash).
 *   - Resmî Android: sunucu Android isteklerinde çerezi yok saydığı için sır yanıt gövdesinde döner,
 *     istemci bellekte tutar ve `x-yasam-mfa-binding` başlığıyla geri gönderir.
 *   challenge_id tek başına (ör. kopyalanmış QR) hiçbir şeyi tamamlayamaz.
 *
 * ZORUNLULUK: users.mfa_required (DB, kullanıcı başına). Bu modüldeki yöntem bayrakları yalnız
 * hangi yöntemlerin SUNULACAĞINI belirler; zorunlu kullanıcı için parolayla girişe ASLA düşülmez.
 */
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUndefinedColumnError } from "@/lib/auth/undefinedColumn";

export const MFA_BINDING_COOKIE = "__Host-yasam_mfa";
export const MFA_BINDING_HEADER = "x-yasam-mfa-binding";
/** Challenge ömrü (sn). DB üst sınırı 15 dk (auth_mfa_challenges_ttl_chk); fonksiyon 60–900 sn'ye kırpar. */
export const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;

const BINDING_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bayt base64url (dolgusuz)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sunulabilecek ikinci doğrulama yöntemleri. F2-C: qr_device (güvenilir Android cihazı + QR).
 * F2-D (email_otp) eklendiğinde buraya girer. Sunulması ayrıca AUTH_MFA_METHODS + kapsam bayrağına bağlı.
 */
export const IMPLEMENTED_MFA_METHODS: readonly string[] = ["qr_device", "email_otp"];

export type MfaMethodScope = "test_accounts" | "all";

/**
 * Sunulan yöntemler = uygulanmış ∩ AUTH_MFA_METHODS (virgüllü). Kapsam AUTH_MFA_METHOD_SCOPE:
 * "all" değilse (varsayılan "test_accounts") yalnız auth_mfa_test_accounts listesindeki hesaplara.
 * Saf; test edilebilir. Boş liste = yöntem yok → zorunlu kullanıcı giriş YAPAMAZ (fail-closed).
 */
export function resolveOfferedMfaMethods(
  isTestAccount: boolean,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const enabled = new Set(
    String(env.AUTH_MFA_METHODS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const scope: MfaMethodScope = String(env.AUTH_MFA_METHOD_SCOPE ?? "").trim().toLowerCase() === "all" ? "all" : "test_accounts";
  if (scope === "test_accounts" && !isTestAccount) return [];
  return IMPLEMENTED_MFA_METHODS.filter((m) => enabled.has(m));
}

/**
 * F2-D: kullanıcıya göre sunulan yöntemler. Bayraklarla açık olsa bile:
 *   qr_device → kullanıcının AKTİF güvenilir cihazı varsa; email_otp → e-posta DOĞRULANMIŞ + sağlayıcı ve
 *   pepper yapılandırılmış + rol izinli (AUTH_MFA_EMAIL_ROLES). Boş liste = giriş YOK (parolaya düşülmez).
 *
 * Owner kilitlenme düzeltmesi (23.11): kurtarma kodu ortam bayraklarına (AUTH_MFA_METHODS / AUTH_MFA_METHOD_SCOPE)
 * BAĞLI DEĞİLDİR. Önceden bayraklar boş / kapsam dışıyken liste erkenden boş dönüyor ve kullanıcının (Owner dahil)
 * elindeki GEÇERLİ kurtarma kodu / çevrimdışı kit kodu da arayüzden kayboluyordu — oysa doğrulama ucu
 * (/api/auth/mfa/recovery/verify) kodu bu listeye bakmadan DB'de doğrular. Artık kurtarma kodu YALNIZ DB'deki gerçek
 * kayda göre sunulur: bu kullanıcıya ait, kullanılmamış, süresi geçmemiş kod / bilet sayısı > 0 (auth_mfa_user_methods;
 * Owner çevrimdışı kiti yalnız Owner'da sayılır). Yanlış ortam ayarı hiçbir ASIL yöntemi açmaz ve MFA'yı atlatmaz:
 * kod yine tek kullanımlık, kullanıcıya bağlı özetle ve deneme sınırıyla DB'de doğrulanır. DB okunamazsa kurtarma
 * sunulmaz (fail-closed).
 */
export async function resolveUserMfaMethods(
  db: SupabaseClient,
  args: { userId: string; role: string; isTestAccount: boolean; emailConfigured: boolean; emailRoleAllowed: boolean },
  env: Record<string, string | undefined> = process.env,
): Promise<string[]> {
  let flags = resolveOfferedMfaMethods(args.isTestAccount, env);
  // F4 (Risk B): kapsam "test_accounts" iken listeye alınıp zorunluluğu AÇILMIŞ hesap, liste kaydının SÜRESİ DOLUNCA (ör. 14 gün)
  // asıl yöntemini KAYBETMEZ (zorunluluk açık + yöntem yok = kilitlenme). Dar kural: yalnız kaydı süresi dolmuş (etkin kaydı
  // olmayan) VE zorunlu hesap — listeye hiç alınmamış hesaplarda yanlış kapsam ayarı yine asıl yöntem AÇMAZ (#833). Fonksiyon
  // (taslak migration 20280129100000) yoksa / okunamazsa / zorunluluk okunamazsa genişletme YAPILMAZ (fail-closed).
  if (!args.isTestAccount && flags.length === 0 && resolveOfferedMfaMethods(true, env).length > 0) {
    const lapsed = await db.rpc("auth_mfa_test_account_lapsed", { p_user_id: args.userId }).then((r) => !r.error && r.data === true, () => false);
    if (lapsed) {
      const req = await readMfaRequirement(db, args.userId);
      if (req.status === "required") flags = resolveOfferedMfaMethods(true, env);
    }
  }
  const { data, error } = await db.rpc("auth_mfa_user_methods", { p_user_id: args.userId });
  // 000400 henüz uygulanmamışsa (veya okuma hatası) F2-C davranışı: yalnız QR (cihaz imzası yine şart;
  // e-posta asla bu yoldan sunulmaz). Kod migration'dan önce yayına çıksa da zorunlu kullanıcı kilitlenmez.
  // Kurtarma kodu bu yolda SUNULMAZ (kayıt okunamadı → fail-closed).
  if (error || !data || typeof data !== "object") return flags.filter((f) => f === "qr_device");
  const m = data as { has_device?: unknown; email_verified?: unknown; recovery_codes?: unknown };
  const methods = flags.filter((f) =>
    f === "qr_device" ? m.has_device === true
      : f === "email_otp" ? m.email_verified === true && args.emailConfigured && args.emailRoleAllowed
        : false);
  // F2-E: kurtarma kodu ayrı bir env bayrağı İSTEMEZ ve kapsam / yöntem bayraklarına bağlı DEĞİLDİR (asıl yöntemler
  // veya ortam ayarı kaybolduğunda da çalışmalı): yalnız bu kullanıcının kullanılmamış kodu / bileti varsa sunulur.
  // 000500 öncesi DB'de alan yoktur → sunulmaz.
  if (Number(m.recovery_codes) > 0) methods.push("recovery_code");
  return methods;
}

export function newMfaBindingSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashMfaBinding(secret: string): string {
  return createHash("sha256").update(`yasam-mfa-binding:${secret}`).digest("hex");
}

export function isMfaChallengeId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** İstekteki bağlama sırrı: Android → başlık; web → HttpOnly çerez. Geçersiz biçim → null. */
export function readMfaBinding(req: NextRequest, androidApp: boolean): string | null {
  const raw = androidApp
    ? (req.headers.get(MFA_BINDING_HEADER) ?? "").trim()
    : (req.cookies.get(MFA_BINDING_COOKIE)?.value ?? "").trim();
  return BINDING_RE.test(raw) ? raw : null;
}

export function setMfaBindingCookie(res: NextResponse, secret: string): void {
  res.cookies.set(MFA_BINDING_COOKIE, secret, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: MFA_CHALLENGE_TTL_SECONDS,
  });
}

export function clearMfaBindingCookie(res: NextResponse): void {
  res.cookies.set(MFA_BINDING_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
}

export type MfaRequirement = { status: "required" | "not_required" } | { status: "error" };

/**
 * users.mfa_required okunur. Kolon henüz yoksa (20280103000100 öncesi deploy) hiçbir kullanıcı
 * zorunlu olamaz → not_required (DB tetikleyicisi de yoktur). Diğer hatalar → error (fail-closed).
 * NOT: kod yanlışlıkla not_required dese bile user_sessions_mfa_guard zorunlu kullanıcının
 * oturumunu auth_finalize_login dışında REDDEDER (savunma derinliği).
 */
export async function readMfaRequirement(db: SupabaseClient, userId: string): Promise<MfaRequirement> {
  const { data, error } = await db.from("users").select("mfa_required").eq("id", userId).maybeSingle();
  if (error) return isUndefinedColumnError(error) ? { status: "not_required" } : { status: "error" };
  return (data as { mfa_required?: unknown } | null)?.mfa_required === true
    ? { status: "required" }
    : { status: "not_required" };
}

export async function isMfaTestAccount(db: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("auth_mfa_is_test_account", { p_user_id: userId });
    return !error && data === true;
  } catch {
    return false;
  }
}

export type MfaBeginResult =
  | { ok: true; challengeId: string; expiresAt: string; qrNonce: string | null; matchCode: string | null }
  | { ok: false; reason: string };

export async function beginMfaChallenge(
  db: SupabaseClient,
  args: { userId: string; bindingHash: string; clientChannel: string; ipHash: string; userAgent: string },
): Promise<MfaBeginResult> {
  const { data, error } = await db.rpc("auth_mfa_begin", {
    p_user_id: args.userId,
    p_browser_secret_hash: args.bindingHash,
    p_client_channel: args.clientChannel,
    p_ip_hash: args.ipHash,
    p_user_agent: args.userAgent.slice(0, 512),
    p_ttl_seconds: MFA_CHALLENGE_TTL_SECONDS,
  });
  if (error) return { ok: false, reason: "error" };
  const r = (data ?? {}) as { ok?: unknown; challenge_id?: unknown; expires_at?: unknown; reason?: unknown; qr_nonce?: unknown; match_code?: unknown };
  if (r.ok === true && isMfaChallengeId(r.challenge_id) && typeof r.expires_at === "string") {
    return {
      ok: true,
      challengeId: String(r.challenge_id),
      expiresAt: r.expires_at,
      // F2-C: QR nonce yalnız bu yanıtta (DB'de yalnız özeti); eşleştirme kodu yalnız başlatan tarayıcıya.
      qrNonce: typeof r.qr_nonce === "string" && /^[A-Za-z0-9_-]{32}$/.test(r.qr_nonce) ? r.qr_nonce : null,
      // F2-K (O1): yeni istekler 6 haneli (yazılan) kod; geçiş süresince eski 2 haneli de kabul.
      matchCode: typeof r.match_code === "string" && /^(?:[0-9]{2}|[0-9]{6})$/.test(r.match_code) ? r.match_code : null,
    };
  }
  return { ok: false, reason: typeof r.reason === "string" ? r.reason : "error" };
}

export type MfaChallengeState = "pending" | "verified" | "consumed" | "expired" | "denied" | "invalid";

export async function readMfaChallengeState(
  db: SupabaseClient,
  challengeId: string,
  bindingHash: string,
): Promise<{ state: MfaChallengeState; expiresAt: string | null; userId: string | null } | null> {
  const { data, error } = await db.rpc("auth_mfa_challenge_status", {
    p_challenge_id: challengeId,
    p_browser_secret_hash: bindingHash,
  });
  if (error) return null;
  const r = (data ?? {}) as { state?: unknown; expires_at?: unknown; user_id?: unknown };
  const allowed: MfaChallengeState[] = ["pending", "verified", "consumed", "expired", "denied", "invalid"];
  const state = allowed.includes(r.state as MfaChallengeState) ? (r.state as MfaChallengeState) : "invalid";
  return {
    state,
    expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
    // Yalnız sunucu içi (tamamlama gating'i). İstemci yanıtına KONMAZ.
    userId: state !== "invalid" && isMfaChallengeId(r.user_id) ? String(r.user_id) : null,
  };
}
