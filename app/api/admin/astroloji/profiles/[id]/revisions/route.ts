import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { appendAstroRevision } from "@/lib/astrology/profiles/service";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST — doğum verisi düzeltmesi = YENİ revizyon (eski revizyon değişmez).
 * Gövde: { expectedRevision, birthDate, birthTime?, timeKnown, timeAccuracy, locationId, dstChoice?, changeNote? }
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await appendAstroRevision(gate.ctx, id, b.body, resolveAstroLocation));
}
