/**
 * TRIAL7 — 7 günlük ücretsiz deneme: SUNUCU yardımcıları (kayıt bayrağı, Turnstile Siteverify,
 * risk sinyalleri, ilk giriş etkinleştirme, durum + kredi özeti, Pro talebi).
 *
 * Tüm DB yazımları SECURITY DEFINER RPC'lerdedir (supabase/migrations/20280101000000_trial7_self_trial.sql);
 * bu dosya yalnız çağırır ve dönüşü fail-closed çözer. Ham IP / ham e-posta SAKLANMAZ (HMAC kovaları).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { rateLimitBucket } from "@/lib/security/dbRateLimit";
import {
  canonicalTrialEmail,
  TRIAL_DEFAULT_DAILY_CREDITS,
  type TrialCreditModule,
  type TrialPhase,
} from "@/lib/trial/trialCore";

assertServerOnly("lib/trial/trialServer");

type Env = Record<string, string | undefined>;

// ─── Otomatik deneme üyeliği bayrağı (fail-closed) ─────────────────────────────

/**
 * Onaysız 7 günlük deneme kaydı AÇIK mı? Üç koşul BİRLİKTE gerekir (Owner: anahtarlar + güvenlik
 * testleri tamamlanmadan canlıda açılmaz):
 *   TRIAL_SELF_SIGNUP_ENABLED=1 · TRIAL_TURNSTILE_SECRET_KEY · TRIAL_TURNSTILE_SITE_KEY.
 * Kapalıyken /api/register bugünkü yönetici onaylı akışla BİREBİR çalışır.
 *
 * Kayıt sistemi Cloudflare'da AYRI bir Turnstile widget'ı kullanır (TRIAL_TURNSTILE_*). Kampanya Merkezi'nin
 * TURNSTILE_SECRET_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY anahtarları burada OKUNMAZ ve otomatik denemeyi AÇMAZ.
 * Site anahtarı tarayıcıya GET /api/register ile sunucudan verilir (NEXT_PUBLIC_ gerekmez; gizli değildir).
 */
export function isSelfTrialSignupEnabled(env: Env = process.env): boolean {
  return (
    env.TRIAL_SELF_SIGNUP_ENABLED === "1" &&
    !!env.TRIAL_TURNSTILE_SECRET_KEY?.trim() &&
    !!env.TRIAL_TURNSTILE_SITE_KEY?.trim()
  );
}

export function turnstileSiteKey(env: Env = process.env): string | null {
  return env.TRIAL_TURNSTILE_SITE_KEY?.trim() || null;
}

// ─── Cloudflare Turnstile — sunucu tarafı Siteverify (ZORUNLU) ─────────────────

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION = "register";
const TURNSTILE_TIMEOUT_MS = 8_000;
const TURNSTILE_TOKEN_MAX = 2048;

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "not_configured" | "verify_failed" | "unavailable" | "action_mismatch" | "hostname_mismatch" };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Turnstile belirtecini Cloudflare Siteverify ile doğrular. Fail-closed: ağ hatası, zaman aşımı,
 * eksik yapılandırma veya beklenmeyen yanıt → ok:false (kayıt OLUŞTURULMAZ).
 * Belirteç tek kullanımlıktır (Cloudflare tarafında); idempotency_key ile yeniden deneme güvenlidir.
 *
 * KVKK veri en aza indirme (Kampanya Merkezi botCheck ile aynı ilke; /alt-isleyiciler metni): isteğe bağlı
 * `remoteip` alanı GÖNDERİLMEZ — sunucu Cloudflare'e yalnız tek kullanımlık belirteci ve gizli anahtarı iletir.
 * Doğrulama zorunluluğu değişmez (success + action + isteğe bağlı hostname kontrolü).
 */
export async function verifyTurnstileToken(
  token: unknown,
  opts: { env?: Env; fetchImpl?: FetchLike; idempotencyKey?: string } = {},
): Promise<TurnstileResult> {
  const env = opts.env ?? process.env;
  const secret = env.TRIAL_TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: false, reason: "not_configured" };
  if (typeof token !== "string" || token.length < 10 || token.length > TURNSTILE_TOKEN_MAX) {
    return { ok: false, reason: "missing_token" };
  }
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (opts.idempotencyKey) body.set("idempotency_key", opts.idempotencyKey);

  const doFetch = opts.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TURNSTILE_TIMEOUT_MS);
  let data: Record<string, unknown>;
  try {
    const res = await doFetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: ctrl.signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
  if (data?.success !== true) return { ok: false, reason: "verify_failed" };
  // Widget action'ı sabittir; başka bir sayfanın belirteci kayıtta kullanılamaz.
  if (typeof data.action === "string" && data.action !== TURNSTILE_ACTION) {
    return { ok: false, reason: "action_mismatch" };
  }
  const allowedHosts = (env.TRIAL_TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0) {
    const host = typeof data.hostname === "string" ? data.hostname.toLowerCase() : "";
    if (!allowedHosts.includes(host)) return { ok: false, reason: "hostname_mismatch" };
  }
  return { ok: true };
}

// ─── Risk sinyalleri (kalıcı engel DEĞİL; yüksek risk → otomatik inceleme) ──────

/** Bilinen tek kullanımlık e-posta alan adları (küçük, bilinçli liste; sahte üyelik sinyali). */
const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonaddy.me",
  "burnermail.io", "discard.email", "dispostable.com", "emailondeck.com", "fakeinbox.com",
  "getairmail.com", "getnada.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamailblock.com", "inboxkitten.com", "maildrop.cc", "mailinator.com", "mailinator.net",
  "mailnesia.com", "mailpoof.com", "mintemail.com", "moakt.com", "mohmal.com", "mytemp.email",
  "sharklasers.com", "spamgourmet.com", "temp-mail.io", "temp-mail.org", "tempail.com",
  "tempmail.com", "tempmail.dev", "tempmailo.com", "tempr.email", "throwawaymail.com",
  "trashmail.com", "trashmail.de", "yopmail.com", "yopmail.fr", "yopmail.net",
]);

/** Aynı IP kovasından 24 saatte bu sayıdan FAZLA deneme kaydı → otomatik inceleme (engel değil). */
export const TRIAL_IP_REVIEW_THRESHOLD = 3;
/** Bu skor ve üstü → deneme 'review' durumunda açılır (modüller + Roxy kapalı; admin karar verir). */
export const TRIAL_REVIEW_SCORE = 50;

export type TrialRisk = { score: number; flags: string[]; review: boolean };

/**
 * SAF risk değerlendirmesi. Aynı IP'yi paylaşan masum kullanıcılar KALICI engellenmez: eşik
 * aşımı yalnız "inceleme" durumu üretir (hesap oluşur, giriş yapılabilir, admin onaylayınca açılır).
 */
export function assessTrialRisk(input: {
  email: string;
  recentSignupsFromIp: number;
  userAgent: string | null;
}): TrialRisk {
  const flags: string[] = [];
  let score = 0;
  const domain = input.email.slice(input.email.lastIndexOf("@") + 1).toLowerCase();
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    flags.push("tek_kullanimlik_eposta");
    score += 60;
  }
  if (input.recentSignupsFromIp >= TRIAL_IP_REVIEW_THRESHOLD) {
    flags.push("ayni_ip_coklu_kayit");
    score += 50;
  } else if (input.recentSignupsFromIp >= 1) {
    flags.push("ayni_ip_onceki_kayit");
    score += 15;
  }
  if (!input.userAgent || input.userAgent.trim().length < 8) {
    flags.push("tarayici_bilgisi_yok");
    score += 20;
  }
  const local = input.email.slice(0, input.email.lastIndexOf("@"));
  if (/^[a-z]{1,3}\d{5,}$/i.test(local) || /\d{8,}/.test(local)) {
    flags.push("otomatik_uretilmis_ad");
    score += 15;
  }
  score = Math.min(100, score);
  return { score, flags, review: score >= TRIAL_REVIEW_SCORE };
}

/** Tek deneme hakkı anahtarı: kanonik e-postanın HMAC'ı (ham e-posta saklanmaz). */
export function trialClaimHash(email: string): string {
  return rateLimitBucket("trial-claim", canonicalTrialEmail(email));
}

/** IP kovası (HMAC; ham IP saklanmaz). */
export function trialIpBucket(ip: string): string | null {
  return ip && ip !== "unknown" ? rateLimitBucket("trial-ip", ip) : null;
}

// ─── Kayıt ─────────────────────────────────────────────────────────────────────

export type TrialRegisterOutcome =
  | { ok: true; userId: string; tenantId: string; trialStatus: "not_started" | "review" }
  | { ok: false; outcome: "already_exists" | "trial_already_used" | "error" };

export async function registerTrialExpert(
  db: SupabaseClient,
  input: {
    email: string;
    passwordHash: string;
    fullName: string;
    tenantName: string;
    tenantSlugBase: string;
    modulePermissions: Record<string, boolean>;
    claimHash: string;
    ipBucket: string | null;
    risk: TrialRisk;
  },
): Promise<TrialRegisterOutcome> {
  try {
    const { data, error } = await db.rpc("trial_register_expert", {
      p_payload: {
        email: input.email,
        password_hash: input.passwordHash,
        full_name: input.fullName,
        tenant_name: input.tenantName,
        tenant_slug_base: input.tenantSlugBase,
        module_permissions: input.modulePermissions,
        claim_hash: input.claimHash,
        ip_bucket: input.ipBucket,
        risk_score: input.risk.score,
        risk_flags: input.risk.flags,
        review: input.risk.review,
      },
    });
    if (error || !data || typeof data !== "object") return { ok: false, outcome: "error" };
    const d = data as Record<string, unknown>;
    if (d.ok === true && d.outcome === "provisioned" && typeof d.user_id === "string") {
      return {
        ok: true,
        userId: d.user_id,
        tenantId: String(d.tenant_id ?? ""),
        trialStatus: d.trial_status === "review" ? "review" : "not_started",
      };
    }
    if (d.outcome === "already_exists") return { ok: false, outcome: "already_exists" };
    if (d.outcome === "trial_already_used") return { ok: false, outcome: "trial_already_used" };
    return { ok: false, outcome: "error" };
  } catch {
    return { ok: false, outcome: "error" };
  }
}

export async function recentTrialSignupsForIp(db: SupabaseClient, ipBucket: string | null): Promise<number> {
  if (!ipBucket) return 0;
  try {
    const { data, error } = await db.rpc("trial_recent_signups_for_ip", { p_ip_bucket: ipBucket });
    if (error) return 0;
    const n = Number(data);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

// ─── İlk başarılı giriş + durum ────────────────────────────────────────────────

export type TrialState = {
  phase: TrialPhase;
  trialStatus: string | null;
  startedAt: string | null;
  endsAt: string | null;
  activated: boolean;
  serverNow: string;
};

function parseTrialState(d: Record<string, unknown>): TrialState {
  const phase = String(d.phase ?? "none") as TrialPhase;
  return {
    phase,
    trialStatus: d.trial_status == null ? null : String(d.trial_status),
    startedAt: d.trial_started_at == null ? null : String(d.trial_started_at),
    endsAt: d.trial_ends_at == null ? null : String(d.trial_ends_at),
    activated: d.activated === true,
    serverNow: d.server_now == null ? new Date().toISOString() : String(d.server_now),
  };
}

/**
 * Deneme penceresini İLK başarılı girişte bir kez başlatır (eşzamanlı girişte de tek kez; tekrar
 * giriş süreyi sıfırlamaz). Deneme rejimi dışı kullanıcı için RPC hiçbir şey yazmaz (phase 'none').
 * Hata → null (giriş akışı ETKİLENMEZ; durum ucu bir sonraki çağrıda yeniden dener).
 */
export async function activateTrialOnLogin(db: SupabaseClient, userId: string): Promise<TrialState | null> {
  try {
    const { data, error } = await db.rpc("trial_activate_on_login", { p_user_id: userId });
    if (error || !data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) return null;
    return parseTrialState(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export type TrialCreditUsage = {
  day: string;
  dailyLimit: number;
  moduleLimits: Partial<Record<TrialCreditModule, number>>;
  usedTotal: number;
  usedByModule: Partial<Record<TrialCreditModule, number>>;
};

export async function readTrialCreditUsage(db: SupabaseClient, userId: string): Promise<TrialCreditUsage | null> {
  try {
    const { data, error } = await db.rpc("trial_credit_usage", { p_user_id: userId });
    if (error || !data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    return {
      day: String(d.day ?? ""),
      dailyLimit: Number.isFinite(Number(d.daily_limit)) ? Number(d.daily_limit) : TRIAL_DEFAULT_DAILY_CREDITS,
      moduleLimits: (d.module_limits && typeof d.module_limits === "object" ? d.module_limits : {}) as TrialCreditUsage["moduleLimits"],
      usedTotal: Number(d.used_total) || 0,
      usedByModule: (d.used_by_module && typeof d.used_by_module === "object" ? d.used_by_module : {}) as TrialCreditUsage["usedByModule"],
    };
  } catch {
    return null;
  }
}

// ─── Uygulama içi Pro talebi ───────────────────────────────────────────────────

export async function createProUpgradeRequest(
  db: SupabaseClient,
  userId: string,
  note: string | null,
): Promise<{ ok: true; created: boolean; createdAt: string } | { ok: false; reason: "not_trial" | "error" }> {
  try {
    const { data, error } = await db.rpc("trial_pro_request_create", { p_user_id: userId, p_note: note });
    if (error || !data || typeof data !== "object") return { ok: false, reason: "error" };
    const d = data as Record<string, unknown>;
    if (d.ok !== true) return { ok: false, reason: d.reason === "not_trial" ? "not_trial" : "error" };
    return { ok: true, created: d.created === true, createdAt: String(d.created_at ?? "") };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function readOpenProRequest(db: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("pro_upgrade_requests")
      .select("created_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .maybeSingle();
    if (error || !data) return null;
    return String((data as { created_at?: unknown }).created_at ?? "") || null;
  } catch {
    return null;
  }
}
