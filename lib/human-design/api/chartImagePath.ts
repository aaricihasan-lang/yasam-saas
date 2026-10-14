/**
 * HD harita görseli storage-path sahiplik/biçim kontrolleri (HD-0 güvenlik).
 *
 * Tek kaynak: upload cleanup, delete, signed-URL, rapor snapshot kopyası, rapor indirme ve
 * yedek/geri yükleme bu predicate'leri kullanır. Böylece "yalnız kendi tenant/client'ına ait,
 * normalize edilemeyen (traversal'sız) path işlenir" kuralı tek yerde tanımlı ve test edilebilir.
 *
 * NEDEN SIKI (HD-01/HD-02, 2026-10-14 denetimi): supabase-js storage yolları URL'ye KODLAMADAN
 * ekler; fetch (WHATWG URL) `..`, `%2e%2e`, `%2E.` gibi nokta segmentlerini ÇÖZER →
 * `T/C/../../X/y.png` ya da `T/%2e%2e/%2e%2e/<başka-bucket>/y` önek kontrolünü geçip başka
 * tenant'ın ya da başka bucket'ın nesnesine service_role ile ulaşırdı. Bu yüzden yol, URL
 * normalizasyonunun DEĞİŞTİREMEYECEĞİ bir alfabeyle sınırlandırılır: `%`, `\`, boşluk,
 * kontrol karakteri, `?`, `#` ve `.`/`..` segmentleri hiçbir koşulda kabul edilmez.
 */

/** DB'de saklanan değer http(s) tam URL mi? (legacy public URL tespiti) */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

/** Bir storage yolunun toplam üst sınırı (Supabase nesne adı sınırının altında). */
export const HD_STORAGE_PATH_MAX_LENGTH = 512;

/**
 * Tek segment: harf/rakam ile başlar; yalnız `[A-Za-z0-9._-]`. `.`/`..` ve gizli/boş segment
 * bu kuralla zaten elenir (ilk karakter `.` olamaz); yalnız sunucunun kendi geçici klasörü
 * (`.restore-tmp`) için `allowDotDir` ile istisna yapılır.
 */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HD harita/rapor görseli için izinli uzantılar (bucket allowed_mime_types ile aynı küme). */
export const HD_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

/**
 * Yol güvenli mi? — URL normalizasyonuyla başka klasöre/bucket'a KAÇAMAZ:
 *   • string, kırpılmış hâliyle aynı, boş değil, ≤ 512 karakter
 *   • baştaki/sondaki `/`, `//`, `\`, `%` (her türlü yüzde-kodlama → çift kodlama dahil),
 *     `?`, `#`, boşluk ve kontrol karakterleri YOK
 *   • her segment SEGMENT_RE'ye uyar (`.`/`..` ve `.gizli` segmentler reddedilir)
 */
export function isSafeStoragePath(p: unknown, opts: { allowDotDir?: string } = {}): p is string {
  if (typeof p !== "string" || p.length === 0 || p.length > HD_STORAGE_PATH_MAX_LENGTH) return false;
  if (p !== p.trim()) return false;
  if (p.startsWith("/") || p.endsWith("/") || p.includes("//")) return false;
  // Yalnız yazdırılabilir ASCII'nin güvenli alt kümesi: %, \, ?, #, boşluk, kontrol karakteri yok.
  if (!/^[A-Za-z0-9._\-/]+$/.test(p)) return false;
  return p.split("/").every((seg) => SEGMENT_RE.test(seg) || (!!opts.allowDotDir && seg === opts.allowDotDir));
}

/** Uzantı (küçük harf) — yalnız son segmentin son noktasından sonrası. */
export function storagePathExtension(p: string): string {
  const last = p.split("/").pop() ?? "";
  const i = last.lastIndexOf(".");
  return i > 0 ? last.slice(i + 1).toLowerCase() : "";
}

function isImageExt(p: string): boolean {
  return (HD_IMAGE_EXTENSIONS as readonly string[]).includes(storagePathExtension(p));
}

/**
 * Verilen storage path, tam olarak bu tenant + client'a mı ait?
 * Yalnız `{tenantId}/{clientId}/{dosya}.{png|jpg|jpeg|webp}` (tek seviye, alt klasör YOK)
 * sahiplenilir. Geçerli eski biçimler: `{t}/{c}/bodygraph.{ext}` ve `{t}/{c}/{uuid}.{ext}`.
 * Başka tenant/client path'i, traversal, legacy URL, boş/whitespace → false.
 */
export function isOwnedChartImagePath(
  path: string | null | undefined,
  tenantId: string,
  clientId: string,
): boolean {
  if (!path || !tenantId || !clientId) return false;
  if (isHttpUrl(path)) return false;
  if (!isSafeStoragePath(path)) return false;
  const segs = path.split("/");
  return segs.length === 3 && segs[0] === tenantId && segs[1] === clientId && isImageExt(path);
}

/** Profesyonel rapor görsel snapshot'larının tenant içi klasörü (P2-1). */
export const HD_REPORT_SNAPSHOT_DIR = "report-snapshots";

/** `{tenantId}/report-snapshots/{reportId}.{ext}` — rapora ait DONMUŞ görsel kopyası. */
export function reportSnapshotImagePath(tenantId: string, reportId: string, ext: string): string {
  const safeExt = (HD_IMAGE_EXTENSIONS as readonly string[]).includes(ext.toLowerCase()) ? ext.toLowerCase() : "png";
  return `${tenantId}/${HD_REPORT_SNAPSHOT_DIR}/${reportId}.${safeExt}`;
}

/**
 * Verilen path bu tenant'ın rapor snapshot klasöründe mi? (danışandan bağımsız; danışan
 * silinse de rapor görseli doğrulanabilir). Yalnız `{t}/report-snapshots/{dosya}.{ext}`
 * (tek seviye, güvenli segment). Başka tenant / traversal / URL / alt klasör → false.
 */
export function isOwnedReportSnapshotPath(path: string | null | undefined, tenantId: string): boolean {
  if (!path || !tenantId) return false;
  if (isHttpUrl(path) || !isSafeStoragePath(path)) return false;
  const segs = path.split("/");
  return segs.length === 3 && segs[0] === tenantId && segs[1] === HD_REPORT_SNAPSHOT_DIR && isImageExt(path);
}

/**
 * Bu tenant'a ait, bilinen biçimlerden birinde HD görsel yolu mu? (yedek/geri yükleme ve
 * toplu listeleme için): danışan görseli `{t}/{uuid}/{dosya}.{ext}` ya da rapor snapshot'ı.
 */
export function isTenantHdImagePath(path: unknown, tenantId: string): path is string {
  if (typeof path !== "string" || !tenantId) return false;
  if (isOwnedReportSnapshotPath(path, tenantId)) return true;
  if (!isSafeStoragePath(path)) return false;
  const segs = path.split("/");
  return segs.length === 3 && segs[0] === tenantId && UUID_RE.test(segs[1]) && isImageExt(path);
}
