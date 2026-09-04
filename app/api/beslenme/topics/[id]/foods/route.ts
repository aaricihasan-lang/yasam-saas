import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { TOPIC_FOOD_COLUMNS, RELATION_TYPES, cleanStr, inEnum, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const CREATE_KEYS = ["food_id", "relation_type", "rationale", "sort_order"] as const;

/** POST /topics/[id]/foods — Topic↔Food ilişkisi ekle. Cross-tenant: iki composite FK zorlar. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId } = await ctx.params;
  if (!isUuid(topicId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

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

  const insert = {
    tenant_id: tenantId,
    topic_id: topicId,
    food_id: body.food_id,
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
