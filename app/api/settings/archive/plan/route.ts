import type { NextRequest } from "next/server";
import { handleArchivePlan } from "@/lib/archive/server/handlers";
import { runArchiveRoute } from "@/lib/archive/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settings/archive/plan — Premium Word Arşivi planı (iş listesi + kapsam dışı kalanlar + özet).
 * Body: `{ options: { modules, clientIds, dateFrom, dateTo, include } }`. Yalnız okuma; "başlatıldı" denetim kaydı yazar.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return runArchiveRoute(req, "archive-plan", 20, (ctx, body) => handleArchivePlan(ctx, body));
}
