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

/**
 * POST /api/kisisel-arsiv/files/upload — SUNUCU-YETKİLİ SIGNED UPLOAD HAZIRLIĞI (P1-3).
 *
 * NEDEN SIGNED UPLOAD (byte-proxy DEĞİL):
 *   Dosya byte'larını Vercel Function üzerinden geçirmek KABUL EDİLEMEZ — Vercel
 *   Functions request body limiti ~4.5 MB'dir (next.config serverActions.bodySizeLimit
 *   platform sınırını AŞMAZ). Bu yüzden dosya byte'ları API route'tan GEÇMEZ; sunucu
 *   yalnız kısa ömürlü, tek-kullanımlık signed upload capability üretir.
 *
 * GÜVENLİK:
 *   - requireModuleAccess → x-user-id + x-session-token binding + modül izni.
 *   - tenantId SUNUCUDAN (guard.tenantId); client body/query/path'inden ALINMAZ.
 *   - archive ownership (personal_archives.id = archiveId AND tenant_id = guard.tenantId)
 *     SUNUCUDA doğrulanır (IDOR engeli).
 *   - obje yolu SUNUCUDA üretilir (uuid + sanitize edilmiş dosya adı) → client path enjekte edemez.
 *   - createSignedUploadUrl service_role ile, { upsert: false } → var olan objeyi ezemez.
 *   Bucket PRIVATE kalır; anon INSERT policy GEREKMEZ — signed token capability yeterlidir.
 *
 * İstek (JSON, DOSYA BYTES YOK):
 *   { archiveId: string, fileName: string, fileType?: string, fileSize?: number }
 * Yanıt:
 *   { ok: true, path: string, token: string }
 * Ardından tarayıcı: supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)
 * ve son olarak POST /api/kisisel-arsiv/files/finalize ile metadata yazılır.
 */

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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const archiveId = String(body.archiveId ?? "").trim();
  if (!archiveId) {
    return NextResponse.json({ ok: false, error: "archiveId gerekli." }, { status: 400 });
  }

  const rawName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName : "dosya";
  const fileSize = body.fileSize != null ? Number(body.fileSize) : null;

  // Client'ın bildirdiği boyut ürün limitini aşamaz (soft guard; gerçek yükleme signed
  // URL ile yapıldığından byte'lar sunucudan geçmez, ancak kendi tenant namespace'i).
  if (fileSize != null && Number.isFinite(fileSize) && fileSize > PERSONAL_ARCHIVE_MAX_BYTES) {
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
  const safeName = sanitizePersonalArchiveFileName(rawName);
  const uuid = crypto.randomUUID();
  const path = buildPersonalArchivePath(tenantId, archiveId, uuid, safeName);

  const { data: signed, error: signError } = await db.storage
    .from(PERSONAL_ARCHIVE_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (signError || !signed?.token) {
    console.error("[kisisel-arsiv/files/upload] createSignedUploadUrl", signError);
    return NextResponse.json({ ok: false, error: "Yükleme hazırlanamadı." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path: signed.path, token: signed.token });
}
