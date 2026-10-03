/**
 * HD harita görseli storage-path sahiplik/biçim kontrolleri (HD-0 güvenlik).
 *
 * Tek kaynak: upload cleanup, delete ve signed-URL route'ları bu predicate'i kullanır.
 * Böylece "yalnız kendi tenant/client'ına ait path işlenir" kuralı tek yerde tanımlı
 * ve runtime test edilebilir olur.
 */

/** DB'de saklanan değer http(s) tam URL mi? (legacy public URL tespiti) */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Verilen storage path, tam olarak bu tenant + client'a mı ait?
 * Yalnız `{tenantId}/{clientId}/...` prefix'iyle başlayan path'ler sahiplenilir.
 * Başka tenant/client path'i, legacy URL, boş/whitespace → false.
 */
export function isOwnedChartImagePath(
  path: string | null | undefined,
  tenantId: string,
  clientId: string,
): boolean {
  if (!path || !tenantId || !clientId) return false;
  const p = path.trim();
  if (!p) return false;
  if (isHttpUrl(p)) return false;
  return p.startsWith(`${tenantId}/${clientId}/`);
}

/** Profesyonel rapor görsel snapshot'larının tenant içi klasörü (P2-1). */
export const HD_REPORT_SNAPSHOT_DIR = "report-snapshots";

/** Yol güvenli mi? (`..`, `//`, `\`, mutlak yol yok) — normalize edilip başka klasöre kaçamaz. */
export function isSafeStoragePath(p: string): boolean {
  if (!p || p.startsWith("/")) return false;
  if (p.includes("\\") || p.includes("//")) return false;
  return !p.split("/").some((seg) => seg === ".." || seg === ".");
}

/** `{tenantId}/report-snapshots/{reportId}.{ext}` — rapora ait DONMUŞ görsel kopyası. */
export function reportSnapshotImagePath(tenantId: string, reportId: string, ext: string): string {
  const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : "png";
  return `${tenantId}/${HD_REPORT_SNAPSHOT_DIR}/${reportId}.${safeExt}`;
}

/**
 * Verilen path bu tenant'ın rapor snapshot klasöründe mi? (danışandan bağımsız; danışan
 * silinse de rapor görseli doğrulanabilir). Başka tenant / traversal / URL → false.
 */
export function isOwnedReportSnapshotPath(path: string | null | undefined, tenantId: string): boolean {
  if (!path || !tenantId) return false;
  const p = path.trim();
  if (!p || isHttpUrl(p) || !isSafeStoragePath(p)) return false;
  return p.startsWith(`${tenantId}/${HD_REPORT_SNAPSHOT_DIR}/`);
}
