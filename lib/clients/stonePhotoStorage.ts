/**
 * lib/clients/stonePhotoStorage.ts — Danışan Yolculuğu taş fotoğrafı depolama sözleşmesi
 * (DYA-07 PHASE B, Client Stones tarafı).
 *
 * BAĞLAM: `stone-photos` bucket PUBLIC ve anon ALL policy taşıyor; eski Client Stones akışı
 * tarayıcıdan anon `.upload()/.getPublicUrl()/.remove()` kullanıyordu. Path client-kurulu
 * olduğundan anon herkes keyfi tenant öneki altına yükleyebiliyor / path'i bilinen başka
 * tenant objesini silebiliyordu. Bu sözleşme Client Stones tarafını SUNUCU-YETKİLİ,
 * private-ready modele taşır (Şifa Rehberi PHASE A ile aynı desen — kardeş modül).
 *
 * NİHAİ MODEL:
 *   - Yükleme SUNUCU-YETKİLİ signed upload (prepare → uploadToSignedUrl → POST verify+insert).
 *   - Okuma yalnız kısa ömürlü signed URL (client_stone_photos DB metadata'sından türetilir).
 *   - Silme SUNUCU-YETKİLİ (service_role + path-ownership guard).
 *   - tenant SUNUCUDAN (guard) alınır; client'tan tenant/path/dosya-adı KABUL EDİLMEZ.
 *   - Obje yolu SUNUCUDA üretilir (uuid + trusted-MIME uzantı).
 *
 * VERİ KORUMA: Mevcut path formatı (`{tenant}/{client}/{stone}/…`) KORUNUR — yeni objeler
 * aynı önek altına uuid.ext olarak yazılır; eski objeler yerinde kalır, taşınmaz/silinmez.
 * Bucket bu fazda PUBLIC kalır; private geçiş AYRI onay gerektirir (bu dosya her iki durumda çalışır).
 */

/** Client Stones ile Şifa Rehberi'nin PAYLAŞTIĞI fiziksel bucket (bu fazda public kalır). */
export const STONE_PHOTO_BUCKET = "stone-photos";

/** Görsel yükleme boyut tavanı (server tarafı zorlanır). */
export const STONE_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Signed READ URL TTL (kısa ömürlü; kalıcı public URL yerine). */
export const STONE_PHOTO_SIGNED_TTL_SECONDS = 3600;

/**
 * Güvenilir MIME → uzantı. Uzantı client dosya adından DEĞİL, doğrulanmış MIME'den
 * türetilir → path enjeksiyonu / çift-uzantı imkânsız. (Mevcut stone-photos allow-list
 * ile hizalı: png/jpeg/webp/gif.)
 */
export const STONE_PHOTO_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** İzin verilen görsel MIME allow-list → uzantı; geçersizse null. */
export function extForMime(mime: unknown): string | null {
  if (typeof mime !== "string") return null;
  const key = mime.split(";")[0].trim().toLowerCase();
  return STONE_PHOTO_MIME_EXT[key] ?? null;
}

/** UUID biçim doğrulaması (client'tan gelen stoneId path segmentine girmeden önce). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** client-scoped önek: `{tenant}/{client}/`. */
export function clientPhotoPrefix(tenantId: string, clientId: string): string {
  return `${tenantId}/${clientId}/`;
}

/** stone-scoped önek: `{tenant}/{client}/{stone}/`. */
export function stonePhotoPrefix(tenantId: string, clientId: string, stoneId: string): string {
  return `${tenantId}/${clientId}/${stoneId}/`;
}

/**
 * Stone-scoped obje yolu — SUNUCUDA üretilir. Segmentler doğrulanmış kaynaklardan
 * (server tenant, owned client/stone id, uuid, trusted ext). Mevcut format korunur.
 */
export function buildStonePhotoPath(
  tenantId: string,
  clientId: string,
  stoneId: string,
  uuid: string,
  ext: string,
): string {
  return `${stonePhotoPrefix(tenantId, clientId, stoneId)}${uuid}.${ext}`;
}

/**
 * Path güvenli mi (traversal / mutlak URL / backslash / mutlak yol reddi). Yalnız
 * startsWith'e güvenmez — encoded traversal ve şema/host enjeksiyonunu da eler.
 */
function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || !path) return false;
  // decode edilmiş biçimde de `..` kaçışını yakala
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  for (const candidate of [path, decoded]) {
    if (candidate.includes("..")) return false;
    if (candidate.includes("://")) return false;
    if (candidate.startsWith("/") || candidate.startsWith("\\") || candidate.includes("\\")) return false;
  }
  return true;
}

/**
 * Bir file_path bu tenant + client öneki (`{tenant}/{client}/`) altında mı?
 * service_role storage silme / signed-url üretimi öncesi ZORUNLU ownership guard'ı.
 * Segment sınırı da doğrulanır (`{tenant}/{client}/` sonunda `/`).
 */
export function isOwnedClientStonePhotoPath(
  path: unknown,
  tenantId: string,
  clientId: string,
): path is string {
  if (!isSafeRelativePath(path)) return false;
  const prefix = clientPhotoPrefix(tenantId, clientId);
  if (!path.startsWith(prefix)) return false;
  // Önek sonrası en az bir dosya segmenti olmalı (boş dizin değil).
  return path.length > prefix.length;
}

/**
 * Bir dizi (client_stone_photos) file_path değerinden YALNIZ bu tenant+client'a ait
 * güvenli path'leri süzer. Yabancı-tenant / traversal / bozuk path'ler elenir →
 * service_role `storage.remove` ASLA yabancı objeye dokunmaz.
 */
export function filterOwnedStonePhotoPaths(
  paths: unknown[],
  tenantId: string,
  clientId: string,
): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (isOwnedClientStonePhotoPath(p, tenantId, clientId)) out.add(p);
  }
  return [...out];
}
