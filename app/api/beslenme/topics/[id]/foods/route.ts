import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isActiveTopicInTenant } from "@/lib/beslenme/topicGuard";
import { TOPIC_FOOD_COLUMNS, RELATION_TYPES, cleanStr, inEnum, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { resolveFoodForWrite } from "@/lib/beslenme/foodEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const CREATE_KEYS = ["food_id", "relation_type", "rationale", "sort_order"] as const;

/** POST /topics/[id]/foods — Topic↔Food ilişkisi ekle. Cross-tenant: iki composite FK zorlar. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId } = await ctx.params;
  if (!isUuid(topicId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);
  // Rehber bu tenant'a ait + aktif olmalı (legacy pasif rehberin alt kayıtları API'den de değişmez).
  if (!(await isActiveTopicInTenant(db, tenantId, topicId))) return beslenmeJson({ ok: false, code: "TOPIC_NOT_FOUND" }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (!isUuid(body.food_id)) return beslenmeJson({ ok: false, code: "BAD_FOOD" }, 400);
  if (!inEnum(body.relation_type, RELATION_TYPES)) return beslenmeJson({ ok: false, code: "BAD_RELATION" }, 400);

  // Rehber bağı tenant-güvenli kompozit FK ile YALNIZ bu tenant'ın besinine kurulabilir. Seçilen
  // besin sistem besiniyse (listede görünen effective kayıt) uzmanın kişisel kopyası kullanılır;
  // global sistem satırı değişmez. Başka tenant'ın besini → 404.
  const food = await resolveFoodForWrite(db, tenantId, body.food_id);
  if (!food.ok) return beslenmeJson({ ok: false, code: food.code === "NOT_FOUND" ? "TOPIC_OR_FOOD_NOT_FOUND" : food.code }, food.status);

  const insert = {
    tenant_id: tenantId,
    topic_id: topicId,
    food_id: food.food.id,
    relation_type: body.relation_type,
    rationale: cleanStr(body.rationale, 2000),
    sort_order: Number.isInteger(body.sort_order) ? (body.sort_order as number) : 0,
  };
  const { data, error } = await db.from("nutrition_topic_foods").insert(insert).select(TOPIC_FOOD_COLUMNS).single();
  if (error) {
    if (error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_RELATION" }, 409);
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "TOPIC_OR_FOOD_NOT_FOUND" }, 404);
    return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  }
  return NextResponse.json({ ok: true, relation: data }, { status: 201 });
}
