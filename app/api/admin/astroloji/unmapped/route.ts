import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { classifyUnmappedAudit, listUnmappedAudit } from "@/lib/astrology/audit/unmapped";

export const runtime = "nodejs";

/**
 * GET — sağlayıcı yanıtında beyaz listede olmayan alan YOLLARI (değer YOK).
 * Tenant'sız SİSTEM denetim kaydı → YALNIZ sistem sahibi (ownerOnly; uzman yüzeyinde 404).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req, { ownerOnly: true });
  if (!gate.ok) return gate.response;
  return serviceJson(await listUnmappedAudit(gate.ctx));
}

/** PATCH — { id, classification } sınıflandırma KAYDI (adaptör davranışı değişmez; fail-closed kalır). Yalnız sistem sahibi. */
export async function PATCH(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req, { ownerOnly: true });
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await classifyUnmappedAudit(gate.ctx, b.body));
}
