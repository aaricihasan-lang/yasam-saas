/**
 * Şifa Rehberi — id-liste toplu (batch) getirme yardımcıları (SAF; test edilebilir).
 *
 * NEDEN: Word "filtreli" export ölçekte (500–5000 eşleşme) TEK dev `.in("id", ids)`
 * ile çekilirse PostgREST GET URL/query-string uzunluk sınırına takılabilir. Sabit
 * küçük batch'lere bölmek bu riski YAPISAL olarak ortadan kaldırır (client'a binlerce
 * id taşınmaz; server resolver → sabit batch fetch → canonical renderer).
 *
 * GUIDE_FETCH_BATCH: 100 UUID/batch ≈ ~3.7 KB query (`id=in.(…)`), tipik 8 KB URL
 * sınırının çok altında; deterministik batch sayısı = ceil(n/100).
 */

export const GUIDE_FETCH_BATCH = 100;

/** ids'i sabit boyutlu, çakışmasız parçalara böler (sıra korunur). */
export function chunkIds<T>(ids: readonly T[], size: number = GUIDE_FETCH_BATCH): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size) as T[]);
  }
  return out;
}

/** ceil(n/size) — beklenen batch sayısı (deterministik doğrulama için). */
export function expectedBatchCount(n: number, size: number = GUIDE_FETCH_BATCH): number {
  if (size < 1) throw new Error("chunk size must be >= 1");
  return Math.ceil(n / size);
}

/**
 * Batch'lerden dönen satırları, verilen deterministik id sırasına göre yeniden dizer.
 * Batch içi `.in()` sıralama garantisi vermez → resolver sırası (fold(name), id) KORUNUR.
 * Bulunamayan id atlanır (tenant dışı/silinmiş); duplicate id tek satıra iner.
 */
export function orderRowsByIds<T extends { id: string }>(
  rows: readonly T[],
  orderedIds: readonly string[],
): T[] {
  const byId = new Map<string, T>();
  for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r);
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    const row = byId.get(id);
    if (row) {
      out.push(row);
      seen.add(id);
    }
  }
  return out;
}
