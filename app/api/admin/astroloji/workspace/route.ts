import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { getWorkspace } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";
// 03.11.2026 DE440 AŞAMA 2: transit taraması bu uçta YEREL hesaplanır (sağlayıcı çağrısı yok; ≤ birkaç sn) ve DE440 verisini okur.
// maxDuration 60 → Vercel bu rotayı DE440'ı zaten taşıyan 60 sn fonksiyon grubuna koyar (aksi hâlde ~120 MB dosya varsayılan
// gruba, yani yüzlerce ilgisiz rotanın paketine eklenirdi). Ayrıntı: docs/astrology/pro/de440-konum-motoru.md §9.
export const maxDuration = 60;

/**
 * GET ?profileId=&revision=&resultId= — (Aşama 2 uyumu) natal sonucun kanonik konuları + "Bilgi Bankam"
 * eşleşmeleri + danışana özel uzman notları.
 * POST { profileId, revision, technique, options } — her teknik için aynı çalışma alanı (seçim
 * planlayıcıyla yeniden birimlere çevrilir; tüm parçalar önbellekte olmalı).
 * Sağlayıcı ÇAĞRILMAZ; sağlayıcı yorumu bu uçta okunmaz/dönmez.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  return serviceJson(await getWorkspace(gate.ctx, { profileId: sp.get("profileId"), revision: sp.get("revision"), resultId: sp.get("resultId") }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const o = b.body && typeof b.body === "object" && !Array.isArray(b.body) ? (b.body as Record<string, unknown>) : {};
  return serviceJson(await getWorkspace(gate.ctx, { profileId: o.profileId, revision: o.revision, technique: o.technique, options: o.options }));
}
