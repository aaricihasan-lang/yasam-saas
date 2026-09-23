import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeFoodContributor, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUnitAllowedForCategory, hasOnlyKeys, FOOD_COLUMNS } from "@/lib/beslenme/contracts";
import { loadNutrientDict, loadUnitDict } from "@/lib/beslenme/foodEngine";
import { buildQuickAddFood, QUICK_ADD_KEYS } from "@/lib/beslenme/quickAddFood";

export const runtime = "nodejs";

/**
 * POST /api/beslenme/foods/quick — MANUEL "Hızlı Besin Ekle".
 *   Tek çağrıda: nutrition_foods + (opsiyonel) nutrients(100g) + (opsiyonel) porsiyon.
 *   Ad dışında hiçbir alan zorunlu değil. BOŞ ≠ 0 (client boşu göndermez). Değerler 100g esaslı.
 *   tenant_id server-side (guard). Manuel kayıt → external_ref/FDC ÜRETİLMEZ (kaynak: Manuel).
 *   Kısmi başarı önlemi: çocuk insert'i başarısızsa, bu istekte oluşturulan food geri alınır (telafi).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeFoodContributor(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, QUICK_ADD_KEYS as unknown as string[])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const nutrientDict = await loadNutrientDict(db);
  const unitDict = await loadUnitDict(db);
  const built = buildQuickAddFood(body, { tenantId, nutrientDict, unitDict, isUnitAllowedForCategory });
  if (!built.ok) return beslenmeJson({ ok: false, code: built.code }, built.status);

  // 1) food
  const foodRes = await db.from("nutrition_foods").insert(built.foodInsert).select(FOOD_COLUMNS).single();
  if (foodRes.error) {
    if (foodRes.error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_NAME" }, 409);
    if (foodRes.error.code === "23503") return beslenmeJson({ ok: false, code: "FOOD_GROUP_NOT_FOUND" }, 400);
    return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  }
  const food = foodRes.data as { id: string };
  const foodId = food.id;

  // telafi: bu istekte oluşturulan food'u geri al (çocuklar CASCADE ile gider).
  const rollback = async () => {
    await db.from("nutrition_foods").delete().eq("tenant_id", tenantId).eq("id", foodId);
  };

  // 2) nutrients (varsa)
  if (built.nutrientRows.length > 0) {
    const rows = built.nutrientRows.map((r) => ({ ...r, food_id: foodId }));
    const nutRes = await db.from("nutrition_food_nutrients").insert(rows);
    if (nutRes.error) {
      await rollback();
      return beslenmeJson({ ok: false, code: "NUTRIENT_WRITE_FAILED" }, 500);
    }
  }

  // 3) porsiyon (varsa)
  if (built.portionRow) {
    const pRes = await db.from("nutrition_food_portions").insert({ ...built.portionRow, food_id: foodId });
    if (pRes.error) {
      await rollback();
      return beslenmeJson({ ok: false, code: "PORTION_WRITE_FAILED" }, 500);
    }
  }

  return NextResponse.json(
    { ok: true, food, nutrientCount: built.nutrientRows.length, portionCreated: built.portionRow != null },
    { status: 201 },
  );
}
