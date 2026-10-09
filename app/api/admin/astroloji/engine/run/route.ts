import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { readJsonBody, realEngineDeps, serviceJson } from "@/lib/astrology/http";
import { runAstrology } from "@/lib/astrology/engine/service";

export const runtime = "nodejs";

/**
 * POST — hesapla (kayıtlı sonuç varsa sağlayıcı ÇAĞRILMAZ).
 * Gövde: { profileId, revision?, selections: [{ technique, options }], confirmNewRequests? }
 * ?previewNoInterp=1 → owner önizlemesi: "Roxy Yorumu Kapalıymış Gibi Gör" (yorum içeriği
 * yanıtta HİÇ bulunmaz; yorum tablosu okunmaz).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const preview = parseOwnerPreviewHideInterp(req.nextUrl.searchParams.get("previewNoInterp"));
  return serviceJson(await runAstrology(gate.ctx, b.body, realEngineDeps(gate.ctx.db), { ownerPreviewHideInterp: preview }));
}
