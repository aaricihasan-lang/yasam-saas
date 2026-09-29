import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isKnownTemplateVersion } from "@/lib/danisan/anamnez/schema";
import {
  isValidDeleteConfirm,
  validateAnswers,
  validateFormCustom,
  validatePatchEnvelope,
  validateSourceLinks,
} from "@/lib/danisan/anamnez/validate";
import {
  ANAMNEZ_FULL_COLUMNS,
  ATTACHMENT_COLUMNS,
  anamnezError,
  anamnezJson,
  collectAnamnesisObjectPaths,
  demoReadOnly,
  fetchExplicitConsent,
  fetchHealthNoteReference,
  fetchSourceValues,
  isMissingRelation,
  loadAnamnesis,
  loadClientInTenant,
  logAnamnezEvent,
  notFound,
  notReady,
  removeObjects,
} from "@/lib/danisan/anamnez/server";
import type { AnamnezRecord, FormCustom } from "@/lib/danisan/anamnez/types";

export const runtime = "nodejs";

/**
 *   GET    /api/clients/[id]/anamnez/[anamnesisId] → { ok, anamnesis, attachments, sources, sourceMeta,
 *                                                     healthNote, explicitConsent, client }
 *   PATCH  … → taslak kaydet (CAS: baseRevision). Tamamlanmış → 409 LOCKED (DB trigger da reddeder).
 *   DELETE … → onaylı silme. Tamamlanmış: yazılı doğrulama (SİL/DELETE) zorunlu; taslak: confirmDraft.
 *              Sıra: Storage nesneleri ÖNCE silinir; başarısızsa DB'ye dokunulmaz (sessiz yetim PDF yok).
 *
 * Her sorgu tenant_id + client_id + id ile filtrelenir; eşleşme yoksa 404 (başka uzmanın
 * anamnezi UUID bilinse dahi okunamaz/değiştirilemez/silinemez).
 */

type RouteCtx = { params: Promise<{ id: string; anamnesisId: string }> };

export async function GET(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return notFound();

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();

  const { row, error } = await loadAnamnesis<AnamnezRecord>(db, tenantId, clientId, anamnesisId, ANAMNEZ_FULL_COLUMNS);
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]", action: "GET", tenantId, cause: error });
  }
  if (!row) return notFound();

  const [attRes, sources, healthNote, explicitConsent] = await Promise.all([
    db
      .from("client_anamnesis_attachments")
      .select(ATTACHMENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .eq("anamnesis_id", row.id)
      .order("created_at", { ascending: true })
      .limit(10),
    fetchSourceValues(db, tenantId, clientId, client.kan),
    fetchHealthNoteReference(db, tenantId, clientId),
    fetchExplicitConsent(db, tenantId, clientId),
  ]);

  return anamnezJson({
    ok: true,
    anamnesis: row,
    attachments: attRes.error ? [] : attRes.data ?? [],
    sources: sources.values,
    sourceMeta: sources.meta,
    healthNote,
    explicitConsent,
    client: { ad: client.ad, soyad: client.soyad },
  });
}

export async function PATCH(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnly();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return anamnezError("INVALID", 400);
  }
  const env = validatePatchEnvelope(body);
  if (!env.ok) return anamnezError("INVALID", 400, { field: env.field, error: env.error });

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();
  const { row, error } = await loadAnamnesis<AnamnezRecord>(db, tenantId, clientId, anamnesisId, ANAMNEZ_FULL_COLUMNS);
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]", action: "PATCH:load", tenantId, cause: error });
  }
  if (!row) return notFound();
  if (row.status !== "draft") return anamnezError("LOCKED", 409);
  if (row.revision !== env.value.baseRevision) return anamnezError("CONFLICT", 409, { revision: row.revision });
  if (!isKnownTemplateVersion(row.template_version)) return anamnezError("INVALID", 400);

  const update: Record<string, unknown> = {};
  let formCustom: FormCustom = row.form_custom;
  if (env.value.formCustom !== undefined) {
    const fc = validateFormCustom(row.template_version, env.value.formCustom);
    if (!fc.ok) return anamnezError("INVALID", 400, { field: fc.field, error: fc.error });
    formCustom = fc.value;
    update.form_custom = formCustom;
  }
  if (env.value.answers !== undefined || env.value.formCustom !== undefined) {
    // Cevaplar HER ZAMAN (yeni) form farkına göre yeniden doğrulanır (silinen özel alanın cevabı kalamaz).
    const ans = validateAnswers(row.template_version, formCustom, env.value.answers ?? row.answers);
    if (!ans.ok) return anamnezError("INVALID", 400, { field: ans.field, error: ans.error });
    update.answers = ans.value;
  }
  if (env.value.sourceLinks !== undefined) {
    const sl = validateSourceLinks(row.template_version, env.value.sourceLinks, row.source_links ?? {}, new Date().toISOString());
    if (!sl.ok) return anamnezError("INVALID", 400, { field: sl.field, error: sl.error });
    update.source_links = sl.value;
  }
  if (env.value.title !== undefined) update.title = env.value.title;
  if (env.value.assessmentDate !== undefined) update.assessment_date = env.value.assessmentDate;
  update.revision = row.revision + 1;
  update.updated_by_user_id = userId;

  const { data, error: upErr } = await db
    .from("client_anamneses")
    .update(update)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("id", row.id)
    .eq("revision", row.revision)
    .eq("status", "draft")
    .select("id, revision, updated_at");
  if (upErr) {
    if (upErr.code === "23514") return anamnezError("LOCKED", 409);
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]", action: "PATCH", tenantId, cause: upErr, usage: { guard, req, module: "clients", failedAction: "record_updated", subEntity: "anamnesis" } });
  }
  const saved = ((data ?? []) as Array<{ id: string; revision: number; updated_at: string }>)[0];
  if (!saved) return anamnezError("CONFLICT", 409);
  // USAGE360: taslak otomatik kaydı 60 sn kovasında tek sayılır (resourceId = anamnez id; HMAC).
  await trackUsage(guard, req, { module: "clients", action: "record_updated", subEntity: "anamnesis", resourceId: saved.id });
  return anamnezJson({ ok: true, revision: saved.revision, updated_at: saved.updated_at, answers: update.answers, formCustom, sourceLinks: update.source_links });
}

export async function DELETE(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnly();

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();
  const { row, error } = await loadAnamnesis<{ id: string; status: "draft" | "completed" }>(db, tenantId, clientId, anamnesisId, "id, status");
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]", action: "DELETE:load", tenantId, cause: error });
  }
  if (!row) return notFound();

  // Sunucu tarafı onay: tamamlanmış kayıtta yazılı doğrulama (SİL / DELETE) şart.
  if (!isValidDeleteConfirm(row.status, body)) return anamnezError("CONFIRM_REQUIRED", 400);

  // 1) Storage ÖNCE: DB satırları + önek listelemesi (yetim yüklemeler dahil).
  const collected = await collectAnamnesisObjectPaths(db, tenantId, clientId, row.id);
  if (!collected.ok) return anamnezError("STORAGE_FAILED", 502);
  const removed = await removeObjects(db, collected.paths);
  if (!removed) return anamnezError("STORAGE_FAILED", 502);

  // 2) DB: anamnez + (cascade) ek metadata'sı.
  const { error: delErr } = await db
    .from("client_anamneses")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("id", row.id);
  if (delErr) return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]", action: "DELETE", tenantId, cause: delErr, usage: { guard, req, module: "clients", failedAction: "record_deleted", subEntity: "anamnesis" } });

  logAnamnezEvent("deleted", {
    tenant: tenantId,
    user: userId,
    client: clientId,
    anamnesis: row.id,
    status: row.status,
    files: collected.paths.length,
  });
  await trackUsage(guard, req, { module: "clients", action: "record_deleted", subEntity: "anamnesis", resourceId: row.id });
  return anamnezJson({ ok: true, deleted: row.id, filesRemoved: collected.paths.length });
}
