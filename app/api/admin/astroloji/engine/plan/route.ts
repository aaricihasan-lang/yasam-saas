import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { planAstrology } from "@/lib/astrology/engine/service";

export const runtime = "nodejs";

/**
 * POST — hesap ÖNİZLEMESİ: "X hesap seçildi → Y yeni sağlayıcı isteği → Z kayıtlı sonuç".
 * Sağlayıcı ÇAĞRILMAZ. Gövde: { profileId, revision?, selections: [{ technique, options }] }
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await planAstrology(gate.ctx, b.body));
}
