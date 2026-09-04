/**
 * lib/kisisel-arsiv/storagePath.ts — Kişisel Arşiv depolama sözleşmesi (P1-3).
 *
 * P1-3 güvenlik kararı: `personal-archive` bucket PUBLIC idi ve storage.objects üzerinde
 * public/anon SELECT+INSERT+DELETE policy'leri taşıyordu; upload/remove doğrudan
 * TARAYICIDAN anon supabase client ile yapılıyordu. Path client-kurulu (`${tenantId}/...`)
 * olduğundan ve policy yalnız `bucket_id`'ye baktığından:
 *   - herkes (anon) keyfi tenant öneki altına dosya yükleyebiliyordu (cross-tenant insert),
 *   - path'i bilen anon başka tenant objesini silebiliyordu (cross-tenant delete),
 *   - obje public URL ile okunabiliyordu.
 *
 * NİHAİ MODEL (bu sözleşme):
 *   - Bucket PRIVATE (migration: public=false + tüm public/anon policy DROP).
 *   - Upload/delete SUNUCU-YETKİLİ: requireModuleAccess + service_role (guard.db).
 *   - tenant SUNUCUDAN (oturumdan) alınır; client'tan tenant/path KABUL EDİLMEZ.
 *   - archive ownership (personal_archives.id = archiveId AND tenant_id = guard.tenantId)
 *     SUNUCUDA doğrulanır (IDOR engeli).
 *   - Obje yolu SUNUCUDA üretilir; yalnız dosya adı client'tan gelir ve sanitize edilir.
 *   - Okuma yalnız kısa ömürlü signed URL (mevcut /api/kisisel-arsiv/signed-url) ile.
 */

/** Kişisel arşiv dosyaları için ADANMIŞ PRIVATE bucket. */
export const PERSONAL_ARCHIVE_BUCKET = "personal-archive";

/**
 * Maksimum dosya boyutu (server tarafı zorlanır). next.config
 * `experimental.serverActions.bodySizeLimit = "50mb"` ile hizalıdır: multipart POST
 * gövdeleri (Route Handler'lar dahil) bu tavana tabidir.
 */
export const PERSONAL_ARCHIVE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Dosya adını güvenli karakter setine indirger (path enjeksiyonu / kontrol karakteri
 * engeli). Boşsa "dosya" döner. Uzunluk 180 karakterle sınırlanır.
 */
export function sanitizePersonalArchiveFileName(name: unknown): string {
  const raw = typeof name === "string" ? name : "";
  const safe = raw.replace(/[^\w.\-()+ ]/g, "_").trim().slice(0, 180);
  return safe || "dosya";
}

/** tenant + archive scoped path öneki. */
export function personalArchivePrefix(tenantId: string, archiveId: string): string {
  return `${tenantId}/${archiveId}/`;
}

/**
 * Sunucuda üretilen çakışma-dayanıklı obje yolu. tenant/archive/uuid SUNUCUDAN gelir;
 * yalnız `safeName` client kaynaklıdır ve önceden sanitize edilmiş olmalıdır. `Date.now`
 * TEK BAŞINA güvenlik identifier'ı olarak kullanılmaz — çakışma/tahmin direncini uuid sağlar.
 */
export function buildPersonalArchivePath(
  tenantId: string,
  archiveId: string,
  uuid: string,
  safeName: string,
): string {
  return `${personalArchivePrefix(tenantId, archiveId)}${uuid}_${safeName}`;
}

/**
 * Bir file_path bu tenant + archive öneki altında mı? Storage silme öncesi savunmacı
 * ownership kontrolü — DB'den çözülen path'ler için ikinci savunma katmanı. Path
 * traversal / mutlak URL reddedilir.
 */
export function isOwnedPersonalArchivePath(
  path: unknown,
  tenantId: string,
  archiveId: string,
): path is string {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("..") || path.includes("://")) return false;
  return path.startsWith(personalArchivePrefix(tenantId, archiveId));
}
