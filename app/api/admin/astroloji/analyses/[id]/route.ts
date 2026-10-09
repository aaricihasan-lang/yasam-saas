import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { serviceJson } from "@/lib/astrology/http";
import { getAnalysis } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET — kayıtlı analizi AÇ (yalnız snapshot; 0 sağlayıcı isteği). Sağlayıcı yorumu yalnız analize
 * dahil edildiyse VE güncel yetki/önizleme izin veriyorsa döner.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  return serviceJson(await getAnalysis(gate.ctx, id, parseOwnerPreviewHideInterp(req.nextUrl.searchParams.get("previewNoInterp"))));
}
