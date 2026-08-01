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
  transitionConceptRelation,
  CONCEPT_RELATION_STATUS_VALUES,
} from "@/lib/yebs/service/conceptRelationTransitions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/yebs/relations/[id]/transition
 * YEBS D8 (yebs_concept_relations) audit'li lifecycle transition ucu (API-TX / TX-C).
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

  const parsed = parseTransitionBody(body, CONCEPT_RELATION_STATUS_VALUES);
  if (!parsed) return invalidTransitionBody();

  const result = await transitionConceptRelation(
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
