import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * POST /api/hd/upload-chart-image — Human Design harita görseli yükleme.
 *
 * AŞAMA 3C (ürün kararı): başka sitede hesaplanmış haritayı elle yükleme dönemi bitti; yeni manuel
 * harita görseli yükleme KAPALI (410). Mevcut görseller etkilenmez: görüntüleme
 * (/api/hd/chart-image-url) ve silme (/api/hd/delete-chart-image) uçları aynen çalışır; veri silinmez.
 * Kimlik + modül kapısı korunur (kimliksiz istek 401/403 alır, kapanış bilgisi sızmaz).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    {
      ok: false,
      code: "MANUAL_IMAGE_CLOSED",
      error: "Yeni manuel Human Design harita görseli yükleme artık kullanılmıyor. Human Design Hesaplama bölümünden otomatik hesaplama yapın.",
    },
    { status: 410, headers: NO_STORE },
  );
}
