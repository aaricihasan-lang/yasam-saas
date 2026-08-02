import { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  UUID_RE,
  parseTransitionBody,
  invalidTransitionId,
  invalidTransitionBody,
} from "@/lib/yebs/service/transitionValidation";
import {
  transitionConcept,
  CONCEPT_STATUS_VALUES,
} from "@/lib/yebs/service/conceptTransitions";
import { dispatchA7OrMechanical } from "@/lib/yebs/service/a7Gates";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/yebs/concepts/[id]/transition
 * YEBS D3 (yebs_concepts) audit'li lifecycle transition ucu (API-TX / TX-C).
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

  const parsed = parseTransitionBody(body, CONCEPT_STATUS_VALUES);
  if (!parsed) return invalidTransitionBody();

  return dispatchA7OrMechanical(
    "concept",
    db,
    adminId,
    id,
    parsed.expectedUpdatedAt,
    parsed.targetStatus,
    parsed.reason,
    transitionConcept,
  );
}
