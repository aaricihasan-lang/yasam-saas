/**
 * lib/store/storefront.ts — Doğal Pazar müşteri-facing (public) okuma katmanı.
 *
 * SUNUCU-ONLY: yalnız Server Component'lerden çağrılır (service_role db). Storefront
 * YALNIZ status='active' ürünleri ve (kategori varsa) is_active kategorileri döndürür.
 * Draft/archived ürün ve pasif kategori ürünü storefront'a SIZMAZ. Görsel URL'leri
 * public bucket'tan çözülür.
 */

import { getServerDb } from "@/lib/supabase-server";
import { STORE_PHOTO_BUCKET } from "@/lib/store/productImage";
import { pickCategoryImage } from "@/lib/store/categoryVisuals";
import type {
  StorefrontProductCard,
  StorefrontProductDetail,
  StoreSettings,
  StoreProductType,
} from "@/lib/store/types";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  product_type: StoreProductType;
  sku: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  currency: string;
  vat_rate: number | string;
  track_inventory: boolean;
  stock_quantity: number;
  status: string;
  is_featured: boolean;
  is_new: boolean;
  sort_order: number;
  created_at: string;
  category: { name: string; slug: string; is_active: boolean } | null;
};

type ImageRow = {
  product_id: string;
  file_path: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
};

const PRODUCT_SELECT =
  "id, name, slug, short_description, description, product_type, sku, price, " +
  "compare_at_price, currency, vat_rate, track_inventory, stock_quantity, status, " +
  "is_featured, is_new, sort_order, created_at, " +
  "category:store_categories ( name, slug, is_active )";

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function publicUrl(filePath: string): string {
  return getServerDb().storage.from(STORE_PHOTO_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

function inStock(row: { track_inventory: boolean; stock_quantity: number }): boolean {
  return !row.track_inventory || row.stock_quantity > 0;
}

/** Storefront'ta gösterilebilir mi? active ürün + (kategori yoksa VEYA kategori aktif). */
function isVisible(row: ProductRow): boolean {
  if (row.status !== "active") return false;
  if (row.category && row.category.is_active !== true) return false;
  return true;
}

function toCard(row: ProductRow, primaryPath: string | null): StorefrontProductCard {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    short_description: row.short_description,
    product_type: row.product_type,
    price: num(row.price),
    compare_at_price: row.compare_at_price === null ? null : num(row.compare_at_price),
    currency: row.currency,
    is_featured: row.is_featured,
    is_new: row.is_new,
    track_inventory: row.track_inventory,
    in_stock: inStock(row),
    category_name: row.category?.name ?? null,
    category_slug: row.category?.slug ?? null,
    primary_image_url: primaryPath ? publicUrl(primaryPath) : null,
  };
}

/** Storefront kategori gösterimi: image_url server'da çözülür (custom → semantic → null). */
export type StorefrontCategory = { name: string; slug: string; image_url: string | null };

export type StorefrontData = {
  products: StorefrontProductCard[];
  categories: StorefrontCategory[];
};

/**
 * Storefront listesi: aktif ürünler + aktif kategoriler — İKİ BAĞIMSIZ koleksiyon.
 * Kategoriler ürünlerden TÜRETİLMEZ: aktif bir kategori henüz ürünsüz olsa da storefront'ta
 * görünür (önce kategori sonra ürün ekleme senaryosu). Sıralama sort_order'a göredir.
 */
export async function getStorefrontData(): Promise<StorefrontData> {
  const db = getServerDb();

  const [{ data: productData, error: productErr }, { data: categoryData }] = await Promise.all([
    db
      .from("store_products")
      .select(PRODUCT_SELECT)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    db
      .from("store_categories")
      .select("name, slug, image_path, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  // Kategoriler bağımsız kaynaktan (ürün varlığından etkilenmez). Görsel önceliği:
  // özel yüklenmiş image_path (public URL) → anlamlı legacy marka görseli → null.
  const categories: StorefrontCategory[] = (
    (categoryData ?? []) as Array<{ name: string; slug: string; image_path: string | null }>
  ).map(({ name, slug, image_path }) => ({
    name,
    slug,
    image_url: pickCategoryImage(image_path ? publicUrl(image_path) : null, slug),
  }));

  if (productErr || !productData) return { products: [], categories };

  const rows = (productData as unknown as ProductRow[]).filter(isVisible);
  const ids = rows.map((r) => r.id);

  // Ana görsel yollarını tek sorguda topla.
  const primaryByProduct = new Map<string, string>();
  if (ids.length > 0) {
    const { data: imgData } = await db
      .from("store_product_images")
      .select("product_id, file_path, is_primary, sort_order, created_at")
      .in("product_id", ids)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    for (const img of (imgData ?? []) as ImageRow[]) {
      if (!primaryByProduct.has(img.product_id)) primaryByProduct.set(img.product_id, img.file_path);
    }
  }

  const products = rows.map((r) => toCard(r, primaryByProduct.get(r.id) ?? null));

  return { products, categories };
}

/** Storefront ürün detayı (yalnız görünür ürün); yoksa null (çağıran notFound()). */
export async function getStorefrontProductBySlug(
  slug: string,
): Promise<StorefrontProductDetail | null> {
  const db = getServerDb();

  const { data, error } = await db
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as ProductRow;
  if (!isVisible(row)) return null;

  const { data: imgData } = await db
    .from("store_product_images")
    .select("product_id, file_path, alt_text, is_primary, sort_order, created_at")
    .eq("product_id", row.id)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const images = ((imgData ?? []) as ImageRow[]).map((img) => ({
    url: publicUrl(img.file_path),
    alt_text: img.alt_text,
    is_primary: img.is_primary,
  }));

  const primaryPath = ((imgData ?? []) as ImageRow[])[0]?.file_path ?? null;
  const card = toCard(row, primaryPath);

  return {
    ...card,
    description: row.description,
    sku: row.sku,
    vat_rate: num(row.vat_rate),
    images,
  };
}

/** Mağaza WhatsApp ayarı (singleton). Yoksa güvenli kapalı varsayılan. */
export async function getStoreSettings(): Promise<StoreSettings> {
  const db = getServerDb();
  const { data, error } = await db
    .from("store_settings")
    .select("whatsapp_number, whatsapp_enabled")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return { whatsapp_number: null, whatsapp_enabled: false };
  return {
    whatsapp_number: (data.whatsapp_number as string | null) ?? null,
    whatsapp_enabled: data.whatsapp_enabled === true,
  };
}
