/**
 * Beslenme Plan Word — güvenli satır sayfalayıcı (PURE, DB/istemci bağımsız).
 *
 * NEDEN: PostgREST/Supabase tek sorgu yanıtını sunucu tarafı max-row (varsayılan ≈1000) ile
 * SESSİZCE kırpar. Büyük planlarda (çok öğün / item / nutrient) `.range()` olmadan çekilen
 * fetch'lerin son satırları düşer → Word'de eksik item / yanlış gün toplamı & ortalama.
 * Örn: 84 item ≈ 1430 nutrient satırı → tek sorgu yalnız 1000 döndürür (61/84 item kapsanır).
 *
 * Bu yardımcı deterministik sıralı, range-tabanlı sayfalama ile TÜM satırları çeker.
 *
 * SÖZLEŞME (duplicate/eksik satır ÜRETMEZ):
 *  - makePage(from,to): STABİL + BENZERSİZ sıralı (PK: `id`) sorgu + `.range(from,to)` döndürmeli.
 *    Sıralama benzersiz olmalı; aksi halde sayfa sınırında satır atlanabilir/yinelenebilir.
 *  - Hata yayılımı: query error fırlatılır (sessiz yutma YOK).
 *  - Sonsuz-döngü koruması: MAX_PAGES üst sınırı.
 *  - Snapshot-only: yalnız verilen sorgu çalıştırılır; canlı katalog okuma / yeniden hesap YOK.
 *
 * NOT: Bu dosya HİÇBİR uzak-kaynak (fetch/axios/http) çağrısı yapmaz; yalnız çağıranın
 * verdiği Supabase sorgu üreticisini çalıştırır (SSRF-güvenli).
 */

/** PostgREST yanıt sayfa boyutu. Supabase varsayılan max-row (≈1000) ile uyumlu. */
export const PAGE_SIZE = 1000;

/** Güvenlik tavanı: PAGE_SIZE=1000 → 10M satır. Gerçekte item ≤ 3000 (MAX_PLAN_ITEMS). */
export const MAX_PAGES = 10_000;

export type PagedResponse<T> = { data: T[] | null; error: unknown };

/**
 * Verilen sayfalı sorguyu tüm satırlar tükenene kadar `.range()` ile çeker.
 * Son (kısmi) sayfa PAGE_SIZE'dan az satır döndürünce biter.
 */
export async function fetchAllPaged<T>(
  makePage: (from: number, to: number) => PromiseLike<PagedResponse<T>>,
  // pageSize/maxPages yalnız test edilebilirlik için parametrik; üretimde varsayılanlar kullanılır.
  pageSize: number = PAGE_SIZE,
  maxPages: number = MAX_PAGES,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await makePage(from, from + pageSize - 1);
    if (error) {
      const msg = (error as { message?: string } | null)?.message ?? "query error";
      throw new Error(`fetchAllPaged: ${msg}`);
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows; // son (kısmi/boş) sayfa → tamamlandı
  }
  throw new Error("fetchAllPaged: sayfa üst sınırı aşıldı (olası sonsuz döngü)");
}
