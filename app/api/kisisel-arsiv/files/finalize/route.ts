import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  PERSONAL_ARCHIVE_BUCKET,
  PERSONAL_ARCHIVE_MAX_BYTES,
  isOwnedPersonalArchivePath,
} from "@/lib/kisisel-arsiv/storagePath";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { logArchiveServerError } from "@/lib/kisisel-arsiv/archiveError";
import {
  QUOTA_EXCEEDED_MESSAGE,
  QUOTA_UNAVAILABLE_MESSAGE,
  commitPersonalArchiveUpload,
  isAllowedPersonalArchiveFile,
  discardUnregisteredPersonalArchiveObjects,
} from "@/lib/kisisel-arsiv/uploadPolicy";
export const runtime = "nodejs";

/**
 * POST /api/kisisel-arsiv/files/finalize — signed upload SONRASI metadata yazımı (P1-3).
 *
 * Tarayıcı signed URL ile objeyi yükledikten sonra bu uç personal_archive_files satırını
 * SUNUCUDA yazar. Güvenlik:
 *   - requireModuleAccess + tenantId SUNUCUDAN (guard.tenantId).
 *   - archive ownership doğrulanır (IDOR).
 *   - path client'tan gelir AMA yalnız `${guard.tenantId}/${archiveId}/` öneki kabul edilir
 *     (cross-tenant / arbitrary path metadata enjeksiyonu engeli).
 *   - GÜÇLÜ BAĞLAMA: obje gerçekten storage'da VAR MI kontrol edilir (exists) → var olmayan
 *     / uydurma path için metadata satırı OLUŞTURULMAZ.
 *   - tenant_id ve file_path metadata'ya SUNUCU değerleriyle yazılır.
 *
 * İstek (JSON):
 *   { archiveId, path, fileName, fileType?, fileSize? }
 */

const FILES_TABLE = "personal_archive_files";

async function archiveInTenant(
  db: SupabaseClient,
  archiveId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("personal_archives")
    .select("id")
    .eq("id", archiveId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return demoReadOnlyResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const archiveId = String(body.archiveId ?? "").trim();
  const path = String(body.path ?? "").trim();
  if (!archiveId || !path) {
    return NextResponse.json({ ok: false, error: "archiveId ve path gerekli." }, { status: 400 });
  }

  // IDOR: archive bu tenant'a ait olmalı.
  if (!(await archiveInTenant(db, archiveId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Arşiv bu hesaba ait değil." }, { status: 403 });
  }

  // Path yalnız bu tenant + archive öneki altında olabilir (client arbitrary path enjekte edemez).
  if (!isOwnedPersonalArchivePath(path, tenantId, archiveId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  // Güçlü bağlama: obje gerçekten yüklenmiş olmalı — yoksa metadata yazma.
  const { data: objectExists, error: existsError } = await db.storage
    .from(PERSONAL_ARCHIVE_BUCKET)
    .exists(path);
  if (existsError) {
    logArchiveServerError("kisisel-arsiv/files/finalize", "POST:exists", tenantId, existsError);
    await trackUsage(guard, req, { module: "personal_archive", action: "action_failed", failedAction: "file_uploaded", subEntity: "file", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Dosya doğrulanamadı." }, { status: 500 });
  }
  if (!objectExists) {
    await trackUsage(guard, req, { module: "personal_archive", action: "action_failed", failedAction: "file_uploaded", subEntity: "file", errorClass: "conflict" });
    return NextResponse.json({ ok: false, error: "Yüklenen dosya bulunamadı." }, { status: 409 });
  }

  const fileName = typeof body.fileName === "string" && body.fileName ? body.fileName : "dosya";
  const declaredType = typeof body.fileType === "string" && body.fileType ? body.fileType : null;

  // BUG-020 ön denetim (commit'ten ÖNCE): ad/yol türü engelliyse rezervasyon henüz açıkken reddedilir →
  // nesne güvenle silinir, rezervasyon belirteç ölene kadar kotada kalır. Kayıtlı dosyaya dokunulmaz.
  if (!isAllowedPersonalArchiveFile(fileName, declaredType) || !isAllowedPersonalArchiveFile(path, null)) {
    await discardUnregisteredPersonalArchiveObjects(db, tenantId, [path]);
    await trackUsage(guard, req, { module: "personal_archive", action: "action_failed", failedAction: "file_uploaded", subEntity: "file", errorClass: "validation" });
    return NextResponse.json({ ok: false, error: "Bu dosya türü güvenlik nedeniyle kabul edilmiyor." }, { status: 415 });
  }

  // Tekrarlanan finalize (ağ tekrarı / çift tıklama): yol zaten kayıtlıysa İKİNCİ kayıt yazılmaz.
  const { data: existing, error: existingError } = await db
    .from(FILES_TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("archive_id", archiveId)
    .eq("file_path", path)
    .limit(1);
  if (existingError) {
    logArchiveServerError("kisisel-arsiv/files/finalize", "POST:existing", tenantId, existingError);
    return NextResponse.json({ ok: false, error: "Dosya doğrulanamadı." }, { status: 500 });
  }
  if (Array.isArray(existing) && existing.length > 0) {
    return NextResponse.json({ ok: true, row: existing[0], reused: true });
  }

  // DIJ-03 + BUG-020: depodaki GERÇEK boyut/tür + ATOMİK kota denetimi (istemci beyanına güvenilmez).
  // FAIL-CLOSED: doğrulanamazsa kayıt yazılmaz; nesne belirteç-güvenli atılır (sayılmayan bayt kalmaz).
  const commit = await commitPersonalArchiveUpload(db, tenantId, path, PERSONAL_ARCHIVE_MAX_BYTES);
  const realType = commit.kind === "unavailable" ? null : commit.mimetype;
  const blocked = !isAllowedPersonalArchiveFile(fileName, realType ?? declaredType);
  if (commit.kind !== "ok" || blocked) {
    // Kayıtlı dosya KORUNUR; rezervasyon açıksa silinir, değilse 0 baytlık yer tutucu (belirteç yeniden yükleyemez).
    await discardUnregisteredPersonalArchiveObjects(db, tenantId, [path]);
    await trackUsage(guard, req, { module: "personal_archive", action: "action_failed", failedAction: "file_uploaded", subEntity: "file", errorClass: commit.kind === "unavailable" ? "server" : "validation" });
    if (commit.kind === "unavailable") {
      console.error("[kisisel-arsiv/files/finalize] kota/boyut doğrulanamadı (fail-closed)");
      return NextResponse.json({ ok: false, code: "QUOTA_UNAVAILABLE", error: QUOTA_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    if (blocked) {
      return NextResponse.json({ ok: false, error: "Bu dosya türü güvenlik nedeniyle kabul edilmiyor." }, { status: 415 });
    }
    const reason = commit.kind === "rejected" ? commit.reason : "size_unknown";
    if (reason === "quota") return NextResponse.json({ ok: false, code: "QUOTA_EXCEEDED", error: QUOTA_EXCEEDED_MESSAGE }, { status: 413 });
    if (reason === "too_large") return NextResponse.json({ ok: false, error: "Dosya boyutu 50 MB sınırını aşıyor." }, { status: 413 });
    if (reason === "missing") return NextResponse.json({ ok: false, error: "Yüklenen dosya bulunamadı." }, { status: 409 });
    return NextResponse.json({ ok: false, code: "QUOTA_UNAVAILABLE", error: QUOTA_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  const fileSize = commit.size;
  const fileType = commit.mimetype ?? declaredType;

  const { data: row, error: metaError } = await db
    .from(FILES_TABLE)
    .insert({
      tenant_id: tenantId,
      archive_id: archiveId,
      file_name: fileName,
      file_path: path,
      file_type: fileType,
      file_size: fileSize,
    })
    .select("*")
    .single();

  if (metaError || !row) {
    logArchiveServerError("kisisel-arsiv/files/finalize", "POST:metadata-insert", tenantId, metaError ?? "satır yok");
    await trackUsage(guard, req, { module: "personal_archive", action: "action_failed", failedAction: "file_uploaded", subEntity: "file", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Dosya kaydedilemedi." }, { status: 500 });
  }

  // USAGE360: yalnız dosya satırının id'si (idempotency); ad/boyut/tür telemetriye GİRMEZ.
  await trackUsage(guard, req, { module: "personal_archive", action: "file_uploaded", subEntity: "file", resourceId: String((row as { id?: unknown }).id ?? "") || null });

  return NextResponse.json({ ok: true, row });
}
