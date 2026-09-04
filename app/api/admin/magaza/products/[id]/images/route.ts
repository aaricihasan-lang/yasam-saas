import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import { storeError, invalidId, STORE_UUID_RE } from "@/lib/store/adminHttp";
import {
  STORE_PHOTO_BUCKET,
  STORE_PHOTO_MIME_EXT,
  STORE_PHOTO_MAX_BYTES,
  buildStorePhotoPath,
} from "@/lib/store/productImage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/magaza/products/[id]/images — OWNER-ONLY ürün görseli yükleme.
 *   - Sunucu-yetkili: server MIME allowlist (jpeg/png/webp) + boyut (5MB) + server path.
 *   - Client dosya adı/path/URL kabul edilmez; arbitrary URL fetch YOK.
 *   - İlk görsel otomatik ana görsel olur. DB insert başarısızsa yüklenen obje temizlenir.
 */

const ALT_MAX = 300;

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id: productId } = await ctx.params;
  if (!STORE_UUID_RE.test(productId)) return invalidId();

  // Ürün var mı?
  const { data: product, error: pErr } = await db
    .from("store_products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (pErr) return storeError("Görsel yüklenemedi.", "STORE_IMAGE_UPLOAD_FAILED", 500);
  if (!product) return storeError("Ürün bulunamadı.", "STORE_PRODUCT_NOT_FOUND", 404);

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

  // Server MIME doğrulaması (client uzantısına güvenilmez).
  const ext = STORE_PHOTO_MIME_EXT[file.type];
  if (!ext) {
    return storeError("Yalnızca JPEG/PNG/WEBP görselleri yüklenebilir.", "STORE_IMAGE_MIME", 415);
  }
  if (file.size <= 0 || file.size > STORE_PHOTO_MAX_BYTES) {
    return storeError("Görsel boyutu 5 MB sınırını aşıyor.", "STORE_IMAGE_TOO_LARGE", 413);
  }

  const altRaw = form.get("alt_text");
  const alt_text = typeof altRaw === "string" ? altRaw.slice(0, ALT_MAX) : "";

  const uuid = crypto.randomUUID();
  const filePath = buildStorePhotoPath(ext, uuid);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage
    .from(STORE_PHOTO_BUCKET)
    .upload(filePath, bytes, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (upErr) return storeError("Görsel yüklenemedi.", "STORE_IMAGE_UPLOAD_FAILED", 500);

  // Mevcut görsel sayısı → ilk görsel ana görsel; sort_order = mevcut adet.
  const { count } = await db
    .from("store_product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  const existing = count ?? 0;

  const { data: row, error: insErr } = await db
    .from("store_product_images")
    .insert({
      product_id: productId,
      file_path: filePath,
      alt_text,
      is_primary: existing === 0,
      sort_order: existing,
    })
    .select("*")
    .single();

  if (insErr || !row) {
    // Orphan önleme: DB satırı yazılamadıysa yüklenen objeyi geri al.
    await db.storage.from(STORE_PHOTO_BUCKET).remove([filePath]);
    return storeError("Görsel kaydedilemedi.", "STORE_IMAGE_SAVE_FAILED", 500);
  }

  const publicUrl = db.storage.from(STORE_PHOTO_BUCKET).getPublicUrl(filePath).data.publicUrl;
  return NextResponse.json({ ok: true, row, url: publicUrl }, { status: 201 });
}
