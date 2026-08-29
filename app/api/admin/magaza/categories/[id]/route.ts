import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import {
  storeError,
  invalidBody,
  invalidId,
  asPlainObject,
  onlyAllowedKeys,
  STORE_UUID_RE,
} from "@/lib/store/adminHttp";
import { isValidStoreSlug } from "@/lib/store/slug";
import { STORE_PHOTO_BUCKET, isOwnedStoreCategoryImagePath } from "@/lib/store/productImage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SLUG_MAX = 200;
const PATCH_KEYS = ["name", "slug", "description", "is_active", "sort_order"] as const;

/**
 * /api/admin/magaza/categories/[id] — OWNER-ONLY kategori güncelle/sil.
 *   - PATCH: allowlist patch (en az bir alan). Duplicate slug → 409.
 *   - DELETE: kategoriye bağlı ürün varsa reddedilir (409) → pasife alma önerilir
 *     (yıkıcı silme yerine deaktivasyon). Bağlı ürün yoksa silinir.
 */

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!STORE_UUID_RE.test(id)) return invalidId();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidBody();
  }
  const obj = asPlainObject(raw);
  if (!obj || !onlyAllowedKeys(obj, PATCH_KEYS)) return invalidBody();

  const patch: Record<string, unknown> = {};

  if ("name" in obj) {
    if (typeof obj.name !== "string" || obj.name.trim() === "" || obj.name.length > 200) return invalidBody();
    patch.name = obj.name.trim();
  }
  if ("slug" in obj) {
    if (!isValidStoreSlug(obj.slug, SLUG_MAX)) return invalidBody();
    patch.slug = obj.slug;
  }
  if ("description" in obj) {
    if (obj.description === null) patch.description = "";
    else if (typeof obj.description !== "string" || obj.description.length > 2000) return invalidBody();
    else patch.description = obj.description;
  }
  if ("is_active" in obj) {
    if (typeof obj.is_active !== "boolean") return invalidBody();
    patch.is_active = obj.is_active;
  }
  if ("sort_order" in obj) {
    if (typeof obj.sort_order !== "number" || !Number.isInteger(obj.sort_order)) return invalidBody();
    patch.sort_order = obj.sort_order;
  }

  if (Object.keys(patch).length === 0) return invalidBody();

  const { data, error } = await db
    .from("store_categories")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return storeError("Bu slug ile bir kategori zaten var.", "STORE_CATEGORY_DUPLICATE", 409);
    }
    if (error.code === "23514") {
      return storeError("Geçersiz kategori verisi.", "STORE_CATEGORY_INVALID", 400);
    }
    return storeError("Kategori güncellenemedi.", "STORE_CATEGORY_UPDATE_FAILED", 500);
  }
  if (!data) return storeError("Kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 404);

  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!STORE_UUID_RE.test(id)) return invalidId();

  // Bağlı ürün var mı? Varsa yıkıcı silme yerine pasife alma önerilir.
  const { count, error: cErr } = await db
    .from("store_products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (cErr) return storeError("Kategori silinemedi.", "STORE_CATEGORY_DELETE_FAILED", 500);
  if ((count ?? 0) > 0) {
    return storeError(
      "Bu kategoriye bağlı ürünler var. Silmek yerine kategoriyi pasife alın.",
      "STORE_CATEGORY_IN_USE",
      409,
    );
  }

  const { data, error } = await db
    .from("store_categories")
    .delete()
    .eq("id", id)
    .select("id, image_path")
    .maybeSingle();

  if (error) return storeError("Kategori silinemedi.", "STORE_CATEGORY_DELETE_FAILED", 500);
  if (!data) return storeError("Kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 404);

  // DB silme başarılı → varsa kategori görsel objesini best-effort temizle (isteği bozmaz).
  const imagePath = (data.image_path as string | null) ?? null;
  if (isOwnedStoreCategoryImagePath(imagePath)) {
    const { error: rmErr } = await db.storage.from(STORE_PHOTO_BUCKET).remove([imagePath]);
    if (rmErr) console.error("[store] silinen kategori görseli temizlenemedi", { code: rmErr.name });
  }

  return NextResponse.json({ ok: true });
}
