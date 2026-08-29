import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import { storeError, invalidId, STORE_UUID_RE } from "@/lib/store/adminHttp";
import {
  STORE_PHOTO_BUCKET,
  STORE_PHOTO_MIME_EXT,
  STORE_PHOTO_MAX_BYTES,
  buildStoreCategoryImagePath,
  isOwnedStoreCategoryImagePath,
} from "@/lib/store/productImage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * /api/admin/magaza/categories/[id]/image — OWNER-ONLY kategori görseli yönetimi.
 *
 * Kategori TEK görsellidir: yükleme/replace mevcut image_path'i yeni path ile değiştirir,
 * eski storage objesini temizler. image_path YALNIZ bu adanmış uçtan mutate edilir —
 * normal kategori PATCH allowlist'i image_path içermez (mass-assignment koruması).
 *
 *   - POST:   multipart/form-data { file } → server MIME (jpeg/png/webp) + boyut (5MB)
 *             + server-üretilen path (`categories/{id}/{uuid}.{ext}`). Client path/URL YOK.
 *   - DELETE: image_path = NULL + eski storage objesi temizlenir (idempotent).
 */

/** Eski kategori görselini best-effort temizle — asla isteği bozmaz (yeni DB referansı korunur). */
async function cleanupOldObject(db: SupabaseClient, oldPath: string | null): Promise<void> {
  if (!isOwnedStoreCategoryImagePath(oldPath)) return;
  const { error } = await db.storage.from(STORE_PHOTO_BUCKET).remove([oldPath]);
  if (error) {
    // Kontrollü: eski obje silinemezse yeni doğru referans korunur; ham hata sızmaz.
    console.error("[store] kategori eski görsel temizlenemedi", { code: error.name });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id: categoryId } = await ctx.params;
  if (!STORE_UUID_RE.test(categoryId)) return invalidId();

  // Kategori var mı? (+ mevcut görsel path'i replace/cleanup için).
  const { data: category, error: cErr } = await db
    .from("store_categories")
    .select("id, image_path")
    .eq("id", categoryId)
    .maybeSingle();
  if (cErr) return storeError("Görsel yüklenemedi.", "STORE_CATEGORY_IMAGE_UPLOAD_FAILED", 500);
  if (!category) return storeError("Kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return storeError("Geçersiz istek gövdesi.", "STORE_INVALID_BODY", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return storeError("Dosya bulunamadı.", "STORE_IMAGE_MISSING", 400);
  }

  // Server MIME doğrulaması (client uzantısına/adına güvenilmez). SVG/GIF reddedilir.
  const ext = STORE_PHOTO_MIME_EXT[file.type];
  if (!ext) {
    return storeError("Yalnızca JPEG/PNG/WEBP görselleri yüklenebilir.", "STORE_IMAGE_MIME", 415);
  }
  if (file.size <= 0 || file.size > STORE_PHOTO_MAX_BYTES) {
    return storeError("Görsel boyutu 5 MB sınırını aşıyor.", "STORE_IMAGE_TOO_LARGE", 413);
  }

  const oldPath = (category.image_path as string | null) ?? null;
  const uuid = crypto.randomUUID();
  const filePath = buildStoreCategoryImagePath(categoryId, ext, uuid);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage
    .from(STORE_PHOTO_BUCKET)
    .upload(filePath, bytes, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (upErr) return storeError("Görsel yüklenemedi.", "STORE_CATEGORY_IMAGE_UPLOAD_FAILED", 500);

  // DB referansını yeni path'e geçir. Başarısızsa yeni objeyi geri al (orphan önleme).
  const { data: row, error: updErr } = await db
    .from("store_categories")
    .update({ image_path: filePath })
    .eq("id", categoryId)
    .select("*")
    .maybeSingle();

  if (updErr || !row) {
    await db.storage.from(STORE_PHOTO_BUCKET).remove([filePath]);
    return storeError("Görsel kaydedilemedi.", "STORE_CATEGORY_IMAGE_SAVE_FAILED", 500);
  }

  // DB başarılı → eski obje (varsa) temizlenir. Hata isteği bozmaz.
  if (oldPath && oldPath !== filePath) await cleanupOldObject(db, oldPath);

  const publicUrl = db.storage.from(STORE_PHOTO_BUCKET).getPublicUrl(filePath).data.publicUrl;
  return NextResponse.json({ ok: true, row, url: publicUrl }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id: categoryId } = await ctx.params;
  if (!STORE_UUID_RE.test(categoryId)) return invalidId();

  const { data: category, error: cErr } = await db
    .from("store_categories")
    .select("*")
    .eq("id", categoryId)
    .maybeSingle();
  if (cErr) return storeError("Görsel kaldırılamadı.", "STORE_CATEGORY_IMAGE_DELETE_FAILED", 500);
  if (!category) return storeError("Kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 404);

  const oldPath = (category.image_path as string | null) ?? null;

  // Zaten görselsizse idempotent başarı (tam satır döner — client tabloyu bozmaz).
  if (!oldPath) return NextResponse.json({ ok: true, row: category });

  const { data: row, error: updErr } = await db
    .from("store_categories")
    .update({ image_path: null })
    .eq("id", categoryId)
    .select("*")
    .maybeSingle();
  if (updErr || !row) return storeError("Görsel kaldırılamadı.", "STORE_CATEGORY_IMAGE_DELETE_FAILED", 500);

  await cleanupOldObject(db, oldPath);

  return NextResponse.json({ ok: true, row });
}
