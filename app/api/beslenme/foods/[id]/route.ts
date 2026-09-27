import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule, requireBeslenmeFoodRead, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import {
  FOOD_COLUMNS,
  FOOD_SOURCE_COLUMNS,
  SOURCE_COLUMNS,
  FOOD_TRADITIONAL_COLUMNS,
  cleanStr,
  cleanStringArray,
  inEnum,
  isUuid,
  hasOnlyKeys,
  PREP_STATES,
} from "@/lib/beslenme/contracts";
import {
  resolveFoodForRead,
  resolveFoodForWrite,
  resolveEffectiveFood,
  mapFoodRpcError,
  listFoodTopicUsage,
} from "@/lib/beslenme/foodEngine";
import { SYSTEM_NUTRITION_TENANT_ID, isSystemNutritionTenant } from "@/lib/beslenme/systemTenant";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

// is_active YOK: Beslenme'de kullanıcıya yönelik arşiv kaldırıldı (yeni arşiv durumu üretilmez).
const UPDATE_KEYS = [
  "name_tr",
  "name_en",
  "aliases",
  "food_group_id",
  "prep_state",
  "description",
  "notes",
  "sort_order",
] as const;

/**
 * GET: EFFECTIVE besin detayı + besin değerleri + porsiyonlar + geleneksel + kaynaklar.
 * Sistem besininin uzmana ait kişisel kopyası varsa KOPYA döner (food.id = kopya id).
 */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeFoodRead(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const food = (await resolveFoodForRead(db, tenantId, id, FOOD_COLUMNS)) as
    | (Record<string, unknown> & { id: string; tenant_id: string; origin_food_id: string | null })
    | null;
  if (!food) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  const foodTenant = food.tenant_id;
  const foodId = food.id;
  const isSystem = isSystemNutritionTenant(foodTenant);

  // Çocuk kayıtlar effective satırın sahibine (SYSTEM veya caller) göre çekilir.
  const [nutrientsRes, portionsRes, traditionalRes, sourcesRes, extRes] = await Promise.all([
    db
      .from("nutrition_food_nutrients")
      .select(
        "id, nutrient_id, amount, unit_id, basis_grams, source_id, nutrient:nutrition_nutrients(code, name_tr, name_en, category, sort_order), unit:nutrition_units(code, symbol)",
      )
      .eq("tenant_id", foodTenant)
      .eq("food_id", foodId),
    db
      .from("nutrition_food_portions")
      .select(
        "id, label_tr, label_en, quantity, measure_unit_id, gram_weight, is_default, sort_order, unit:nutrition_units(code, symbol, name_tr)",
      )
      .eq("tenant_id", foodTenant)
      .eq("food_id", foodId)
      .order("sort_order", { ascending: true }),
    db
      .from("nutrition_food_traditional")
      .select(FOOD_TRADITIONAL_COLUMNS)
      .eq("tenant_id", foodTenant)
      .eq("food_id", foodId)
      .maybeSingle(),
    db
      .from("nutrition_food_sources")
      .select(`${FOOD_SOURCE_COLUMNS}, source:nutrition_sources(${SOURCE_COLUMNS})`)
      .eq("tenant_id", foodTenant)
      .eq("food_id", foodId)
      .order("sort_order", { ascending: true }),
    // Dış referans: kişisel kopyada sistem aslının referansı "türetildiği kaynak" olarak
    // gösterilir (salt bilgi; kopyaya kopyalanmaz → plan snapshot'ı yanlış provenance taşımaz).
    db
      .from("nutrition_food_external_refs")
      .select("id, provider, external_id, external_dataset, external_version, source_url, retrieved_at")
      .eq("tenant_id", food.origin_food_id ? SYSTEM_NUTRITION_TENANT_ID : foodTenant)
      .eq("food_id", food.origin_food_id ?? foodId),
  ]);

  return NextResponse.json(
    {
      ok: true,
      food: { ...food, is_system: isSystem, is_personalized: !!food.origin_food_id },
      nutrients: nutrientsRes.data ?? [],
      portions: portionsRes.data ?? [],
      traditional: traditionalRes.data ?? null,
      sources: sourcesRes.data ?? [],
      externalRefs: extRes.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH: güncelle (allowlist). Sistem besininde ilk yazma uzmanın kişisel kopyasını oluşturur. */
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, UPDATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const patch: Record<string, unknown> = {};
  if ("name_tr" in body) {
    const v = cleanStr(body.name_tr, 200);
    if (!v) return beslenmeJson({ ok: false, code: "NAME_REQUIRED" }, 400);
    patch.name_tr = v;
  }
  if ("name_en" in body) patch.name_en = cleanStr(body.name_en, 200);
  if ("aliases" in body) patch.aliases = cleanStringArray(body.aliases);
  if ("food_group_id" in body) {
    if (body.food_group_id != null && !isUuid(body.food_group_id))
      return beslenmeJson({ ok: false, code: "BAD_FOOD_GROUP" }, 400);
    patch.food_group_id = isUuid(body.food_group_id) ? body.food_group_id : null;
  }
  if ("prep_state" in body) {
    if (body.prep_state != null && !inEnum(body.prep_state, PREP_STATES))
      return beslenmeJson({ ok: false, code: "BAD_PREP_STATE" }, 400);
    patch.prep_state = inEnum(body.prep_state, PREP_STATES) ? body.prep_state : null;
  }
  if ("description" in body) patch.description = cleanStr(body.description, 8000);
  if ("notes" in body) patch.notes = cleanStr(body.notes, 8000);
  if ("sort_order" in body && Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order;

  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NO_FIELDS" }, 400);

  // Sahiplik + (gerekirse) kişisel kopya — gövde doğrulandıktan SONRA (geçersiz istek kopya üretmez).
  const wguard = await resolveFoodForWrite(db, tenantId, id);
  if (!wguard.ok) return beslenmeJson({ ok: false, code: wguard.code }, wguard.status);
  const targetId = wguard.food.id;

  const { data, error } = await db
    .from("nutrition_foods")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", targetId)
    .select(FOOD_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_NAME" }, 409);
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "FOOD_GROUP_NOT_FOUND" }, 400);
    return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  }
  if (!data) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, food: data, food_id: targetId, personalized: wguard.forked });
}

/**
 * DELETE ("Sil" — çalışma alanından kaldır; arşiv YOK):
 *   • uzmanın özgün besini             → gerçek DELETE (değer/porsiyon/geleneksel/kaynak bağı cascade)
 *   • sistem besininin kişisel kopyası → kopya silinir + sistem aslı bu uzmanda gizlenir
 *   • sistem besini                    → yalnız bu uzmanın çalışma alanından kaldırılır (global satır korunur)
 * Rehberde kullanılan besin → 409 IN_USE + rehber başlıkları. Plan kalemleri snapshot ile korunur.
 */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);
  if (isSystemNutritionTenant(tenantId)) return beslenmeJson({ ok: false, code: "SYSTEM_READONLY" }, 403);

  const eff = await resolveEffectiveFood(db, tenantId, id);
  if (!eff) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const inUse = async () => {
    const usage = await listFoodTopicUsage(db, tenantId, [eff.id]);
    return [...new Set(usage.map((u) => u.title))];
  };

  // Rehber kullanımı (kopya/özgün satır için) — kullanıcıya NEREDE kullanıldığını söyle.
  if (!isSystemNutritionTenant(eff.tenant_id)) {
    const topics = await inUse();
    if (topics.length > 0) return beslenmeJson({ ok: false, code: "IN_USE", topics }, 409);
  }

  const { data, error } = await db.rpc("nutrition_food_remove", {
    p_tenant_id: tenantId,
    p_system_tenant_id: SYSTEM_NUTRITION_TENANT_ID,
    p_food_id: eff.id,
  });
  if (error) {
    const m = mapFoodRpcError(error.code);
    if (m.code === "IN_USE") return beslenmeJson({ ok: false, code: "IN_USE", topics: await inUse() }, 409);
    return beslenmeJson({ ok: false, code: m.code === "WRITE_FAILED" ? "DELETE_FAILED" : m.code }, m.status);
  }
  const action = (data as { action?: string } | null)?.action ?? "deleted";
  return NextResponse.json({ ok: true, deleted: true, action });
}
