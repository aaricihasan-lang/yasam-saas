import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { getRelationReportSnapshot } from "@/lib/human-design/relations/relationExtras";
import { relationReportFilename, renderRelationReportBuffer } from "@/lib/human-design/relations/relationReport";
import { renderRelationImage } from "@/lib/human-design/relations/relationImages";

export const runtime = "nodejs";

/**
 * POST /api/hd/relations/reports/:reportId/download — kayıtlı ilişki/grup raporunun Word dosyası.
 *   - Kaynak YALNIZ donmuş snapshot (tekrar indirmede içerik aynı). Görsel snapshot'taki kayıtlı veriden
 *     yeniden çizilir; snapshot görseli "yok" diyorsa rapor bunu açıkça yazar (sessiz görselsiz rapor yok).
 *   - Android'de Word kapalı (androidWordGuard → 403). Tenant guard'dan; başka hesabın raporu → 404.
 *   - Roxy çağrısı YOK; sağlayıcı adı / anahtar rapora girmez. no-store.
 */
type RouteContext = { params: Promise<{ reportId: string }> };
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
  const { reportId } = await ctx.params;
  const r = await getRelationReportSnapshot({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, reportId);
  if (!r.body.ok) return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  const s = r.body.snapshot;
  const image = s.image.status === "ok" ? renderRelationImage(s.analysis)?.png ?? null : null;
  let buffer: Buffer;
  try {
    buffer = await renderRelationReportBuffer(s, { image });
  } catch {
    return NextResponse.json({ ok: false, error: "Rapor belgesi oluşturulamadı." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${relationReportFilename(s.analysis, s.generatedAt)}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store, private",
    },
  });
}
