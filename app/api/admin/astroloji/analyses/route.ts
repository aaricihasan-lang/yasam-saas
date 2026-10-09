import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { parseOwnerPreviewHideInterp } from "@/lib/astrology/access/entitlements";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { listAnalyses, saveAnalysis } from "@/lib/astrology/analyses/service";

export const runtime = "nodejs";

/**
 * GET ?profileId= [&tradition=western|vedic|kp &technique= &offset= &limit=] — profilin kayıtlı analizleri:
 * gelenek/teknik özeti + sayfa (snapshot içeriği yok; sağlayıcı çağrılmaz).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  return serviceJson(await listAnalyses(gate.ctx, sp.get("profileId"), sp));
}

/**
 * POST — "Analizi Kaydet": DEĞİŞMEZ snapshot (atomik, idempotent: saveRequestId).
 * Gövde: { profileId, revision, resultId, includeProviderInterp, title?, saveRequestId }
 * Sağlayıcı ÇAĞRILMAZ (kayıtlı sonuçtan kurulur).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const preview = parseOwnerPreviewHideInterp(req.nextUrl.searchParams.get("previewNoInterp"));
  return serviceJson(await saveAnalysis(gate.ctx, b.body, preview));
}
