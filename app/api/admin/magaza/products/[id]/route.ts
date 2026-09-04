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
import { buildProductPatch, PRODUCT_PATCH_KEYS } from "@/lib/store/productValidation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * /api/admin/magaza/products/[id] — OWNER-ONLY ürün detay + güncelleme.
 *   - GET: ürün + görseller.
 *   - PATCH: allowlist patch; kategori varlık kontrolü; non-physical stok nötrleme.
 */

function mapDuplicate(error: { message?: string; details?: string }): NextResponse {
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (blob.includes("sku")) {
    return storeError("Bu SKU ile başka bir ürün var.", "STORE_PRODUCT_SKU_DUPLICATE", 409);
  }
  return storeError("Bu slug ile bir ürün zaten var.", "STORE_PRODUCT_SLUG_DUPLICATE", 409);
}

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!STORE_UUID_RE.test(id)) return invalidId();

  const { data: product, error } = await db
    .from("store_products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return storeError("Ürün alınamadı.", "STORE_PRODUCT_GET_FAILED", 500);
  if (!product) return storeError("Ürün bulunamadı.", "STORE_PRODUCT_NOT_FOUND", 404);

  const { data: images } = await db
    .from("store_product_images")
    .select("*")
    .eq("product_id", id)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return NextResponse.json({ ok: true, row: { ...product, images: images ?? [] } });
}

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
  if (!obj || !onlyAllowedKeys(obj, PRODUCT_PATCH_KEYS)) return invalidBody();

  const parsed = buildProductPatch(obj);
  if (!parsed.ok) {
    if (parsed.code) return storeError(parsed.error ?? "Geçersiz ürün verisi.", parsed.code, 400);
    return invalidBody();
  }
  const patch = parsed.patch;

  // Ürün tipi non-physical'a çekiliyorsa stok alanlarını nötrle (anlamsız envanter yok).
  if (parsed.newProductType && parsed.newProductType !== "physical") {
    patch.track_inventory = false;
    patch.stock_quantity = 0;
    patch.low_stock_threshold = 0;
  }

  // Kategori değişiyorsa (non-null) varlık kontrolü.
  if (typeof parsed.categoryId === "string") {
    const { data: cat, error: cErr } = await db
      .from("store_categories")
      .select("id")
      .eq("id", parsed.categoryId)
      .maybeSingle();
    if (cErr) return storeError("Ürün güncellenemedi.", "STORE_PRODUCT_UPDATE_FAILED", 500);
    if (!cat) return storeError("Seçilen kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 400);
  }

  const { data, error } = await db
    .from("store_products")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return mapDuplicate(error);
    if (error.code === "23514") return storeError("Geçersiz ürün verisi.", "STORE_PRODUCT_INVALID", 400);
    if (error.code === "23503") return storeError("Seçilen kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 400);
    return storeError("Ürün güncellenemedi.", "STORE_PRODUCT_UPDATE_FAILED", 500);
  }
  if (!data) return storeError("Ürün bulunamadı.", "STORE_PRODUCT_NOT_FOUND", 404);

  return NextResponse.json({ ok: true, row: data });
}
