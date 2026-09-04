import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { SOURCE_COLUMNS, SOURCE_TYPES, cleanStr, cleanUrl, inEnum, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const UPDATE_KEYS = [
  "title", "authors", "organization", "source_type", "publication_year",
  "edition", "page_range", "chapter", "url", "reference_code", "note", "is_active",
] as const;

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
    const v = cleanStr(body.title, 400);
    if (!v) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);
    patch.title = v;
  }
  if ("authors" in body) patch.authors = cleanStr(body.authors, 500);
  if ("organization" in body) patch.organization = cleanStr(body.organization, 300);
  if ("source_type" in body) {
    if (body.source_type != null && !inEnum(body.source_type, SOURCE_TYPES))
      return beslenmeJson({ ok: false, code: "BAD_SOURCE_TYPE" }, 400);
    patch.source_type = inEnum(body.source_type, SOURCE_TYPES) ? body.source_type : null;
  }
  if ("publication_year" in body) {
    if (body.publication_year != null && (!Number.isInteger(body.publication_year) || (body.publication_year as number) < 1000 || (body.publication_year as number) > 2200))
      return beslenmeJson({ ok: false, code: "BAD_YEAR" }, 400);
    patch.publication_year = Number.isInteger(body.publication_year) ? body.publication_year : null;
  }
  if ("edition" in body) patch.edition = cleanStr(body.edition, 100);
  if ("page_range" in body) patch.page_range = cleanStr(body.page_range, 100);
  if ("chapter" in body) patch.chapter = cleanStr(body.chapter, 200);
  if ("url" in body) patch.url = cleanUrl(body.url);
  if ("reference_code" in body) patch.reference_code = cleanStr(body.reference_code, 200);
  if ("note" in body) patch.note = cleanStr(body.note, 4000);
  if ("is_active" in body && typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NO_FIELDS" }, 400);

  const { data, error } = await db
    .from("nutrition_sources")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SOURCE_COLUMNS)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  if (!data) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, source: data });
}

/** DELETE: gerçek silme; referanslı (topic/food link) ise 409 (RESTRICT). */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { error, count } = await db
    .from("nutrition_sources")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) {
    if (error.code === "23503")
      return beslenmeJson({ ok: false, code: "IN_USE", error: "Kaynak bir kayda bağlı; önce bağı kaldırın." }, 409);
    return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  }
  if (!count) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, deleted: true });
}
