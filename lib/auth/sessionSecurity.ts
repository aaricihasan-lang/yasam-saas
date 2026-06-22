/**
 * Hesap güvenliği — kullanıcı oturumu oluşturma, konum risk değerlendirmesi,
 * güvenlik olayı kaydetme ve oturum doğrulama.
 *
 * Yalnızca server-side (API route) kullanımı içindir.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SecurityRiskLevel = "low" | "suspicious" | "high_risk";

type LastSession = {
  city: string | null;
  country: string | null;
  created_at: string;
};

export type LocationInfo = {
  ip: string;
  country: string | null;
  city: string | null;
  userAgent: string;
};

type RiskAssessment = {
  level: SecurityRiskLevel;
  eventType: string;
  severity: "low" | "medium" | "high";
  message: string;
};

function minutesBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoB).getTime() - new Date(isoA).getTime()) / 60_000;
}

function normalizeStr(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function assessRisk(last: LastSession | null, next: LocationInfo): RiskAssessment {
  if (!last) {
    return { level: "low", eventType: "new_login", severity: "low", message: "İlk giriş." };
  }

  const lastCity    = normalizeStr(last.city);
  const lastCountry = normalizeStr(last.country);
  const newCity     = normalizeStr(next.city);
  const newCountry  = normalizeStr(next.country);

  // Bilinmeyen konum veya aynı şehir → düşük risk
  if (!lastCity || !newCity || lastCity === newCity) {
    return { level: "low", eventType: "new_login", severity: "low", message: "Aynı konumdan giriş." };
  }

  const mins = minutesBetween(last.created_at, new Date().toISOString());

  // 10 saat ve üzeri → makul seyahat süresi
  if (mins >= 600) {
    return { level: "low", eventType: "new_login", severity: "low", message: "Farklı konum, yeterli süre geçmiş." };
  }

  // Farklı ülke ve 6 saatten az → yüksek risk
  if (lastCountry && newCountry && lastCountry !== newCountry && mins < 360) {
    return {
      level: "high_risk",
      eventType: "high_risk_login",
      severity: "high",
      message: `Farklı ülkeden hızlı giriş: ${last.country?.toUpperCase()} → ${next.country?.toUpperCase()} (${Math.round(mins)} dk içinde)`,
    };
  }

  // Farklı şehir ve 60 dakikadan az → şüpheli
  if (mins < 60) {
    return {
      level: "suspicious",
      eventType: "suspicious_login",
      severity: "medium",
      message: `Farklı şehirden hızlı giriş: ${last.city} → ${next.city} (${Math.round(mins)} dk içinde)`,
    };
  }

  return { level: "low", eventType: "new_login", severity: "low", message: "Farklı şehir, makul süre." };
}

/**
 * Giriş sonrası çağrılır.
 * - Mevcut aktif oturumları kapatır (end_reason = "new_login")
 * - Yeni oturum kaydı oluşturur
 * - Risk değerlendirip gerekirse security_event ekler
 */
export async function createUserSession(
  db: SupabaseClient,
  userId: string,
  location: LocationInfo,
  sessionToken: string,
): Promise<{ suspiciousLogin: boolean; highRisk: boolean }> {
  // Son aktif oturumu risk değerlendirmesi için al
  const { data: lastSession } = await db
    .from("user_sessions")
    .select("city, country, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Eski aktif oturumları kapat
  await db
    .from("user_sessions")
    .update({
      is_active:  false,
      ended_at:   new Date().toISOString(),
      end_reason: "new_login",
    })
    .eq("user_id", userId)
    .eq("is_active", true);

  // Yeni oturum kaydı
  await db.from("user_sessions").insert({
    user_id:       userId,
    ip_address:    location.ip,
    country:       location.country,
    city:          location.city,
    user_agent:    location.userAgent,
    session_token: sessionToken,
    is_active:     true,
    created_at:    new Date().toISOString(),
    last_seen_at:  new Date().toISOString(),
  });

  const risk = assessRisk(lastSession, location);

  // Düşük risk değilse güvenlik olayı kaydet
  if (risk.level !== "low") {
    await db.from("security_events").insert({
      user_id:    userId,
      event_type: risk.eventType,
      severity:   risk.severity,
      message:    risk.message,
      ip_address: location.ip,
      country:    location.country,
      city:       location.city,
      user_agent: location.userAgent,
      metadata: {
        previous_city:    lastSession?.city    ?? null,
        previous_country: lastSession?.country ?? null,
        new_city:         location.city,
        new_country:      location.country,
        minutes_elapsed:  lastSession
          ? Math.round(minutesBetween(lastSession.created_at, new Date().toISOString()))
          : null,
      },
    });
  }

  return {
    suspiciousLogin: risk.level === "suspicious",
    highRisk:        risk.level === "high_risk",
  };
}

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
