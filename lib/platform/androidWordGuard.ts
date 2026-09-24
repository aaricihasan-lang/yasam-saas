import { NextResponse } from "next/server";
import { isAndroidUserAgent } from "@/lib/platform/android";

/**
 * Word (.docx) üreten API route'ları için Android koruması (defense-in-depth).
 *
 * ÜRÜN KARARI: Android cihazlarda hiçbir Word indirilmez. UI zaten butonu Android'de
 * render etmez; bu guard doğrudan-istek yüzeyini de kapatır.
 *
 * Davranış:
 *   - İstek User-Agent'ı Android → 403 (feature-unavailable, no-store).
 *   - UA yok / Android değil → null (FAIL-OPEN): masaüstü, iOS ve server-to-server
 *     (UA'sız internal) istekler ETKİLENMEZ.
 *
 * Kullanım (Word route'unun EN BAŞINDA, kimlik kontrolünden önce ya da sonra):
 *   const blocked = androidWordGuard(req);
 *   if (blocked) return blocked;
 */
export function androidWordGuard(req: Request): NextResponse | null {
  if (isAndroidUserAgent(req.headers.get("user-agent"))) {
    return NextResponse.json(
      {
        ok: false,
        error: "Word indirme bu cihazda kullanılamıyor. Lütfen bilgisayardan deneyin.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}
