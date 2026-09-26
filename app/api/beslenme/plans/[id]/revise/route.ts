import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: yeni revizyon → AYNI AİLE, revision=max+1, draft (verbatim deep copy; §19).
 * Erişim: requireBeslenmePlanAccess (admin | bound-plan uzmanı). Yeni revizyon AYNI family
 * olduğundan mevcut danışan binding'i otomatik korunur (ek bağlama gerekmez).
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { data, error } = await db.rpc("nutrition_plan_revise", { p_tenant_id: tenantId, p_source_plan_id: id });
  if (error) { const m = mapRpcError(error.code); return beslenmeJson({ ok: false, code: m.code }, m.status); }
  return NextResponse.json({ ok: true, plan: data }, { status: 201 });
}
