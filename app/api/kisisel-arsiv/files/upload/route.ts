import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PERSONAL_ARCHIVE_BUCKET,
  PERSONAL_ARCHIVE_MAX_BYTES,
  sanitizePersonalArchiveFileName,
  buildPersonalArchivePath,
} from "@/lib/kisisel-arsiv/storagePath";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/kisisel-arsiv/files/upload — SUNUCU-YETKİLİ kişisel arşiv dosyası yükleme (P1-3).
 *
 * Önceki durum: dosya storage'a doğrudan TARAYICIDAN anon supabase client ile yükleniyordu
 * (`supabase.storage.from("personal-archive").upload(...)`), path client-kurulu
 * (`${tenantId}/${archiveId}/...`) ve bucket public + anon INSERT policy taşıyordu →
 * cross-tenant yazma mümkündü. Bu route yükleme yolunu tamamen server'a taşır:
 *   - requireModuleAccess → x-user-id + x-session-token binding + modül izni.
 *   - tenantId SUNUCUDAN (guard.tenantId); client body/query/path'inden ALINMAZ.
 *   - archive ownership (personal_archives.id = archiveId AND tenant_id = guard.tenantId)
 *     SUNUCUDA doğrulanır (IDOR engeli).
 *   - obje yolu SUNUCUDA üretilir (uuid + sanitized dosya adı) → client path enjekte edemez.
 *   - storage upload service_role ile (guard.db), upsert=false.
 *   - metadata (personal_archive_files) aynı server akışında yazılır; başarısızsa yeni
 *     yüklenen obje SERVER-SIDE best-effort temizlenir (client storage.remove ÇAĞIRMAZ).
 *
 * İstek: multipart/form-data → { archiveId: string, file: File }
 * Yanıt: { ok: true, row: <personal_archive_files satırı> }
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

  // Demo hesap: mevcut ürün semantiği — yazma yapılmaz, fail-safe no-op.
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const archiveId = String(form.get("archiveId") ?? "").trim();
  if (!archiveId) {
    return NextResponse.json({ ok: false, error: "archiveId gerekli." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı." }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ ok: false, error: "Boş dosya yüklenemez." }, { status: 400 });
  }
  if (file.size > PERSONAL_ARCHIVE_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Dosya boyutu 50 MB sınırını aşıyor." },
      { status: 413 },
    );
  }

  // IDOR: archive bu tenant'a ait olmalı — client'tan tenant/path GÜVENİLMEZ.
  if (!(await archiveInTenant(db, archiveId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Arşiv bu hesaba ait değil." }, { status: 403 });
  }

  // Obje yolu SUNUCUDA üretilir. Yalnız dosya adı client kaynaklı → sanitize edilir.
  const originalName = typeof file.name === "string" && file.name ? file.name : "dosya";
  const safeName = sanitizePersonalArchiveFileName(originalName);
  const uuid = crypto.randomUUID();
  const filePath = buildPersonalArchivePath(tenantId, archiveId, uuid, safeName);
  const contentType = file.type || "application/octet-stream";
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from(PERSONAL_ARCHIVE_BUCKET)
    .upload(filePath, bytes, { upsert: false, contentType });

  if (uploadError) {
    console.error("[kisisel-arsiv/files/upload] storage upload", uploadError);
    return NextResponse.json({ ok: false, error: "Dosya yüklenemedi." }, { status: 500 });
  }

  // Metadata satırı — tenant_id ve file_path SUNUCUDAN; client değeri kullanılmaz.
  const { data: row, error: metaError } = await db
    .from(FILES_TABLE)
    .insert({
      tenant_id: tenantId,
      archive_id: archiveId,
      file_name: originalName,
      file_path: filePath,
      file_type: contentType,
      file_size: file.size,
    })
    .select("*")
    .single();

  if (metaError || !row) {
    // Metadata başarısız → orphan obje kalmasın. SERVER-SIDE best-effort cleanup.
    const { error: cleanupError } = await db.storage
      .from(PERSONAL_ARCHIVE_BUCKET)
      .remove([filePath]);
    if (cleanupError) {
      console.error("[kisisel-arsiv/files/upload] cleanup after metadata fail", cleanupError);
    }
    console.error("[kisisel-arsiv/files/upload] metadata insert", metaError);
    return NextResponse.json({ ok: false, error: "Dosya kaydedilemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row });
}
