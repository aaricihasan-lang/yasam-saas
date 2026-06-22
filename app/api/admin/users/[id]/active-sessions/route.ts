import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]/active-sessions
 * Desteklenen query parametreleri:
 *   limit   (varsayılan 5, 0 = yalnızca özet döner)
 *   offset  (varsayılan 0)
 *   from    (YYYY-MM-DD)
 *   to      (YYYY-MM-DD)
 *
 * summary her zaman TÜM aktif oturumlar üzerinden hesaplanır (doğruluk için).
 * sessions listesi ise paginated döner.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });

  const sp     = req.nextUrl.searchParams;
  const limit  = Math.min(100, Math.max(0, Number(sp.get("limit")  ?? 5)));
  const offset = Math.max(0,               Number(sp.get("offset") ?? 0));
  const from   = sp.get("from");
  const to     = sp.get("to");

  // Lisans + summary için tüm aktif oturumlar (hafif kolon seti)
  const [allActiveRes, licenseRes] = await Promise.all([
    db.from("user_sessions")
      .select("is_active, last_seen_at, platform, city, country")
      .eq("user_id", id)
      .eq("is_active", true),
    db.from("users")
      .select("allowed_active_sessions, allowed_locations, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions, security_mode, security_exempt, license_type")
      .eq("id", id)
      .maybeSingle(),
  ]);

  const allActive = allActiveRes.data ?? [];
  const license   = licenseRes.data;

  const FRESH_MS = (license?.security_mode === "flexible" ? 60 : 15) * 60 * 1000;
  const now      = Date.now();

  const freshSessions = allActive.filter(
    (s) => now - new Date(String(s.last_seen_at)).getTime() < FRESH_MS,
  );

  const platformCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0, unknown: 0 };
  for (const s of freshSessions) {
    const p = String(s.platform ?? "desktop");
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
  }

  const locKeys = new Set<string>();
  for (const s of freshSessions) {
    const city    = String(s.city    ?? "").trim().toLowerCase();
    const country = String(s.country ?? "").trim().toLowerCase();
    if (city) locKeys.add(`${city}|${country}`);
  }

  const summary = {
    totalActive:       allActive.length,
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
    licenseType:    license?.license_type    ?? "single",
    securityMode:   license?.security_mode   ?? "normal",
    securityExempt: license?.security_exempt ?? false,
  };

  // Sayfalanmış oturum listesi
  let displaySessions: Record<string, unknown>[] = [];
  let sessionsTotal = 0;

  if (limit > 0) {
    let dispQ = db.from("user_sessions")
      .select(
        "id, ip_address, country, city, user_agent, platform, is_active, created_at, last_seen_at, ended_at, end_reason",
        { count: "exact" },
      )
      .eq("user_id", id)
      .order("last_seen_at", { ascending: false });

    if (from) dispQ = dispQ.gte("last_seen_at", `${from}T00:00:00.000Z`);
    if (to)   dispQ = dispQ.lte("last_seen_at", `${to}T23:59:59.999Z`);

    const dispRes = await dispQ.range(offset, offset + limit - 1);
    displaySessions = (dispRes.data ?? []) as Record<string, unknown>[];
    sessionsTotal   = dispRes.count ?? 0;
  } else {
    // Sadece toplam sayıyı döndür
    const countRes = await db.from("user_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", id);
    sessionsTotal = countRes.count ?? 0;
  }

  return NextResponse.json({ sessions: displaySessions, sessionsTotal, summary });
}
