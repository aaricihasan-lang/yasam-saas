import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, getDayScope } from "@/lib/beslenme/planEngine";
import { createDestructiveChallenge } from "@/lib/beslenme/destructiveChallenge";
import { loadDayClearScope } from "@/lib/beslenme/dayClearScope";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; dayId: string }> };

/**
 * POST: "Günü Temizle" AŞAMA 3 kodu. Kapsam sunucuda hesaplanır (öğün + kalem sayıları);
 * boş gün → challenge üretilmez. Kod 5 dk geçerli, tek kullanımlık, kullanıcı+tenant+kapsama bağlı.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId, userId } = guard;
  const { id, dayId } = await ctx.params;
  if (!isUuid(id) || !isUuid(dayId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getDayScope(db, tenantId, dayId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const clear = await loadDayClearScope(db, tenantId, id, dayId);
  if (!clear.ok) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  if (clear.mealIds.length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_CLEAR" }, 409);

  const ch = await createDestructiveChallenge(db, { tenantId, userId, action: "plan_day_clear", scopeKeys: clear.keys });
  if (!ch.ok) return beslenmeJson({ ok: false, code: ch.code }, ch.status);
  return NextResponse.json(
    { ok: true, ...ch.value, meals: clear.mealIds.length, items: clear.itemCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
