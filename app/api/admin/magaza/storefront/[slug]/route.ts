import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import { storeError } from "@/lib/store/adminHttp";
import {
  getStorefrontData,
  getStorefrontProductBySlug,
  getStoreSettings,
} from "@/lib/store/storefront";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ slug: string }> };

/**
 * /api/admin/magaza/storefront/[slug] — OWNER-ONLY ürün detayı önizleme verisi.
 *   Public PDP kilitliyken sahip, gerçek PDP'nin göreceği (status='active') ürünü
 *   + benzer ürünleri owner-gate'li olarak çeker. Draft/archived storefront dışıdır.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;

  const { slug } = await ctx.params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return storeError("Ürün bulunamadı.", "STORE_PRODUCT_NOT_FOUND", 404);

  const [{ products, categories }, settings] = await Promise.all([
    getStorefrontData(),
    getStoreSettings(),
  ]);
  const related = products.filter((p) => p.slug !== product.slug).slice(0, 4);

  return NextResponse.json(
    {
      ok: true,
      product,
      categories,
      related,
      whatsapp_number: settings.whatsapp_enabled ? settings.whatsapp_number : null,
      whatsapp_enabled: settings.whatsapp_enabled,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
