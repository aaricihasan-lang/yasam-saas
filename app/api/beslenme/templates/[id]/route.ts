import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, hasOnlyKeys, isUuid } from "@/lib/beslenme/contracts";
import { TEMPLATE_COLUMNS, TEMPLATE_PATCH_KEYS } from "@/lib/beslenme/templateContracts";
import { loadTemplateDetail, getTemplate } from "@/lib/beslenme/templateEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/** GET: şablon detayı (meal→item→nutrient ağacı). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const detail = await loadTemplateDetail(db, tenantId, id);
  if (!detail) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, ...detail }, { headers: { "Cache-Control": "no-store" } });
}

/** PATCH: rename / not / arşivle (is_active). Snapshot/tree DEĞİŞMEZ. */
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
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, TEMPLATE_PATCH_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = cleanStr(body.title, 200);
    if (!t) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);
    patch.title = t;
  }
  if (body.note !== undefined) patch.note = cleanStr(body.note, 4000);
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") return beslenmeJson({ ok: false, code: "BAD_ACTIVE" }, 400);
    patch.is_active = body.is_active;
  }
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_UPDATE" }, 400);

  const existing = await getTemplate(db, tenantId, id);
  if (!existing) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { data, error } = await db
    .from("nutrition_templates")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();
  if (error || !data) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  return NextResponse.json({ ok: true, template: data });
}

/** DELETE: şablonu sil (cascade → meal/item/nutrient). */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const existing = await getTemplate(db, tenantId, id);
  if (!existing) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { error } = await db.from("nutrition_templates").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  return NextResponse.json({ ok: true });
}
