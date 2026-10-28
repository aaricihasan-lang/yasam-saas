import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid, validateAnalysisRequest } from "@/lib/numeroloji-klasik/input";
import { buildClassicServiceDeps } from "@/lib/numeroloji-klasik/server/deps";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { CLASSIC_LIST_LIMIT, listAnalyses } from "@/lib/numeroloji-klasik/server/repository";
import { computeClassicAnalysis } from "@/lib/numeroloji-klasik/server/service";

export const runtime = "nodejs";
/** En kötü durum: paralel çağrılar (her biri ≤ 45 sn) + DB payı. */
export const maxDuration = 120;

/**
 * /api/numeroloji-klasik/analyses
 *   GET  — kayıtlı analiz listesi (son 20; ?offset=, ?clientId=) — 0 sağlayıcı çağrısı.
 *   POST — yeni analiz hesapla + kaydet (önbellek önce; demo/bayrak/kota korumalı).
 *
 * Güvenlik: bayrak kapalı → 404 (guard'dan önce); requireModuleAccess("numerology"); tenant YALNIZ oturumdan;
 * gövde ≤ 16 KB + katı doğrulama; danışan bağı clients izni + aynı tenant; yanıt no-store; sağlayıcı adı yok.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const offsetRaw = sp.get("offset");
  const offset = offsetRaw && /^\d{1,6}$/.test(offsetRaw) ? Number(offsetRaw) : 0;
  const clientId = sp.get("clientId");
  if (clientId !== null && !isUuid(clientId)) return classicJson(400, { ok: false, code: "INVALID_CLIENT_ID", error: "Geçersiz danışan kimliği." });

  const r = await listAnalyses(guard.db, guard.tenantId, { offset, limit: CLASSIC_LIST_LIMIT, clientId: clientId?.toLowerCase() ?? null });
  if (!r.ok) return classicError("DB_ERROR");
  return classicJson(200, {
    ok: true,
    rows: r.value.rows.map((x) => ({
      id: x.id, kind: x.kind, title: x.title, clientId: x.client_id, techniques: x.techniques, status: x.status,
      rowVersion: x.row_version, createdAt: x.created_at, updatedAt: x.updated_at,
    })),
    hasMore: r.value.hasMore,
    nextOffset: r.value.hasMore ? offset + CLASSIC_LIST_LIMIT : null,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validateAnalysisRequest(body.value);
  if (!v.ok) return validationResponse(v);

  const result = await computeClassicAnalysis(
    {
      db: guard.db,
      tenantId: guard.tenantId,
      userId: guard.userId,
      isDemo: guard.is_demo_account,
      canLinkClients: resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients"),
    },
    v.value,
    buildClassicServiceDeps(guard.db),
  );

  if (result.body.ok) {
    await trackUsage(guard, req, { module: "numerology", action: "analysis_run", subEntity: "analysis", resourceId: result.body.analysis.id });
  } else if (result.status >= 500) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "analysis_run", subEntity: "analysis", errorClass: "server" });
  }
  const headers: Record<string, string> = {};
  if (!result.body.ok && result.body.retryAfterSec) headers["Retry-After"] = String(result.body.retryAfterSec);
  return classicJson(result.status, result.body, headers);
}
