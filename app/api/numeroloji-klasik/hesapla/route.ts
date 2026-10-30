import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { validateAnalysisRequest } from "@/lib/numeroloji-klasik/input";
import { buildClassicServiceDeps } from "@/lib/numeroloji-klasik/server/deps";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { computeClassicResult, draftView } from "@/lib/numeroloji-klasik/server/service";
import { targetAllowed } from "@/lib/numeroloji-klasik/futureYears";
import { futureYearsOptsFor, viewForViewer } from "@/lib/numeroloji-klasik/server/futureYearsView";

export const runtime = "nodejs";
/** En kötü durum: paralel çağrılar (her biri ≤ 45 sn) + DB payı. */
export const maxDuration = 120;

/**
 * POST /api/numeroloji-klasik/hesapla — analiz HESAPLA (kalıcı kayıt OLUŞTURMAZ; 30.10.2026 owner kararı).
 *   Gövde: analiz isteği (kind, title, clientId, techniques, input) — danışan bağı burada YAZILMAZ / denetlenmez
 *   (yalnız Kaydet'te). Yanıt: { ok, draft: { view, request, referenceDate, resultHash } }.
 *   Kayıt yalnız açık "Kaydet" ile: POST /api/numeroloji-klasik/analyses { request, referenceDate, resultHash }.
 *
 * Güvenlik: bayrak kapalı → 404 (guard'dan önce); requireModuleAccess("numerology"); tenant YALNIZ oturumdan;
 * demo → 403; gövde ≤ 16 KB + katı doğrulama; NK-R3 gelecek yıl hedefi sağlayıcıdan ÖNCE; yanıt no-store.
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validateAnalysisRequest(body.value);
  if (!v.ok) return validationResponse(v);
  // NK-R3: yetkisiz uzman gelecek yıla düşen hedef tarihle hesap BAŞLATAMAZ (sağlayıcı çağrısından ÖNCE; kredi harcanmaz).
  const fy = futureYearsOptsFor(guard.profile);
  if (v.value.kind === "person" && !targetAllowed(v.value.input.targetDate, fy)) {
    return classicJson(403, { ok: false, code: "FUTURE_YEARS_PERMISSION_REQUIRED", error: "Gelecek yıllara ait hesaplama için \"Gelecek Yılları Göster\" izniniz olmalı. Hedef tarihi bu yıl içinde seçin.", field: "input.targetDate" });
  }
  const canLinkClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  // Danışan izni yoksa istekteki danışan bağı taslağa taşınmaz (Kaydet'te zaten reddedilirdi).
  const request = canLinkClients ? v.value : { ...v.value, clientId: null };

  const result = await computeClassicResult(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account, canLinkClients },
    request,
    buildClassicServiceDeps(guard.db),
  );

  if (result.body.ok) {
    await trackUsage(guard, req, { module: "numerology", action: "analysis_run", subEntity: "analysis", resourceId: `taslak-${result.body.computed.resultHash.slice(0, 16)}` });
  } else if (result.status >= 500) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "analysis_run", subEntity: "analysis", errorClass: "server" });
  }
  const headers: Record<string, string> = {};
  if (!result.body.ok) {
    if (result.body.retryAfterSec) headers["Retry-After"] = String(result.body.retryAfterSec);
    return classicJson(result.status, result.body, headers);
  }
  const c = result.body.computed;
  return classicJson(200, {
    ok: true,
    draft: { view: viewForViewer(draftView(request, c), fy), request, referenceDate: c.referenceDate, resultHash: c.resultHash },
  });
}
