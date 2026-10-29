import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid } from "@/lib/numeroloji-klasik/input";
import { toReportRecord } from "@/lib/numeroloji-klasik/report/docx";
import { buildReportFilename, contentDisposition } from "@/lib/numeroloji-klasik/report/filename";
import { renderClassicPng } from "@/lib/numeroloji-klasik/report/png";
import { classicError, classicJson, classicNotFound, NO_STORE, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { getAnalysis } from "@/lib/numeroloji-klasik/server/repository";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/numeroloji-klasik/rapor/gorsel   { analysisId: uuid }
 *   → image/png eki (kişi analizi; 2400 px genişlik). YALNIZ kayıtlı veriden (0 sağlayıcı çağrısı).
 *   Bayrak kapalı / başka tenant / yok → 404; kişi analizi değil → 400 KIND_MISMATCH; harita + Kalde yok → 422.
 *   Güvenlik: requireModuleAccess("numerology"); tenant yalnız oturumdan; gövde ≤ 16 KB, bilinmeyen alan → 400.
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const o = body.value;
  if (!o || typeof o !== "object" || Array.isArray(o)) return classicJson(400, { ok: false, code: "INVALID_INPUT", error: "Geçersiz istek." });
  const keys = Object.keys(o as Record<string, unknown>);
  if (keys.some((k) => k !== "analysisId")) return classicJson(400, { ok: false, code: "UNKNOWN_FIELD", error: "Beklenmeyen alan.", field: keys.find((k) => k !== "analysisId")?.slice(0, 40) });
  const id = (o as { analysisId?: unknown }).analysisId;
  if (!isUuid(id)) return classicJson(400, { ok: false, code: "INVALID_ID", error: "Kayıt kimliği geçersiz.", field: "analysisId" });

  const r = await getAnalysis(guard.db, guard.tenantId, id.toLowerCase());
  if (!r.ok) return r.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
  const row = r.value;
  if (row.kind !== "person") return classicJson(400, { ok: false, code: "KIND_MISMATCH", error: "Görsel rapor yalnız kişi analizi için hazırlanır.", field: "analysisId" });

  const at = new Date();
  const out = renderClassicPng(toReportRecord(row as unknown as Record<string, unknown>), { generatedAt: at, expertName: expertDisplayName(guard.profile) });
  if (!out.ok) {
    if (out.reason === "no_data") return classicJson(422, { ok: false, code: "PNG_NOT_AVAILABLE", error: "Bu analizde görsel rapor için çekirdek harita ya da Kalde sonucu bulunmuyor." });
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "report_generated", subEntity: "analysis", errorClass: "server" });
    return classicJson(500, { ok: false, code: "PNG_FAILED", error: "Görsel rapor oluşturulamadı. Lütfen tekrar deneyin." });
  }
  await trackUsage(guard, req, { module: "numerology", action: "report_generated", subEntity: "analysis", resourceId: row.id });
  const filename = buildReportFilename("kisi", row.title, at).replace(/\.docx$/, ".png");
  return new Response(new Uint8Array(out.png), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "image/png",
      "Content-Disposition": contentDisposition(filename),
      "Content-Length": String(out.png.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
