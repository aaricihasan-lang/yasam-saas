import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import { getStorefrontData, getStoreSettings } from "@/lib/store/storefront";

export const runtime = "nodejs";

/**
 * /api/admin/magaza/storefront — OWNER-ONLY sahip önizleme verisi.
 *   Public /magaza kilitliyken sahip, gerçek vitrinin GÖRECEĞİ (status='active')
 *   veriyi bu owner-gate'li uçtan çeker. requireStoreAdmin → verifyAdminRequest +
 *   requireMainAdmin. service_role yalnız sunucuda; müşteri-facing SIZINTI yok.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;

  const [{ products, categories }, settings] = await Promise.all([
    getStorefrontData(),
    getStoreSettings(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      products,
      categories,
      whatsapp_number: settings.whatsapp_enabled ? settings.whatsapp_number : null,
      whatsapp_enabled: settings.whatsapp_enabled,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
