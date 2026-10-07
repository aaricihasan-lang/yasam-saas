import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { serviceJson } from "@/lib/astrology/http";
import { getAstroProfileDetail } from "@/lib/astrology/profiles/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — profil + tüm (değişmez) revizyonları. */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  return serviceJson(await getAstroProfileDetail(gate.ctx, id));
}
