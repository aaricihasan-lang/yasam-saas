import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { createRelationReport, listRelationReports } from "@/lib/human-design/relations/relationExtras";

export const runtime = "nodejs";

/**
 * GET  /api/hd/relations/:id/reports — bu analizin kayıtlı raporları (salt-okuma).
 * POST /api/hd/relations/:id/reports — { sections: { analysis, knowledge, expert_comment }, prepared_by? }
 *      Seçimler varsayılan KAPALI. İçerik DONDURULUR (sonraki yorum/kayıt değişikliği bu raporu değiştirmez).
 *      Android'de Word kapalı (mevcut kural). Roxy çağrısı YOK.
 */
type RouteContext = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const r = await listRelationReports({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, id);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const rl = await hitDbRateLimit(guard.db, rateLimitBucket("hd-relation-report", guard.userId), 40, 60 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla rapor hazırlandı. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec || 60) } },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const { id } = await ctx.params;
  const r = await createRelationReport({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, id, raw);
  if (r.body.ok) await trackUsage(guard, req, { module: "human_design", action: "report_generated", subEntity: "report", resourceId: r.body.id });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
