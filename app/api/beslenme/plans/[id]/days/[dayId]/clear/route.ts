import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, getDayScope } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; dayId: string }> };

/** POST: günü temizle — tüm öğünleri (cascade item/nutrient) sil. Gün row'u KALIR (dense). Archived → 403. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, dayId } = await ctx.params;
  if (!isUuid(id) || !isUuid(dayId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getDayScope(db, tenantId, dayId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { error } = await db
    .from("nutrition_plan_meals").delete().eq("tenant_id", tenantId).eq("plan_day_id", dayId);
  if (error) return beslenmeJson({ ok: false, code: "CLEAR_FAILED" }, 500);
  return NextResponse.json({ ok: true });
}
