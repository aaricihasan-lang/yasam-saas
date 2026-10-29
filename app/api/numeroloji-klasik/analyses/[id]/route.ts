import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid, validatePatchRequest, validateReplaceRequest } from "@/lib/numeroloji-klasik/input";
import { targetAllowed } from "@/lib/numeroloji-klasik/futureYears";
import { buildClassicServiceDeps } from "@/lib/numeroloji-klasik/server/deps";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { clientBelongsToTenant, getAnalysis, softDeleteAnalysis, updateAnalysis } from "@/lib/numeroloji-klasik/server/repository";
import { replaceClassicAnalysis, toAnalysisView } from "@/lib/numeroloji-klasik/server/service";
import { futureYearsOptsFor, viewForViewer } from "@/lib/numeroloji-klasik/server/futureYearsView";

export const runtime = "nodejs";

/**
 * /api/numeroloji-klasik/analyses/[id]
 *   GET    — kayıtlı analizi aç (0 sağlayıcı çağrısı; yeniden hesap YOK).
 *   PATCH  — { title?, clientId?: uuid|null, rowVersion } (row_version CAS; danışan bağı clients izni + aynı tenant).
 *   PUT    — açık "Kaydı Güncelle" (taslak önbellekten doğrulanır; 0 sağlayıcı çağrısı).
 *   DELETE — yumuşak silme (?rowVersion= verilirse CAS).
 * Başka tenant'ın / silinmiş / var olmayan kimlik → aynı 404 (varlık sızdırılmaz). Demo → yazma yok.
 * clients izni yoksa yanıtlarda clientId daima null.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();

  const r = await getAnalysis(guard.db, guard.tenantId, id.toLowerCase());
  if (!r.ok) return r.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
  // NK-R3: "Gelecek Yılları Göster" alt-yetkisi yoksa gelecek dönemler / gelecek yıl zamanlaması gönderilmez.
  const view = viewForViewer(toAnalysisView(r.value), futureYearsOptsFor(guard.profile));
  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  return classicJson(200, { ok: true, analysis: canSeeClients ? view : { ...view, clientId: null } });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validatePatchRequest(body.value);
  if (!v.ok) return validationResponse(v);

  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  if (v.value.clientId) {
    if (!canSeeClients) return classicError("CLIENTS_PERMISSION_REQUIRED");
    const belongs = await clientBelongsToTenant(guard.db, guard.tenantId, v.value.clientId);
    if (belongs === null) return classicError("DB_ERROR");
    if (!belongs) return classicError("CLIENT_NOT_FOUND");
  } else if (v.value.clientId === null && !canSeeClients) {
    return classicError("CLIENTS_PERMISSION_REQUIRED");
  }

  const r = await updateAnalysis(guard.db, guard.tenantId, id.toLowerCase(), v.value.rowVersion, { title: v.value.title, clientId: v.value.clientId });
  if (!r.ok) {
    if (r.reason === "not_found") return classicNotFound();
    if (r.reason === "conflict") return classicError("CONFLICT");
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_updated", subEntity: "analysis", errorClass: "server" });
    return classicError("DB_ERROR");
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_updated", subEntity: "analysis", resourceId: r.value.id });
  const x = r.value;
  return classicJson(200, {
    ok: true,
    row: { id: x.id, kind: x.kind, title: x.title, clientId: canSeeClients ? x.client_id : null, techniques: x.techniques, status: x.status, rowVersion: x.row_version, createdAt: x.created_at, updatedAt: x.updated_at },
  });
}

/**
 * PUT — açık "Kaydı Güncelle": { request, referenceDate, resultHash, rowVersion }. Uzmanın "Bilgileri Düzenle →
 * Yeniden Hesapla" ile gördüğü taslak YALNIZ önbellekten yeniden kurulur (0 sağlayıcı çağrısı), özet doğrulanır,
 * kayıt row_version CAS ile değiştirilir. Tür değişemez (400 KIND_MISMATCH). Kayıt hiçbir zaman sessizce değişmez.
 */
export async function PUT(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validateReplaceRequest(body.value);
  if (!v.ok) return validationResponse(v);
  const fy = futureYearsOptsFor(guard.profile);
  const rq = v.value.request;
  if (rq.kind === "person" && !targetAllowed(rq.input.targetDate ?? v.value.referenceDate, fy)) {
    return classicJson(403, { ok: false, code: "FUTURE_YEARS_PERMISSION_REQUIRED", error: "Gelecek yıllara ait hesaplama için \"Gelecek Yılları Göster\" izniniz olmalı. Hedef tarihi bu yıl içinde seçin.", field: "request.input.targetDate" });
  }
  const cur = await getAnalysis(guard.db, guard.tenantId, id.toLowerCase());
  if (!cur.ok) return cur.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
  if (cur.value.kind !== rq.kind) return classicJson(400, { ok: false, code: "KIND_MISMATCH", error: "Kaydın türü değiştirilemez.", field: "request.kind" });

  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  // Danışan izni olmayan uzman kayıttaki mevcut danışan bağını göremez ve değiştiremez → mevcut bağ korunur.
  const ref = canSeeClients ? v.value : { ...v.value, request: { ...rq, clientId: cur.value.client_id } };
  const r = await replaceClassicAnalysis(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account, canLinkClients: canSeeClients || ref.request.clientId === cur.value.client_id },
    id.toLowerCase(),
    v.value.rowVersion,
    ref,
    buildClassicServiceDeps(guard.db),
  );
  if (!r.body.ok) {
    if (r.status >= 500) await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_updated", subEntity: "analysis", errorClass: "server" });
    return classicJson(r.status, r.body);
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_updated", subEntity: "analysis", resourceId: r.body.analysis.id });
  const view = viewForViewer(r.body.analysis, fy);
  return classicJson(200, { ok: true, analysis: canSeeClients ? view : { ...view, clientId: null } });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const rv = req.nextUrl.searchParams.get("rowVersion");
  if (rv !== null && !/^[1-9]\d{0,9}$/.test(rv)) return classicJson(400, { ok: false, code: "INVALID_ROW_VERSION", error: "Sürüm bilgisi geçersiz." });

  const r = await softDeleteAnalysis(guard.db, guard.tenantId, id.toLowerCase(), rv === null ? null : Number(rv));
  if (!r.ok) {
    if (r.reason === "not_found") return classicNotFound();
    if (r.reason === "conflict") return classicError("CONFLICT");
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_deleted", subEntity: "analysis", errorClass: "server" });
    return classicError("DB_ERROR");
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_deleted", subEntity: "analysis", resourceId: id.toLowerCase() });
  return classicJson(200, { ok: true, id: r.value.id });
}
