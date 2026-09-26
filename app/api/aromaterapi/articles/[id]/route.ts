import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail } from "@/lib/aromaterapi/service/readErrors";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { pickWritableArticleFields, articleRequiredOk } from "@/lib/aromaterapi/articleFields";

export const runtime = "nodejs";

const ARTICLES_TABLE = "aromatherapy_knowledge_articles";
const ARTICLE_BODY_LIMIT = 64 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

function writeFail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/** PATCH /api/aromaterapi/articles/[id] — Bilgi Bankası notu kısmi güncelleme (tenant-scoped). */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, ARTICLE_BODY_LIMIT);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large"
      ? writeFail("AROMA_WRITE_PAYLOAD_TOO_LARGE", 413)
      : writeFail("AROMA_WRITE_INVALID_BODY", 400);
  }

  const fields = pickWritableArticleFields(bodyRes.value, { partial: true });
  if (Object.keys(fields).length === 0) return writeFail("AROMA_WRITE_INVALID_BODY", 400);
  if (!articleRequiredOk(fields, true)) return writeFail("AROMA_WRITE_INVALID_BODY", 400);

  if (guard.is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await guard.db
    .from(ARTICLES_TABLE)
    .update(fields)
    .eq("tenant_id", guard.tenantId)
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[aromaterapi:articles:update]", (error as { message?: unknown })?.message);
    return writeFail("AROMA_WRITE_FAILED", 500);
  }
  if (!data || data.length === 0) return writeFail("AROMA_NOT_FOUND", 404);
  return NextResponse.json({ ok: true, id });
}

/** DELETE /api/aromaterapi/articles/[id] — Bilgi Bankası notu kalıcı silme (tenant-scoped, onaylı). */
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  if (guard.is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await guard.db
    .from(ARTICLES_TABLE)
    .delete()
    .eq("tenant_id", guard.tenantId)
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[aromaterapi:articles:delete]", (error as { message?: unknown })?.message);
    return writeFail("AROMA_WRITE_FAILED", 500);
  }
  if (!data || data.length === 0) return writeFail("AROMA_NOT_FOUND", 404);
  return NextResponse.json({ ok: true, id });
}
