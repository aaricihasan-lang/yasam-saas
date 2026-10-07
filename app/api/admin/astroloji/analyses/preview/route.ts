import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { previewAnalysis } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";

/** POST — kaydetmeden önce özet (yazım yok, sağlayıcı çağrısı yok). Gövde: kaydetme ile aynı. */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const preview = parseOwnerPreviewHideInterp(req.nextUrl.searchParams.get("previewNoInterp"));
  return serviceJson(await previewAnalysis(gate.ctx, b.body, preview));
}
