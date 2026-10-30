import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid, validateDraftRef } from "@/lib/numeroloji-klasik/input";
import { buildClassicServiceDeps } from "@/lib/numeroloji-klasik/server/deps";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { CLASSIC_LIST_LIMIT, listAnalyses } from "@/lib/numeroloji-klasik/server/repository";
import { persistClassicAnalysis } from "@/lib/numeroloji-klasik/server/service";
import { targetAllowed } from "@/lib/numeroloji-klasik/futureYears";
import { futureYearsOptsFor, viewForViewer } from "@/lib/numeroloji-klasik/server/futureYearsView";

export const runtime = "nodejs";
/** En kötü durum: paralel çağrılar (her biri ≤ 45 sn) + DB payı. */
export const maxDuration = 120;

/**
 * /api/numeroloji-klasik/analyses
 *   GET  — kayıtlı analiz listesi (20'lik sayfa; ?offset=, ?clientId=, ?sira=ad) — 0 sağlayıcı çağrısı.
 *          ?sira=ad → başlığa göre Türkçe A–Z (Kayıtlı Analizler ekranı; 30.10.2026); verilmezse yeni kayıt önce
 *          (Danışan dosyası kartı değişmez). ?clientId= → clients izni
 *          (yoksa 403 CLIENTS_PERMISSION_REQUIRED); clients izni yoksa yanıtlarda clientId daima null.
 *   POST — açık KAYDET: { request, referenceDate, resultHash } → taslak YALNIZ önbellekten yeniden kurulur
 *          (0 sağlayıcı çağrısı), sonuç özeti doğrulanır, TEK INSERT. Hesap için: POST /api/numeroloji-klasik/hesapla.
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
  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  if (clientId !== null && !canSeeClients) {
    return classicJson(403, { ok: false, code: "CLIENTS_PERMISSION_REQUIRED", error: "Danışana göre listelemek için Danışan Yönetimi izniniz olmalı." });
  }

  const sira = sp.get("sira");
  if (sira !== null && sira !== "ad" && sira !== "yeni") return classicJson(400, { ok: false, code: "INVALID_SORT", error: "Geçersiz sıralama." });
  const r = await listAnalyses(guard.db, guard.tenantId, { offset, limit: CLASSIC_LIST_LIMIT, clientId: clientId?.toLowerCase() ?? null, sort: sira === "ad" ? "title_tr" : "created" });
  if (!r.ok) return classicError("DB_ERROR");
  return classicJson(200, {
    ok: true,
    rows: r.value.rows.map((x) => ({
      id: x.id, kind: x.kind, title: x.title, clientId: canSeeClients ? x.client_id : null, techniques: x.techniques, status: x.status,
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
  const v = validateDraftRef(body.value);
  if (!v.ok) return validationResponse(v);
  const ref = v.value;
  // NK-R3: yetkisiz uzman gelecek yıla düşen hedef tarihli sonucu KAYDEDEMEZ (hesaplayamadığı gibi).
  const fy = futureYearsOptsFor(guard.profile);
  if (ref.request.kind === "person" && !targetAllowed(ref.request.input.targetDate ?? ref.referenceDate, fy)) {
    return classicJson(403, { ok: false, code: "FUTURE_YEARS_PERMISSION_REQUIRED", error: "Gelecek yıllara ait hesaplama için \"Gelecek Yılları Göster\" izniniz olmalı. Hedef tarihi bu yıl içinde seçin.", field: "request.input.targetDate" });
  }

  const canLinkClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  const result = await persistClassicAnalysis(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account, canLinkClients },
    ref,
    buildClassicServiceDeps(guard.db),
  );

  if (result.body.ok) {
    await trackUsage(guard, req, { module: "numerology", action: "record_created", subEntity: "analysis", resourceId: result.body.analysis.id });
  } else if (result.status >= 500) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_created", subEntity: "analysis", errorClass: "server" });
  }
  const outBody = result.body.ok
    ? { ...result.body, analysis: { ...viewForViewer(result.body.analysis, fy), ...(canLinkClients ? {} : { clientId: null }) } }
    : result.body;
  return classicJson(result.status, outBody);
}
