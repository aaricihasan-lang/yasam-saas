import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { MEAL_CREATE_KEYS, MEAL_TYPES, PLAN_MEAL_COLUMNS, isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, getDayScope } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; dayId: string }> };

/** POST: güne öğün ekle (özel öğün: meal_type=null + label). Archived → 403. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, dayId } = await ctx.params;
  if (!isUuid(id) || !isUuid(dayId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, MEAL_CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getDayScope(db, tenantId, dayId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const label = cleanStr(body.label, 120);
  if (!label) return beslenmeJson({ ok: false, code: "LABEL_REQUIRED" }, 400);
  let mealType: string | null = null;
  if (body.meal_type != null) {
    if (typeof body.meal_type !== "string" || !(MEAL_TYPES as readonly string[]).includes(body.meal_type)) {
      return beslenmeJson({ ok: false, code: "BAD_MEAL_TYPE" }, 400);
    }
    mealType = body.meal_type;
  }
  let energyTarget: number | null = null;
  if (body.energy_target != null) {
    energyTarget = cleanNumber(body.energy_target, { min: 0.0001, max: 100000 });
    if (energyTarget == null) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
  }

  let sortOrder: number;
  if (Number.isInteger(body.sort_order)) sortOrder = body.sort_order as number;
  else {
    const { data: last } = await db
      .from("nutrition_plan_meals").select("sort_order")
      .eq("tenant_id", tenantId).eq("plan_day_id", dayId)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;
  }

  const { data, error } = await db
    .from("nutrition_plan_meals")
    .insert({
      tenant_id: tenantId, plan_id: id, plan_day_id: dayId,
      meal_type: mealType, label, sort_order: sortOrder, energy_target: energyTarget,
      note: cleanStr(body.note, 4000),
    })
    .select(PLAN_MEAL_COLUMNS).single();
  if (error) return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  return NextResponse.json({ ok: true, meal: { ...data, items: [] } }, { status: 201 });
}
