import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * GET /api/appointments — uzmanın randevu listesi (C2-B1a, salt-okuma).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA alınır; request'ten GÜVENİLMEZ. Sorgu tenant_id ile .eq.
 *
 * Query (opsiyonel): from / to (appointment_date ISO aralığı), client_id (tenant içi),
 *                    order (asc|desc, varsayılan asc).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const url = new URL(req.url);

  const from = url.searchParams.get("from")?.trim() || null;
  const to = url.searchParams.get("to")?.trim() || null;
  const clientId = url.searchParams.get("client_id")?.trim() || null;
  const ascending = url.searchParams.get("order") !== "desc";

  let query = db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("appointment_date", { ascending });

  if (clientId) query = query.eq("client_id", clientId);
  if (from) query = query.gte("appointment_date", from);
  if (to) query = query.lte("appointment_date", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, appointments: data ?? [] });
}
