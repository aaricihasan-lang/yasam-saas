/**
 * lib/store/types.ts — Yaşam Sistemi Doğal Pazar V1 ortak tip ve sabitleri.
 *
 * Client-safe: yalnız tip + saf sabit + saf yardımcı. Server sırrı YOK.
 */

export const STORE_BRAND_NAME = "Yaşam Sistemi Doğal Pazar";
export const STORE_BRAND_TAGLINE = "Doğal ve bütüncül yaşam ürünleri";

export const STORE_PRODUCT_TYPES = ["physical", "digital", "service"] as const;
export type StoreProductType = (typeof STORE_PRODUCT_TYPES)[number];

export const STORE_PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type StoreProductStatus = (typeof STORE_PRODUCT_STATUSES)[number];

/** Ürün tipi Türkçe etiketleri (UI). */
export const STORE_PRODUCT_TYPE_LABELS: Record<StoreProductType, string> = {
  physical: "Fiziksel Ürün",
  digital: "Dijital Ürün",
  service: "Hizmet / Eğitim",
};

/** Durum Türkçe etiketleri (UI). */
export const STORE_PRODUCT_STATUS_LABELS: Record<StoreProductStatus, string> = {
  draft: "Taslak",
  active: "Aktif",
  archived: "Arşiv",
};

/** V1 desteklenen para birimleri (ISO 4217). İlk/varsayılan: TRY. */
export const STORE_CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
export type StoreCurrency = (typeof STORE_CURRENCIES)[number];

export const STORE_CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export type StoreCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type StoreProductImage = {
  id: string;
  product_id: string;
  file_path: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
};

export type StoreProduct = {
  id: string;
  category_id: string | null;
  owner_user_id: string | null;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  product_type: StoreProductType;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  vat_rate: number;
  track_inventory: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  status: StoreProductStatus;
  is_featured: boolean;
  is_new: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type StoreSettings = {
  whatsapp_number: string | null;
  whatsapp_enabled: boolean;
};

/** Admin liste satırı: ürün + kategori adı + ana görsel + görsel sayısı (join'li okuma). */
export type StoreProductAdminRow = StoreProduct & {
  category_name: string | null;
  primary_image_path: string | null;
  image_count: number;
};

/** Admin ürün detayı (form için tam veri + görseller). */
export type StoreProductAdminDetail = StoreProduct & {
  images: StoreProductImage[];
};

/** Storefront kartı için sade ürün gösterimi (public URL çözülmüş). */
export type StorefrontProductCard = {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  product_type: StoreProductType;
  price: number;
  compare_at_price: number | null;
  currency: string;
  is_featured: boolean;
  is_new: boolean;
  track_inventory: boolean;
  in_stock: boolean;
  category_name: string | null;
  category_slug: string | null;
  primary_image_url: string | null;
};

/** Storefront ürün detay gösterimi. */
export type StorefrontProductDetail = StorefrontProductCard & {
  description: string;
  sku: string | null;
  vat_rate: number;
  images: Array<{ url: string; alt_text: string; is_primary: boolean }>;
};

export function isStoreProductType(v: unknown): v is StoreProductType {
  return typeof v === "string" && (STORE_PRODUCT_TYPES as readonly string[]).includes(v);
}

export function isStoreProductStatus(v: unknown): v is StoreProductStatus {
  return typeof v === "string" && (STORE_PRODUCT_STATUSES as readonly string[]).includes(v);
}

/** Para biçimlendirme (UI). numeric → 2 hane; sembol öncelikli. */
export function formatStorePrice(amount: number, currency: string): string {
  const symbol = STORE_CURRENCY_SYMBOLS[currency] ?? "";
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return symbol ? `${formatted} ${symbol}` : `${formatted} ${currency}`;
}
