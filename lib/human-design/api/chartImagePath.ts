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
