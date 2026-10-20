/**
 * Kişisel Arşiv — yükleme politikası (DIJ-03 + BUG-020, satış öncesi AŞAMA 1).
 *
 * Önceki durum: boyut yalnız istemci beyanıydı ve opsiyoneldi; dosya türü hiç denetlenmiyordu
 * (.exe kabul ediliyordu); tenant kotası yoktu.
 *
 * Kural:
 *   - Yürütülebilir / betik / tarayıcıda çalışan (html, svg) dosyalar uzantı VEYA MIME ile REDDEDİLİR.
 *     Diğer belge/görsel/ses/video/arşiv türleri bugünkü gibi kabul edilir (UI "diğer" sınıfı
 *     kırılmaz). Tam beyaz liste owner kararına bırakıldı.
 *   - Tekil dosya ≤ 50 MB: yükleme hazırlığında beyan ZORUNLU; finalize'da depodaki GERÇEK boyut
 *     okunur, aşan nesne silinir.
 *   - Tenant toplam kotası (PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES): storage.objects gerçek boyut
 *     toplamı `personal_archive_tenant_bytes` RPC'sinden okunur (migration 20271104000200).
 *     RPC henüz uygulanmamışsa kota kontrolü ATLANIR (mevcut davranış; yükleme kırılmaz).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/** Her durumda reddedilen uzantılar (yürütülebilir, betik, kurulum paketi, tarayıcıda çalışan). */
export const PERSONAL_ARCHIVE_BLOCKED_EXT: ReadonlySet<string> = new Set([
  "exe", "msi", "msp", "bat", "cmd", "com", "scr", "pif", "cpl", "dll", "sys", "drv", "ocx",
  "ps1", "psm1", "psd1", "vbs", "vbe", "js", "jse", "mjs", "cjs", "wsf", "wsh", "wsc", "hta", "jar",
  "apk", "aab", "xapk", "ipa", "sh", "bash", "zsh", "csh", "run", "bin", "app", "dmg", "pkg", "deb", "rpm",
  "lnk", "reg", "inf", "scf", "url", "gadget", "msc", "appx", "msix", "appxbundle",
  "html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "xsl", "php", "asp", "aspx", "jsp", "py", "pl", "rb",
]);

/** Her durumda reddedilen MIME türleri (tarayıcının bildirdiği / deponun kaydettiği). */
const BLOCKED_MIME: ReadonlySet<string> = new Set([
  "application/x-msdownload", "application/x-ms-installer", "application/x-msi", "application/x-dosexec",
  "application/x-executable", "application/x-sh", "application/x-csh", "application/x-bat",
  "application/vnd.microsoft.portable-executable", "application/java-archive", "application/x-java-archive",
  "application/vnd.android.package-archive", "application/x-apple-diskimage", "application/javascript",
  "text/javascript", "application/x-javascript", "text/html", "application/xhtml+xml", "image/svg+xml",
  "application/hta", "application/x-ms-shortcut", "application/xml", "text/xml",
]);

export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).trim().toLowerCase() : "";
}

/** BUG-020: dosya adı ve (varsa) MIME türü kabul edilebilir mi. */
export function isAllowedPersonalArchiveFile(fileName: string, mime: string | null | undefined): boolean {
  const ext = fileExtension(fileName);
  if (ext && PERSONAL_ARCHIVE_BLOCKED_EXT.has(ext)) return false;
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m && BLOCKED_MIME.has(m)) return false;
  return true;
}

export type StoredObjectMeta = { size: number | null; mimetype: string | null };

/** Depodaki nesnenin GERÇEK boyut/türü (service_role `list`). Bulunamazsa null. */
export async function readStoredObjectMeta(
  db: SupabaseClient,
  bucket: string,
  path: string,
): Promise<StoredObjectMeta | null> {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await db.storage.from(bucket).list(dir, { search: name, limit: 100 });
  if (error || !Array.isArray(data)) return null;
  const hit = data.find((o) => o.name === name);
  if (!hit) return null;
  const meta = (hit.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
  const size = typeof meta.size === "number" && Number.isFinite(meta.size) ? meta.size : null;
  const mimetype = typeof meta.mimetype === "string" ? meta.mimetype : null;
  return { size, mimetype };
}

/**
 * Tenant'ın arşivde kullandığı toplam bayt. RPC yoksa (migration uygulanmamış) null → kota atlanır.
 */
export async function personalArchiveTenantBytes(db: SupabaseClient, tenantId: string): Promise<number | null> {
  try {
    const { data, error } = await db.rpc("personal_archive_tenant_bytes", { p_tenant_id: tenantId });
    if (error) return null;
    const n = Number(data);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function exceedsTenantQuota(usedBytes: number | null, addBytes: number): boolean {
  if (usedBytes == null) return false;
  return usedBytes + Math.max(0, addBytes) > PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES;
}
