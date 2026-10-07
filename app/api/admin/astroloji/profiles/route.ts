import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { createAstroProfile, listAstroProfiles } from "@/lib/astrology/profiles/service";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";

export const runtime = "nodejs";

/** GET — owner tenant'ının doğum profilleri (güncel revizyon özetiyle). */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  return serviceJson(await listAstroProfiles(gate.ctx));
}

/** POST — yeni profil + revizyon 1. Gövde: { label, clientId?, birthDate, birthTime?, timeKnown, timeAccuracy, locationId, dstChoice? } */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await createAstroProfile(gate.ctx, b.body, resolveAstroLocation));
}
