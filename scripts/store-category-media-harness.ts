/* Geçici (disposable) — Doğal Pazar V1.1 kategori görseli + servis etiketi mantık harness'i.
 * Saf logic doğrulaması (server/DB gerektirmez): path üretimi, sahiplik guard'ı, MIME/boyut
 * sabitleri, kategori görsel önceliği (custom → semantic → null) ve servis UI etiketi. */
import {
  STORE_PHOTO_BUCKET,
  STORE_PHOTO_MIME_EXT,
  STORE_PHOTO_MAX_BYTES,
  STORE_CATEGORY_IMAGE_PREFIX,
  buildStoreCategoryImagePath,
  isOwnedStoreCategoryImagePath,
  isOwnedStorePhotoPath,
} from "@/lib/store/productImage";
import {
  categoryImageForStrict,
  pickCategoryImage,
  STORE_CAT_STONES,
  STORE_CAT_AROMA,
} from "@/lib/store/categoryVisuals";
import { STORE_PRODUCT_TYPE_LABELS } from "@/lib/store/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  got=${JSON.stringify(got)}`); }
}

const CAT_ID = "11111111-2222-3333-4444-555555555555";

// --- Bucket reuse (yeni bucket YOK) ---
check("bucket = store-product-images (reuse)", STORE_PHOTO_BUCKET === "store-product-images");
check("kategori öneki categories/", STORE_CATEGORY_IMAGE_PREFIX === "categories/");

// --- Server path üretimi ---
const p = buildStoreCategoryImagePath(CAT_ID, "jpg", "abcabcab-0000-1111-2222-333333333333");
check("path = categories/{id}/{uuid}.jpg", p === `categories/${CAT_ID}/abcabcab-0000-1111-2222-333333333333.jpg`, p);
check("path kategori namespace'inde", p.startsWith(`categories/${CAT_ID}/`), p);

// --- Sahiplik guard (delete/replace öncesi) ---
check("geçerli kategori path kabul", isOwnedStoreCategoryImagePath(p) === true);
check("traversal reddedilir", isOwnedStoreCategoryImagePath("categories/../secret.png") === false);
check("mutlak URL reddedilir", isOwnedStoreCategoryImagePath("https://evil/x.png") === false);
check("ürün path'i kategori guard'ından geçmez", isOwnedStoreCategoryImagePath("products/x.jpg") === false);
check("boş/null reddedilir", isOwnedStoreCategoryImagePath(null) === false && isOwnedStoreCategoryImagePath("") === false);
check("kategori path ürün guard'ından geçmez (namespace izolasyonu)", isOwnedStorePhotoPath(p) === false);

// --- MIME allowlist (SVG/GIF YOK) ---
check("jpeg → jpg", STORE_PHOTO_MIME_EXT["image/jpeg"] === "jpg");
check("png → png", STORE_PHOTO_MIME_EXT["image/png"] === "png");
check("webp → webp", STORE_PHOTO_MIME_EXT["image/webp"] === "webp");
check("svg reddedilir (allowlist dışı)", STORE_PHOTO_MIME_EXT["image/svg+xml"] === undefined);
check("gif reddedilir (allowlist dışı)", STORE_PHOTO_MIME_EXT["image/gif"] === undefined);
check("boyut sınırı 5MB", STORE_PHOTO_MAX_BYTES === 5 * 1024 * 1024);

// --- Görsel önceliği: custom → semantic → null (yanlış foto ATANMAZ) ---
const CUSTOM = "https://cdn/x/categories/abc.jpg";
check("özel görsel her zaman öncelikli", pickCategoryImage(CUSTOM, "analiz") === CUSTOM);
check("özel yoksa anlamlı taş slug → taş görseli", pickCategoryImage(null, "dogal-taslar") === STORE_CAT_STONES);
check("özel yoksa aroma slug → aroma görseli", pickCategoryImage(null, "aromaterapi") === STORE_CAT_AROMA);
check("ANALİZ: özel yok + anlamlı eşleşme yok → null (yanlış foto YOK)", pickCategoryImage(null, "analiz") === null);
check("categoryImageForStrict('analiz') = null", categoryImageForStrict("analiz") === null);
check("categoryImageForStrict('numeroloji') = null (taş foto SIZMAZ)", categoryImageForStrict("numeroloji") === null);
check("boş custom string semantic'e düşer", pickCategoryImage("", "dogal-taslar") === STORE_CAT_STONES);

// --- Servis UI etiketi (DB değeri 'service' AYNEN) ---
check("service etiketi = Analiz / Danışmanlık", STORE_PRODUCT_TYPE_LABELS.service === "Analiz / Danışmanlık");
check("eski 'Hizmet / Eğitim' KALDIRILDI", STORE_PRODUCT_TYPE_LABELS.service !== "Hizmet / Eğitim");
check("physical/digital etiketleri korunur",
  STORE_PRODUCT_TYPE_LABELS.physical === "Fiziksel Ürün" && STORE_PRODUCT_TYPE_LABELS.digital === "Dijital Ürün");

console.log(`\nKategori medya harness: ${pass} geçti, ${fail} kaldı`);
process.exit(fail === 0 ? 0 : 1);
