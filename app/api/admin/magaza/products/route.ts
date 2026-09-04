import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import {
  storeError,
  invalidBody,
  asPlainObject,
  onlyAllowedKeys,
  STORE_UUID_RE,
} from "@/lib/store/adminHttp";
import {
  buildProductInsert,
  PRODUCT_CREATE_KEYS,
} from "@/lib/store/productValidation";
import { isStoreProductStatus } from "@/lib/store/types";

export const runtime = "nodejs";

/**
 * /api/admin/magaza/products — OWNER-ONLY ürün liste + oluşturma.
 *   - Liste: kategori adı + ana görsel yolu + görsel sayısı (JS join). Filtre: q/category/status.
 *   - Oluşturma: allowlist + controlled vocab + kategori varlık kontrolü.
 *   - Duplicate slug/sku → 409; ham DB metni sızmaz.
 */

const MAX_Q_LEN = 100;

function mapDuplicate(error: { message?: string; details?: string }): NextResponse {
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (blob.includes("sku")) {
    return storeError("Bu SKU ile başka bir ürün var.", "STORE_PRODUCT_SKU_DUPLICATE", 409);
  }
  return storeError("Bu slug ile bir ürün zaten var.", "STORE_PRODUCT_SLUG_DUPLICATE", 409);
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;

  let query = db
    .from("store_products")
    .select("*, category:store_categories ( name )")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const status = sp.get("status");
  if (status && status !== "") {
    if (!isStoreProductStatus(status)) {
      return storeError("Geçersiz durum.", "STORE_INVALID_STATUS", 400);
    }
    query = query.eq("status", status);
  }

  const category = sp.get("category");
  if (category && category !== "") {
    if (!STORE_UUID_RE.test(category)) {
      return storeError("Geçersiz kategori kimliği.", "STORE_INVALID_CATEGORY", 400);
    }
    query = query.eq("category_id", category);
  }

  const rawQ = sp.get("q");
  if (rawQ !== null) {
    const cleaned = rawQ.trim().replace(/[,()*%]/g, "").slice(0, MAX_Q_LEN);
    if (cleaned) query = query.or(`name.ilike.%${cleaned}%,sku.ilike.%${cleaned}%`);
  }

  const { data, error } = await query;
  if (error) return storeError("Ürünler alınamadı.", "STORE_PRODUCT_LIST_FAILED", 500);

  const products = (data ?? []) as Array<Record<string, unknown> & { id: string; category: { name: string } | null }>;
  const ids = products.map((p) => p.id);

  // Görsel özetleri (ana görsel yolu + adet).
  const primaryByProduct = new Map<string, string>();
  const countByProduct = new Map<string, number>();
  if (ids.length > 0) {
    const { data: imgs } = await db
      .from("store_product_images")
      .select("product_id, file_path, is_primary, sort_order, created_at")
      .in("product_id", ids)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    for (const img of (imgs ?? []) as Array<{ product_id: string; file_path: string }>) {
      countByProduct.set(img.product_id, (countByProduct.get(img.product_id) ?? 0) + 1);
      if (!primaryByProduct.has(img.product_id)) primaryByProduct.set(img.product_id, img.file_path);
    }
  }

  const rows = products.map((p) => {
    const { category: cat, ...rest } = p;
    return {
      ...rest,
      category_name: cat?.name ?? null,
      primary_image_path: primaryByProduct.get(p.id) ?? null,
      image_count: countByProduct.get(p.id) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidBody();
  }
  const obj = asPlainObject(raw);
  if (!obj || !onlyAllowedKeys(obj, PRODUCT_CREATE_KEYS)) return invalidBody();

  const parsed = buildProductInsert(obj);
  if (!parsed.ok) {
    if (parsed.code) return storeError(parsed.error ?? "Geçersiz ürün verisi.", parsed.code, 400);
    return invalidBody();
  }

  // Kategori varlık kontrolü (FK ON DELETE SET NULL olsa da create'te zorunlu ve var olmalı).
  if (parsed.categoryId) {
    const { data: cat, error: cErr } = await db
      .from("store_categories")
      .select("id")
      .eq("id", parsed.categoryId)
      .maybeSingle();
    if (cErr) return storeError("Ürün oluşturulamadı.", "STORE_PRODUCT_CREATE_FAILED", 500);
    if (!cat) return storeError("Seçilen kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 400);
  }

  const { data, error } = await db
    .from("store_products")
    .insert(parsed.value)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return mapDuplicate(error);
    if (error.code === "23514") return storeError("Geçersiz ürün verisi.", "STORE_PRODUCT_INVALID", 400);
    if (error.code === "23503") return storeError("Seçilen kategori bulunamadı.", "STORE_CATEGORY_NOT_FOUND", 400);
    return storeError("Ürün oluşturulamadı.", "STORE_PRODUCT_CREATE_FAILED", 500);
  }

  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
