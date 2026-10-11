import { NextRequest, NextResponse } from "next/server";
import { requireAstrologyAccess, ASTRO_NO_STORE } from "@/lib/astrology/access/ownerGate";
import { readAstroRoxyConfig } from "@/lib/astrology/config";

export const runtime = "nodejs";

/**
 * GET …/astroloji/access — erişim yoklaması (admin kabuğu: owner; uzman yüzeyi: Astroloji yetkili uzman).
 * Yetkisizse / kill switch kapalıysa 404 (modülün varlığı sızmaz). Sunucuda çözülmüş yetkiler
 * (Roxy otomatik yorum alt-yetkisi dahil), owner olup olmadığı ve sağlayıcının yapılandırılıp
 * yapılandırılmadığı (anahtar değeri DÖNMEZ). Arayüz görünürlüğü bu yanıtla karar verir (fail-closed).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const isOwner = gate.ctx.isOwner === true;
  return NextResponse.json(
    {
      ok: true,
      entitlements: gate.ctx.entitlements,
      isOwner,
      providerConfigured: readAstroRoxyConfig() !== null,
      // "Roxy Yorumu Kapalıymış Gibi Gör" ve sağlayıcı alan denetimi yalnız sistem sahibine.
      ownerPreviewAvailable: isOwner,
    },
    { headers: ASTRO_NO_STORE },
  );
}
