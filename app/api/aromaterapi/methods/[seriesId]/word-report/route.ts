import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isUuid, docxResponse } from "@/lib/aromaterapi/report/request";
import { buildMethodsDoc } from "@/lib/aromaterapi/report/builders";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ seriesId: string }> }): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const params = await ctx.params;
  const id = (params.seriesId ?? "").trim();
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const res = await buildMethodsDoc(db, tenantId, { mode: "selected", ids: [id] }, { expertName: null, date: new Date() });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return docxResponse(res.buffer, res.filename);
}
