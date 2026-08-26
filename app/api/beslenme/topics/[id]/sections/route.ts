import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { SECTION_COLUMNS, SECTION_KEYS, cleanStr, inEnum, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const CREATE_KEYS = ["section_key", "heading", "content", "sort_order"] as const;

/** POST /topics/[id]/sections — yeni section. Cross-tenant: (tenant_id, topic_id) FK zorlar. */
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
  if (body.section_key != null && !inEnum(body.section_key, SECTION_KEYS)) {
    return beslenmeJson({ ok: false, code: "BAD_SECTION_KEY" }, 400);
  }

  const insert = {
    tenant_id: tenantId,
    topic_id: topicId,
    section_key: inEnum(body.section_key, SECTION_KEYS) ? body.section_key : null,
    heading: cleanStr(body.heading, 200),
    content: cleanStr(body.content, 20000),
    sort_order: Number.isInteger(body.sort_order) ? (body.sort_order as number) : 0,
  };
  const { data, error } = await db.from("nutrition_topic_sections").insert(insert).select(SECTION_COLUMNS).single();
  if (error) {
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "TOPIC_NOT_FOUND" }, 404);
    return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  }
  return NextResponse.json({ ok: true, section: data }, { status: 201 });
}
