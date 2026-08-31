import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import {
  TOPIC_COLUMNS,
  SECTION_COLUMNS,
  TOPIC_FOOD_COLUMNS,
  TOPIC_SOURCE_COLUMNS,
  SOURCE_COLUMNS,
  cleanStr,
  isUuid,
  hasOnlyKeys,
} from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

const UPDATE_KEYS = ["title", "summary", "sort_order", "is_active"] as const;

/** GET: topic detayı + sections + ilişkili besinler + kaynaklar. topic_type/framework değişmez. */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { data: topic, error } = await db
    .from("nutrition_topics")
    .select(TOPIC_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  if (!topic) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const [sections, foods, sources] = await Promise.all([
    db.from("nutrition_topic_sections").select(SECTION_COLUMNS).eq("tenant_id", tenantId).eq("topic_id", id).order("sort_order", { ascending: true }),
    db.from("nutrition_topic_foods").select(`${TOPIC_FOOD_COLUMNS}, food:nutrition_foods(id, name_tr, name_en, food_group_id)`).eq("tenant_id", tenantId).eq("topic_id", id).order("sort_order", { ascending: true }),
    db.from("nutrition_topic_sources").select(`${TOPIC_SOURCE_COLUMNS}, source:nutrition_sources(${SOURCE_COLUMNS})`).eq("tenant_id", tenantId).eq("topic_id", id).order("sort_order", { ascending: true }),
  ]);

  return NextResponse.json(
    { ok: true, topic, sections: sections.data ?? [], foods: foods.data ?? [], sources: sources.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH: yalnız title/summary/sort_order/is_active (topic_type + framework_id IMMUTABLE). */
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
  if ("title" in body) {
    const v = cleanStr(body.title, 200);
    if (!v) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);
    patch.title = v;
  }
  if ("summary" in body) patch.summary = cleanStr(body.summary, 8000);
  if ("sort_order" in body && Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order;
  if ("is_active" in body && typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NO_FIELDS" }, 400);

  const { data, error } = await db
    .from("nutrition_topics")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(TOPIC_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_PROFILE" }, 409);
    return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  }
  if (!data) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, topic: data });
}

/** DELETE: arşiv (varsayılan) / ?hard=1 gerçek silme (sections+links CASCADE; food RESTRICT etkilenmez). */
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
      .from("nutrition_topics")
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
    .from("nutrition_topics")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  if (!count) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, deleted: true });
}
