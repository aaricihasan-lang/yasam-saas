import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import {
  FOOD_COLUMNS,
  FOOD_SOURCE_COLUMNS,
  SOURCE_COLUMNS,
  cleanStr,
  cleanStringArray,
  inEnum,
  isUuid,
  hasOnlyKeys,
  PREP_STATES,
} from "@/lib/beslenme/contracts";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

const UPDATE_KEYS = [
  "name_tr",
  "name_en",
  "aliases",
  "food_group_id",
  "prep_state",
  "description",
  "notes",
  "sort_order",
  "is_active",
] as const;

/** GET: besin detayı + bağlı kaynaklar. */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { data: food, error } = await db
    .from("nutrition_foods")
    .select(FOOD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  if (!food) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { data: links } = await db
    .from("nutrition_food_sources")
    .select(`${FOOD_SOURCE_COLUMNS}, source:nutrition_sources(${SOURCE_COLUMNS})`)
    .eq("tenant_id", tenantId)
    .eq("food_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json(
    { ok: true, food, sources: links ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH: güncelle (allowlist; kimlik kolonları hariç). */
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
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
  if ("is_active" in body && typeof body.is_active === "boolean") patch.is_active = body.is_active;

  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NO_FIELDS" }, 400);

  const { data, error } = await db
    .from("nutrition_foods")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(FOOD_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_NAME" }, 409);
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "FOOD_GROUP_NOT_FOUND" }, 400);
    return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  }
  if (!data) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, food: data });
}

/** DELETE: varsayılan arşiv (is_active=false); ?hard=1 → gerçek silme (RESTRICT referans → 409). */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  if (!hard) {
    const { data, error } = await db
      .from("nutrition_foods")
      .update({ is_active: false })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return beslenmeJson({ ok: false, code: "ARCHIVE_FAILED" }, 500);
    if (!data) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
    return NextResponse.json({ ok: true, archived: true });
  }

  const { error, count } = await db
    .from("nutrition_foods")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) {
    if (error.code === "23503")
      return beslenmeJson({ ok: false, code: "IN_USE", error: "Bu besin bir kayda bağlı; önce ilişkiyi kaldırın." }, 409);
    return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  }
  if (!count) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, deleted: true });
}
