/**
 * Kişisel Arşiv — yükleme politikası (DIJ-03 + BUG-020, satış öncesi AŞAMA 1).
 *
 * Önceki durum: boyut yalnız istemci beyanıydı ve opsiyoneldi; dosya türü hiç denetlenmiyordu
 * (.exe kabul ediliyordu); tenant kotası yoktu.
 *
 * Kural (owner kararları 2026-10-20):
 *   - Tenant başına toplam 2 GB (= 2 × 1024³ = 2 147 483 648 bayt), dosya başına 50 MB (52 428 800 bayt).
 *   - Kota DB'de, tenant başına danışma kilidi altında ATOMİK uygulanır:
 *       hazırlık (signed URL)  → personal_archive_reserve_upload: gerçek depo baytı + bekleyen
 *                                rezervasyonlar + yeni beyan ≤ kota ise rezervasyon yazılır;
 *       finalize               → personal_archive_commit_upload: nesnenin GERÇEK boyut/türü
 *                                storage.objects'ten okunur, tekil sınır + kota yeniden denetlenir.
 *     Böylece eşzamanlı yüklemeler kotayı birlikte aşamaz ve istemcinin beyanına güvenilmez.
 *   - FAIL-CLOSED: RPC yoksa (migration 20271104000200 uygulanmamış) veya hata verirse YENİ yükleme
 *     durdurulur. Mevcut dosyaların listelenmesi/indirilmesi/silinmesi bu modülü kullanmaz → etkilenmez.
 *   - Yürütülebilir / betik / tarayıcıda çalışan (html, svg, xml) dosyalar uzantı VEYA MIME ile reddedilir.
 *     Diğer türler bugünkü gibi kabul edilir; tam beyaz liste owner kararına bırakıldı.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (2 147 483 648 bayt)
/** Aynı tenant için aynı anda bekleyebilecek (yüklenmemiş) hazırlık sayısı. UI sıralı yükler. */
export const PERSONAL_ARCHIVE_MAX_PENDING_UPLOADS = 5;
/** Kullanılmayan rezervasyon bu süre sonunda kotadan düşer. */
export const PERSONAL_ARCHIVE_RESERVATION_TTL_SECONDS = 60 * 60;

export const QUOTA_UNAVAILABLE_MESSAGE =
  "Depolama kotası şu anda doğrulanamıyor; yükleme yapılamadı. Mevcut dosyalarınız etkilenmez, lütfen daha sonra tekrar deneyin.";
export const QUOTA_EXCEEDED_MESSAGE = "Arşiv depolama kotası (2 GB) doldu.";

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

export type ReserveResult =
  | { readonly kind: "ok" }
  | { readonly kind: "quota" }
  | { readonly kind: "pending_limit" }
  | { readonly kind: "unavailable" };

/** Hazırlık: atomik kota rezervasyonu. RPC yok/hata/beklenmeyen yanıt → unavailable (fail-closed). */
export async function reservePersonalArchiveUpload(
  db: SupabaseClient,
  tenantId: string,
  path: string,
  declaredBytes: number,
): Promise<ReserveResult> {
  try {
    const { data, error } = await db.rpc("personal_archive_reserve_upload", {
      p_tenant_id: tenantId,
      p_path: path,
      p_bytes: Math.ceil(declaredBytes),
      p_quota: PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES,
      p_max_pending: PERSONAL_ARCHIVE_MAX_PENDING_UPLOADS,
      p_ttl_seconds: PERSONAL_ARCHIVE_RESERVATION_TTL_SECONDS,
    });
    if (error || !data || typeof data !== "object") return { kind: "unavailable" };
    const d = data as { ok?: unknown; reason?: unknown };
    if (d.ok === true) return { kind: "ok" };
    if (d.reason === "quota") return { kind: "quota" };
    if (d.reason === "pending_limit") return { kind: "pending_limit" };
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

export type CommitResult =
  | { readonly kind: "ok"; readonly size: number; readonly mimetype: string | null }
  | { readonly kind: "rejected"; readonly reason: "too_large" | "quota" | "missing" | "size_unknown"; readonly mimetype: string | null }
  | { readonly kind: "unavailable" };

/** Finalize: depodaki GERÇEK boyut/tür + atomik kota denetimi. RPC yok/hata → unavailable (fail-closed). */
export async function commitPersonalArchiveUpload(
  db: SupabaseClient,
  tenantId: string,
  path: string,
  maxFileBytes: number,
): Promise<CommitResult> {
  try {
    const { data, error } = await db.rpc("personal_archive_commit_upload", {
      p_tenant_id: tenantId,
      p_path: path,
      p_quota: PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES,
      p_max_file: maxFileBytes,
    });
    if (error || !data || typeof data !== "object") return { kind: "unavailable" };
    const d = data as { ok?: unknown; reason?: unknown; size?: unknown; mimetype?: unknown };
    const mimetype = typeof d.mimetype === "string" ? d.mimetype : null;
    if (d.ok === true && typeof d.size === "number" && Number.isFinite(d.size)) {
      return { kind: "ok", size: d.size, mimetype };
    }
    if (d.reason === "too_large" || d.reason === "quota" || d.reason === "missing" || d.reason === "size_unknown") {
      return { kind: "rejected", reason: d.reason, mimetype };
    }
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Kullanılmayan rezervasyonu bırak (best-effort; süre dolunca zaten düşer). */
export async function releasePersonalArchiveReservation(db: SupabaseClient, tenantId: string, path: string): Promise<void> {
  try {
    await db.from("personal_archive_upload_reservations").delete().eq("path", path).eq("tenant_id", tenantId);
  } catch {
    // best-effort
  }
}
