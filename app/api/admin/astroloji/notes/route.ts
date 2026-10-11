import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { enforceAstroWrite } from "@/lib/astrology/limits";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { saveExpertNote } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";

/**
 * PUT — danışana özel uzman çalışma notu (upsert, iyimser kilit). Bilgi Bankası'na DOKUNMAZ.
 * Gövde: { profileId, sectionKey ("overall" | kanonik konu), body, expectedRevision (yeni not için null) }
 */
export async function PUT(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const limited = await enforceAstroWrite(gate.ctx, "note_save", { creating: (b.body as { expectedRevision?: unknown } | null)?.expectedRevision == null });
  if (limited) return limited;
  return serviceJson(await saveExpertNote(gate.ctx, b.body));
}
