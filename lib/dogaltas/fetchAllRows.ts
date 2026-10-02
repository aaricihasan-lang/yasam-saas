/**
 * lib/dogaltas/fetchAllRows.ts — PostgREST satır tavanına (max-rows, Supabase varsayılanı
 * 1000) takılmadan TÜM eşleşen satırları okuyan sayfalı okuma yardımcısı (P2-07).
 *
 * Sorun: `.range()`'siz bir SELECT, PostgREST'in `max-rows` ayarı kadar satırla sessizce
 * kesilir (hata yok, `count` yok). "Tümü" anlamı taşıyan liste/rapor/arama yolları bu yüzden
 * 1000+ kayıtlı bir tenant'ta eksik sonuç gösterir.
 *
 * Kurallar:
 *   - Çağıran her sayfa sorgusunu KENDİSİ kurar (tenant filtresi her sayfada korunur) ve
 *     sıralamayı benzersiz bir anahtarla (ör. `id`) sabitler → sayfalar arası atlama/çift yok.
 *   - Sayfa boyutu `max-rows`'tan küçük/eşit olmalı; sunucu daha az satır dönerse (max-rows
 *     daha düşük ayarlanmışsa) döngü dönen satır sayısı kadar ilerler ve BOŞ sayfa gelene
 *     kadar devam eder → ayar ne olursa olsun kesilme olmaz.
 *   - `maxRows` verilirse en fazla o kadar satır okunur ve `truncated:true` DÜRÜSTÇE döner
 *     (bounded korpus; sessiz kesilme yok).
 *   - Hata ilk sayfada da sonraki sayfalarda da yutulmaz; `error` döner, kısmi satırlar
 *     "başarılı" sayılmaz.
 */

export const DOGALTAS_DB_PAGE_SIZE = 1000;

/** Supabase sorgu oluşturucusu (thenable) — data tipi select'e göre değiştiği için gevşek. */
export type PageQueryResult = { data: unknown; error: unknown };

export type FetchAllRowsResult<T> =
  | { ok: true; rows: T[]; truncated: boolean }
  | { ok: false; rows: T[]; truncated: false; error: unknown };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageQueryResult>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<FetchAllRowsResult<T>> {
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? DOGALTAS_DB_PAGE_SIZE, DOGALTAS_DB_PAGE_SIZE));
  const maxRows = opts.maxRows != null && opts.maxRows > 0 ? opts.maxRows : null;
  const rows: T[] = [];
  let from = 0;
  // Sonsuz döngü sigortası (her tur ≥1 satır ilerler; boş sayfada çıkılır).
  for (let guard = 0; guard < 100_000; guard++) {
    const want = maxRows != null ? Math.min(pageSize, maxRows - rows.length + 1) : pageSize;
    const { data, error } = await page(from, from + want - 1);
    if (error) return { ok: false, rows, truncated: false, error };
    const batch = (Array.isArray(data) ? data : []) as T[];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (maxRows != null && rows.length > maxRows) {
      return { ok: true, rows: rows.slice(0, maxRows), truncated: true };
    }
    from += batch.length;
  }
  return { ok: true, rows, truncated: false };
}

/**
 * `.in(column, ids)` sorgularını URL uzunluğu sınırına takılmadan parçalar (her parça ayrı
 * istek; her parçada tenant filtresi çağıranın kurduğu sorguda korunur). Parça içinde de
 * satır tavanı olabileceği için her parça `fetchAllRows` ile okunur.
 */
export const DOGALTAS_IN_CHUNK = 150;

export async function fetchAllRowsByIds<T>(
  ids: readonly string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<PageQueryResult>,
  opts: { chunkSize?: number } = {},
): Promise<FetchAllRowsResult<T>> {
  const size = Math.max(1, opts.chunkSize ?? DOGALTAS_IN_CHUNK);
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    const res = await fetchAllRows<T>((from, to) => page(chunk, from, to));
    if (!res.ok) return { ok: false, rows, truncated: false, error: res.error };
    rows.push(...res.rows);
  }
  return { ok: true, rows, truncated: false };
}
