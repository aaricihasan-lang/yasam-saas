import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { SECTION_COLUMNS, SECTION_KEYS, cleanStr, inEnum, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; sectionId: string }> };
const UPDATE_KEYS = ["section_key", "heading", "content", "sort_order"] as const;

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId, sectionId } = await ctx.params;
  if (!isUuid(topicId) || !isUuid(sectionId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

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
  if ("section_key" in body) {
    if (body.section_key != null && !inEnum(body.section_key, SECTION_KEYS))
      return beslenmeJson({ ok: false, code: "BAD_SECTION_KEY" }, 400);
    patch.section_key = inEnum(body.section_key, SECTION_KEYS) ? body.section_key : null;
  }
  if ("heading" in body) patch.heading = cleanStr(body.heading, 200);
  if ("content" in body) patch.content = cleanStr(body.content, 20000);
  if ("sort_order" in body && Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order;
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NO_FIELDS" }, 400);

  const { data, error } = await db
    .from("nutrition_topic_sections")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("topic_id", topicId)
    .eq("id", sectionId)
    .select(SECTION_COLUMNS)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  if (!data) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, section: data });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId, sectionId } = await ctx.params;
  if (!isUuid(topicId) || !isUuid(sectionId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { error, count } = await db
    .from("nutrition_topic_sections")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("topic_id", topicId)
    .eq("id", sectionId);
  if (error) return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  if (!count) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, deleted: true });
}
