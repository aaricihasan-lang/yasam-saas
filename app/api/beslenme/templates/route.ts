import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, hasOnlyKeys, isUuid, inEnum } from "@/lib/beslenme/contracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_CREATE_KEYS,
  TEMPLATE_TYPES,
  TEMPLATE_SOURCE_KINDS,
} from "@/lib/beslenme/templateContracts";

export const runtime = "nodejs";

/** GET: şablon listesi (opsiyonel type filtresi). Tenant-scoped, owner-only. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const includeInactive = url.searchParams.get("all") === "1";

  let query = db.from("nutrition_templates").select(TEMPLATE_COLUMNS).eq("tenant_id", tenantId);
  if (type && (TEMPLATE_TYPES as readonly string[]).includes(type)) query = query.eq("template_type", type);
  if (!includeInactive) query = query.eq("is_active", true);
  query = query.order("updated_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) return beslenmeJson({ ok: false, code: "LIST_FAILED" }, 500);
  return NextResponse.json({ ok: true, templates: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST: plan öğününden/gününden şablon oluştur. Body: { from:'meal'|'day', source_id, title, note? }.
 * SNAPSHOT server-authoritative (RPC kaynak plan ağacını DB'den okur; client gönderemez — §39).
 */
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
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, TEMPLATE_CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (!inEnum(body.from, TEMPLATE_SOURCE_KINDS)) return beslenmeJson({ ok: false, code: "BAD_SOURCE_KIND" }, 400);
  if (!isUuid(body.source_id)) return beslenmeJson({ ok: false, code: "BAD_SOURCE" }, 400);
  const title = cleanStr(body.title, 200);
  if (!title) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);
  const note = cleanStr(body.note, 4000);

  const fn = body.from === "meal" ? "nutrition_template_create_from_meal" : "nutrition_template_create_from_day";
  const params =
    body.from === "meal"
      ? { p_tenant_id: tenantId, p_source_meal_id: body.source_id, p_title: title, p_note: note }
      : { p_tenant_id: tenantId, p_source_day_id: body.source_id, p_title: title, p_note: note };

  const { data, error } = await db.rpc(fn, params);
  if (error) {
    const m = mapRpcError(error.code);
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  return NextResponse.json({ ok: true, template: data }, { status: 201 });
}
