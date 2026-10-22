/**
 * pagedInventoryRead.ts — Ürün & Stok tablolarının SAYFALI, eksiksiz okunması (STK-04; yalnız sunucu).
 *
 * Eski davranış: liste / katalog / Word raporu sorguları tek seferde `select` yapıyordu.
 * PostgREST `max_rows` (Supabase varsayılanı 1000) bu sorguları SESSİZCE ilk 1000 satırda keser:
 * >1000 kalemli kategoride liste, satış kataloğu ve Word raporu eksik kalır; istemcinin
 * client_id → uuid eşlemesi de sonraki kalemleri bulamaz.
 *
 * Yeni davranış: lib/db/readAllPaged ile sayfa sayfa okunur.
 *  - Sıralama deterministiktir: istenen sıra + benzersiz `id` bağ kırıcı → sayfa sınırında
 *    atlama / tekrar olmaz (aynı created_at / aynı ad olsa bile).
 *  - Her sayfa `tenant_id` filtresiyle okunur.
 *  - Sunucunun bildirdiği toplam ile okunan satır sayısı tutmazsa (okuma sırasında veri
 *    değişti) bir kez yeniden okunur; yine tutmazsa HATA döner — kısmi liste başarı sayılmaz.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { IncompleteReadError, readAllPaged } from "@/lib/db/readAllPaged";

export const INVENTORY_PAGE_SIZE = 500;

export type PagedReadOptions = {
  /** Birincil sıralama kolonu; bağ kırıcı olarak her zaman `id` eklenir. */
  orderBy: string;
  ascending?: boolean;
  /** Ek filtre (ör. yalnız stoğu > 0 olanlar). */
  gtZero?: string;
};

export async function readInventoryRowsPaged<T = Record<string, unknown>>(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  columns: string,
  opts: PagedReadOptions,
): Promise<{ rows: T[]; error: unknown | null }> {
  const run = () =>
    readAllPaged<T>(
      (from, to) => {
        let q = db.from(table).select(columns, { count: "exact" }).eq("tenant_id", tenantId);
        if (opts.gtZero) q = q.gt(opts.gtZero, 0);
        return q
          .order(opts.orderBy, { ascending: opts.ascending ?? true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to);
      },
      { pageSize: INVENTORY_PAGE_SIZE },
    );

  let res = await run();
  if (res.error instanceof IncompleteReadError) res = await run(); // eşzamanlı ekleme/silme: tek yeniden deneme
  return { rows: res.rows, error: res.error };
}
