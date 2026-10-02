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
import { classifyDeviceType, normalizeLimit, UNLIMITED, type LimitReason } from "@/lib/auth/sessionLimits";
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

async function insertSession(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  sessionToken: string,
  platform: string,
  now: string,
  clientChannel: ClientChannel,
): Promise<void> {
  // Zorunlu (şemada her zaman var olan) alanlar.
  const base: Record<string, unknown> = {
    user_id:       userId,
    ip_address:    location.ip,
    country:       location.country,
    city:          location.city,
    user_agent:    location.userAgent,
    session_token: sessionToken,
    is_active:     true,
    created_at:    now,
    last_seen_at:  now,
  };
  // Opsiyonel kolonlar — şemada yoksa (migration uygulanmadan deploy) insert bunları
  // NAME'iyle tanıyıp bırakır (fail-open: oturum yine oluşur). İP-3: client_channel de
  // aynı platform deseniyle geriye-uyumlu ele alınır.
  const optional: Record<string, unknown> = { platform, client_channel: clientChannel };

  const payload = { ...base, ...optional };
  const { error } = await db.from("user_sessions").insert(payload);
  if (!error) return;

  // Şemada eksik olan opsiyonel kolonları hatayı okuyup düşürerek en fazla iki kez dene.
  let attempt: Record<string, unknown> = payload;
  let lastMsg = error.message;
  for (let i = 0; i < Object.keys(optional).length; i++) {
    const dropKey = Object.keys(optional).find(
      (k) => k in attempt && lastMsg.includes(k),
    );
    if (!dropKey) break;
    const rest = { ...attempt };
    delete rest[dropKey];
    attempt = rest;
    const retry = await db.from("user_sessions").insert(attempt);
    if (!retry.error) return;
    lastMsg = retry.error.message;
  }
  throw new Error(`Oturum kaydedilemedi: ${lastMsg}`);
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Giriş sonrası çağrılır. Lisans + platform ayarlarına göre dinamik risk politikası uygular.
 */
export type CreateSessionResult =
  | { ok: true; suspiciousLogin: boolean; highRisk: boolean }
  | { ok: false; reason: LimitReason; deviceType: string };

export async function createUserSession(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  sessionToken: string,
): Promise<CreateSessionResult> {
  const now      = new Date().toISOString();
  const platform = detectPlatform(location.userAgent);
  // İP-3: kanal — extractLocationFromHeaders doldurur; doğrudan çağrılarda UA-parse fallback.
  const clientChannel = location.channel ?? resolveClientChannel(location.userAgent, null);

  // ── Kullanıcı lisans + platform ayarları ─────────────────────────────────
  const { data: lr } = await db
    .from("users")
    .select("role, security_exempt, allowed_active_sessions, allowed_locations, security_mode, license_type, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions")
    .eq("id", userId)
    .maybeSingle();

  const securityExempt  = lr?.security_exempt === true;
  // Owner kararı (FAZ1 final): telefon + bilgisayar NORMAL kullanımdır → etkin konum limiti
  // en az 2 (migration 20270129000200 NULL/1 → 2 yapar; burada da taban 2). 3/999 korunur.
  const allowedLocs     = effectiveAllowedLocations(lr?.allowed_locations);
  const rawMode         = String(lr?.security_mode ?? "normal");
  const secMode         = (["strict", "normal", "flexible"].includes(rawMode) ? rawMode : "normal") as
    "strict" | "normal" | "flexible";
  const freshThresholdMs = secMode === "flexible" ? FLEXIBLE_THRESHOLD_MS : FRESH_THRESHOLD_MS;

  // P3 limit semantiği: -1 SINIRSIZ · 0 YASAK · N max (normalize; default -1).
  const totalLimit = normalizeLimit(lr?.allowed_active_sessions);
  const platformLimitByType: Record<string, number> = {
    desktop: normalizeLimit(lr?.allowed_desktop_sessions),
    mobile:  normalizeLimit(lr?.allowed_mobile_sessions),
    tablet:  normalizeLimit(lr?.allowed_tablet_sessions),
    unknown: normalizeLimit(lr?.allowed_unknown_sessions),
  };

  // ── Güvenlik muafiyeti ────────────────────────────────────────────────────
  if (securityExempt) {
    await insertSession(db, userId, location, sessionToken, platform, now, clientChannel);
    await finalizeNewSession(db, sessionToken, {
      expires_at:     computeSessionExpiresAt(lr?.role),
      client_channel: clientChannel,
    });
    return { ok: true, suspiciousLogin: false, highRisk: false };
  }

  // ── Aktif oturumları çek ──────────────────────────────────────────────────
  const { data: rawSessions } = await db
    .from("user_sessions")
    .select("id, city, country, last_seen_at, platform")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false });

  const sessions: ActiveSession[] = (rawSessions ?? []) as ActiveSession[];

  // ── Stale oturumları kapat (dinamik eşik) ─────────────────────────────────
  const staleSessions = sessions.filter((s) => !isFreshWith(s, freshThresholdMs));
  if (staleSessions.length > 0) {
    await db
      .from("user_sessions")
      .update({ is_active: false, ended_at: now, end_reason: "stale" })
      .in("id", staleSessions.map((s) => s.id));
  }

  const freshSessions = sessions.filter((s) => isFreshWith(s, freshThresholdMs));

  // ── Bilinmeyen konumlu fresh oturumlar ────────────────────────────────────
  // FAZ1 FINAL HARDENING: konum başlığı olmayan (ör. mobil ağ/WebView) TAZE oturumlar artık
  // KAPATILMAZ — telefon + bilgisayar eş zamanlı normal kullanım. Konum sayımına girmezler.

  const knownFreshSessions = freshSessions.filter((s) => classifySession(s, location) !== "unknown");

  // ── Lokasyon sınıflandırması ──────────────────────────────────────────────
  const diffCitySessions:    ActiveSession[] = [];
  const diffCountrySessions: ActiveSession[] = [];

  for (const s of knownFreshSessions) {
    const cls = classifySession(s, location);
    if (cls === "diff_city")    diffCitySessions.push(s);
    else if (cls === "diff_country") diffCountrySessions.push(s);
  }

  // ── Distinct lokasyon sayısı ──────────────────────────────────────────────
  const locationKeys = new Set<string>();
  if (location.city) {
    locationKeys.add(`${normalizeStr(location.city)}|${normalizeStr(location.country ?? "")}`);
  }
  for (const s of knownFreshSessions) {
    if (s.city) {
      locationKeys.add(`${normalizeStr(s.city)}|${normalizeStr(s.country ?? "")}`);
    }
  }
  const distinctLocs          = locationKeys.size;
  const locationLimitExceeded = distinctLocs > allowedLocs;

  // ── Konum riski ───────────────────────────────────────────────────────────
  let riskLevel = "low" as SecurityRiskLevel;
  const sessionsToCloseForRisk: string[] = [];

  if (locationLimitExceeded) {
    const activeHighRisk = diffCountrySessions.filter(isWithinHighRiskWindow);
    if (activeHighRisk.length > 0) {
      riskLevel = "high_risk";
      sessionsToCloseForRisk.push(...activeHighRisk.map((s) => s.id));
    }

    // FAZ1 FINAL HARDENING (owner kararı): aynı ülke içinde farklı şehir (ör. telefon mobil
    // ağda başka şehir IP'si) NORMAL sayılır; yalnız strict modda risk + kapatma uygulanır.
    // Risk esas olarak farklı ülke (yukarıda) ve olağandışı girişlerdir.
    if (diffCitySessions.length > 0 && secMode === "strict") {
      if (riskLevel !== "high_risk") riskLevel = "high_risk";
      sessionsToCloseForRisk.push(...diffCitySessions.map((s) => s.id));
    }

    const staleHighRisk = diffCountrySessions.filter((s) => !isWithinHighRiskWindow(s));
    if (staleHighRisk.length > 0) {
      await db
        .from("user_sessions")
        .update({ is_active: false, ended_at: now, end_reason: "stale" })
        .in("id", staleHighRisk.map((s) => s.id));
    }

    if (sessionsToCloseForRisk.length > 0) {
      await db
        .from("user_sessions")
        .update({ is_active: false, ended_at: now, end_reason: "new_login" })
        .in("id", sessionsToCloseForRisk);
    }
  } else {
    // Limit içinde — pencere dışı diff_country stale kapat
    const staleHighRisk = diffCountrySessions.filter((s) => !isWithinHighRiskWindow(s));
    if (staleHighRisk.length > 0) {
      await db
        .from("user_sessions")
        .update({ is_active: false, ended_at: now, end_reason: "stale" })
        .in("id", staleHighRisk.map((s) => s.id));
    }

    // Aktif diff_country + limit içinde → isteğe bağlı düşük seviyeli log
    const activeDiffCountry = diffCountrySessions.filter(isWithinHighRiskWindow);
    if (activeDiffCountry.length > 0) {
      await db.from("security_events").insert({
        user_id:    userId,
        event_type: "multi_location_allowed",
        severity:   "low",
        message:    `İzinli çoklu lokasyon: ${activeDiffCountry[0]?.country?.toUpperCase() ?? "?"} → ${location.country?.toUpperCase() ?? "?"}`,
        ip_address: location.ip,
        country:    location.country,
        city:       location.city,
        user_agent: location.userAgent,
        metadata: {
          platform,
          license_type:       lr?.license_type ?? "single",
          allowed_locations:  allowedLocs,
          distinct_locations: distinctLocs,
        },
      });
    }
  }

  // ── Risk olayı logu ───────────────────────────────────────────────────────
  if (riskLevel !== "low") {
    const refSession =
      riskLevel === "high_risk"
        ? (diffCountrySessions.find(isWithinHighRiskWindow) ?? diffCountrySessions[0])
        : diffCitySessions[0];

    await db.from("security_events").insert({
      user_id:    userId,
      event_type: riskLevel === "high_risk" ? "high_risk_login" : "suspicious_login",
      severity:   riskLevel === "high_risk" ? "high" : "medium",
      message:
        riskLevel === "high_risk"
          ? `Farklı ülkeden hızlı giriş: ${refSession?.country?.toUpperCase() ?? "?"} → ${location.country?.toUpperCase() ?? "?"}`
          : `Farklı şehirden eş zamanlı giriş: ${refSession?.city ?? "?"} → ${location.city ?? "?"}`,
      ip_address: location.ip,
      country:    location.country,
      city:       location.city,
      user_agent: location.userAgent,
      metadata: {
        platform,
        previous_city:     refSession?.city    ?? null,
        previous_country:  refSession?.country ?? null,
        new_city:          location.city,
        new_country:       location.country,
        conflicting_count: sessionsToCloseForRisk.length,
      },
    });
  }

  // ── Platform + toplam limit: REJECT-NEW (atomik, race-safe) ───────────────
  // Risk/stale kapatmalar yukarıda yapıldı. Yeni oturumu, aktif sayımı advisory
  // lock altında yeniden yapan RPC ile ATOMİK oluştururuz: limit aşımında INSERT
  // ETMEZ ve MEVCUT oturumlara DOKUNMAZ; yalnız reddeder (P3 reject-new).
  const platformLimit = platformLimitByType[platform] ?? UNLIMITED;

  const { data: rpcData, error: rpcError } = await db.rpc("create_session_within_limits", {
    p_user_id:        userId,
    p_session_token:  sessionToken,
    p_ip:             location.ip,
    p_country:        location.country,
    p_city:           location.city,
    p_user_agent:     location.userAgent,
    p_platform:       platform,
    p_platform_limit: platformLimit,
    p_total_limit:    totalLimit,
  });
  if (rpcError) {
    throw new Error(`Oturum oluşturulamadı: ${rpcError.message}`);
  }

  const result = (rpcData ?? {}) as { inserted?: boolean; reason?: string };
  if (!result.inserted) {
    const reason = (result.reason ?? "total_limit") as LimitReason;
    // Gözlemlenebilirlik için düşük seviyeli log (best-effort; PII/secret yok).
    try {
      await db.from("security_events").insert({
        user_id:    userId,
        event_type: "session_limit_blocked",
        severity:   "low",
        message:    `Yeni giriş reddedildi (${reason}) — ${platform}`,
        ip_address: location.ip,
        country:    location.country,
        city:       location.city,
        user_agent: location.userAgent,
        metadata:   { platform, reason, platform_limit: platformLimit, total_limit: totalLimit },
      });
    } catch {
      /* log başarısızlığı yeni girişi bloke etmez */
    }
    return { ok: false, reason, deviceType: platform };
  }

  // FAZ1 FINAL HARDENING: create_session_within_limits RPC'si expires_at/client_channel yazmaz →
  // aynı token satırına best-effort tamamlayıcı UPDATE (AWAIT edilir). Kolon henüz yoksa
  // (migration 20270129000200 uygulanmadan deploy) kolon varsayılanı/NULL kalır; giriş ETKİLENMEZ.
  await finalizeNewSession(db, sessionToken, {
    expires_at:     computeSessionExpiresAt(lr?.role),
    client_channel: clientChannel,
  });

  return {
    ok: true,
    suspiciousLogin: riskLevel === "suspicious",
    highRisk:        riskLevel === "high_risk",
  };
}

/** Etkin konum limiti: taban 2 (owner kararı), üst sınır yok (3/999 korunur). */
export function effectiveAllowedLocations(raw: unknown): number {
  const n = Number(raw ?? 2);
  if (!Number.isFinite(n)) return 2;
  return Math.max(2, Math.trunc(n));
}

async function finalizeNewSession(
  db: SupabaseClient,
  sessionToken: string,
  fields: { expires_at: string; client_channel: ClientChannel },
): Promise<void> {
  let attempt: Record<string, unknown> = { ...fields };
  for (let i = 0; i < 3 && Object.keys(attempt).length > 0; i++) {
    try {
      const { error } = await db
        .from("user_sessions")
        .update(attempt)
        .eq("session_token", sessionToken);
      if (!error) return;
      const dropKey = Object.keys(attempt).find((k) => error.message?.includes(k));
      if (!dropKey) return;
      const rest = { ...attempt };
      delete rest[dropKey];
      attempt = rest;
    } catch {
      return; // best-effort: oturum zaten oluştu
    }
  }
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
