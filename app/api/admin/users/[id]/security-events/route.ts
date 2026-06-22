import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]/security-events
 * Desteklenen query parametreleri:
 *   limit            (olaylar, varsayılan 5, maks 100)
 *   offset           (olaylar, varsayılan 0)
 *   sessions_limit   (oturumlar, varsayılan 5, maks 100)
 *   sessions_offset  (oturumlar, varsayılan 0)
 *   from             (YYYY-MM-DD)
 *   to               (YYYY-MM-DD)
 *   severity         (high | medium | low)
 *   event_type       (event tipi string filtresi)
 *
 * Her zaman döner: summary { high30d, suspicious30d }
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });

  const sp          = req.nextUrl.searchParams;
  const evLimit     = Math.min(100, Math.max(0, Number(sp.get("limit")           ?? 5)));
  const evOffset    = Math.max(0,               Number(sp.get("offset")          ?? 0));
  const sessLimit   = Math.min(100, Math.max(0, Number(sp.get("sessions_limit")  ?? 5)));
  const sessOffset  = Math.max(0,               Number(sp.get("sessions_offset") ?? 0));
  const from        = sp.get("from");       // YYYY-MM-DD
  const to          = sp.get("to");         // YYYY-MM-DD
  const severity    = sp.get("severity");   // high | medium | low
  const eventType   = sp.get("event_type");

  const cutoff30d   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // ── Olaylar (events) ─────────────────────────────────────────────────────────
  let evQ = db
    .from("security_events")
    .select(
      "id, event_type, severity, message, ip_address, country, city, user_agent, metadata, created_at, reviewed_by_admin",
      { count: "exact" },
    )
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  if (severity)  evQ = evQ.eq("severity",   severity);
  if (eventType) evQ = evQ.eq("event_type", eventType);
  if (from)      evQ = evQ.gte("created_at", `${from}T00:00:00.000Z`);
  if (to)        evQ = evQ.lte("created_at", `${to}T23:59:59.999Z`);

  let eventsData:  Record<string, unknown>[] = [];
  let eventsTotal  = 0;
  if (evLimit > 0) {
    const r = await evQ.range(evOffset, evOffset + evLimit - 1);
    eventsData  = (r.data ?? []) as Record<string, unknown>[];
    eventsTotal = r.count ?? 0;
  } else {
    const r = await evQ.limit(0);
    eventsTotal = r.count ?? 0;
  }

  // ── Oturumlar (sessions) ──────────────────────────────────────────────────────
  let sQ = db
    .from("user_sessions")
    .select(
      "id, ip_address, country, city, user_agent, platform, is_active, created_at, last_seen_at, ended_at, end_reason",
      { count: "exact" },
    )
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  if (from) sQ = sQ.gte("created_at", `${from}T00:00:00.000Z`);
  if (to)   sQ = sQ.lte("created_at", `${to}T23:59:59.999Z`);

  let sessionsData:  Record<string, unknown>[] = [];
  let sessionsTotal  = 0;
  if (sessLimit > 0) {
    const r = await sQ.range(sessOffset, sessOffset + sessLimit - 1);
    sessionsData  = (r.data ?? []) as Record<string, unknown>[];
    sessionsTotal = r.count ?? 0;
  } else {
    const r = await sQ.limit(0);
    sessionsTotal = r.count ?? 0;
  }

  // ── Son 30 gün özeti (badge için, her zaman döner) ────────────────────────────
  const [highRes, medRes] = await Promise.all([
    db.from("security_events").select("*", { count: "exact", head: true })
      .eq("user_id", id).eq("severity", "high").gte("created_at", cutoff30d),
    db.from("security_events").select("*", { count: "exact", head: true })
      .eq("user_id", id).eq("severity", "medium").gte("created_at", cutoff30d),
  ]);

  return NextResponse.json({
    events:       eventsData,
    eventsTotal,
    sessions:     sessionsData,
    sessionsTotal,
    summary: {
      high30d:       highRes.count ?? 0,
      suspicious30d: medRes.count  ?? 0,
    },
  });
}
