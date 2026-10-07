import { NextRequest, NextResponse } from "next/server";
import { requireAstrologyOwner, ASTRO_NO_STORE } from "@/lib/astrology/access/ownerGate";
import { readAstroRoxyConfig } from "@/lib/astrology/config";

export const runtime = "nodejs";

/**
 * GET /api/admin/astroloji/access — owner kapısı yoklaması.
 * Owner değilse / kill switch kapalıysa 404 (modülün varlığı sızmaz). Owner için dört yetkinin
 * (Aşama 1'de hepsi owner'a açık) ve sağlayıcının yapılandırılıp yapılandırılmadığının özeti
 * (anahtar değeri DÖNMEZ).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    {
      ok: true,
      entitlements: gate.ctx.entitlements,
      providerConfigured: readAstroRoxyConfig() !== null,
      ownerPreviewAvailable: true,
    },
    { headers: ASTRO_NO_STORE },
  );
}
