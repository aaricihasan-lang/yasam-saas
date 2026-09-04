import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUuid, cleanNumber, isUnitAllowedForCategory, hasOnlyKeys } from "@/lib/beslenme/contracts";
import {
  resolveFoodForRead,
  resolveFoodForWrite,
  loadNutrientDict,
  loadUnitDict,
} from "@/lib/beslenme/foodEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

const NUTRIENT_JOIN =
  "id, nutrient_id, amount, unit_id, basis_grams, source_id, sort:nutrient_id, " +
  "nutrient:nutrition_nutrients(code, name_tr, name_en, category, sort_order), " +
  "unit:nutrition_units(code, symbol)";

/** GET: besnin /100 g nutrient kompozisyonu (SYSTEM veya kendi besni okunabilir). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const food = await resolveFoodForRead(db, tenantId, id, "id, tenant_id");
  if (!food) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { data, error } = await db
    .from("nutrition_food_nutrients")
    .select(NUTRIENT_JOIN)
    .eq("tenant_id", food.tenant_id as string)
    .eq("food_id", id);
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, nutrients: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PUT: /100 g nutrient setini TÜMÜYLE değiştir (yalnız CUSTOM food).
 * body: { items: [{ nutrient_code, amount, unit_code, source_id? }] }
 * amount /100 g bazındadır (basis_grams=100 invariant). Yok = satır yok (0 yazma yok).
 */
export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const write = await resolveFoodForWrite(db, tenantId, id);
  if (!write.ok) return beslenmeJson({ ok: false, code: write.code }, write.status);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["items"]))
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return beslenmeJson({ ok: false, code: "ITEMS_REQUIRED" }, 400);
  if (items.length > 60) return beslenmeJson({ ok: false, code: "TOO_MANY" }, 400);

  const nutrientDict = await loadNutrientDict(db);
  const unitDict = await loadUnitDict(db);

  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return beslenmeJson({ ok: false, code: "BAD_ITEM" }, 400);
    const it = raw as Record<string, unknown>;
    const nutrient = typeof it.nutrient_code === "string" ? nutrientDict.get(it.nutrient_code) : undefined;
    if (!nutrient) return beslenmeJson({ ok: false, code: "BAD_NUTRIENT" }, 400);
    if (seen.has(nutrient.code)) return beslenmeJson({ ok: false, code: "DUPLICATE_NUTRIENT" }, 409);
    seen.add(nutrient.code);
    const unit = typeof it.unit_code === "string" ? unitDict.get(it.unit_code) : undefined;
    if (!unit) return beslenmeJson({ ok: false, code: "BAD_UNIT" }, 400);
    if (!isUnitAllowedForCategory(nutrient.category, unit.code))
      return beslenmeJson({ ok: false, code: "UNIT_INCOMPATIBLE" }, 400);
    const amount = cleanNumber(it.amount, { min: 0, max: 1_000_000 });
    if (amount == null) return beslenmeJson({ ok: false, code: "BAD_AMOUNT" }, 400);
    if (it.source_id != null && !isUuid(it.source_id)) return beslenmeJson({ ok: false, code: "BAD_SOURCE" }, 400);
    rows.push({
      tenant_id: tenantId,
      food_id: id,
      nutrient_id: nutrient.id,
      amount,
      unit_id: unit.id,
      basis_grams: 100,
      source_id: isUuid(it.source_id) ? it.source_id : null,
    });
  }

  // set-replace: mevcut satırları sil, yenilerini ekle (owner-only küçük set).
  const del = await db.from("nutrition_food_nutrients").delete().eq("tenant_id", tenantId).eq("food_id", id);
  if (del.error) return beslenmeJson({ ok: false, code: "WRITE_FAILED" }, 500);
  if (rows.length > 0) {
    const ins = await db.from("nutrition_food_nutrients").insert(rows);
    if (ins.error) {
      if (ins.error.code === "23503") return beslenmeJson({ ok: false, code: "SOURCE_NOT_FOUND" }, 400);
      return beslenmeJson({ ok: false, code: "WRITE_FAILED" }, 500);
    }
  }
  return NextResponse.json({ ok: true, count: rows.length });
}
