import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, getDayScope } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/** POST: bir günün öğünlerini yeniden sırala. body: { dayId, order: [mealId...] }. Archived → 403. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["dayId", "order"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (!isUuid(body.dayId)) return beslenmeJson({ ok: false, code: "BAD_DAY" }, 400);
  const order = body.order;
  if (!Array.isArray(order) || order.length === 0 || order.length > 60 || !order.every((x) => isUuid(x))) {
    return beslenmeJson({ ok: false, code: "BAD_ORDER" }, 400);
  }

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getDayScope(db, tenantId, body.dayId as string);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  // Verilen öğün id'leri bu güne ait olmalı (foreign id fail-closed).
  const { data: meals } = await db
    .from("nutrition_plan_meals").select("id")
    .eq("tenant_id", tenantId).eq("plan_day_id", body.dayId as string);
  const dayMealIds = new Set(((meals as { id: string }[] | null) ?? []).map((m) => m.id));
  const ids = order as string[];
  if (ids.length !== dayMealIds.size || !ids.every((x) => dayMealIds.has(x))) {
    return beslenmeJson({ ok: false, code: "ORDER_MISMATCH" }, 400);
  }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await db
      .from("nutrition_plan_meals").update({ sort_order: i })
      .eq("tenant_id", tenantId).eq("id", ids[i]).eq("plan_day_id", body.dayId as string);
    if (error) return beslenmeJson({ ok: false, code: "REORDER_FAILED" }, 500);
  }
  return NextResponse.json({ ok: true });
}
