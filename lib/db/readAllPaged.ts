/**
 * BIO-01 — PostgREST max-rows (Supabase varsayılanı 1000) sınırında SESSİZ KESİLMEYİ
 * engelleyen sayfalı okuma yardımcısı (yalnız sunucu).
 *
 * Kullanım: çağıran her sayfa için DETERMİNİSTİK sıralı (benzersiz anahtar dahil, ör.
 * `.order("id")`) ve `select(cols, { count: "exact" })` ile sorgu kurar; yardımcı
 * `.range(from, to)` aralıklarını sırayla ister.
 *
 * Garanti:
 *   - Bir sayfa okuma hatası → hata döner (kısmi sonuç "başarı" sayılmaz).
 *   - Sunucunun bildirdiği toplam (count) ile okunan satır sayısı tutmazsa (sunucu
 *     max-rows sayfa boyutundan küçükse veya okuma sırasında veri değiştiyse)
 *     `IncompleteReadError` döner → çağıran sessizce eksik rapor/kopya ÜRETMEZ.
 *   - `maxRows` verilirse en fazla o kadar satır okunur; `truncated` + `total` ile
 *     çağıran görünür bir kırpma notu basabilir (sessiz düşürme yok).
 */
export type PageQueryResult = {
  data: unknown[] | null;
  error: unknown;
  count?: number | null;
};

export class IncompleteReadError extends Error {
  readonly expected: number;
  readonly received: number;
  constructor(expected: number, received: number) {
    super(`Eksik okuma: beklenen ${expected} satır, okunan ${received}.`);
    this.name = "IncompleteReadError";
    this.expected = expected;
    this.received = received;
  }
}

export const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGES = 2000; // sonsuz döngü güvenliği (500 × 2000 = 1M satır)

export async function readAllPaged<T = Record<string, unknown>>(
  fetchPage: (from: number, to: number) => PromiseLike<PageQueryResult>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<{ rows: T[]; error: unknown | null; total: number | null; truncated: boolean }> {
  const pageSize = Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE));
  const maxRows = opts.maxRows != null ? Math.max(0, Math.floor(opts.maxRows)) : null;
  const rows: T[] = [];
  let total: number | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    let to = from + pageSize - 1;
    if (maxRows !== null) to = Math.min(to, maxRows - 1);
    if (maxRows !== null && from >= maxRows) {
      truncated = total === null ? true : total > rows.length;
      break;
    }
    const res = await fetchPage(from, to);
    if (res.error) return { rows: [], error: res.error, total, truncated: false };
    if (total === null && typeof res.count === "number") total = res.count;
    const data = (res.data ?? []) as T[];
    rows.push(...data);
    const requested = to - from + 1;
    if (data.length < requested) break; // son sayfa (veya sunucu max-rows kırptı → aşağıda yakalanır)
    if (maxRows !== null && rows.length >= maxRows) {
      truncated = total === null ? true : total > rows.length;
      break;
    }
  }

  if (!truncated && total !== null && rows.length !== total) {
    return { rows: [], error: new IncompleteReadError(total, rows.length), total, truncated: false };
  }
  return { rows, error: null, total, truncated };
}

/** `.in(col, ids)` filtresini URL uzunluğu güvenli parçalara böler. */
export function chunkIds<T>(ids: readonly T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
