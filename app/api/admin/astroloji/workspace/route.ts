import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { serviceJson } from "@/lib/astrology/http";
import { getWorkspace } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";

/**
 * GET ?profileId=&revision=&resultId= — natal sonucun kanonik konuları + "Bilgi Bankam" eşleşmeleri +
 * danışana özel uzman notları. Sağlayıcı ÇAĞRILMAZ; sağlayıcı yorumu bu uçta okunmaz/dönmez.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  return serviceJson(await getWorkspace(gate.ctx, { profileId: sp.get("profileId"), revision: sp.get("revision"), resultId: sp.get("resultId") }));
}
