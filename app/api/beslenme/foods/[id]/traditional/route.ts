import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import {
  isUuid,
  cleanStr,
  inEnum,
  hasOnlyKeys,
  THERMAL_QUALITIES,
  MOISTURE_QUALITIES,
  FOOD_TRADITIONAL_COLUMNS,
} from "@/lib/beslenme/contracts";
import { resolveFoodForRead, resolveFoodForWrite } from "@/lib/beslenme/foodEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const PUT_KEYS = ["framework_id", "thermal_quality", "moisture_quality", "notes", "source_id"] as const;

/** GET: besnin İÇSEL geleneksel niteliği (nutrient facts'ten AYRI). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
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
    .eq("food_id", id)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, traditional: data ?? null }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PUT: geleneksel niteliği upsert et (yalnız CUSTOM food). Tüm alanlar boşsa kaydı SİLER.
 * body: { framework_id?, thermal_quality?, moisture_quality?, notes?, source_id? }
 * NOT: profil↔food ilişkisi ("Safra: uygun") BURADA DUPLICATE EDİLMEZ — o topic_foods'ta.
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
  const source_id = isUuid(body.source_id) ? (body.source_id as string) : null;

  const empty = !framework_id && !thermal && !moisture && !notes && !source_id;

  // tek-kayıt: mevcut sil, boş değilse ekle (idempotent upsert).
  const del = await db.from("nutrition_food_traditional").delete().eq("tenant_id", tenantId).eq("food_id", id);
  if (del.error) return beslenmeJson({ ok: false, code: "WRITE_FAILED" }, 500);
  if (empty) return NextResponse.json({ ok: true, traditional: null });

  const { data, error } = await db
    .from("nutrition_food_traditional")
    .insert({ tenant_id: tenantId, food_id: id, framework_id, thermal_quality: thermal, moisture_quality: moisture, notes, source_id })
    .select(FOOD_TRADITIONAL_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "REF_NOT_FOUND" }, 400);
    return beslenmeJson({ ok: false, code: "WRITE_FAILED" }, 500);
  }
  return NextResponse.json({ ok: true, traditional: data });
}
