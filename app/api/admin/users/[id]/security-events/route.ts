import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]/security-events
 * Kullanıcının güvenlik olaylarını ve son oturumlarını döndürür.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  const [eventsResult, sessionsResult] = await Promise.all([
    db
      .from("security_events")
      .select("id, event_type, severity, message, ip_address, country, city, user_agent, metadata, created_at, reviewed_by_admin")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("user_sessions")
      .select("id, ip_address, country, city, user_agent, is_active, created_at, last_seen_at, ended_at, end_reason")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    events:   eventsResult.data   ?? [],
    sessions: sessionsResult.data ?? [],
  });
}
