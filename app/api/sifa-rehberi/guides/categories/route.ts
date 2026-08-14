import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/sifa-rehberi/publicApiError";

export const runtime = "nodejs";

/**
 * GET /api/sifa-rehberi/guides/categories — tenant-bağlı, non-empty distinct kategori facet.
 *
 * Server pagination sonrası kategori seçenekleri "yüklü satırlardan" türetilemez
 * (ilk sayfada olmayan kategori kaybolurdu). Bu uç TÜM tenant kategorilerini döndürür.
 * tenant SUNUCUDAN türetilir; count DÖNMEZ (gereksiz).
 *
 * Not: statik `categories` segmenti dinamik `[id]`'den önce eşleşir → çakışma yok.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  const { data, error } = await db.rpc("list_healing_guide_categories", {
    p_tenant_id: tenantId,
  });
  if (error) {
    return serverErrorResponse({ route: "sifa/guides/categories", action: "GET", tenantId, cause: error });
  }

  const categories = ((data ?? []) as { category: string }[])
    .map((r) => r.category)
    .filter((c): c is string => typeof c === "string" && c.length > 0);

  return NextResponse.json({ ok: true, categories });
}
