/**
 * Biyoenerji liste sayfaları için oturum-içi (modül seviyesi) hafif cache.
 *
 * Amaç: Detaydan listeye geri dönüldüğünde önceki liste state'ini ANINDA
 * göstermek (stale-while-revalidate); arka planda taze veri çekilip güncellenir.
 *
 * Kapsam: yalnızca SPA gezinmesi boyunca yaşar (sayfa tam yeniden yüklenince
 * sıfırlanır). Veri yazılmaz, kalıcı değildir; salt hız amaçlıdır.
 */
export type BioListCacheEntry = {
  rows: unknown[];
  total: number;
  searchCount: number;
  lastCreatedAt: string | null;
  categories: string[] | null;
};

const store = new Map<string, BioListCacheEntry>();

/** Listeyi belirleyen parametrelerden kararlı cache anahtarı üretir. */
export function bioListKey(
  resource: string,
  p: { search?: string; category?: string; offset?: number; limit?: number } = {},
): string {
  return [
    resource,
    `s=${(p.search ?? "").trim().toLocaleLowerCase("tr-TR")}`,
    `c=${(p.category ?? "").trim()}`,
    `o=${p.offset ?? 0}`,
    `l=${p.limit ?? ""}`,
  ].join("|");
}

export function bioListGet(key: string): BioListCacheEntry | undefined {
  return store.get(key);
}

export function bioListSet(key: string, entry: BioListCacheEntry): void {
  store.set(key, entry);
}

/**
 * Bir kaydı (id ile) daha önce yüklenmiş liste sayfalarından bulur.
 *
 * Amaç: Listeden detaya geçişte "Kayıt yükleniyor…" boş ekranını atlamak —
 * kayıt zaten listede taze çekilmişse detay ANINDA gösterilir; arka planda
 * tam kayıt yeniden çekilip güncellenir (stale-while-revalidate).
 *
 * Not: Anahtar `resource|...` biçiminde olduğundan yalnız ilgili kaynağın
 * girdileri taranır. Salt-okuma; veri yazılmaz.
 */
export function bioListFindRow(
  resource: string,
  id: string,
): Record<string, unknown> | undefined {
  const target = id.trim();
  if (!target) return undefined;
  const prefix = `${resource}|`;
  for (const [key, entry] of store) {
    if (key !== resource && !key.startsWith(prefix)) continue;
    for (const raw of entry.rows) {
      const row = raw as { id?: unknown };
      if (String(row?.id ?? "").trim() === target) {
        return raw as Record<string, unknown>;
      }
    }
  }
  return undefined;
}
