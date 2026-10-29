import { NextRequest } from "next/server";
import { classicReportRateLimit } from "@/lib/numeroloji-klasik/server/reportRateLimit";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { contentDisposition } from "@/lib/numeroloji-klasik/report/filename";
import { classicError, classicJson, classicNotFound, NO_STORE, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { buildClassicReport, validateReportRequest } from "@/lib/numeroloji-klasik/server/reportService";

export const runtime = "nodejs";
export const maxDuration = 60;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * POST /api/numeroloji-klasik/rapor
 *   { kind: "person"|"stones"|"relationship"|"business"|"names"|"comparison",
 *     analysisId?: uuid, legacyId?: uuid, noteId?: uuid, variant?: "summary"|"technical"|"full", include?: string[] }
 *   → Word (.docx) eki. YALNIZ kayıtlı veriden (0 sağlayıcı çağrısı). Başka tenant / yok → 404;
 *     tür uyuşmazlığı → 400 KIND_MISMATCH; haritasız taş raporu → 422.
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const limited = await classicReportRateLimit(guard.db, guard.userId);
  if (limited) return limited;

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validateReportRequest(body.value);
  if (!v.ok) return validationResponse(v);

  let out: Awaited<ReturnType<typeof buildClassicReport>>;
  try {
    out = await buildClassicReport(
      { db: guard.db, tenantId: guard.tenantId, viewerId: guard.userId, expertName: expertDisplayName(guard.profile), futureYears: canSeeNumerologyFutureYears(guard.profile), canSeeStock: resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "stones") },
      v.value,
    );
  } catch {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "report_generated", subEntity: "analysis", errorClass: "server" });
    return classicError("DB_ERROR");
  }
  if (!out.ok) {
    if (out.reason === "not_found") return classicNotFound();
    if (out.reason === "kind_mismatch") return classicJson(400, { ok: false, code: "KIND_MISMATCH", error: "Seçilen analiz bu rapor türüne uygun değil.", field: "kind" });
    if (out.reason === "no_chart") return classicJson(422, { ok: false, code: "STONES_NOT_AVAILABLE", error: "Bu analizde taş eşleştirmesi için kişi haritası bulunmuyor." });
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "report_generated", subEntity: "analysis", errorClass: "server" });
    return classicError("DB_ERROR");
  }

  await trackUsage(guard, req, { module: "numerology", action: "report_generated", subEntity: "analysis", resourceId: out.resourceId });
  return new Response(new Uint8Array(out.buffer), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": DOCX_MIME,
      "Content-Disposition": contentDisposition(out.filename),
      "Content-Length": String(out.buffer.length),
    },
  });
}
