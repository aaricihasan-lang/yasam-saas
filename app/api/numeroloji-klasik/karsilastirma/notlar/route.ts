import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid } from "@/lib/numeroloji-klasik/input";
import { classicError, classicJson, classicNotFound, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { clientBelongsToTenant, insertNote, listNotes } from "@/lib/numeroloji-klasik/server/repository";
import {
  buildComparison,
  COMPARE_MAX_BODY_BYTES,
  noteSnapshotOf,
  readLimitedJsonBody,
  toNoteView,
  toNoteViews,
  validateNoteCreate,
} from "@/lib/numeroloji-klasik/server/compareService";

export const runtime = "nodejs";

/**
 * /api/numeroloji-klasik/karsilastirma/notlar
 *   GET  ?clientId=&legacyId=&classicId= — notlar (son 50; tenant oturumdan). clientId → clients izni.
 *   POST { legacyId?, classicId?, clientId?, body } — sunucu hizalamayı KAYITLI verilerden yeniden kurar ve
 *        snapshot = buildNoteSnapshot(alignment) + savedAt saklar. Metin HAM saklanır (kontrol karakterleri atılır;
 *        kaçışlama UI'dadır). Demo → 403. clientId → clients izni + aynı tenant.
 * Yanıtlarda: clients izni yoksa clientId null; bağlı klasik analiz silinmişse classicId null + snapshot'ta klasik
 * taraf yok + classicDeleted: true.
 */
const CLIENTS_PERMISSION_REQUIRED = { ok: false, code: "CLIENTS_PERMISSION_REQUIRED", error: "Danışana bağlamak için Danışan Yönetimi izniniz olmalı." };

export async function GET(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const filter: { clientId?: string; legacyRecordId?: string; classicAnalysisId?: string } = {};
  for (const [param, key] of [["clientId", "clientId"], ["legacyId", "legacyRecordId"], ["classicId", "classicAnalysisId"]] as const) {
    const v = sp.get(param);
    if (v === null || v === "") continue;
    if (!isUuid(v)) return classicJson(400, { ok: false, code: "INVALID_ID", error: "Kayıt kimliği geçersiz.", field: param });
    filter[key] = v.toLowerCase();
  }
  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  if (filter.clientId && !canSeeClients) return classicJson(403, CLIENTS_PERMISSION_REQUIRED);

  const r = await listNotes(guard.db, guard.tenantId, filter);
  if (!r.ok) return classicError("DB_ERROR");
  const notes = await toNoteViews(guard.db, guard.tenantId, r.value, { canSeeClients });
  if (!notes) return classicError("DB_ERROR");
  return classicJson(200, { ok: true, notes });
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const body = await readLimitedJsonBody(req, COMPARE_MAX_BODY_BYTES);
  if (!body.ok) return validationResponse(body);
  const v = validateNoteCreate(body.value);
  if (!v.ok) return validationResponse(v);

  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  if (v.value.clientId) {
    if (!canSeeClients) return classicJson(403, CLIENTS_PERMISSION_REQUIRED);
    const belongs = await clientBelongsToTenant(guard.db, guard.tenantId, v.value.clientId);
    if (belongs === null) return classicError("DB_ERROR");
    if (!belongs) return classicError("CLIENT_NOT_FOUND");
  }

  const c = await buildComparison({ db: guard.db, tenantId: guard.tenantId, viewerId: guard.userId }, v.value);
  if (!c.ok) return c.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");

  const saved = await insertNote(guard.db, guard.tenantId, {
    clientId: v.value.clientId,
    legacyRecordId: v.value.legacyId,
    classicAnalysisId: v.value.classicId,
    snapshot: noteSnapshotOf(c.value.alignment),
    body: v.value.body,
    createdBy: guard.userId,
  });
  if (!saved.ok) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_created", subEntity: "analysis", errorClass: "server" });
    return classicError("DB_ERROR");
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_created", subEntity: "analysis", resourceId: saved.value.id });
  // Klasik analiz buildComparison'da canlı doğrulandı (silinmişse 404) → classicDeleted false.
  return classicJson(201, { ok: true, note: toNoteView(saved.value, { canSeeClients }) });
}
