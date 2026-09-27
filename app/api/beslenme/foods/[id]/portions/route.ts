import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUuid, cleanStr, cleanNumber, isValidPortionMeasureUnitType, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { resolveFoodForRead, resolveFoodForWrite, loadUnitDict, mapFoodRpcError } from "@/lib/beslenme/foodEngine";
import { SYSTEM_NUTRITION_TENANT_ID } from "@/lib/beslenme/systemTenant";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

const PORTION_JOIN =
  "id, label_tr, label_en, quantity, measure_unit_id, gram_weight, is_default, sort_order, source_id, " +
  "unit:nutrition_units(code, symbol, name_tr)";

/** GET: besnin porsiyonları (gram köprüsü). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const food = await resolveFoodForRead(db, tenantId, id, "id, tenant_id");
  if (!food) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { data, error } = await db
    .from("nutrition_food_portions")
    .select(PORTION_JOIN)
    .eq("tenant_id", food.tenant_id as string)
    .eq("food_id", food.id as string)
    .order("sort_order", { ascending: true });
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, portions: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PUT: porsiyon setini TÜMÜYLE değiştir (ATOMİK RPC; tek transaction).
 * body: { items: [{ id?, label_tr, label_en?, quantity?, measure_unit_code, gram_weight, is_default?, sort_order? }] }
 * id → mevcut porsiyon (id korunur). quantity / label_en anahtarı YOKSA mevcut değer korunur
 * (quantity artık 1'e SIFIRLANMAZ); id'siz satır yeni porsiyon (quantity varsayılan 1).
 * Sistem besininde ilk yazma kişisel kopyayı oluşturur; istemcinin gönderdiği sistem porsiyon
 * id'leri kopyada etiket eşlemesiyle yeniden bağlanır.
 */
export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
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
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["items"]))
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return beslenmeJson({ ok: false, code: "ITEMS_REQUIRED" }, 400);
  if (items.length > 40) return beslenmeJson({ ok: false, code: "TOO_MANY" }, 400);

  const unitDict = await loadUnitDict(db);
  const rows: Record<string, unknown>[] = [];
  const labels = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return beslenmeJson({ ok: false, code: "BAD_ITEM" }, 400);
    const it = raw as Record<string, unknown>;
    const label = cleanStr(it.label_tr, 120);
    if (!label) return beslenmeJson({ ok: false, code: "LABEL_REQUIRED" }, 400);
    const lkey = label.toLocaleLowerCase("tr");
    if (labels.has(lkey)) return beslenmeJson({ ok: false, code: "DUPLICATE_LABEL" }, 409);
    labels.add(lkey);
    const unit = typeof it.measure_unit_code === "string" ? unitDict.get(it.measure_unit_code) : undefined;
    if (!unit) return beslenmeJson({ ok: false, code: "BAD_UNIT" }, 400);
    if (!isValidPortionMeasureUnitType(unit.unit_type))
      return beslenmeJson({ ok: false, code: "BAD_MEASURE_UNIT" }, 400);
    if (it.id != null && !isUuid(it.id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);
    let quantity: number | null = null;
    if (it.quantity != null) {
      quantity = cleanNumber(it.quantity, { min: 0.0001, max: 100000 });
      if (quantity == null) return beslenmeJson({ ok: false, code: "BAD_QUANTITY" }, 400);
    }
    const gram = cleanNumber(it.gram_weight, { min: 0.0001, max: 100000 });
    if (gram == null) return beslenmeJson({ ok: false, code: "BAD_GRAM_WEIGHT" }, 400);
    const row: Record<string, unknown> = {
      label_tr: label,
      measure_unit_id: unit.id,
      gram_weight: gram,
      is_default: it.is_default === true,
      sort_order: Number.isInteger(it.sort_order) ? (it.sort_order as number) : rows.length,
    };
    if (isUuid(it.id)) row.id = it.id;
    if (quantity != null) row.quantity = quantity;
    if ("label_en" in it) row.label_en = cleanStr(it.label_en, 120);
    rows.push(row);
  }

  // Tek varsayılan porsiyon invariant'ı (DB partial-unique kaldırıldı → app-layer fail-closed).
  if (rows.filter((r) => r.is_default === true).length > 1) {
    return beslenmeJson({ ok: false, code: "MULTIPLE_DEFAULT" }, 409);
  }

  // Sahiplik + (gerekirse) kişisel kopya — gövde doğrulandıktan SONRA.
  const write = await resolveFoodForWrite(db, tenantId, id);
  if (!write.ok) return beslenmeJson({ ok: false, code: write.code }, write.status);

  // Kopya YENİ oluştuysa istemcinin gönderdiği (sistem) porsiyon id'leri kopyaya ait değildir:
  // aynı etiketli kopya porsiyonuna eşle (quantity vb. korunur), eşleşmeyen → yeni satır.
  if (write.forked) {
    const { data: forkPortions } = await db
      .from("nutrition_food_portions")
      .select("id, label_tr")
      .eq("tenant_id", tenantId)
      .eq("food_id", write.food.id);
    const byLabel = new Map(
      ((forkPortions as Array<{ id: string; label_tr: string }> | null) ?? []).map((p) => [p.label_tr.toLocaleLowerCase("tr"), p.id]),
    );
    for (const r of rows) {
      if (!("id" in r)) continue;
      const mapped = byLabel.get(String(r.label_tr).toLocaleLowerCase("tr"));
      if (mapped) r.id = mapped;
      else delete r.id;
    }
  }

  // ATOMİK set-replace (hata → eski porsiyonlar korunur).
  const { data, error } = await db.rpc("nutrition_food_portions_replace", {
    p_tenant_id: tenantId,
    p_system_tenant_id: SYSTEM_NUTRITION_TENANT_ID,
    p_food_id: write.food.id,
    p_rows: rows,
  });
  if (error) {
    if (error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_LABEL" }, 409);
    const m = mapFoodRpcError(error.code);
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  return NextResponse.json({ ok: true, count: Number(data ?? rows.length), food_id: write.food.id, personalized: write.forked });
}
