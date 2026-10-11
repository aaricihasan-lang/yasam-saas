import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { serviceJson } from "@/lib/astrology/http";
import { searchClientCandidates } from "@/lib/astrology/clients/service";

export const runtime = "nodejs";

/**
 * GET ?name=&birthDate= — merkezî danışanlarda OLASI eşleşmeler (yalnız uzmanın tenant'ı; Türkçe duyarsız).
 * Kesin eşleşme varsayılmaz; aynı kimlikli kayıtlar ayrı döner; hiçbir bağ kurulmaz.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  return serviceJson(await searchClientCandidates(gate.ctx, req.nextUrl.searchParams));
}
