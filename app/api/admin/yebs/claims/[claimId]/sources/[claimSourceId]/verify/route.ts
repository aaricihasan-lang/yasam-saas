import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  UUID_RE,
  parseVerificationBody,
  invalidTransitionId,
  invalidTransitionBody,
  transitionErrorResponse,
} from "@/lib/yebs/service/transitionValidation";
import {
  transitionClaimSourceVerification,
  VERIFICATION_STATUS_VALUES,
} from "@/lib/yebs/service/claimSourceVerificationTransitions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ claimId: string; claimSourceId: string }>;
};

/**
 * POST /api/admin/yebs/claims/[claimId]/sources/[claimSourceId]/verify
 *
 * YEBS D7 (yebs_claim_sources) audit'li evidence verification transition ucu (API-TX / TX-V).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Actor YALNIZ guard.adminId'den; id'ler URL'den; request/operation ID server-side.
 *   - Body yalnız {verification_status, expected_updated_at, reason}; fazla/eksik → 400.
 *   - verification_status değişikliği yalnız SECURITY DEFINER RPC üzerinden.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { claimId, claimSourceId } = await ctx.params;
  if (!UUID_RE.test(claimId) || !UUID_RE.test(claimSourceId)) {
    return invalidTransitionId();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidTransitionBody();
  }

  const parsed = parseVerificationBody(body, VERIFICATION_STATUS_VALUES);
  if (!parsed) return invalidTransitionBody();

  const result = await transitionClaimSourceVerification(
    db,
    adminId,
    claimId,
    claimSourceId,
    parsed.expectedUpdatedAt,
    parsed.verificationStatus,
    parsed.reason,
  );

  if (!result.ok) return transitionErrorResponse(result.code);

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}
