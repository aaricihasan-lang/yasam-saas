/**
 * Hesap güvenliği — çok cihaz politikası, konum tabanlı risk motoru,
 * platform bazlı oturum limitleri, oturum doğrulama.
 *
 * Yalnızca server-side (API route) kullanımı içindir.
 *
 * Politika özeti:
 *   security_exempt=true   → risk motoru tamamen atlanır
 *   security_mode=flexible → stale eşiği 60 dk (diğerlerinde 15 dk)
 *   allowed_locations      → farklı lokasyon sayısı bu limitin altındaysa konum riski yok
 *   allowed_active_sessions → toplam fresh session limiti; aşılırsa en eskisi kapanır
 *   allowed_{platform}_sessions → platform bazlı limit; aşılırsa en eski aynı-platform kapanır
 *   Lokasyon limiti aşılınca:
 *     diff_city + fresh → suspicious_login (strict modda high_risk)
 *     diff_country + 6h → high_risk_login
 *   Lokasyon limit içinde ve diff_country varsa → multi_location_allowed (low) logu
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyDeviceType, type LimitReason } from "@/lib/auth/sessionLimits";
import { resolveClientChannel, CLIENT_CHANNEL_HEADER, type ClientChannel } from "@/lib/auth/clientChannel";

// ─── Eşikler ─────────────────────────────────────────────────────────────────

const FRESH_THRESHOLD_MS     = 15 * 60 * 1000;    // 15 dakika (strict / normal)
const FLEXIBLE_THRESHOLD_MS  = 60 * 60 * 1000;    // 60 dakika (flexible)
const HIGH_RISK_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 saat

/**
 * last_seen_at throttle penceresi = FRESH_THRESHOLD_MS (15 dk) / 10 = 90 sn.
 * Aktif bir oturumun last_seen_at'i gerçek aktiviteden en fazla bu kadar geri kalır;
 * bağlayıcı freshness eşiği olan 15 dk'ya %90 marj bırakır (admin aktif-oturum sayımı
 * ve login'de stale kapatma da aynı eşiği kullanır). Per-request UPDATE amplifikasyonunu
 * düşürmek için getActiveSessionUserId içinde kullanılır.
 */
const LAST_SEEN_THROTTLE_MS = 90 * 1000; // 90 sn (FRESH_THRESHOLD_MS / 10)

// ─── Oturum süresi politikası (FAZ1 FINAL HARDENING — AUTH) ─────────────────
//
// SATIŞ ÖNCESİ KAPANIŞ (P1-3): süre ZORLAMASI varsayılan AÇIK (R2). Env'e bağımlı değildir;
// `SESSION_EXPIRY_ENFORCE` yalnız ACİL KAPATMA anahtarıdır ("0" / "false" / "off" / "no" → R1).
// R1 (yalnız kill-switch ile): last_seen_at touch'ı + expires_at yazımı + sunucu logout; süre
// nedeniyle sonlandırma YOK. Süreler: admin mutlak 24 saat / idle 2 saat, uzman mutlak 30 gün /
// idle 7 gün. Mutlak süre expires_at'e oturum oluşturulurken yazılır. Birikmiş politika dışı
// oturumlar migration 20271001000000 ile kapatıldı (DELETE yok).

export const SESSION_ABSOLUTE_MS = {
  admin: 24 * 60 * 60 * 1000,
  expert: 30 * 24 * 60 * 60 * 1000,
} as const;

export const SESSION_IDLE_MS = {
  admin: 2 * 60 * 60 * 1000,
  expert: 7 * 24 * 60 * 60 * 1000,
} as const;

export type SessionExpiryPolicy = {
  enforce: boolean;
  touchAfterSeconds: number;
  expertIdleSeconds: number;
  adminIdleSeconds: number;
  adminAbsoluteSeconds: number;
};

const SESSION_EXPIRY_KILL_SWITCH_VALUES: ReadonlySet<string> = new Set(["0", "false", "off", "no"]);

/**
 * Süre zorlaması açık mı? (saf; test edilebilir). Varsayılan: AÇIK. Yalnız açıkça
 * "0"/"false"/"off"/"no" verilirse kapanır (acil kill-switch); boş/tanımsız/diğer → AÇIK.
 */
export function isSessionExpiryEnforced(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = String(env.SESSION_EXPIRY_ENFORCE ?? "").trim().toLowerCase();
  return !SESSION_EXPIRY_KILL_SWITCH_VALUES.has(raw);
}

export function resolveSessionExpiryPolicy(
  env: Record<string, string | undefined> = process.env,
): SessionExpiryPolicy {
  return {
    enforce: isSessionExpiryEnforced(env),
    touchAfterSeconds: LAST_SEEN_THROTTLE_MS / 1000,
    expertIdleSeconds: SESSION_IDLE_MS.expert / 1000,
    adminIdleSeconds: SESSION_IDLE_MS.admin / 1000,
    adminAbsoluteSeconds: SESSION_ABSOLUTE_MS.admin / 1000,
  };
}

/** Yeni oturumun mutlak bitişi (rol bazlı). */
export function computeSessionExpiresAt(role: unknown, nowMs: number = Date.now()): string {
  const isAdmin = String(role ?? "").trim().toLowerCase() === "admin";
  return new Date(nowMs + (isAdmin ? SESSION_ABSOLUTE_MS.admin : SESSION_ABSOLUTE_MS.expert)).toISOString();
}

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type SecurityRiskLevel = "low" | "suspicious" | "high_risk";

export type LocationInfo = {
  ip: string;
  country: string | null;
  city: string | null;
  userAgent: string;
  /**
   * FAZ 1 İP-3 — ileriye dönük istemci kanalı (analitik). Yalnız extractLocationFromHeaders
   * doldurur; yoksa createUserSession UA-parse fallback uygular. Kimlik/yetki kanıtı DEĞİLDİR.
   */
  channel?: ClientChannel;
};

type ActiveSession = {
  id: string;
  city: string | null;
  country: string | null;
  last_seen_at: string;
  platform: string | null;
};

type SessionClass = "same_city" | "diff_city" | "diff_country" | "unknown";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function normalizeStr(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function msElapsed(isoDate: string): number {
  return Date.now() - new Date(isoDate).getTime();
}

/**
 * last_seen_at yazımı throttle kararı. Değer yoksa/parse edilemezse güvenli tarafta
 * kalıp yazar (mevcut "her zaman yaz" davranışı korunur); aksi halde yalnız kayıt
 * LAST_SEEN_THROTTLE_MS'den eskiyse yazar.
 */
function shouldRefreshLastSeen(lastSeenAt: unknown): boolean {
  if (typeof lastSeenAt !== "string" || !lastSeenAt) return true;
  const t = Date.parse(lastSeenAt);
  if (Number.isNaN(t)) return true;
  return Date.now() - t >= LAST_SEEN_THROTTLE_MS;
}

function isFreshWith(session: ActiveSession, thresholdMs: number): boolean {
  return msElapsed(session.last_seen_at) < thresholdMs;
}

function isWithinHighRiskWindow(session: ActiveSession): boolean {
  return msElapsed(session.last_seen_at) < HIGH_RISK_THRESHOLD_MS;
}

function classifySession(
  session: ActiveSession,
  newLoc: LocationInfo,
): SessionClass {
  const sc  = normalizeStr(session.city);
  const sco = normalizeStr(session.country);
  const nc  = normalizeStr(newLoc.city);
  const nco = normalizeStr(newLoc.country);

  if (!sc || !nc) return "unknown";
  if (sco && nco && sco !== nco) return "diff_country";
  if (sc !== nc) return "diff_city";
  return "same_city";
}

/**
 * Tarayıcı user-agent dizesinden platform çıkarır.
 */
export function detectPlatform(userAgent: string): string {
  // P3: merkezi sınıflandırıcıyı kullan (Android tablet düzeltmesi + WebView→mobile).
  return classifyDeviceType(userAgent);
}

// ─── Oturum modeli v2 sabitleri (owner kararları — KİLİTLİ) ───────────────────

/** Admin için ONAYLI eşzamanlı web oturumu üst sınırı (resmi Android uygulaması hariç). */
export const ADMIN_WEB_SESSION_CAP = 2;
/** Admin ikinci/riskli web girişi onay bekleme süresi (saniye). */
export const PENDING_APPROVAL_TTL_SECONDS = 10 * 60;
/** Uzman WEB oturumu stale eşiği — yalnız yeni giriş sırasında (normal 15 dk / flexible 60 dk). */
export function expertStaleSeconds(securityMode: string): number {
  return (securityMode === "flexible" ? FLEXIBLE_THRESHOLD_MS : FRESH_THRESHOLD_MS) / 1000;
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Giriş sonrası çağrılır (kimlik + active/approval gating ÇAĞIRANDA yapılmış olmalı).
 *
 * OTURUM MODELİ v2: karar TEK atomik RPC'de (create_session_v2, kullanıcı başına kilit):
 *   - admin resmi Android: en fazla 1 aktif (ikinci → admin_mobile_active; mevcut KORUNUR)
 *   - admin web: aktif web varsa (veya giriş yüksek riskliyse) → pending_approval (10 dk);
 *     onaylı web üst sınırı ADMIN_WEB_SESSION_CAP (dolu → admin_web_limit)
 *   - uzman: users.allowed_* tek kaynak (security_exempt ATLAMAZ); resmi Android mobil sayılır;
 *     15 dk stale temizliği yalnız uzman web oturumlarında; limit dolu → yeni giriş RED
 * Konum/risk motoru artık MEVCUT OTURUM KAPATMAZ; yalnız security_events kaydı + admin için
 * pending sinyali üretir. security_exempt yalnız bu konum/risk değerlendirmesini atlar.
 */
export type CreateSessionResult =
  | {
      ok: true;
      state: "active" | "pending_approval";
      sessionId: string | null;
      pendingExpiresAt: string | null;
      channel: ClientChannel;
      role: "admin" | "expert";
      suspiciousLogin: boolean;
      highRisk: boolean;
      exceptionUsed: boolean;
    }
  | { ok: false; reason: LimitReason; deviceType: string; role: "admin" | "expert" | null };

export type CreateSessionOptions = {
  /** Aynı cihazdaki ÖNCEKİ token (localStorage/pending) — aynı kullanıcıya aitse kapatılır. */
  replaceToken?: string | null;
};

export async function createUserSession(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  sessionToken: string,
  options: CreateSessionOptions = {},
): Promise<CreateSessionResult> {
  const platform = detectPlatform(location.userAgent);
  const clientChannel = location.channel ?? resolveClientChannel(location.userAgent, null);
  const limitPlatform = clientChannel === "android_app" ? "mobile" : platform;

  const { data: lr } = await db
    .from("users")
    .select("role, security_exempt, allowed_locations, security_mode, license_type")
    .eq("id", userId)
    .maybeSingle();

  const roleRaw = String(lr?.role ?? "").trim().toLowerCase();
  const role: "admin" | "expert" | null = roleRaw === "admin" ? "admin" : roleRaw === "expert" ? "expert" : null;
  const securityExempt = lr?.security_exempt === true;
  const allowedLocs = effectiveAllowedLocations(lr?.allowed_locations);
  const rawMode = String(lr?.security_mode ?? "normal");
  const secMode = (["strict", "normal", "flexible"].includes(rawMode) ? rawMode : "normal") as
    "strict" | "normal" | "flexible";

  // ── Konum/risk değerlendirmesi (yalnız sinyal; mevcut oturum KAPATILMAZ) ──
  const risk = securityExempt
    ? { level: "low" as SecurityRiskLevel, refSession: undefined as ActiveSession | undefined }
    : await evaluateLoginRisk(db, userId, location, secMode, allowedLocs);

  const policy = resolveSessionExpiryPolicy();
  const replaceToken = typeof options.replaceToken === "string" && options.replaceToken.trim()
    ? options.replaceToken.trim().slice(0, 200)
    : null;

  const { data: rpcData, error: rpcError } = await db.rpc("create_session_v2", {
    p_user_id: userId,
    p_session_token: sessionToken,
    p_ip: location.ip,
    p_country: location.country,
    p_city: location.city,
    p_user_agent: location.userAgent,
    p_platform: platform,
    p_client_channel: clientChannel,
    p_replace_token: replaceToken,
    p_expires_at: clientChannel === "android_app" ? null : computeSessionExpiresAt(lr?.role),
    p_high_risk: role === "admin" && risk.level === "high_risk",
    p_enforce: policy.enforce,
    p_expert_idle_seconds: policy.expertIdleSeconds,
    p_admin_idle_seconds: policy.adminIdleSeconds,
    p_admin_absolute_seconds: policy.adminAbsoluteSeconds,
    p_expert_stale_seconds: expertStaleSeconds(secMode),
    p_admin_web_cap: ADMIN_WEB_SESSION_CAP,
    p_pending_ttl_seconds: PENDING_APPROVAL_TTL_SECONDS,
  });
  if (rpcError) {
    throw new Error(`Oturum oluşturulamadı: ${rpcError.message}`);
  }

  const result = (rpcData ?? {}) as {
    inserted?: boolean;
    reason?: string;
    state?: string;
    session_id?: string | null;
    pending_expires_at?: string | null;
    exception_used?: boolean;
  };

  if (!result.inserted) {
    const reason = String(result.reason ?? "total_limit");
    if (reason === "inactive" || reason === "no_role") {
      // Çağıran gating'i zaten yaptı; yarışta pasifleşme → genel red (sızıntı yok).
      return { ok: false, reason: "total_forbidden", deviceType: limitPlatform, role };
    }
    const isAdminReason = reason === "admin_mobile_active" || reason === "admin_web_limit";
    await logSecurityEvent(db, userId, location, {
      event_type: reason === "admin_mobile_active" ? "admin_mobile_login_rejected"
        : reason === "admin_web_limit" ? "admin_web_login_rejected_limit"
          : "session_limit_blocked",
      severity: isAdminReason ? "medium" : "low",
      message: `Yeni giriş reddedildi (${reason}) — ${limitPlatform}`,
      metadata: { platform: limitPlatform, channel: clientChannel, reason },
    });
    return { ok: false, reason: reason as LimitReason, deviceType: limitPlatform, role };
  }

  // ── Risk / istisna kayıtları (mevcut oturum KAPATILMAZ) ──────────────────
  if (risk.level !== "low") {
    await logSecurityEvent(db, userId, location, {
      event_type: risk.level === "high_risk" ? "high_risk_login" : "suspicious_login",
      severity: risk.level === "high_risk" ? "high" : "medium",
      message: risk.level === "high_risk"
        ? `Farklı ülkeden hızlı giriş: ${risk.refSession?.country?.toUpperCase() ?? "?"} → ${location.country?.toUpperCase() ?? "?"}`
        : `Farklı şehirden eş zamanlı giriş: ${risk.refSession?.city ?? "?"} → ${location.city ?? "?"}`,
      metadata: {
        platform: limitPlatform,
        previous_city: risk.refSession?.city ?? null,
        previous_country: risk.refSession?.country ?? null,
        new_city: location.city,
        new_country: location.country,
        existing_sessions_closed: 0,
        admin_pending: role === "admin" && result.state === "pending_approval",
      },
    });
  }
  if (result.exception_used === true) {
    // TEMPORARY TEST ACCOUNT EXCEPTION — REMOVE AFTER SALES LAUNCH (görünür iz).
    await logSecurityEvent(db, userId, location, {
      event_type: "session_limit_exception_used",
      severity: "low",
      message: "Geçici test hesabı istisnası: cihaz/oturum limiti uygulanmadı.",
      metadata: { platform: limitPlatform, channel: clientChannel },
    });
  }

  return {
    ok: true,
    state: result.state === "pending_approval" ? "pending_approval" : "active",
    sessionId: typeof result.session_id === "string" ? result.session_id : null,
    pendingExpiresAt: typeof result.pending_expires_at === "string" ? result.pending_expires_at : null,
    channel: clientChannel,
    role: role ?? "expert",
    suspiciousLogin: risk.level === "suspicious",
    highRisk: risk.level === "high_risk",
    exceptionUsed: result.exception_used === true,
  };
}

/** Konum/risk sinyali — salt okuma (+ düşük seviyeli log); HİÇBİR oturumu kapatmaz. */
async function evaluateLoginRisk(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  secMode: "strict" | "normal" | "flexible",
  allowedLocs: number,
): Promise<{ level: SecurityRiskLevel; refSession: ActiveSession | undefined }> {
  const freshThresholdMs = secMode === "flexible" ? FLEXIBLE_THRESHOLD_MS : FRESH_THRESHOLD_MS;
  const { data: rawSessions } = await db
    .from("user_sessions")
    .select("id, city, country, last_seen_at, platform")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false });
  const sessions: ActiveSession[] = (rawSessions ?? []) as ActiveSession[];
  const knownFresh = sessions
    .filter((s) => isFreshWith(s, freshThresholdMs))
    .filter((s) => classifySession(s, location) !== "unknown");

  const diffCity: ActiveSession[] = [];
  const diffCountry: ActiveSession[] = [];
  for (const s of knownFresh) {
    const cls = classifySession(s, location);
    if (cls === "diff_city") diffCity.push(s);
    else if (cls === "diff_country") diffCountry.push(s);
  }

  const keys = new Set<string>();
  if (location.city) keys.add(`${normalizeStr(location.city)}|${normalizeStr(location.country ?? "")}`);
  for (const s of knownFresh) {
    if (s.city) keys.add(`${normalizeStr(s.city)}|${normalizeStr(s.country ?? "")}`);
  }
  const distinctLocs = keys.size;
  if (distinctLocs <= allowedLocs) {
    const activeDiffCountry = diffCountry.filter(isWithinHighRiskWindow);
    if (activeDiffCountry.length > 0) {
      await logSecurityEvent(db, userId, location, {
        event_type: "multi_location_allowed",
        severity: "low",
        message: `İzinli çoklu lokasyon: ${activeDiffCountry[0]?.country?.toUpperCase() ?? "?"} → ${location.country?.toUpperCase() ?? "?"}`,
        metadata: { allowed_locations: allowedLocs, distinct_locations: distinctLocs },
      });
    }
    return { level: "low", refSession: undefined };
  }

  const activeHighRisk = diffCountry.filter(isWithinHighRiskWindow);
  if (activeHighRisk.length > 0) return { level: "high_risk", refSession: activeHighRisk[0] };
  if (diffCity.length > 0 && secMode === "strict") return { level: "high_risk", refSession: diffCity[0] };
  return { level: "low", refSession: undefined };
}

async function logSecurityEvent(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  ev: { event_type: string; severity: "low" | "medium" | "high"; message: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await db.from("security_events").insert({
      user_id: userId,
      event_type: ev.event_type,
      severity: ev.severity,
      message: ev.message,
      ip_address: location.ip,
      country: location.country,
      city: location.city,
      user_agent: location.userAgent,
      metadata: ev.metadata,
    });
  } catch {
    /* güvenlik olayı logu girişi bloklamaz */
  }
}

/** Etkin konum limiti: taban 2 (owner kararı), üst sınır yok (3/999 korunur). */
export function effectiveAllowedLocations(raw: unknown): number {
  const n = Number(raw ?? 2);
  if (!Number.isFinite(n)) return 2;
  return Math.max(2, Math.trunc(n));
}

// ─── Token doğrulama ─────────────────────────────────────────────────────────

/**
 * FAZ1 FINAL HARDENING (PERF-05 kapanışı): token doğrulama + last_seen_at touch TEK noktada.
 *
 * Birincil yol: `touch_active_session` RPC (migration 20270129000200) — tek round-trip, koşullu
 * (throttled, ~90 sn) touch ve YALNIZ enforce açıkken mutlak/idle süre zorlaması. Yazma
 * AWAIT edilir (eski `void db.update(...)` tembel PostgREST builder'ını HİÇ çalıştırmıyordu).
 *
 * Geçiş/yedek yol (yalnız enforce KAPALIYKEN): RPC yoksa/hata verirse eski select + AWAIT'li
 * throttled update. Enforce AÇIKKEN RPC hatası → null (fail-closed; süresi dolmuş oturum
 * yedek yoldan geçemez).
 */
export async function touchActiveSession(
  db: SupabaseClient,
  sessionToken: string,
  policy: SessionExpiryPolicy = resolveSessionExpiryPolicy(),
): Promise<string | null> {
  const token = (sessionToken ?? "").trim();
  if (!token) return null;

  try {
    const { data, error } = await db.rpc("touch_active_session", {
      p_token: token,
      p_touch_after_seconds: policy.touchAfterSeconds,
      p_idle_seconds: policy.expertIdleSeconds,
      p_enforce: policy.enforce,
      p_admin_idle_seconds: policy.adminIdleSeconds,
      p_admin_absolute_seconds: policy.adminAbsoluteSeconds,
    });
    if (!error) {
      return typeof data === "string" && data.length > 0 ? data : null;
    }
  } catch {
    /* aşağıdaki karar */
  }

  if (policy.enforce) return null; // fail-closed
  return legacyTouchActiveSession(db, token);
}

async function legacyTouchActiveSession(
  db: SupabaseClient,
  sessionToken: string,
): Promise<string | null> {
  const { data } = await db
    .from("user_sessions")
    .select("user_id, last_seen_at")
    .eq("session_token", sessionToken)
    .eq("is_active", true)
    .maybeSingle();

  if (!data || data.user_id == null) return null;

  if (shouldRefreshLastSeen(data.last_seen_at)) {
    // AWAIT: PostgREST builder tembeldir; await edilmeyen update İSTEK GÖNDERMEZ.
    // Touch hatası doğrulamayı düşürmez (best-effort), ama istek gerçekten gider.
    try {
      await db
        .from("user_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("session_token", sessionToken)
        .eq("is_active", true);
    } catch {
      /* best-effort */
    }
  }
  return String(data.user_id);
}

export async function validateSessionToken(
  db: SupabaseClient,
  sessionToken: string,
): Promise<boolean> {
  return (await touchActiveSession(db, sessionToken)) !== null;
}

/**
 * Aktif bir oturum token'ının sahibi olan user_id'yi döndürür.
 * Token yoksa / pasifse (veya enforce açıkken süresi dolmuşsa) null döner. Aktivite üzerine
 * last_seen_at tazelenir (throttled, AWAIT'li).
 *
 * verifyUserRequest gibi guard'ların token.user_id === x-user-id bağını
 * kurabilmesi için kullanılır (yalnızca aktif/geçerli olduğunu değil,
 * KİMİN token'ı olduğunu da bilmek gerekir).
 */
export async function getActiveSessionUserId(
  db: SupabaseClient,
  sessionToken: string,
): Promise<string | null> {
  return touchActiveSession(db, sessionToken);
}

/**
 * Kullanıcı çıkışı (FAZ1 FINAL HARDENING): YALNIZ verilen token'ı pasifler
 * (is_active=false, end_reason='user_logout'). İdempotent: zaten pasif/bilinmeyen token → 0.
 * Diğer cihazların oturumlarına DOKUNMAZ.
 */
export async function endUserSession(
  db: SupabaseClient,
  sessionToken: string,
): Promise<number> {
  const token = (sessionToken ?? "").trim();
  if (!token) return 0;
  const { data, error } = await db
    .from("user_sessions")
    .update({ is_active: false, ended_at: new Date().toISOString(), end_reason: "user_logout" })
    .eq("session_token", token)
    .eq("is_active", true)
    .select("id");
  if (error) throw new Error("Oturum kapatılamadı.");
  return Array.isArray(data) ? data.length : 0;
}

// ─── Header'dan konum bilgisi ─────────────────────────────────────────────────

export function extractLocationFromHeaders(headers: Headers): LocationInfo {
  const ip = extractClientIp(headers);

  const country = headers.get("x-vercel-ip-country") ?? null;

  const rawCity = headers.get("x-vercel-ip-city");
  const city    = rawCity ? decodeURIComponent(rawCity) : null;

  const userAgent = headers.get("user-agent") ?? "";
  // İP-3: analitik kanal (android_app vs *_web) — istemci ipucu + UA fallback. Güvenlik DEĞİL.
  const channel = resolveClientChannel(userAgent, headers.get(CLIENT_CHANNEL_HEADER));

  return { ip, country, city, userAgent, channel };
}

/**
 * İstemci IP'si (FAZ1 FINAL HARDENING): Vercel'in ayarladığı başlıklar önceliklidir —
 * `x-real-ip` → `x-vercel-forwarded-for` (ilk değer) → `x-forwarded-for` (ilk değer).
 * Başlık yoksa "unknown". YALNIZ throttle/konum analitiği içindir; kimlik kanıtı DEĞİLDİR.
 */
export function extractClientIp(headers: Headers): string {
  const first = (v: string | null) => (v ?? "").split(",")[0]?.trim() ?? "";
  return (
    first(headers.get("x-real-ip")) ||
    first(headers.get("x-vercel-forwarded-for")) ||
    first(headers.get("x-forwarded-for")) ||
    "unknown"
  );
}
