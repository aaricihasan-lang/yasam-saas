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
  transitionRelationSourceVerification,
  RELATION_SOURCE_VERIFICATION_STATUS_VALUES,
} from "@/lib/yebs/service/conceptRelationSourceVerificationTransitions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ relationId: string; relationSourceId: string }>;
};

/**
 * POST /api/admin/yebs/relations/[relationId]/sources/[relationSourceId]/verify
 *
 * YEBS D9 (yebs_concept_relation_sources) audit'li evidence verification transition
 * ucu (API-TX / TX-V). Claim Source ile AYRI RPC (evidence_layer farkı korunur).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { relationId, relationSourceId } = await ctx.params;
  if (!UUID_RE.test(relationId) || !UUID_RE.test(relationSourceId)) {
    return invalidTransitionId();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidTransitionBody();
  }

  const parsed = parseVerificationBody(body, RELATION_SOURCE_VERIFICATION_STATUS_VALUES);
  if (!parsed) return invalidTransitionBody();

  const result = await transitionRelationSourceVerification(
    db,
    adminId,
    relationId,
    relationSourceId,
    parsed.expectedUpdatedAt,
    parsed.verificationStatus,
    parsed.reason,
  );

  if (!result.ok) return transitionErrorResponse(result.code);

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}
