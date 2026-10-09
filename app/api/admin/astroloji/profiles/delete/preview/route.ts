import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { previewProfileDeletion } from "@/lib/astrology/clients/deletion";

export const runtime = "nodejs";

/** POST { mode: "single"|"bulk", profileIds } — kalıcı silme ÖNİZLEMESİ (hiçbir şey silinmez). */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await previewProfileDeletion(gate.ctx, b.body));
}
