import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import {
  storeError,
  invalidId,
  invalidBody,
  asPlainObject,
  onlyAllowedKeys,
  STORE_UUID_RE,
} from "@/lib/store/adminHttp";
import { STORE_PHOTO_BUCKET, isOwnedStorePhotoPath } from "@/lib/store/productImage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

/**
 * /api/admin/magaza/products/[id]/images/[imageId] — OWNER-ONLY görsel sil / ana yap.
 *   - DELETE: DB satırı silinir (source of truth), sonra storage objesi kaldırılır.
 *     Silinen ana görselse kalan ilk görsel ana görsel yapılır. Orphan obje riski
 *     minimize edilir (referans önce koparılır; artık obje public bucket'ta zararsız).
 *   - PATCH: {is_primary?, alt_text?} — ana görsel tekilliği korunur.
 */

const PATCH_KEYS = ["is_primary", "alt_text"] as const;
const ALT_MAX = 300;

async function loadImage(
  db: SupabaseClient,
  productId: string,
  imageId: string,
) {
  return db
    .from("store_product_images")
    .select("*")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id: productId, imageId } = await ctx.params;
  if (!STORE_UUID_RE.test(productId) || !STORE_UUID_RE.test(imageId)) return invalidId();

  const { data: image, error } = await loadImage(db, productId, imageId);
  if (error) return storeError("Görsel silinemedi.", "STORE_IMAGE_DELETE_FAILED", 500);
  if (!image) return storeError("Görsel bulunamadı.", "STORE_IMAGE_NOT_FOUND", 404);

  const filePath = (image as { file_path: string }).file_path;
  const wasPrimary = (image as { is_primary: boolean }).is_primary === true;

  const { error: delErr } = await db
    .from("store_product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", productId);
  if (delErr) return storeError("Görsel silinemedi.", "STORE_IMAGE_DELETE_FAILED", 500);

  // Storage objesi kaldır (best-effort; yalnız beklenen önekteki path).
  if (isOwnedStorePhotoPath(filePath)) {
    await db.storage.from(STORE_PHOTO_BUCKET).remove([filePath]);
  }

  // Ana görsel silindiyse kalan ilk görseli ana görsel yap.
  if (wasPrimary) {
    const { data: next } = await db
      .from("store_product_images")
      .select("id")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await db.from("store_product_images").update({ is_primary: true }).eq("id", next.id);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id: productId, imageId } = await ctx.params;
  if (!STORE_UUID_RE.test(productId) || !STORE_UUID_RE.test(imageId)) return invalidId();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidBody();
  }
  const obj = asPlainObject(raw);
  if (!obj || !onlyAllowedKeys(obj, PATCH_KEYS)) return invalidBody();

  const { data: image, error } = await loadImage(db, productId, imageId);
  if (error) return storeError("Görsel güncellenemedi.", "STORE_IMAGE_UPDATE_FAILED", 500);
  if (!image) return storeError("Görsel bulunamadı.", "STORE_IMAGE_NOT_FOUND", 404);

  const patch: Record<string, unknown> = {};
  if ("alt_text" in obj) {
    if (obj.alt_text === null) patch.alt_text = "";
    else if (typeof obj.alt_text !== "string" || obj.alt_text.length > ALT_MAX) return invalidBody();
    else patch.alt_text = obj.alt_text;
  }

  let makePrimary = false;
  if ("is_primary" in obj) {
    if (typeof obj.is_primary !== "boolean") return invalidBody();
    if (obj.is_primary) makePrimary = true;
    else patch.is_primary = false;
  }

  // Ana görsel yapılıyorsa önce diğerlerini indir (tekillik indexi ihlali olmasın).
  if (makePrimary) {
    await db
      .from("store_product_images")
      .update({ is_primary: false })
      .eq("product_id", productId)
      .eq("is_primary", true);
    patch.is_primary = true;
  }

  if (Object.keys(patch).length === 0) return invalidBody();

  const { data, error: upErr } = await db
    .from("store_product_images")
    .update(patch)
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("*")
    .maybeSingle();

  if (upErr) return storeError("Görsel güncellenemedi.", "STORE_IMAGE_UPDATE_FAILED", 500);
  if (!data) return storeError("Görsel bulunamadı.", "STORE_IMAGE_NOT_FOUND", 404);

  return NextResponse.json({ ok: true, row: data });
}
