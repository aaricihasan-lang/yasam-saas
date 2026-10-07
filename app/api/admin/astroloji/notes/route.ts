import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { saveExpertNote } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";

/**
 * PUT — danışana özel uzman çalışma notu (upsert, iyimser kilit). Bilgi Bankası'na DOKUNMAZ.
 * Gövde: { profileId, sectionKey ("overall" | kanonik konu), body, expectedRevision (yeni not için null) }
 */
export async function PUT(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await saveExpertNote(gate.ctx, b.body));
}
