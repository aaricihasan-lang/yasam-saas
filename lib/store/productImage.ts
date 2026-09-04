/**
 * lib/store/productImage.ts — Doğal Pazar ürün görseli depolama sözleşmesi.
 *
 * MODEL: KASITLI-PUBLIC bucket `store-product-images` (storefront'ta müşteriye görsel
 * gösterilir). Ancak yükleme SUNUCU-YETKİLİ (yalnız owner admin route): server MIME
 * allowlist + boyut sınırı + server-üretilen path. Client dosya adı/path/URL kabul
 * edilmez; arbitrary remote URL fetch edilmez.
 *
 * MIME allowlist: yalnız jpeg/png/webp (SVG/gif YOK). Boyut: 5 MB.
 * Path: `products/{uuid}.{ext}` — platform sahipli (tenant öneki yok).
 */

/** Public storefront ürün görsel bucket'ı. */
export const STORE_PHOTO_BUCKET = "store-product-images";

/** Sunucu tarafı izinli MIME → uzantı. Client uzantısına GÜVENİLMEZ. */
export const STORE_PHOTO_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Maksimum dosya boyutu (5 MB) — server tarafı zorlanır. */
export const STORE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Ürün görsellerinin path öneki. */
export const STORE_PHOTO_PREFIX = "products/";

/**
 * Sunucuda üretilen çakışma-dayanıklı obje yolu. Dosya adı client'tan ALINMAZ.
 * `products/{uuid}.{ext}` — uzantı server-side MIME'den türetilir.
 */
export function buildStorePhotoPath(ext: string, uuid: string): string {
  return `${STORE_PHOTO_PREFIX}${uuid}.${ext}`;
}

/**
 * Bir file_path beklenen ürün-görsel önekine uyuyor mu? (delete guard — client'tan
 * gelen path'e körü körüne storage remove uygulanmaz.) Traversal / mutlak URL reddi.
 */
export function isOwnedStorePhotoPath(path: unknown): path is string {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("..") || path.includes("://")) return false;
  return path.startsWith(STORE_PHOTO_PREFIX);
}

// ------------------------------------------------------------
// Kategori görseli — AYNI public bucket (`store-product-images`), ayrı namespace.
// MIME allowlist + boyut sınırı ürün görseliyle ORTAK (yukarıdaki sabitler REUSE).
// ------------------------------------------------------------

/** Kategori görsellerinin path öneki (bucket içi namespace). */
export const STORE_CATEGORY_IMAGE_PREFIX = "categories/";

/**
 * Sunucuda üretilen kategori görsel yolu. Dosya adı client'tan ALINMAZ; kategori kimliği
 * ve uzantı server-side (MIME'den) belirlenir. `categories/{categoryId}/{uuid}.{ext}`.
 */
export function buildStoreCategoryImagePath(categoryId: string, ext: string, uuid: string): string {
  return `${STORE_CATEGORY_IMAGE_PREFIX}${categoryId}/${uuid}.${ext}`;
}

/**
 * Bir image_path beklenen kategori-görsel önekine uyuyor mu? (delete/replace guard —
 * DB'de tutulan path'e storage remove uygulanmadan önce doğrulanır.) Traversal / URL reddi.
 */
export function isOwnedStoreCategoryImagePath(path: unknown): path is string {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("..") || path.includes("://")) return false;
  return path.startsWith(STORE_CATEGORY_IMAGE_PREFIX);
}
