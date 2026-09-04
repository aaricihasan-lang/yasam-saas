import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PERSONAL_ARCHIVE_BUCKET,
  isOwnedPersonalArchivePath,
} from "@/lib/kisisel-arsiv/storagePath";

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

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

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
    console.error("[kisisel-arsiv/files/finalize] exists check", existsError);
    return NextResponse.json({ ok: false, error: "Dosya doğrulanamadı." }, { status: 500 });
  }
  if (!objectExists) {
    return NextResponse.json({ ok: false, error: "Yüklenen dosya bulunamadı." }, { status: 409 });
  }

  const fileName = typeof body.fileName === "string" && body.fileName ? body.fileName : "dosya";
  const fileType = typeof body.fileType === "string" && body.fileType ? body.fileType : null;
  const fileSize =
    body.fileSize != null && Number.isFinite(Number(body.fileSize)) ? Number(body.fileSize) : null;

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
    console.error("[kisisel-arsiv/files/finalize] metadata insert", metaError);
    return NextResponse.json({ ok: false, error: "Dosya kaydedilemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row });
}
