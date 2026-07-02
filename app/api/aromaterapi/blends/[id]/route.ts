import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/aromaterapi/blends/[id] — tekil blend silme (FAZ B1).
 * tenant_id DAİMA oturumdan; silme .eq("id").eq("tenant_id") → başka tenant'ın
 * kaydı silinemez (IDOR koruması).
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("aromatherapy_blends")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId) // oturumdan; başka tenant'ın kaydına dokunamaz
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Karışım bulunamadı veya bu hesaba ait değil." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, id });
}
