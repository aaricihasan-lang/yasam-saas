import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * GET /api/clients/[id] — tek danışan kaydı (C2-B1a, salt-okuma).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA alınır; id + tenant_id eşleşmesi zorunlu (IDOR engellenir).
 */
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

  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, client: data });
}
