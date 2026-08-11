import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { archiveConsultation } from "@/lib/human-design/consultation/admin/consultationAdminService";
import {
  httpStatusForConsultationError,
  messageForConsultationError,
} from "@/lib/human-design/consultation/admin/consultationErrorHttp";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;
type RouteContext = { params: Promise<{ id: string }> };

/** POST: rpc_hd_consultation_archive — soft archive (hard delete YOK). */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });

  const r = await archiveConsultation(guard.db, guard.adminId, id);
  if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
  return NextResponse.json({ ok: true, id: r.data.id }, { headers: NO_STORE });
}
