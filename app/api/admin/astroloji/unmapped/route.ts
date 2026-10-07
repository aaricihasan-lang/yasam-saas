import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { classifyUnmappedAudit, listUnmappedAudit } from "@/lib/astrology/audit/unmapped";

export const runtime = "nodejs";

/** GET — sağlayıcı yanıtında beyaz listede olmayan alan YOLLARI (değer YOK). */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  return serviceJson(await listUnmappedAudit(gate.ctx));
}

/** PATCH — { id, classification } sınıflandırma KAYDI (adaptör davranışı değişmez; fail-closed kalır). */
export async function PATCH(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await classifyUnmappedAudit(gate.ctx, b.body));
}
