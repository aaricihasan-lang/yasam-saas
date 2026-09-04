import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { ITEM_PATCH_KEYS, ITEM_INPUT_KEYS, PLAN_ITEM_COLUMNS, isUuid } from "@/lib/beslenme/planContracts";
import {
  getPlan, isPlanEditable, getItemScope, getMealScope, buildItemSnapshot, mapRpcError,
} from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; itemId: string }> };

async function loadItemNutrients(db: import("@supabase/supabase-js").SupabaseClient, tenantId: string, itemId: string) {
  const { data } = await db
    .from("nutrition_plan_item_nutrients").select("nutrient_code, amount, unit_code")
    .eq("tenant_id", tenantId).eq("item_id", itemId);
  return ((data as Array<{ nutrient_code: string; amount: number; unit_code: string }> | null) ?? [])
    .map((n) => ({ nutrient_code: n.nutrient_code, amount: Number(n.amount), unit_code: n.unit_code }));
}

/**
 * PATCH: miktar/porsiyon düzenle (frozen nutrient snapshot DEĞİŞMEZ; §13) VEYA başka öğüne taşı
 * (target_meal_id → aynı plan, meal_id UPDATE). Archived → 403.
 */
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, itemId } = await ctx.params;
  if (!isUuid(id) || !isUuid(itemId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ITEM_PATCH_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getItemScope(db, tenantId, itemId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  // ── MOVE (başka öğüne taşı) ──
  if (body.target_meal_id != null) {
    if (!isUuid(body.target_meal_id)) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
    const target = await getMealScope(db, tenantId, body.target_meal_id as string);
    if (!target || target.plan_id !== id) return beslenmeJson({ ok: false, code: "TARGET_NOT_FOUND" }, 404);
    const { data: last } = await db
      .from("nutrition_plan_items").select("sort_order")
      .eq("tenant_id", tenantId).eq("meal_id", target.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextSort = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;
    const { data, error } = await db
      .from("nutrition_plan_items").update({ meal_id: target.id, sort_order: nextSort })
      .eq("tenant_id", tenantId).eq("id", itemId).select(PLAN_ITEM_COLUMNS).single();
    if (error) return beslenmeJson({ ok: false, code: "MOVE_FAILED" }, 500);
    const nutrients = await loadItemNutrients(db, tenantId, itemId);
    return NextResponse.json({ ok: true, item: { ...(data as unknown as Record<string, unknown>), nutrients } });
  }

  // ── AMOUNT / PORTION edit (nutrient snapshot FROZEN) ──
  const { data: item } = await db
    .from("nutrition_plan_items").select("food_id").eq("tenant_id", tenantId).eq("id", itemId).maybeSingle();
  const foodId = (item as { food_id: string | null } | null)?.food_id ?? null;

  const patch: Record<string, unknown> = {};
  if (body.portion_id != null) {
    if (!isUuid(body.portion_id)) return beslenmeJson({ ok: false, code: "BAD_PORTION" }, 400);
    if (!foodId) return beslenmeJson({ ok: false, code: "FOOD_GONE" }, 400);
    const snap = await buildItemSnapshot(db, tenantId, {
      foodId, portionId: body.portion_id as string, quantity: body.quantity == null ? null : Number(body.quantity),
    });
    if (!snap.ok) return beslenmeJson({ ok: false, code: snap.error.code }, snap.error.status);
    patch.grams = snap.value.grams;
    patch.quantity = snap.value.quantity;
    patch.portion_label_snapshot = snap.value.snapshot.portion_label;
    patch.portion_gram_snapshot = snap.value.snapshot.portion_gram;
  } else if (body.grams != null) {
    const g = Number(body.grams);
    if (!Number.isFinite(g) || g <= 0) return beslenmeJson({ ok: false, code: "BAD_GRAMS" }, 400);
    patch.grams = g;
    patch.quantity = null;
    patch.portion_label_snapshot = null;
    patch.portion_gram_snapshot = null;
  }
  if ("note" in body) patch.note = cleanStr(body.note, 2000);
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_UPDATE" }, 400);

  const { data, error } = await db
    .from("nutrition_plan_items").update(patch).eq("tenant_id", tenantId).eq("id", itemId).select(PLAN_ITEM_COLUMNS).single();
  if (error) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  const nutrients = await loadItemNutrients(db, tenantId, itemId);
  return NextResponse.json({ ok: true, item: { ...(data as unknown as Record<string, unknown>), nutrients } });
}

/** PUT: besini değiştir → YENİ snapshot + nutrient set (server food'u yeniden çözer; §34). Archived → 403. */
export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, itemId } = await ctx.params;
  if (!isUuid(id) || !isUuid(itemId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

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
  const scope = await getItemScope(db, tenantId, itemId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const snap = await buildItemSnapshot(db, tenantId, {
    foodId: body.food_id as string,
    grams: body.grams == null ? null : Number(body.grams),
    portionId: (body.portion_id as string | null) ?? null,
    quantity: body.quantity == null ? null : Number(body.quantity),
  });
  if (!snap.ok) return beslenmeJson({ ok: false, code: snap.error.code }, snap.error.status);

  const note = cleanStr(body.note, 2000);
  const { data, error } = await db.rpc("nutrition_plan_item_create_or_replace", {
    p_tenant_id: tenantId, p_meal_id: scope.meal_id, p_item_id: itemId,
    p_food_id: snap.value.food_id, p_grams: snap.value.grams, p_quantity: snap.value.quantity,
    p_snapshot: { ...snap.value.snapshot, note },
    p_nutrients: snap.value.nutrients,
  });
  if (error) { const m = mapRpcError(error.code); return beslenmeJson({ ok: false, code: m.code }, m.status); }
  return NextResponse.json({ ok: true, item: { ...data, nutrients: snap.value.nutrients } });
}

/** DELETE: item sil (cascade nutrient). Archived → 403. */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, itemId } = await ctx.params;
  if (!isUuid(id) || !isUuid(itemId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getItemScope(db, tenantId, itemId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { error } = await db.from("nutrition_plan_items").delete().eq("tenant_id", tenantId).eq("id", itemId);
  if (error) return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  return NextResponse.json({ ok: true });
}
