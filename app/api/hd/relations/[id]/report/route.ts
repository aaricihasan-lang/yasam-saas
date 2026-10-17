import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { getRelationAnalysis } from "@/lib/human-design/relations/relationService";
import { relationReportFilename, renderRelationReportBuffer } from "@/lib/human-design/relations/relationReport";

export const runtime = "nodejs";

/**
 * POST /api/hd/relations/:id/report — kayıtlı ilişki/grup analizinin Word (.docx) raporu.
 *   - Kaynak YALNIZ kayıtlı sonuç (yeni Roxy çağrısı YOK; ham sağlayıcı yanıtı rapora girmez).
 *   - Android'de Word mevcut kurala göre kapalı (androidWordGuard → 403; düğme de gizli).
 *   - Tenant guard'dan; başka hesabın analizi → 404. no-store.
 */
type RouteContext = { params: Promise<{ id: string }> };
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const rl = await hitDbRateLimit(guard.db, rateLimitBucket("hd-word-dl", guard.tenantId), 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla indirme isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rl.retryAfterSec || 60) } },
    );
  }
  const { id } = await ctx.params;
  const r = await getRelationAnalysis({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, id);
  if (!r.body.ok) return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  let buffer: Buffer;
  try {
    buffer = await renderRelationReportBuffer(r.body.analysis);
  } catch {
    await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "report_generated", subEntity: "report", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Rapor belgesi oluşturulamadı." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  await trackUsage(guard, req, { module: "human_design", action: "report_generated", subEntity: "report", resourceId: id });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${relationReportFilename(r.body.analysis)}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store, private",
    },
  });
}
