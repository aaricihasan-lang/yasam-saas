import { NextRequest, NextResponse } from "next/server";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import {
  isUuid,
  cleanStr,
  inEnum,
  hasOnlyKeys,
  THERMAL_QUALITIES,
  MOISTURE_QUALITIES,
  FOOD_TRADITIONAL_COLUMNS,
} from "@/lib/beslenme/contracts";
import { resolveFoodForRead, resolveFoodForWrite, mapFoodRpcError } from "@/lib/beslenme/foodEngine";
import { SYSTEM_NUTRITION_TENANT_ID } from "@/lib/beslenme/systemTenant";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const PUT_KEYS = ["framework_id", "thermal_quality", "moisture_quality", "notes", "source_id"] as const;

/** GET: besnin İÇSEL geleneksel niteliği (nutrient facts'ten AYRI). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const food = await resolveFoodForRead(db, tenantId, id, "id, tenant_id");
  if (!food) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { data, error } = await db
    .from("nutrition_food_traditional")
    .select(FOOD_TRADITIONAL_COLUMNS)
    .eq("tenant_id", food.tenant_id as string)
    .eq("food_id", food.id as string)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, traditional: data ?? null }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PUT: geleneksel niteliği upsert et (ATOMİK RPC). Tüm alanlar boşsa kaydı SİLER.
 * body: { framework_id?, thermal_quality?, moisture_quality?, notes?, source_id? }
 * source_id anahtarı GÖNDERİLMEZSE mevcut kaynak bağı KORUNUR (null → açıkça temizler).
 * NOT: profil↔food ilişkisi ("Safra: uygun") BURADA DUPLICATE EDİLMEZ — o topic_foods'ta.
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
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PUT_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const framework_id = isUuid(body.framework_id) ? (body.framework_id as string) : null;
  if (body.framework_id != null && !framework_id) return beslenmeJson({ ok: false, code: "BAD_FRAMEWORK" }, 400);
  const thermal = body.thermal_quality == null ? null : inEnum(body.thermal_quality, THERMAL_QUALITIES) ? body.thermal_quality : undefined;
  if (thermal === undefined) return beslenmeJson({ ok: false, code: "BAD_THERMAL" }, 400);
  const moisture = body.moisture_quality == null ? null : inEnum(body.moisture_quality, MOISTURE_QUALITIES) ? body.moisture_quality : undefined;
  if (moisture === undefined) return beslenmeJson({ ok: false, code: "BAD_MOISTURE" }, 400);
  const notes = cleanStr(body.notes, 4000);
  if (body.source_id != null && !isUuid(body.source_id)) return beslenmeJson({ ok: false, code: "BAD_SOURCE" }, 400);

  const row: Record<string, unknown> = { framework_id, thermal_quality: thermal, moisture_quality: moisture, notes };
  if ("source_id" in body) row.source_id = isUuid(body.source_id) ? body.source_id : null;

  // Sahiplik + (gerekirse) kişisel kopya — gövde doğrulandıktan SONRA.
  const write = await resolveFoodForWrite(db, tenantId, id);
  if (!write.ok) return beslenmeJson({ ok: false, code: write.code }, write.status);

  // ATOMİK upsert (hata → eski kayıt korunur).
  const { data, error } = await db.rpc("nutrition_food_traditional_replace", {
    p_tenant_id: tenantId,
    p_system_tenant_id: SYSTEM_NUTRITION_TENANT_ID,
    p_food_id: write.food.id,
    p_row: row,
  });
  if (error) {
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "REF_NOT_FOUND" }, 400);
    const m = mapFoodRpcError(error.code);
    const errorClass = usageErrorClassForStatus(m.status);
    if (errorClass) {
      await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_updated", subEntity: "food", errorClass });
    }
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  await trackUsage(guard, req, { module: "beslenme", action: "record_updated", subEntity: "food", resourceId: write.food.id });
  return NextResponse.json({ ok: true, traditional: data ?? null, food_id: write.food.id, personalized: write.forked });
}
