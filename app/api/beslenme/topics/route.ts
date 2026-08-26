import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { normalizeSearchText } from "@/lib/yasam-hafizasi/search/normalize";
import {
  TOPIC_COLUMNS,
  TOPIC_TYPES,
  cleanStr,
  inEnum,
  isUuid,
  hasOnlyKeys,
} from "@/lib/beslenme/contracts";

export const runtime = "nodejs";

const CREATE_KEYS = ["topic_type", "framework_id", "title", "summary", "sort_order"] as const;

/** GET: topic listesi (type / framework filtresi + arama). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const framework = url.searchParams.get("framework_id");
  const q = cleanStr(url.searchParams.get("q"), 120);
  const includeInactive = url.searchParams.get("all") === "1";

  let query = db.from("nutrition_topics").select(TOPIC_COLUMNS).eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  if (type && inEnum(type, TOPIC_TYPES)) query = query.eq("topic_type", type);
  if (framework && isUuid(framework)) query = query.eq("framework_id", framework);
  if (q) {
    const norm = normalizeSearchText(q).normalizedText;
    if (norm) query = query.textSearch("search_tsv", norm, { config: "simple", type: "websearch" });
  }
  query = query.order("sort_order", { ascending: true }).order("title", { ascending: true }).limit(300);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, code: "LIST_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true, topics: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** POST: yeni topic. framework invariant (traditional_profile ⇔ framework_id). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  if (!inEnum(body.topic_type, TOPIC_TYPES)) return beslenmeJson({ ok: false, code: "BAD_TOPIC_TYPE" }, 400);
  const title = cleanStr(body.title, 200);
  if (!title) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);

  const isProfile = body.topic_type === "traditional_profile";
  const frameworkId = isUuid(body.framework_id) ? (body.framework_id as string) : null;
  // §11 invariant (app-layer; DB CHECK de zorlar).
  if (isProfile && !frameworkId) return beslenmeJson({ ok: false, code: "FRAMEWORK_REQUIRED" }, 400);
  if (!isProfile && frameworkId) return beslenmeJson({ ok: false, code: "FRAMEWORK_NOT_ALLOWED" }, 400);

  const insert = {
    tenant_id: tenantId,
    topic_type: body.topic_type,
    framework_id: isProfile ? frameworkId : null,
    title,
    summary: cleanStr(body.summary, 8000),
    sort_order: Number.isInteger(body.sort_order) ? (body.sort_order as number) : 0,
  };

  const { data, error } = await db.from("nutrition_topics").insert(insert).select(TOPIC_COLUMNS).single();
  if (error) {
    if (error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_PROFILE" }, 409);
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "FRAMEWORK_NOT_FOUND" }, 400);
    if (error.code === "23514") return beslenmeJson({ ok: false, code: "FRAMEWORK_INVARIANT" }, 400);
    return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  }
  return NextResponse.json({ ok: true, topic: data }, { status: 201 });
}
