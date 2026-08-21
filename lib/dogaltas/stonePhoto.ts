/**
 * lib/dogaltas/stonePhoto.ts — Doğaltaş taş fotoğrafı depolama sözleşmesi (F-016).
 *
 * F-016 kararı (satış-gate): eski `stone-photos` bucket'ı PUBLIC ve Şifa Rehberi
 * (`healing-guides/…`) + danışan-çalışma-alanı ile PAYLAŞIMLI. O bucket'ı private'a
 * çevirmek diğer modülleri kırar → kapsam DIŞI. Bu yüzden Doğaltaş'a AYRI ADANMIŞ
 * private bucket verilir: `dogaltas-photos`.
 *
 * NİHAİ KOD MODELİ (FAZ 2'de ek source-code değişikliği YOK — yalnız migration apply/deploy):
 *   - Bucket sabiti DOĞRUDAN `dogaltas-photos` (private). Başka yerde const değiştirme gerekmez.
 *   - Yükleme SUNUCU-YETKİLİ (server MIME/boyut/path; tenant oturumdan; service_role).
 *   - DB source-of-truth = `file_path`. Kalıcı public URL üretilmez/saklanmaz.
 *   - Okuma (render+DOCX) kısa ömürlü signed URL / service_role download ile yetkilendirilir.
 *   - Legacy uyum: yalnız `url` taşıyan eski satırlar dual-read ile okunur (prod'da 0 referans).
 *
 * DEPLOYMENT SIRASI (Model A): önce migration apply (private bucket oluşur; eski sistem
 * bozulmaz, prod'da 0 Doğaltaş görseli), SONRA kod deploy. Backfill/veri-taşıma YOK.
 *
 * Prod pre-check: mevcut taş görsel referansı = 0 (kayıp/backfill riski yok).
 */

/** Doğaltaş taş görselleri için ADANMIŞ PRIVATE bucket (nihai model). */
export const STONE_PHOTO_BUCKET = "dogaltas-photos";

/** Sunucu tarafı izinli MIME → uzantı. Client uzantısına GÜVENİLMEZ. */
export const STONE_PHOTO_MIME_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

/** Maksimum dosya boyutu (10 MB) — server tarafı zorlanır. */
export const STONE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Doğaltaş taş görselleri için tenant-scoped path öneki. */
export function stonePhotoPrefix(tenantId: string): string {
  return `catalog/${tenantId}/`;
}

/**
 * Sunucuda üretilen çakışma-dayanıklı obje yolu. Dosya adı client'tan ALINMAZ.
 * `catalog/{tenantId}/{uuid}.{ext}` — uzantı server-side MIME'den türetilir.
 */
export function buildStonePhotoPath(tenantId: string, ext: string, uuid: string): string {
  return `${stonePhotoPrefix(tenantId)}${uuid}.${ext}`;
}

/**
 * Bir file_path bu tenant'a ait beklenen öneke uyuyor mu? (signed-read + delete
 * ownership guard'ı — client'tan gelen path'e körü körüne signed-url verilmez.)
 */
export function isOwnedStonePhotoPath(path: unknown, tenantId: string): path is string {
  if (typeof path !== "string" || !path) return false;
  // path traversal / mutlak URL reddi
  if (path.includes("..") || path.includes("://")) return false;
  return path.startsWith(stonePhotoPrefix(tenantId));
}

/** stones.images öğe şekli (hem legacy public-url hem yeni file_path taşır). */
export type StoneImage = { id: string; name: string; url?: string; file_path?: string };

/**
 * Bir/birden çok stones.images JSONB değerinden bu tenant'a ait geçerli file_path'leri
 * toplar. Stone silmede orphan storage objelerini temizlemek için kullanılır (F-016).
 * Non-array / yabancı-önekli / traversal path'ler elenir (güvenli).
 */
export function collectStonePhotoPaths(imagesList: unknown[], tenantId: string): string[] {
  const out = new Set<string>();
  for (const images of imagesList) {
    if (!Array.isArray(images)) continue;
    for (const it of images) {
      const fp = it && typeof it === "object" ? (it as Record<string, unknown>).file_path : undefined;
      if (isOwnedStonePhotoPath(fp, tenantId)) out.add(fp);
    }
  }
  return [...out];
}
