import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { serviceJson } from "@/lib/astrology/http";
import { getAstrologyResult } from "@/lib/astrology/engine/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET — kayıtlı hesap sonucunu görüntüle (sağlayıcı ÇAĞRILMAZ, 0 istek).
 * ?profileId=&revision= → saat-bilinmiyor maskesi bu revizyona göre; ?previewNoInterp=1 → owner önizlemesi.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  return serviceJson(
    await getAstrologyResult(gate.ctx, id, {
      profileId: sp.get("profileId"),
      revision: sp.get("revision"),
      ownerPreviewHideInterp: parseOwnerPreviewHideInterp(sp.get("previewNoInterp")),
    }),
  );
}
