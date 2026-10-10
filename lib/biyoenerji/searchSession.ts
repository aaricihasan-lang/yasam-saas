/**
 * Biyoenerji genel arama — oturum içi geri dönüş yardımcıları (WT8). SAF + sessionStorage.
 *
 * Sonuç → detay → GERİ akışında arama metni, sonuç listesi ve kaydırma konumu bu sekmenin
 * sessionStorage'ından geri yüklenir (sunucuya tekrar gidilmez; sekme kapanınca silinir).
 * Önbellek yalnız sunucunun bu kullanıcıya zaten döndürdüğü sonuçlardır (tenant'tan bağımsız
 * yeni veri yok); başka sekme/cihaz/oturuma taşınmaz.
 */
import type { BioGlobalHit } from "@/lib/biyoenerji/globalSearch";

export type BioSearchSection = { key: string; label: string; total: number; hits: BioGlobalHit[] };

export type BioSearchCache = {
  query: string;
  total: number;
  sections: BioSearchSection[];
  scrollY: number;
};

export const BIO_SEARCH_CACHE_KEY = "yasam-bio-global-search-v1";
/** history.state işareti: bu geçmiş kaydı "arama sonuçları" kaydıdır (çıkış sorusu için). */
export const BIO_SEARCH_GUARD_MARK = "yasamBioSearch";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function writeBioSearchCache(storage: StorageLike | null, value: BioSearchCache | null): void {
  if (!storage) return;
  try {
    if (!value) storage.setItem(BIO_SEARCH_CACHE_KEY, "");
    else storage.setItem(BIO_SEARCH_CACHE_KEY, JSON.stringify({ v: 1, ...value }));
  } catch {
    /* kota/erişim hatası → geri yükleme olmaz, arama yeniden yapılır */
  }
}

export function readBioSearchCache(storage: StorageLike | null): BioSearchCache | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BIO_SEARCH_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<BioSearchCache> & { v?: number };
    if (p.v !== 1 || typeof p.query !== "string" || !p.query.trim() || !Array.isArray(p.sections)) return null;
    const sections = p.sections.filter(
      (s): s is BioSearchSection =>
        Boolean(s) && typeof s.key === "string" && typeof s.label === "string" && Array.isArray(s.hits),
    );
    return {
      query: p.query,
      total: typeof p.total === "number" ? p.total : sections.reduce((n, s) => n + s.hits.length, 0),
      sections,
      scrollY: typeof p.scrollY === "number" && p.scrollY >= 0 ? p.scrollY : 0,
    };
  } catch {
    return null;
  }
}

export function isBioSearchGuardState(state: unknown): boolean {
  return Boolean(state && typeof state === "object" && (state as Record<string, unknown>)[BIO_SEARCH_GUARD_MARK] === true);
}

/** Aynı sayfa adresinde `q` parametresini ayarlar/kaldırır (yol + sorgu + hash döner). */
export function urlWithQuery(href: string, query: string): string {
  const url = new URL(href, "http://local.invalid");
  if (query.trim()) url.searchParams.set("q", query.trim());
  else url.searchParams.delete("q");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Sonuçtan açılan kayıt detayına arama terimini taşır (yalnız istemci tarafı vurgu için).
 * Detay rotası olmayan bölümler zaten `?q=<kayıt adı>` ile listeye gider → aynen kalır.
 */
export function bioDetailHrefWithQuery(href: string, query: string): string {
  const term = query.trim();
  if (!term || href.includes("?")) return href;
  return `${href}?q=${encodeURIComponent(term)}`;
}
