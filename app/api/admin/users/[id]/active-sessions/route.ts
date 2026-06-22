import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]/active-sessions
 * Kullanıcının aktif + son oturumlarını, platform sayaçlarını ve lisans limitlerini döndürür.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  const [sessionsResult, licenseResult] = await Promise.all([
    db
      .from("user_sessions")
      .select("id, ip_address, country, city, user_agent, platform, is_active, created_at, last_seen_at, ended_at, end_reason")
      .eq("user_id", id)
      .order("last_seen_at", { ascending: false })
      .limit(50),
    db
      .from("users")
      .select("allowed_active_sessions, allowed_locations, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions, security_mode, security_exempt, license_type")
      .eq("id", id)
      .maybeSingle(),
  ]);

  const sessions = sessionsResult.data ?? [];
  const license  = licenseResult.data;

  const FRESH_MS = (license?.security_mode === "flexible" ? 60 : 15) * 60 * 1000;
  const now      = Date.now();

  // Aktif + fresh oturumlar
  const activeSessions = sessions.filter((s) => s.is_active);
  const freshSessions  = activeSessions.filter(
    (s) => now - new Date(String(s.last_seen_at)).getTime() < FRESH_MS,
  );

  // Platform sayaçları
  const platformCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0, unknown: 0 };
  for (const s of freshSessions) {
    const p = String(s.platform ?? "desktop");
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
  }

  // Distinct lokasyon sayısı (city+country benzersiz)
  const locKeys = new Set<string>();
  for (const s of freshSessions) {
    const city    = String(s.city    ?? "").trim().toLowerCase();
    const country = String(s.country ?? "").trim().toLowerCase();
    if (city) locKeys.add(`${city}|${country}`);
  }

  const summary = {
    totalActive:       activeSessions.length,
    totalFresh:        freshSessions.length,
    distinctLocations: locKeys.size,
    byPlatform:        platformCounts,
    limits: {
      allowedActiveSessions:  license?.allowed_active_sessions  ?? 2,
      allowedLocations:       license?.allowed_locations        ?? 1,
      allowedDesktopSessions: license?.allowed_desktop_sessions ?? 1,
      allowedMobileSessions:  license?.allowed_mobile_sessions  ?? 1,
      allowedTabletSessions:  license?.allowed_tablet_sessions  ?? 0,
      allowedUnknownSessions: license?.allowed_unknown_sessions ?? 0,
    },
    licenseType:   license?.license_type   ?? "single",
    securityMode:  license?.security_mode  ?? "normal",
    securityExempt: license?.security_exempt ?? false,
  };

  return NextResponse.json({ sessions, summary });
}
