import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { viewCachedSelections } from "@/lib/astrology/engine/service";

export const runtime = "nodejs";

/**
 * POST { profileId, revision?, selections } — seçimlerin YALNIZ kayıtlı sonuçlarını döndürür.
 * Sağlayıcı bağımlılığı verilmez → bu uç hiçbir koşulda Roxy isteği yapamaz.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const preview = parseOwnerPreviewHideInterp(req.nextUrl.searchParams.get("previewNoInterp"));
  return serviceJson(await viewCachedSelections(gate.ctx, b.body, { ownerPreviewHideInterp: preview }));
}
