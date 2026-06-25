import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/clients/[id]/appointments — bir danışanın randevuları (C2-B1a, salt-okuma).
 *
 * Güvenlik:
 *   - verifyUserRequest → binding. tenant_id SUNUCUDA.
 *   - Önce client_id'nin bu tenant'a ait olduğu doğrulanır (IDOR engellenir).
 *   - Sorgu tenant_id + client_id ile filtrelenir.
 */
async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("appointment_date", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, appointments: data ?? [] });
}
