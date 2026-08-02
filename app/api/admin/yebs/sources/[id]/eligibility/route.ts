import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  UUID_RE,
  invalidTransitionId,
  transitionErrorResponse,
} from "@/lib/yebs/service/transitionValidation";
import { a7Eligibility } from "@/lib/yebs/service/a7Gates";
import { SOURCE_STATUS_VALUES } from "@/lib/yebs/service/sourceTransitions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/yebs/sources/[id]/eligibility?target_status=... (A7 read-only). */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return invalidTransitionId();

  const targetStatus = new URL(req.url).searchParams.get("target_status") ?? "";
  if (!(SOURCE_STATUS_VALUES as readonly string[]).includes(targetStatus)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz hedef durum.", code: "YEBS_INVALID_TARGET_STATUS" },
      { status: 400 },
    );
  }

  const res = await a7Eligibility(db, "source", adminId, id, targetStatus);
  if (!res.ok) return transitionErrorResponse(res.code);
  return NextResponse.json({ ok: true, eligibility: res.eligibility }, { status: 200 });
}
