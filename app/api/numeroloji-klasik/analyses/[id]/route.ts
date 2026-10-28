import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid, validatePatchRequest } from "@/lib/numeroloji-klasik/input";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { clientBelongsToTenant, getAnalysis, softDeleteAnalysis, updateAnalysis } from "@/lib/numeroloji-klasik/server/repository";
import { toAnalysisView } from "@/lib/numeroloji-klasik/server/service";

export const runtime = "nodejs";

/**
 * /api/numeroloji-klasik/analyses/[id]
 *   GET    — kayıtlı analizi aç (0 sağlayıcı çağrısı; yeniden hesap YOK).
 *   PATCH  — { title?, clientId?: uuid|null, rowVersion } (row_version CAS; danışan bağı clients izni + aynı tenant).
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
  const view = toAnalysisView(r.value);
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
