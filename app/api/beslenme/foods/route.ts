import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { normalizeSearchText } from "@/lib/yasam-hafizasi/search/normalize";
import {
  FOOD_COLUMNS,
  cleanStr,
  cleanStringArray,
  inEnum,
  isUuid,
  hasOnlyKeys,
  PREP_STATES,
} from "@/lib/beslenme/contracts";

export const runtime = "nodejs";

const CREATE_KEYS = [
  "name_tr",
  "name_en",
  "aliases",
  "food_group_id",
  "prep_state",
  "description",
  "notes",
  "sort_order",
] as const;

/** GET: liste + arama + grup filtresi. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const url = new URL(req.url);
  const q = cleanStr(url.searchParams.get("q"), 120);
  const group = url.searchParams.get("group");
  const includeInactive = url.searchParams.get("all") === "1";

  let query = db.from("nutrition_foods").select(FOOD_COLUMNS).eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  if (group && isUuid(group)) query = query.eq("food_group_id", group);
  if (q) {
    const normalized = normalizeSearchText(q).normalizedText;
    if (normalized) query = query.textSearch("search_tsv", normalized, { config: "simple", type: "websearch" });
  }
  query = query.order("sort_order", { ascending: true }).order("name_tr", { ascending: true }).limit(300);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, code: "LIST_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true, foods: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** POST: yeni besin. */
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

  const name_tr = cleanStr(body.name_tr, 200);
  if (!name_tr) return beslenmeJson({ ok: false, code: "NAME_REQUIRED" }, 400);
  if (body.food_group_id != null && !isUuid(body.food_group_id)) {
    return beslenmeJson({ ok: false, code: "BAD_FOOD_GROUP" }, 400);
  }
  if (body.prep_state != null && !inEnum(body.prep_state, PREP_STATES)) {
    return beslenmeJson({ ok: false, code: "BAD_PREP_STATE" }, 400);
  }

  const insert = {
    tenant_id: tenantId,
    name_tr,
    name_en: cleanStr(body.name_en, 200),
    aliases: cleanStringArray(body.aliases),
    food_group_id: isUuid(body.food_group_id) ? body.food_group_id : null,
    prep_state: inEnum(body.prep_state, PREP_STATES) ? body.prep_state : null,
    description: cleanStr(body.description, 8000),
    notes: cleanStr(body.notes, 8000),
    sort_order: Number.isInteger(body.sort_order) ? (body.sort_order as number) : 0,
  };

  const { data, error } = await db.from("nutrition_foods").insert(insert).select(FOOD_COLUMNS).single();
  if (error) {
    if (error.code === "23505") return beslenmeJson({ ok: false, code: "DUPLICATE_NAME" }, 409);
    if (error.code === "23503") return beslenmeJson({ ok: false, code: "FOOD_GROUP_NOT_FOUND" }, 400);
    return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  }
  return NextResponse.json({ ok: true, food: data }, { status: 201 });
}
