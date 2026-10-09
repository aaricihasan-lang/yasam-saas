import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { createAstroProfile, listAstroProfiles } from "@/lib/astrology/profiles/service";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";

export const runtime = "nodejs";

/**
 * GET — uzmanın Astroloji danışan listesi (doğum profilleri). Sunucu tarafı:
 * ?q= (ad/soyad/profil adı, Türkçe duyarsız) &birthDate=YYYY-MM-DD &archived=1 &sort=recent|name &limit= (≤100) &offset=
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  return serviceJson(await listAstroProfiles(gate.ctx, req.nextUrl.searchParams));
}

/** POST — yeni profil + revizyon 1. Gövde: { label, clientId?, birthDate, birthTime?, timeKnown, timeAccuracy, locationId, dstChoice? } */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await createAstroProfile(gate.ctx, b.body, resolveAstroLocation));
}
