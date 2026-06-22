/**
 * Hesap güvenliği — çok cihaz politikası, konum tabanlı risk motoru,
 * oturum doğrulama.
 *
 * Yalnızca server-side (API route) kullanımı içindir.
 *
 * Politika özeti:
 *   - Aynı şehir ≤2 eş zamanlı oturum → izin ver
 *   - Aynı şehir 3. oturum → en eskiyi kapat, düşük öncelikli log
 *   - Farklı şehir + her iki taraf da son 15 dk aktif → suspicious_login + eski kapat
 *   - Farklı ülke + eski oturum son 6 saat içinde aktif → high_risk_login + eski kapat
 *   - Son 15 dk'dan eski oturum (stale) → sessizce kapat, uyarı yok
 *   - Konum bilinmiyorsa → sessizce kapat, risk değerlendirmesi yok
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Eşikler ─────────────────────────────────────────────────────────────────

const FRESH_THRESHOLD_MS     = 15 * 60 * 1000;   // 15 dakika
const HIGH_RISK_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 saat
const MAX_SAME_CITY_SESSIONS = 2;

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
};

type SessionClass = "same_city" | "diff_city" | "diff_country" | "unknown";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function normalizeStr(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function msElapsed(isoDate: string): number {
  return Date.now() - new Date(isoDate).getTime();
}

function isFresh(session: ActiveSession): boolean {
  return msElapsed(session.last_seen_at) < FRESH_THRESHOLD_MS;
}

function isWithinHighRiskWindow(session: ActiveSession): boolean {
  return msElapsed(session.last_seen_at) < HIGH_RISK_THRESHOLD_MS;
}

function classifySession(
  session: ActiveSession,
  newLoc: LocationInfo,
): SessionClass {
  const sc = normalizeStr(session.city);
  const sco = normalizeStr(session.country);
  const nc = normalizeStr(newLoc.city);
  const nco = normalizeStr(newLoc.country);

  // Herhangi bir tarafın şehri bilinmiyorsa karşılaştırma yapılamaz
  if (!sc || !nc) return "unknown";

  if (sco && nco && sco !== nco) return "diff_country";
  if (sc !== nc) return "diff_city";
  return "same_city";
}

/**
 * Tarayıcı user-agent dizesinden platform çıkarır.
 * Basit heruistik — kesin değil, yeterli.
 */
export function detectPlatform(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|playbook/.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|opera mini|windows phone/.test(ua)) return "mobile";
  return ua ? "desktop" : "unknown";
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Giriş sonrası çağrılır. Yeni politikayla:
 * - Stale oturumlar sessizce kapatılır
 * - Aynı şehir oturumları korunur (≤2)
 * - Farklı şehir/ülke için risk seviyesine göre eski oturum kapatılır ve event oluşturulur
 */
export async function createUserSession(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  sessionToken: string,
): Promise<{ suspiciousLogin: boolean; highRisk: boolean }> {
  const now = new Date().toISOString();
  const platform = detectPlatform(location.userAgent);

  // ── Tüm aktif oturumları çek ────────────────────────────────────────────────
  const { data: rawSessions } = await db
    .from("user_sessions")
    .select("id, city, country, last_seen_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false });

  const sessions: ActiveSession[] = (rawSessions ?? []) as ActiveSession[];

  // ── Stale (≥15 dk) oturumları sessizce kapat ─────────────────────────────
  const staleSessions = sessions.filter((s) => !isFresh(s));
  if (staleSessions.length > 0) {
    await db
      .from("user_sessions")
      .update({ is_active: false, ended_at: now, end_reason: "stale" })
      .in("id", staleSessions.map((s) => s.id));
  }

  // ── Fresh oturumları sınıflandır ─────────────────────────────────────────
  const freshSessions = sessions.filter(isFresh);

  const sameCitySessions: ActiveSession[]   = [];
  const diffCitySessions: ActiveSession[]   = [];
  const diffCountrySessions: ActiveSession[] = [];
  const unknownSessions: ActiveSession[]     = [];

  for (const s of freshSessions) {
    const cls = classifySession(s, location);
    if (cls === "same_city")    sameCitySessions.push(s);
    else if (cls === "diff_city")    diffCitySessions.push(s);
    else if (cls === "diff_country") diffCountrySessions.push(s);
    else                             unknownSessions.push(s);
  }

  // ── Bilinmeyen konumlu fresh oturumları sessizce kapat ───────────────────
  if (unknownSessions.length > 0) {
    await db
      .from("user_sessions")
      .update({ is_active: false, ended_at: now, end_reason: "stale" })
      .in("id", unknownSessions.map((s) => s.id));
  }

  // ── Risk değerlendirmesi ─────────────────────────────────────────────────
  //
  // Öncelik: diff_country > diff_city > same_city_limit
  // Aynı girişte hem farklı ülke hem farklı şehir session varsa → high_risk.

  let riskLevel: SecurityRiskLevel = "low";
  const sessionsToCloseForRisk: string[] = [];

  // Farklı ülke — 6 saat penceresi (high_risk_window)
  const activeHighRisk = diffCountrySessions.filter(isWithinHighRiskWindow);
  if (activeHighRisk.length > 0) {
    riskLevel = "high_risk";
    sessionsToCloseForRisk.push(...activeHighRisk.map((s) => s.id));
  }

  // Farklı şehir + fresh (her iki taraf son 15 dk'da aktif)
  if (diffCitySessions.length > 0) {
    // diffCitySessions zaten freshSessions'dan geldiği için tamamı fresh
    if (riskLevel !== "high_risk") riskLevel = "suspicious";
    sessionsToCloseForRisk.push(...diffCitySessions.map((s) => s.id));
  }

  // Eski yüksek riskli session var ama pencere dışında → sessizce kapat
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

  // ── Aynı şehir maks-2 politikası ────────────────────────────────────────
  let closedForLimit = false;
  if (sameCitySessions.length >= MAX_SAME_CITY_SESSIONS) {
    // En eski (en düşük last_seen_at) oturumu kapat
    const oldest = [...sameCitySessions].sort(
      (a, b) => new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime(),
    )[0];
    await db
      .from("user_sessions")
      .update({ is_active: false, ended_at: now, end_reason: "session_limit" })
      .eq("id", oldest.id);
    closedForLimit = true;
  }

  // ── Güvenlik olayları ────────────────────────────────────────────────────
  if (riskLevel !== "low") {
    const refSession =
      riskLevel === "high_risk"
        ? (activeHighRisk[0] ?? diffCountrySessions[0])
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
        previous_city:      refSession?.city    ?? null,
        previous_country:   refSession?.country ?? null,
        new_city:           location.city,
        new_country:        location.country,
        conflicting_count:  sessionsToCloseForRisk.length,
      },
    });
  }

  if (closedForLimit) {
    await db.from("security_events").insert({
      user_id:    userId,
      event_type: "many_same_city_sessions",
      severity:   "low",
      message:    `Aynı şehirde çok oturum kapatıldı: ${location.city ?? "bilinmeyen"}`,
      ip_address: location.ip,
      country:    location.country,
      city:       location.city,
      user_agent: location.userAgent,
      metadata:   { platform, city: location.city, active_count: sameCitySessions.length + 1 },
    });
  }

  // ── Yeni oturum oluştur ──────────────────────────────────────────────────
  const sessionPayload: Record<string, unknown> = {
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

  const { error: insertError } = await db.from("user_sessions").insert(sessionPayload);

  if (insertError) {
    // Migration henüz uygulanmamışsa platform kolonu olmadan tekrar dene
    if (insertError.message.includes("platform")) {
      const { platform: _p, ...payloadWithoutPlatform } = sessionPayload;
      const { error: retryError } = await db.from("user_sessions").insert(payloadWithoutPlatform);
      if (retryError) throw new Error(`Oturum kaydedilemedi: ${retryError.message}`);
    } else {
      throw new Error(`Oturum kaydedilemedi: ${insertError.message}`);
    }
  }

  return {
    suspiciousLogin: riskLevel === "suspicious",
    highRisk:        riskLevel === "high_risk",
  };
}

// ─── Token doğrulama ─────────────────────────────────────────────────────────

/**
 * Oturum token'ının hâlâ aktif olup olmadığını kontrol eder.
 * Geçerliyse last_seen_at güncellenir.
 */
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

// ─── Header'dan konum bilgisi ─────────────────────────────────────────────────

/**
 * NextRequest header'larından konum bilgisi çıkarır.
 * Vercel ortamında x-vercel-ip-* header'ları otomatik eklenir.
 */
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
