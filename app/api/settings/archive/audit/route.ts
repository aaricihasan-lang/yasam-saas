import type { NextRequest } from "next/server";
import { handleArchiveAudit } from "@/lib/archive/server/handlers";
import { runArchiveRoute } from "@/lib/archive/server/http";

export const runtime = "nodejs";

/**
 * POST /api/settings/archive/audit — arşiv sonucu denetim kaydı (security_events; yalnız sayılar ve durum).
 * Body: `{ archive_id, result: { status, ok, failed, skipped, records, bytes, duration_ms } }`.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return runArchiveRoute(req, "archive-audit", 30, (ctx, body) => handleArchiveAudit(ctx, body));
}
