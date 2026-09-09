/**
 * lib/sifa-rehberi/stonePhotoStorage.ts — Şifa Rehberi görsel depolama sözleşmesi (P1 PHASE A).
 *
 * P1 STONE-PHOTOS güvenlik kararı: `stone-photos` bucket PUBLIC idi ve storage.objects
 * üzerinde public/anon ALL policy taşıyordu; upload/getPublicUrl/remove doğrudan
 * TARAYICIDAN anon supabase client ile yapılıyordu. Path client-kurulu
 * (`healing-guides/${tenantId}/...`) olduğundan ve policy yalnız `bucket_id`'ye baktığından
 * anon herkes keyfi tenant öneki altına yükleyebiliyor, path'i bilen başka tenant objesini
 * silebiliyor ve obje kalıcı public URL ile okunabiliyordu.
 *
 * NİHAİ MODEL (bu sözleşme — PHASE A, Şifa Rehberi tarafı):
 *   - Yükleme SUNUCU-YETKİLİ signed upload: requireModuleAccess → createSignedUploadUrl
 *     (service_role) → tarayıcı uploadToSignedUrl → server finalize (obje varlık doğrulaması).
 *   - Okuma yalnız kısa ömürlü signed URL (guide-scoped; DB metadata'sından türetilir).
 *   - Silme SUNUCU-YETKİLİ: guide ownership + DB membership + service_role remove.
 *   - tenant SUNUCUDAN (oturumdan) alınır; client'tan tenant/path KABUL EDİLMEZ.
 *   - Obje yolu SUNUCUDA üretilir (uuid + trusted-MIME extension); client path/uzantı seçemez.
 *
 * NOT (PHASE A merge-safety): stone-photos bucket bu fazda PUBLIC kalır ve public ALL policy
 * DROP EDİLMEZ (Client Stones hâlâ bağımlı). Bu dosya yalnız Şifa Rehberi tarafını
 * server-authorized + private-ready modele taşır; bucket private yapıldığında da çalışır.
 */

/** Şifa Rehberi ile Client Stones'un PAYLAŞTIĞI fiziksel bucket (bu fazda public kalır). */
export const STONE_PHOTOS_BUCKET = "stone-photos";

/** Şifa Rehberi görsellerinin tenant-scoped kök öneki. */
export const HEALING_GUIDES_ROOT = "healing-guides";

/** Görsel yükleme boyut tavanı (server tarafı zorlanır). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Signed READ URL TTL (kısa ömürlü; kalıcı public URL yerine). */
export const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Güvenilir MIME → uzantı eşlemesi. Uzantı client dosya adından DEĞİL, doğrulanmış
 * MIME'den türetilir → path enjeksiyonu / çift-uzantı imkânsız.
 */
export const UPLOAD_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** İzin verilen görsel MIME allowlist (upload). */
export function extForMime(mime: unknown): string | null {
  if (typeof mime !== "string") return null;
  const key = mime.split(";")[0].trim().toLowerCase();
  return UPLOAD_MIME_EXT[key] ?? null;
}

/**
 * Şifa Rehberi detay sayfasındaki bölüm (DetailTabId) allowlist'i. Section path
 * segmentine YALNIZ bu sabit token'lar girebilir → traversal/enjeksiyon imkânsız.
 */
export const GUIDE_PHOTO_SECTIONS = new Set<string>([
  "rahatsizlik",
  "belirtiler",
  "uygulamalar",
  "dogaltas",
  "aromaterapi",
  "islami_oneriler",
  "destekleyici",
]);

/** section token allowlist doğrulaması; geçersizse null. */
export function sanitizeGuideSection(section: unknown): string | null {
  if (typeof section !== "string") return null;
  const s = section.trim();
  return GUIDE_PHOTO_SECTIONS.has(s) ? s : null;
}

/** tenant-scoped kök önek: `healing-guides/{tenant}/`. */
export function guideTenantPrefix(tenantId: string): string {
  return `${HEALING_GUIDES_ROOT}/${tenantId}/`;
}

/** guide-scoped önek: `healing-guides/{tenant}/{guideId}/`. */
export function guidePathPrefix(tenantId: string, guideId: string): string {
  return `${HEALING_GUIDES_ROOT}/${tenantId}/${guideId}/`;
}

/** create/staging öneki: `healing-guides/{tenant}/staging/`. */
export function stagingPrefix(tenantId: string): string {
  return `${HEALING_GUIDES_ROOT}/${tenantId}/staging/`;
}

/**
 * Guide-scoped obje yolu — SUNUCUDA üretilir. section allowlist'ten, uuid + ext
 * güvenilir kaynaklardan gelir. `Date.now` TEK BAŞINA güvenlik id'si olarak kullanılmaz.
 */
export function buildGuidePhotoPath(
  tenantId: string,
  guideId: string,
  section: string,
  uuid: string,
  ext: string,
): string {
  return `${guidePathPrefix(tenantId, guideId)}${section}/${uuid}.${ext}`;
}

/** Create-flow (guide henüz yok) staging obje yolu — SUNUCUDA üretilir. */
export function buildStagingPhotoPath(tenantId: string, uuid: string, ext: string): string {
  return `${stagingPrefix(tenantId)}${uuid}.${ext}`;
}

/** Path güvenli mi (traversal / mutlak URL / backslash / mutlak yol reddi). */
function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("..") || path.includes("://")) return false;
  if (path.startsWith("/") || path.startsWith("\\") || path.includes("\\")) return false;
  return true;
}

/** Bir file_path bu tenant öneki (`healing-guides/{tenant}/`) altında mı? */
export function isTenantOwnedHealingPath(path: unknown, tenantId: string): path is string {
  if (!isSafeRelativePath(path)) return false;
  return path.startsWith(guideTenantPrefix(tenantId));
}

/** Bir file_path bu tenant + guide öneki altında mı? */
export function isGuideOwnedHealingPath(
  path: unknown,
  tenantId: string,
  guideId: string,
): path is string {
  if (!isSafeRelativePath(path)) return false;
  return path.startsWith(guidePathPrefix(tenantId, guideId));
}

/** Bir file_path bu tenant'ın staging öneki altında mı (yalnız orphan cleanup için)? */
export function isStagingHealingPath(path: unknown, tenantId: string): path is string {
  if (!isSafeRelativePath(path)) return false;
  return path.startsWith(stagingPrefix(tenantId));
}

/** `NEXT_PUBLIC_SUPABASE_URL` → host. Geçersizse boş. */
export function storageHostFromEnv(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) return "";
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return "";
  }
}

const STONE_PHOTOS_PUBLIC_PREFIX = `/storage/v1/object/public/${STONE_PHOTOS_BUCKET}/`;

/**
 * Legacy uyumluluk: GÜVENİLİR (EXACT host) stone-photos public URL'inden storage path'i
 * çözer. Yalnız beklenen storage host + `/storage/v1/object/public/stone-photos/` yolundan
 * kabul edilir. Rastgele dış URL parse EDİLMEZ. Bulunamazsa null.
 */
export function parseStonePhotoPathFromPublicUrl(
  rawUrl: unknown,
  allowedHost: string,
): string | null {
  if (typeof rawUrl !== "string" || !rawUrl || !allowedHost) return null;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.host !== allowedHost) return null; // EXACT — evil-host geçmez
  if (!u.pathname.startsWith(STONE_PHOTOS_PUBLIC_PREFIX)) return null;
  const path = decodeURIComponent(u.pathname.slice(STONE_PHOTOS_PUBLIC_PREFIX.length));
  return path || null;
}

export type HealingImageLike = {
  file_path?: unknown;
  url?: unknown;
};

/**
 * Bir görsel metadata girdisinden AUTHORITATIVE, tenant-owned storage path'i çözer.
 * Öncelik:
 *   1. `file_path` varsa ve tenant-owned ise onu kullan (yeni model — source of truth).
 *   2. yoksa SADECE trusted stone-photos public URL'inden parse et (legacy uyumluluk),
 *      ardından tenant-owned doğrula.
 * Aksi hâlde null (arbitrary dış URL / cross-tenant / traversal → asla kabul edilmez).
 */
export function resolveHealingImagePath(
  image: HealingImageLike | null | undefined,
  tenantId: string,
  allowedHost: string,
): string | null {
  if (!image || typeof image !== "object") return null;
  if (isTenantOwnedHealingPath(image.file_path, tenantId)) {
    return image.file_path;
  }
  const parsed = parseStonePhotoPathFromPublicUrl(image.url, allowedHost);
  if (parsed && isTenantOwnedHealingPath(parsed, tenantId)) return parsed;
  return null;
}
