/**
 * lib/store/productValidation.ts — Doğal Pazar ürün gövde doğrulama (create + patch).
 *
 * Allowlist + tip/aralık kontrolü + controlled vocab. owner_user_id/id/timestamp asla
 * body'den kabul edilmez (mass-assignment koruması). Para 2 haneye yuvarlanır (float
 * gürültüsü engellenir; DB numeric(12,2)). Digital/service için stok alanları nötrlenir.
 */

import {
  STORE_CURRENCIES,
  isStoreProductType,
  isStoreProductStatus,
  type StoreProductType,
  type StoreProductStatus,
} from "@/lib/store/types";
import { slugifyStore, isValidStoreSlug } from "@/lib/store/slug";

const SLUG_MAX = 300;
const PRICE_MAX = 9_999_999_999.99; // numeric(12,2)

export const PRODUCT_CREATE_KEYS = [
  "name", "slug", "category_id", "short_description", "description", "product_type",
  "sku", "price", "compare_at_price", "currency", "vat_rate", "track_inventory",
  "stock_quantity", "low_stock_threshold", "status", "is_featured", "is_new", "sort_order",
] as const;

export const PRODUCT_PATCH_KEYS = PRODUCT_CREATE_KEYS;

export type ProductInsert = {
  name: string;
  slug: string;
  category_id: string | null;
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
};

export type ValidationResult<T> =
  | { ok: true; value: T; categoryId: string | null | undefined }
  | { ok: false; code?: string; error?: string };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** product_type fiziksel değilse stok alanlarını nötrle (anlamsız envanter yok). */
function neutralizeStock(v: ProductInsert): void {
  if (v.product_type !== "physical") {
    v.track_inventory = false;
    v.stock_quantity = 0;
    v.low_stock_threshold = 0;
  }
}

export function buildProductInsert(obj: Record<string, unknown>): ValidationResult<ProductInsert> {
  // name (zorunlu)
  if (typeof obj.name !== "string" || obj.name.trim() === "" || obj.name.length > 300) {
    return { ok: false };
  }
  const name = obj.name.trim();

  // product_type (zorunlu)
  if (!isStoreProductType(obj.product_type)) return { ok: false };
  const product_type = obj.product_type;

  // category_id (zorunlu — geçerli uuid; varlık kontrolü route'ta)
  if (typeof obj.category_id !== "string" || !UUID_RE.test(obj.category_id)) return { ok: false };
  const category_id = obj.category_id;

  // slug (opsiyonel → addan üret)
  let slug: string;
  if (obj.slug !== undefined && obj.slug !== null && obj.slug !== "") {
    if (!isValidStoreSlug(obj.slug, SLUG_MAX)) return { ok: false };
    slug = obj.slug;
  } else {
    slug = slugifyStore(name);
    if (!isValidStoreSlug(slug, SLUG_MAX)) {
      return { ok: false, code: "STORE_SLUG_UNRESOLVED", error: "Ürün adından geçerli bir slug üretilemedi." };
    }
  }

  // price (zorunlu, >=0)
  if (!isFiniteNumber(obj.price) || obj.price < 0 || obj.price > PRICE_MAX) return { ok: false };
  const price = round2(obj.price);

  const base: ProductInsert = {
    name,
    slug,
    category_id,
    short_description: "",
    description: "",
    product_type,
    sku: null,
    price,
    compare_at_price: null,
    currency: "TRY",
    vat_rate: 0,
    track_inventory: false,
    stock_quantity: 0,
    low_stock_threshold: 0,
    status: "draft",
    is_featured: false,
    is_new: false,
    sort_order: 0,
  };

  // opsiyonel alanlar
  if ("short_description" in obj && obj.short_description !== null && obj.short_description !== undefined) {
    if (typeof obj.short_description !== "string" || obj.short_description.length > 600) return { ok: false };
    base.short_description = obj.short_description;
  }
  if ("description" in obj && obj.description !== null && obj.description !== undefined) {
    if (typeof obj.description !== "string" || obj.description.length > 20000) return { ok: false };
    base.description = obj.description;
  }
  if ("sku" in obj && obj.sku !== null && obj.sku !== undefined && obj.sku !== "") {
    if (typeof obj.sku !== "string" || obj.sku.trim() === "" || obj.sku.length > 100) return { ok: false };
    base.sku = obj.sku.trim();
  }
  if ("compare_at_price" in obj && obj.compare_at_price !== null && obj.compare_at_price !== undefined) {
    if (!isFiniteNumber(obj.compare_at_price) || obj.compare_at_price < 0 || obj.compare_at_price > PRICE_MAX) {
      return { ok: false };
    }
    base.compare_at_price = round2(obj.compare_at_price);
  }
  if ("currency" in obj && obj.currency !== undefined) {
    if (typeof obj.currency !== "string" || !(STORE_CURRENCIES as readonly string[]).includes(obj.currency)) {
      return { ok: false };
    }
    base.currency = obj.currency;
  }
  if ("vat_rate" in obj && obj.vat_rate !== undefined) {
    if (!isFiniteNumber(obj.vat_rate) || obj.vat_rate < 0 || obj.vat_rate > 100) return { ok: false };
    base.vat_rate = round2(obj.vat_rate);
  }
  if ("track_inventory" in obj && obj.track_inventory !== undefined) {
    if (typeof obj.track_inventory !== "boolean") return { ok: false };
    base.track_inventory = obj.track_inventory;
  }
  if ("stock_quantity" in obj && obj.stock_quantity !== undefined) {
    if (!isInt(obj.stock_quantity) || obj.stock_quantity < 0) return { ok: false };
    base.stock_quantity = obj.stock_quantity;
  }
  if ("low_stock_threshold" in obj && obj.low_stock_threshold !== undefined) {
    if (!isInt(obj.low_stock_threshold) || obj.low_stock_threshold < 0) return { ok: false };
    base.low_stock_threshold = obj.low_stock_threshold;
  }
  if ("status" in obj && obj.status !== undefined) {
    if (!isStoreProductStatus(obj.status)) return { ok: false };
    base.status = obj.status;
  }
  if ("is_featured" in obj && obj.is_featured !== undefined) {
    if (typeof obj.is_featured !== "boolean") return { ok: false };
    base.is_featured = obj.is_featured;
  }
  if ("is_new" in obj && obj.is_new !== undefined) {
    if (typeof obj.is_new !== "boolean") return { ok: false };
    base.is_new = obj.is_new;
  }
  if ("sort_order" in obj && obj.sort_order !== undefined) {
    if (!isInt(obj.sort_order)) return { ok: false };
    base.sort_order = obj.sort_order;
  }

  neutralizeStock(base);
  return { ok: true, value: base, categoryId: category_id };
}

/**
 * PATCH: yalnız PRESENT anahtarlar. product_type değişirse stok nötrleme; ancak
 * güvenli nötrleme için gerçek (yeni ya da mevcut) product_type route'ta bilinmelidir.
 * Bu fonksiyon patch objesini ve varsa yeni product_type/category_id'yi döndürür.
 */
export type ProductPatchResult =
  | {
      ok: true;
      patch: Partial<ProductInsert>;
      newProductType: StoreProductType | undefined;
      categoryId: string | null | undefined;
    }
  | { ok: false; code?: string; error?: string };

export function buildProductPatch(obj: Record<string, unknown>): ProductPatchResult {
  const patch: Partial<ProductInsert> = {};
  let newProductType: StoreProductType | undefined;
  let categoryId: string | null | undefined;

  if ("name" in obj) {
    if (typeof obj.name !== "string" || obj.name.trim() === "" || obj.name.length > 300) return { ok: false };
    patch.name = obj.name.trim();
  }
  if ("slug" in obj) {
    if (!isValidStoreSlug(obj.slug, SLUG_MAX)) return { ok: false };
    patch.slug = obj.slug;
  }
  if ("category_id" in obj) {
    if (obj.category_id === null) {
      patch.category_id = null;
      categoryId = null;
    } else if (typeof obj.category_id === "string" && UUID_RE.test(obj.category_id)) {
      patch.category_id = obj.category_id;
      categoryId = obj.category_id;
    } else {
      return { ok: false };
    }
  }
  if ("short_description" in obj) {
    if (obj.short_description === null) patch.short_description = "";
    else if (typeof obj.short_description !== "string" || obj.short_description.length > 600) return { ok: false };
    else patch.short_description = obj.short_description;
  }
  if ("description" in obj) {
    if (obj.description === null) patch.description = "";
    else if (typeof obj.description !== "string" || obj.description.length > 20000) return { ok: false };
    else patch.description = obj.description;
  }
  if ("product_type" in obj) {
    if (!isStoreProductType(obj.product_type)) return { ok: false };
    patch.product_type = obj.product_type;
    newProductType = obj.product_type;
  }
  if ("sku" in obj) {
    if (obj.sku === null || obj.sku === "") patch.sku = null;
    else if (typeof obj.sku !== "string" || obj.sku.trim() === "" || obj.sku.length > 100) return { ok: false };
    else patch.sku = obj.sku.trim();
  }
  if ("price" in obj) {
    if (!isFiniteNumber(obj.price) || obj.price < 0 || obj.price > PRICE_MAX) return { ok: false };
    patch.price = round2(obj.price);
  }
  if ("compare_at_price" in obj) {
    if (obj.compare_at_price === null) patch.compare_at_price = null;
    else if (!isFiniteNumber(obj.compare_at_price) || obj.compare_at_price < 0 || obj.compare_at_price > PRICE_MAX) return { ok: false };
    else patch.compare_at_price = round2(obj.compare_at_price);
  }
  if ("currency" in obj) {
    if (typeof obj.currency !== "string" || !(STORE_CURRENCIES as readonly string[]).includes(obj.currency)) return { ok: false };
    patch.currency = obj.currency;
  }
  if ("vat_rate" in obj) {
    if (!isFiniteNumber(obj.vat_rate) || obj.vat_rate < 0 || obj.vat_rate > 100) return { ok: false };
    patch.vat_rate = round2(obj.vat_rate);
  }
  if ("track_inventory" in obj) {
    if (typeof obj.track_inventory !== "boolean") return { ok: false };
    patch.track_inventory = obj.track_inventory;
  }
  if ("stock_quantity" in obj) {
    if (!isInt(obj.stock_quantity) || obj.stock_quantity < 0) return { ok: false };
    patch.stock_quantity = obj.stock_quantity;
  }
  if ("low_stock_threshold" in obj) {
    if (!isInt(obj.low_stock_threshold) || obj.low_stock_threshold < 0) return { ok: false };
    patch.low_stock_threshold = obj.low_stock_threshold;
  }
  if ("status" in obj) {
    if (!isStoreProductStatus(obj.status)) return { ok: false };
    patch.status = obj.status;
  }
  if ("is_featured" in obj) {
    if (typeof obj.is_featured !== "boolean") return { ok: false };
    patch.is_featured = obj.is_featured;
  }
  if ("is_new" in obj) {
    if (typeof obj.is_new !== "boolean") return { ok: false };
    patch.is_new = obj.is_new;
  }
  if ("sort_order" in obj) {
    if (!isInt(obj.sort_order)) return { ok: false };
    patch.sort_order = obj.sort_order;
  }

  if (Object.keys(patch).length === 0) return { ok: false };
  return { ok: true, patch, newProductType, categoryId };
}
