import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { serviceJson } from "@/lib/astrology/http";
import { getClientPreview } from "@/lib/astrology/clients/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — Danışan Ön İzleme: salt okunur, yalnız ayırt edici temel alanlar (sağlık/görüşme verisi YOK). */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  return serviceJson(await getClientPreview(gate.ctx, id));
}
