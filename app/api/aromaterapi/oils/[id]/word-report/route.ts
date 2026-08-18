import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isUuid, docxResponse } from "@/lib/aromaterapi/report/request";
import { buildSingleOilDoc } from "@/lib/aromaterapi/report/builders";

export const runtime = "nodejs";

/**
 * POST /api/aromaterapi/oils/[id]/word-report — tek yağ monografisi (.docx).
 * tenant DAİMA oturumdan (verifyUserRequest); id URL'den, tenant-scoped okunur (IDOR-güvenli).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  const res = await buildSingleOilDoc(db, tenantId, id, { expertName: null, date: new Date() });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return docxResponse(res.buffer, res.filename);
}
