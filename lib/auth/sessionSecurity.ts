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

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type SecurityRiskLevel = "low" | "suspicious" | "high_risk";

export type LocationInfo = {
  ip: string;
  country: string | null;
  city: string | null;
  userAgent: string;
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
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|playbook/.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|opera mini|windows phone/.test(ua)) return "mobile";
  return ua ? "desktop" : "unknown";
}

async function insertSession(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  sessionToken: string,
  platform: string,
  now: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    user_id:       userId,
    ip_address:    location.ip,
    country:       location.country,
    city:          location.city,
    user_agent:    location.userAgent,
    platform,
    session_token: sessionToken,
    is_active:     true,
    created_at:    now,
    last_seen_at:  now,
  };

  const { error } = await db.from("user_sessions").insert(payload);

  if (error) {
    if (error.message.includes("platform")) {
      const { platform: _p, ...withoutPlatform } = payload;
      const { error: retryError } = await db.from("user_sessions").insert(withoutPlatform);
      if (retryError) throw new Error(`Oturum kaydedilemedi: ${retryError.message}`);
    } else {
      throw new Error(`Oturum kaydedilemedi: ${error.message}`);
    }
  }
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Giriş sonrası çağrılır. Lisans + platform ayarlarına göre dinamik risk politikası uygular.
 */
export async function createUserSession(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  sessionToken: string,
): Promise<{ suspiciousLogin: boolean; highRisk: boolean }> {
  const now      = new Date().toISOString();
  const platform = detectPlatform(location.userAgent);

  // ── Kullanıcı lisans + platform ayarları ─────────────────────────────────
  const { data: lr } = await db
    .from("users")
    .select("security_exempt, allowed_active_sessions, allowed_locations, security_mode, license_type, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions")
    .eq("id", userId)
    .maybeSingle();

  const securityExempt  = lr?.security_exempt === true;
  const allowedSessions = Math.max(1, Number(lr?.allowed_active_sessions ?? 2));
  const allowedLocs     = Math.max(1, Number(lr?.allowed_locations ?? 1));
  const rawMode         = String(lr?.security_mode ?? "normal");
  const secMode         = (["strict", "normal", "flexible"].includes(rawMode) ? rawMode : "normal") as
    "strict" | "normal" | "flexible";
  const freshThresholdMs = secMode === "flexible" ? FLEXIBLE_THRESHOLD_MS : FRESH_THRESHOLD_MS;

  // Platform limitleri (0 = platform bazlı limit yok, toplam limitle yönetilir)
  const platformLimits: Record<string, number> = {
    desktop: Math.max(0, Number(lr?.allowed_desktop_sessions ?? 1)),
    mobile:  Math.max(0, Number(lr?.allowed_mobile_sessions  ?? 1)),
    tablet:  Math.max(0, Number(lr?.allowed_tablet_sessions  ?? 0)),
    unknown: Math.max(0, Number(lr?.allowed_unknown_sessions ?? 0)),
  };

  // ── Güvenlik muafiyeti ────────────────────────────────────────────────────
  if (securityExempt) {
    await insertSession(db, userId, location, sessionToken, platform, now);
    return { suspiciousLogin: false, highRisk: false };
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

  // ── Bilinmeyen konumlu fresh oturumları kapat ─────────────────────────────
  const unknownLocSessions = freshSessions.filter((s) => classifySession(s, location) === "unknown");
  if (unknownLocSessions.length > 0) {
    await db
      .from("user_sessions")
      .update({ is_active: false, ended_at: now, end_reason: "stale" })
      .in("id", unknownLocSessions.map((s) => s.id));
  }

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
  let riskLevel: SecurityRiskLevel = "low";
  const sessionsToCloseForRisk: string[] = [];

  if (locationLimitExceeded) {
    const activeHighRisk = diffCountrySessions.filter(isWithinHighRiskWindow);
    if (activeHighRisk.length > 0) {
      riskLevel = "high_risk";
      sessionsToCloseForRisk.push(...activeHighRisk.map((s) => s.id));
    }

    if (diffCitySessions.length > 0) {
      if (riskLevel !== "high_risk") {
        riskLevel = secMode === "strict" ? "high_risk" : "suspicious";
      }
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

  // ── Platform bazlı oturum limiti ──────────────────────────────────────────
  // Risk kapatmalarından sonra kalan fresh session'lar
  const closedForRiskIds = new Set(sessionsToCloseForRisk);
  const remainingSessions = knownFreshSessions.filter((s) => !closedForRiskIds.has(s.id));

  const platformLimit = platformLimits[platform] ?? 0;
  let closedForPlatformLimit = false;

  if (platformLimit > 0) {
    // Platform bazlı limit aktif — aynı platformdaki session'ları say
    const samePlatformSessions = remainingSessions
      .filter((s) => (s.platform ?? "desktop") === platform)
      .sort((a, b) => new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime());

    if (samePlatformSessions.length >= platformLimit) {
      const oldest = samePlatformSessions[0];
      if (oldest) {
        await db
          .from("user_sessions")
          .update({ is_active: false, ended_at: now, end_reason: "session_limit" })
          .eq("id", oldest.id);
        closedForPlatformLimit = true;
        // Remaining'den çıkar, toplam limit hesabında hesaba katılmaz
        const idx = remainingSessions.findIndex((s) => s.id === oldest.id);
        if (idx !== -1) remainingSessions.splice(idx, 1);
      }
    }
  }

  // ── Toplam oturum limiti ──────────────────────────────────────────────────
  let closedForTotalLimit = false;
  if (remainingSessions.length >= allowedSessions) {
    const oldest = [...remainingSessions].sort(
      (a, b) => new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime(),
    )[0];
    if (oldest) {
      await db
        .from("user_sessions")
        .update({ is_active: false, ended_at: now, end_reason: "session_limit" })
        .eq("id", oldest.id);
      closedForTotalLimit = true;
    }
  }

  if (closedForPlatformLimit || closedForTotalLimit) {
    await db.from("security_events").insert({
      user_id:    userId,
      event_type: "many_same_city_sessions",
      severity:   "low",
      message: closedForPlatformLimit
        ? `${platform} oturum limiti aşıldı, en eski ${platform} kapatıldı (limit: ${platformLimit})`
        : `Toplam oturum limiti aşıldı, en eski kapatıldı (limit: ${allowedSessions})`,
      ip_address: location.ip,
      country:    location.country,
      city:       location.city,
      user_agent: location.userAgent,
      metadata: {
        platform,
        city:          location.city,
        active_count:  remainingSessions.length + 1,
        platform_limit: platformLimit,
        total_limit:   allowedSessions,
        closed_for_platform: closedForPlatformLimit,
        closed_for_total:    closedForTotalLimit,
      },
    });
  }

  // ── Yeni oturum oluştur ───────────────────────────────────────────────────
  await insertSession(db, userId, location, sessionToken, platform, now);

  return {
    suspiciousLogin: riskLevel === "suspicious",
    highRisk:        riskLevel === "high_risk",
  };
}

// ─── Token doğrulama ─────────────────────────────────────────────────────────

export async function validateSessionToken(
  db: SupabaseClient,
  sessionToken: string,
): Promise<boolean> {
  const { data } = await db
    .from("user_sessions")
    .select("id")
    .eq("session_token", sessionToken)
    .eq("is_active", true)
    .maybeSingle();

  if (data) {
    void db
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("session_token", sessionToken);
  }

  return !!data;
}

/**
 * Aktif bir oturum token'ının sahibi olan user_id'yi döndürür.
 * Token yoksa / pasifse null döner. Aktivite üzerine last_seen_at tazelenir.
 *
 * verifyUserRequest gibi guard'ların token.user_id === x-user-id bağını
 * kurabilmesi için kullanılır (yalnızca aktif/geçerli olduğunu değil,
 * KİMİN token'ı olduğunu da bilmek gerekir).
 */
export async function getActiveSessionUserId(
  db: SupabaseClient,
  sessionToken: string,
): Promise<string | null> {
  const { data } = await db
    .from("user_sessions")
    .select("user_id, last_seen_at")
    .eq("session_token", sessionToken)
    .eq("is_active", true)
    .maybeSingle();

  if (data && shouldRefreshLastSeen(data.last_seen_at)) {
    // Throttle: yalnız kayıt LAST_SEEN_THROTTLE_MS'den eskiyse yaz. Bu read-then-update
    // atomik DEĞİLDİR — eşzamanlı bir istek dalgasında aynı eski değeri okuyup birden
    // fazla UPDATE oluşabilir; bu kabul edilebilir (tek-yazma garantisi atomik koşullu
    // update/RPC gerektirir, PERF-1 kapsamı dışı). Token doğrulaması (is_active) bundan
    // etkilenmez; freshness eşiğine geniş marj korunur.
    void db
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("session_token", sessionToken);
  }

  return data?.user_id != null ? String(data.user_id) : null;
}

// ─── Header'dan konum bilgisi ─────────────────────────────────────────────────

export function extractLocationFromHeaders(headers: Headers): LocationInfo {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown";

  const country = headers.get("x-vercel-ip-country") ?? null;

  const rawCity = headers.get("x-vercel-ip-city");
  const city    = rawCity ? decodeURIComponent(rawCity) : null;

  const userAgent = headers.get("user-agent") ?? "";

  return { ip, country, city, userAgent };
}
