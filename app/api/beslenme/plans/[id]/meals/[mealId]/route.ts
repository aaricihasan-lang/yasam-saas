import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { MEAL_PATCH_KEYS, MEAL_TYPES, PLAN_MEAL_COLUMNS, isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, getMealScope } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; mealId: string }> };

async function guardEditableMeal(db: import("@supabase/supabase-js").SupabaseClient, tenantId: string, planId: string, mealId: string) {
  const plan = await getPlan(db, tenantId, planId);
  if (!plan) return { ok: false as const, code: "NOT_FOUND", status: 404 };
  if (!isPlanEditable(plan.status)) return { ok: false as const, code: "PLAN_ARCHIVED", status: 403 };
  const scope = await getMealScope(db, tenantId, mealId);
  if (!scope || scope.plan_id !== planId) return { ok: false as const, code: "NOT_FOUND", status: 404 };
  return { ok: true as const, scope };
}

/** PATCH: öğün adı/tip/hedef/not/sıra. Archived → 403. */
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, mealId } = await ctx.params;
  if (!isUuid(id) || !isUuid(mealId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, MEAL_PATCH_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const g = await guardEditableMeal(db, tenantId, id, mealId);
  if (!g.ok) return beslenmeJson({ ok: false, code: g.code }, g.status);

  const patch: Record<string, unknown> = {};
  if ("label" in body) {
    const l = cleanStr(body.label, 120);
    if (!l) return beslenmeJson({ ok: false, code: "LABEL_REQUIRED" }, 400);
    patch.label = l;
  }
  if ("meal_type" in body) {
    if (body.meal_type == null) patch.meal_type = null;
    else if (typeof body.meal_type === "string" && (MEAL_TYPES as readonly string[]).includes(body.meal_type)) patch.meal_type = body.meal_type;
    else return beslenmeJson({ ok: false, code: "BAD_MEAL_TYPE" }, 400);
  }
  if ("energy_target" in body) {
    if (body.energy_target == null) patch.energy_target = null;
    else {
      const v = cleanNumber(body.energy_target, { min: 0.0001, max: 100000 });
      if (v == null) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
      patch.energy_target = v;
    }
  }
  if ("note" in body) patch.note = cleanStr(body.note, 4000);
  if ("sort_order" in body) {
    if (!Number.isInteger(body.sort_order)) return beslenmeJson({ ok: false, code: "BAD_SORT" }, 400);
    patch.sort_order = body.sort_order;
  }
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_UPDATE" }, 400);

  const { data, error } = await db
    .from("nutrition_plan_meals").update(patch).eq("tenant_id", tenantId).eq("id", mealId).eq("plan_id", id)
    .select(PLAN_MEAL_COLUMNS).single();
  if (error) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  return NextResponse.json({ ok: true, meal: data });
}

/** DELETE: öğünü sil (cascade item/nutrient). Archived → 403. */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, mealId } = await ctx.params;
  if (!isUuid(id) || !isUuid(mealId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const g = await guardEditableMeal(db, tenantId, id, mealId);
  if (!g.ok) return beslenmeJson({ ok: false, code: g.code }, g.status);

  const { error } = await db.from("nutrition_plan_meals").delete().eq("tenant_id", tenantId).eq("id", mealId).eq("plan_id", id);
  if (error) return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  return NextResponse.json({ ok: true });
}
