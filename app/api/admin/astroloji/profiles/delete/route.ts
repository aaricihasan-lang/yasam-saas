import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { deleteProfiles } from "@/lib/astrology/clients/deletion";

export const runtime = "nodejs";

/**
 * POST { mode, profileIds, confirmToken, confirmations } — KALICI silme. Tekli 2, toplu 3 onay ZORUNLU;
 * onaylanan durum kilit altında yeniden doğrulanır; ortak analizler korunur; tek işlem (kısmi başarı yok).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await deleteProfiles(gate.ctx, b.body));
}
