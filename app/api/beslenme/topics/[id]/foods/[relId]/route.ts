import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { TOPIC_FOOD_COLUMNS, RELATION_TYPES, cleanStr, inEnum, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; relId: string }> };
const UPDATE_KEYS = ["relation_type", "rationale", "sort_order"] as const;

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId, relId } = await ctx.params;
  if (!isUuid(topicId) || !isUuid(relId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

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
  if ("relation_type" in body) {
    if (!inEnum(body.relation_type, RELATION_TYPES)) return beslenmeJson({ ok: false, code: "BAD_RELATION" }, 400);
    patch.relation_type = body.relation_type;
  }
  if ("rationale" in body) patch.rationale = cleanStr(body.rationale, 2000);
  if ("sort_order" in body && Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order;
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NO_FIELDS" }, 400);

  const { data, error } = await db
    .from("nutrition_topic_foods")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("topic_id", topicId)
    .eq("id", relId)
    .select(TOPIC_FOOD_COLUMNS)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  if (!data) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, relation: data });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId, relId } = await ctx.params;
  if (!isUuid(topicId) || !isUuid(relId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { error, count } = await db
    .from("nutrition_topic_foods")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("topic_id", topicId)
    .eq("id", relId);
  if (error) return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  if (!count) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, deleted: true });
}
