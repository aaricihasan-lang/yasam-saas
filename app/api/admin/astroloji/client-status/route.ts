import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { serviceJson } from "@/lib/astrology/http";
import { getClientAstrologyStatus } from "@/lib/astrology/clients/service";

export const runtime = "nodejs";

/**
 * GET ?clientId= — Danışan Yolculuğu'ndaki küçük Astroloji durum alanı: has_analyses | no_analyses | not_linked.
 * Yalnız sayı/durum (harita, yorum, not, rapor YOK); sağlayıcı çağrılmaz. Astroloji yetkisi yoksa tek tip 404.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  return serviceJson(await getClientAstrologyStatus(gate.ctx, req.nextUrl.searchParams.get("clientId")));
}
