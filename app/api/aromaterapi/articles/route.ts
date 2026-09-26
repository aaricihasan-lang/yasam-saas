import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { buildOrIlike } from "@/lib/aromaterapi/service/readValidation";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { pickWritableArticleFields, articleRequiredOk } from "@/lib/aromaterapi/articleFields";

export const runtime = "nodejs";

const ARTICLES_TABLE = "aromatherapy_knowledge_articles";
const ARTICLE_BODY_LIMIT = 64 * 1024;
const ARTICLE_LIST_COLS =
  "id, category, sort_order, title, summary, content, source, is_active, updated_at";

function writeFail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * GET /api/aromaterapi/articles — Uzmanın KENDİ Bilgi Bankası notları (tenant-scoped).
 *
 * YALNIZ oturum tenant'ının kayıtları döner (`.eq("tenant_id", tenantId)`). Paylaşımlı
 * (tenant_id IS NULL) admin içeriği DÖNMEZ (tenant izolasyonu; ARO-027 ile hizalı).
 * Basit `?q` başlık/özet ilike araması (tablo generated search_norm taşımaz).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();

  let query = guard.db
    .from(ARTICLES_TABLE)
    .select(ARTICLE_LIST_COLS)
    .eq("tenant_id", guard.tenantId);

  if (qRaw !== "") {
    if (qRaw.length > 200) return writeFail("AROMA_QUERY_TOO_LONG", 400);
    query = query.or(buildOrIlike(["title", "summary"], qRaw));
  }

  const { data, error } = await query
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[aromaterapi:articles:list]", (error as { message?: unknown })?.message);
    return writeFail("AROMA_READ_FAILED", 500);
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

/**
 * POST /api/aromaterapi/articles — Bilgi Bankası notu CREATE (tenant-scoped, hafif yazma).
 * tenant/id gövdeden ASLA kabul edilmez (whitelist düşürür). Demo → no-op.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const bodyRes = await readJsonBounded(req, ARTICLE_BODY_LIMIT);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large"
      ? writeFail("AROMA_WRITE_PAYLOAD_TOO_LARGE", 413)
      : writeFail("AROMA_WRITE_INVALID_BODY", 400);
  }

  const fields = pickWritableArticleFields(bodyRes.value);
  if (!articleRequiredOk(fields, false)) return writeFail("AROMA_WRITE_INVALID_BODY", 400);

  if (guard.is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await guard.db
    .from(ARTICLES_TABLE)
    .insert({ ...fields, tenant_id: guard.tenantId })
    .select("id")
    .single();

  if (error) {
    console.error("[aromaterapi:articles:create]", (error as { message?: unknown })?.message);
    return writeFail("AROMA_WRITE_FAILED", 500);
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
