import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  UUID_RE,
  parseTransitionBody,
  invalidTransitionId,
  invalidTransitionBody,
  transitionErrorResponse,
} from "@/lib/yebs/service/transitionValidation";
import {
  transitionTradition,
  TRADITION_STATUS_VALUES,
} from "@/lib/yebs/service/traditionTransitions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/yebs/traditions/[id]/transition
 *
 * YEBS D1 (yebs_traditions) audit'li lifecycle transition ucu (API-TX / TX-C).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Actor YALNIZ guard.adminId'den; id URL'den; request/operation ID server-side.
 *   - Body yalnız {target_status, expected_updated_at, reason}; fazla/eksik anahtar → 400.
 *   - status değişikliği yalnız SECURITY DEFINER RPC üzerinden (doğrudan write YOK).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return invalidTransitionId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidTransitionBody();
  }

  const parsed = parseTransitionBody(body, TRADITION_STATUS_VALUES);
  if (!parsed) return invalidTransitionBody();

  const result = await transitionTradition(
    db,
    adminId,
    id,
    parsed.expectedUpdatedAt,
    parsed.targetStatus,
    parsed.reason,
  );

  if (!result.ok) return transitionErrorResponse(result.code);

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}
