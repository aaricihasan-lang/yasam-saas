import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { ITEM_INPUT_KEYS, isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, getMealScope, buildItemSnapshot, mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; mealId: string }> };

/**
 * POST: öğüne besin ekle. Client YALNIZ { food_id, grams } veya { food_id, portion_id, quantity }
 * gönderir (+note). SNAPSHOT server-authoritative (buildItemSnapshot; §12). Atomik RPC ile
 * item + nutrient snapshot yazılır. Archived → 403. Ekstra alan (spoof) → 400 UNKNOWN_FIELD.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, mealId } = await ctx.params;
  if (!isUuid(id) || !isUuid(mealId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ITEM_INPUT_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (!isUuid(body.food_id)) return beslenmeJson({ ok: false, code: "BAD_FOOD" }, 400);
  if (body.portion_id != null && !isUuid(body.portion_id)) return beslenmeJson({ ok: false, code: "BAD_PORTION" }, 400);

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getMealScope(db, tenantId, mealId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const snap = await buildItemSnapshot(db, tenantId, {
    foodId: body.food_id as string,
    grams: typeof body.grams === "number" || typeof body.grams === "string" ? Number(body.grams) : null,
    portionId: (body.portion_id as string | null) ?? null,
    quantity: body.quantity == null ? null : Number(body.quantity),
  });
  if (!snap.ok) return beslenmeJson({ ok: false, code: snap.error.code }, snap.error.status);

  const note = cleanStr(body.note, 2000);
  const { data, error } = await db.rpc("nutrition_plan_item_create_or_replace", {
    p_tenant_id: tenantId, p_meal_id: mealId, p_item_id: null,
    p_food_id: snap.value.food_id, p_grams: snap.value.grams, p_quantity: snap.value.quantity,
    p_snapshot: { ...snap.value.snapshot, note },
    p_nutrients: snap.value.nutrients,
  });
  if (error) { const m = mapRpcError(error.code); return beslenmeJson({ ok: false, code: m.code }, m.status); }
  return NextResponse.json({ ok: true, item: { ...data, nutrients: snap.value.nutrients } }, { status: 201 });
}
