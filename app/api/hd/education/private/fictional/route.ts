import { withTrialRoxyMeter } from "@/lib/trial/roxyMeter";
import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { createFictional } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — FAZ 14: kurgusal eğitim haritası. Tamamen kurgusal doğum bilgisi + zorunlu kurgusal beyan → mevcut motorla hesap →
 * yalnız eğitmenin özel eğitim arşivine. Danışan izni İSTENMEZ; gerçek kişi kaydı OLUŞMAZ. Ücret / kota normal analizle aynıdır.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return createFictional(req, gate.ctx);
}

// TRIAL7: deneme uzmanının GERÇEK Roxy istekleri günlük ortak krediden düşer (önbellek isabeti düşmez).
export const POST = withTrialRoxyMeter("human_design", "hd/education/fictional", handlePost);
