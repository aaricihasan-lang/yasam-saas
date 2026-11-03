import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { previewAnalysis } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";
// 03.11.2026 DE440 AŞAMA 2: transit taraması bu uçta YEREL hesaplanır (sağlayıcı çağrısı yok; ≤ birkaç sn) ve DE440 verisini okur.
// maxDuration 60 → Vercel bu rotayı DE440'ı zaten taşıyan 60 sn fonksiyon grubuna koyar (aksi hâlde ~120 MB dosya varsayılan
// gruba, yani yüzlerce ilgisiz rotanın paketine eklenirdi). Ayrıntı: docs/astrology/pro/de440-konum-motoru.md §9.
export const maxDuration = 60;

/** POST — kaydetmeden önce özet (yazım yok, sağlayıcı çağrısı yok). Gövde: kaydetme ile aynı. */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const preview = parseOwnerPreviewHideInterp(req.nextUrl.searchParams.get("previewNoInterp"));
  return serviceJson(await previewAnalysis(gate.ctx, b.body, preview));
}
