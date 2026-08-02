import { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  UUID_RE,
  parseTransitionBody,
  invalidTransitionId,
  invalidTransitionBody,
} from "@/lib/yebs/service/transitionValidation";
import {
  transitionClaim,
  CLAIM_STATUS_VALUES,
} from "@/lib/yebs/service/claimTransitions";
import { dispatchA7OrMechanical } from "@/lib/yebs/service/a7Gates";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/yebs/claims/[id]/transition
 * YEBS D6 (yebs_claims) audit'li lifecycle transition ucu (API-TX / TX-C).
 * 7-durumlu makine + archive/unarchive; →verified/→approved/→published A7'ye kadar kapalı.
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

  const parsed = parseTransitionBody(body, CLAIM_STATUS_VALUES);
  if (!parsed) return invalidTransitionBody();

  // A7 dispatch: önce kalite/publish/bağımlılık kapısı; A7 kapsamı dışıysa mekanik
  // API-TX servisine (transitionClaim) düşer. Body sözleşmesi değişmez.
  return dispatchA7OrMechanical(
    "claim",
    db,
    adminId,
    id,
    parsed.expectedUpdatedAt,
    parsed.targetStatus,
    parsed.reason,
    transitionClaim,
  );
}
