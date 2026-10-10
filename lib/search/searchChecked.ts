/**
 * Arama sonuçlarında "Kontrol edildi" yardımcısı (WT5 Doğaltaş Detay Arama; WT8: ortak — Doğaltaş
 * ailesi + Biyoenerji genel arama). SAF çekirdek + sessionStorage.
 *
 * Amaç: uzman bir aramanın sonuçlarını tek tek açıp geri döndüğünde hangilerine baktığını görsün.
 * Yalnız GÖRÜNTÜLEME yardımcısıdır: sonucu, sıralamayı, filtreyi DEĞİŞTİRMEZ; sunucuya yazmaz.
 *
 * Bağlam = metin araması + Detay Arama filtreleri (astro/çakra/mineral/uyarı). İşaretler bağlama
 * bağlıdır:
 *   - aynı arama (aynı q + aynı filtreler) → işaretler korunur (detaydan geri dönüş, sayfa yenileme);
 *   - YENİ arama/filtre → temiz başlar (başka aramanın işaretleri karışmaz);
 *   - önceki bir aramaya geri dönülürse onun işaretleri geri gelir (son 20 bağlam);
 *   - arama/filtre tamamen temizlenince etiket gösterilmez;
 *   - sekme kapanınca hepsi silinir (sessionStorage; cihazlar/oturumlar arası taşınmaz).
 * Eski kalıcı (localStorage, bağlamsız, hiç silinmeyen) "Bakıldı" listesinin yerini alır.
 *
 * WT8 `scope`: aynı depoyu paylaşan yüzeyler (taş listesi, mineraller, kombinasyonlar, kombinasyon
 * oluşturucu, Biyoenerji) birbirinin işaretlerini görmez. `scope` verilmezse anahtar WT5 ile BİREBİR
 * aynıdır (mevcut Doğaltaş işaretleri korunur).
 */

export const SEARCH_CHECKED_STORAGE_KEY = "yasam-dogaltas-search-checked-v1";
const MAX_CONTEXTS = 40;
const MAX_IDS_PER_CONTEXT = 1000;

export type SearchContextInput = {
  /** Yüzey kimliği (ör. "minerals", "bio"); yoksa WT5 Doğaltaş taş listesi. */
  scope?: string;
  query: string;
  zodiac?: string;
  chakra?: string;
  mineral?: string;
  warningOnly?: boolean;
};

type Stored = { v: 1; contexts: { k: string; ids: string[] }[] };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function norm(v: string | undefined): string {
  return (v ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

/** Arama bağlamı anahtarı; arama/filtre yoksa "" (etiket gösterilmez). */
export function searchContextKey(input: SearchContextInput): string {
  const parts = {
    q: norm(input.query),
    z: norm(input.zodiac),
    c: norm(input.chakra),
    m: norm(input.mineral),
    w: input.warningOnly ? "1" : "",
  };
  if (!parts.q && !parts.z && !parts.c && !parts.m && !parts.w) return "";
  const scope = norm(input.scope);
  return JSON.stringify(scope ? { s: scope, ...parts } : parts);
}

function readStored(storage: StorageLike | null): Stored {
  if (!storage) return { v: 1, contexts: [] };
  try {
    const raw = storage.getItem(SEARCH_CHECKED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    if (parsed && parsed.v === 1 && Array.isArray(parsed.contexts)) {
      return {
        v: 1,
        contexts: parsed.contexts
          .filter((c) => c && typeof c.k === "string" && Array.isArray(c.ids))
          .map((c) => ({ k: c.k, ids: c.ids.map(String) })),
      };
    }
  } catch {
    /* bozuk/erişilemez depolama → boş */
  }
  return { v: 1, contexts: [] };
}

/** Bu bağlamda "kontrol edildi" işaretli kayıt kimlikleri. */
export function readCheckedIds(storage: StorageLike | null, context: string): Set<string> {
  if (!context) return new Set();
  const found = readStored(storage).contexts.find((c) => c.k === context);
  return new Set(found?.ids ?? []);
}

/** Kaydı bu bağlamda işaretler; güncel kümeyi döner. Bağlam yoksa hiçbir şey yazılmaz. */
export function markChecked(storage: StorageLike | null, context: string, id: string): Set<string> {
  if (!context || !id) return readCheckedIds(storage, context);
  const stored = readStored(storage);
  const existing = stored.contexts.find((c) => c.k === context);
  const ids = new Set(existing?.ids ?? []);
  ids.add(id);
  const next = [...ids].slice(-MAX_IDS_PER_CONTEXT);
  // En son kullanılan bağlam sona; en eski bağlamlar düşer.
  const others = stored.contexts.filter((c) => c.k !== context);
  const contexts = [...others, { k: context, ids: next }].slice(-MAX_CONTEXTS);
  try {
    storage?.setItem(SEARCH_CHECKED_STORAGE_KEY, JSON.stringify({ v: 1, contexts } satisfies Stored));
  } catch {
    /* kota/erişim hatası → yalnız bellekte */
  }
  return new Set(next);
}

/** Tarayıcı sessionStorage'ı (SSR / erişim hatasında null). */
export function browserSessionStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
