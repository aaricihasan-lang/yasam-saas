import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { PERSONAL_ARCHIVE_BUCKET } from "@/lib/kisisel-arsiv/storagePath";

export const runtime = "nodejs";

const FILES_TABLE = "personal_archive_files";
const ARCHIVES_TABLE = "personal_archives";

/** Signed URL süre politikası KORUNUR (P1-1 kapsamında değiştirilmez). */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * GET /api/kisisel-arsiv/signed-url
 *
 * `personal-archive` (PRIVATE) bucket'ı için kısa ömürlü signed URL üretir.
 *
 * P1-1 SESSION BINDING FIX:
 *   ESKİ MODEL (zayıf-auth): userId + tenantId + filePath QUERY'den alınırdı; yalnız
 *   users(id=userId AND tenant_id=tenantId AND active) kontrol edilirdi. x-session-token
 *   bağlaması YOKTU → yalnızca userId+tenantId bilen biri (spoof edilebilir) signed URL
 *   alabiliyordu ve tenant öneki altındaki HERHANGİ bir path için (metadata olmasa bile).
 *
 *   YENİ MODEL (canonical auth contract):
 *     1. requireModuleAccess(req, "personal_archive") → x-user-id + x-session-token
 *        DOĞRULANIR (token aktif + binding: token sahibi == x-user-id) + modül izni.
 *     2. tenantId ve userId SUNUCUDAN (guard) gelir; QUERY'den ASLA alınmaz.
 *     3. Demo hesap → 403.
 *     4. filePath yalnız caller tenant öneki altında olabilir (traversal/cross-tenant reddi).
 *     5. GÜÇLÜ KAYNAK SAHİPLİĞİ: personal_archive_files'ta (tenant_id=guard.tenantId AND
 *        file_path=filePath) satırı GERÇEKTEN var olmalı — tenant öneki bilmek YETMEZ.
 *        Ek olarak archive_id → personal_archives(id, tenant_id=guard.tenantId) doğrulanır.
 *     6. Tüm kontroller geçerse service_role (guard.db) ile signed URL üretilir.
 *
 * Bucket PRIVATE kalır; anon client asla storage'a dokunmaz.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  // Demo hesap: signed URL üretimi engellenir.
  if (is_demo_account === true) {
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get("filePath")?.trim() ?? "";
  if (!filePath) {
    return NextResponse.json({ error: "Dosya yolu gerekli." }, { status: 400 });
  }

  // Savunma katmanı 1 — path yalnız SUNUCU-TÜRETİLMİŞ tenant öneki altında olabilir.
  // tenantId QUERY'den DEĞİL guard'dan gelir → cross-tenant prefix / traversal reddi.
  if (filePath.includes("..") || filePath.includes("://") || !filePath.startsWith(`${tenantId}/`)) {
    return NextResponse.json({ error: "Geçersiz dosya yolu." }, { status: 403 });
  }

  // Savunma katmanı 2 (ASIL yetki) — dosya metadata'sı gerçekten bu tenant'a AİT olmalı.
  // Tenant öneki altında rastgele bir path bilmek signed URL almak için YETERSİZ.
  const { data: fileRow, error: fileErr } = await db
    .from(FILES_TABLE)
    .select("archive_id")
    .eq("tenant_id", tenantId)
    .eq("file_path", filePath)
    .maybeSingle();

  if (fileErr) {
    console.error("[kisisel-arsiv/signed-url] metadata lookup", fileErr);
    return NextResponse.json({ error: "Dosya doğrulanamadı." }, { status: 500 });
  }
  if (!fileRow) {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
  }

  // Savunma katmanı 3 — archive de aynı tenant'a ait olmalı (IDOR ikinci savunma).
  const { data: archiveRow, error: archiveErr } = await db
    .from(ARCHIVES_TABLE)
    .select("id")
    .eq("id", fileRow.archive_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (archiveErr) {
    console.error("[kisisel-arsiv/signed-url] archive lookup", archiveErr);
    return NextResponse.json({ error: "Dosya doğrulanamadı." }, { status: 500 });
  }
  if (!archiveRow) {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
  }

  // Service role (guard.db) ile signed URL üret — bucket PRIVATE olsa bile çalışır.
  const { data: signed, error: signErr } = await db.storage
    .from(PERSONAL_ARCHIVE_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    console.error("[kisisel-arsiv/signed-url]", signErr);
    return NextResponse.json({ error: "URL üretilemedi." }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: signed.signedUrl });
}
