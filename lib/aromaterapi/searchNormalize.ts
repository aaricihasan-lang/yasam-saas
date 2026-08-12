/**
 * Aromaterapi V2 — ARAMA normalizasyonu (TEK sözleşme).
 *
 * Bu, ARAMA-ODAKLI bir normalizasyondur ve canonical slug/key normalizasyonundan
 * (ör. glossary canonical_key, `aromatherapy_glossary_terms` stored normalize kolonu)
 * KASITLI OLARAK AYRIDIR. Onları DEĞİŞTİRMEZ / onlara BAĞIMLI DEĞİLDİR.
 *
 * SQL karşılığı: `public.aromatherapy_search_normalize(text)`
 * (migration 20261003000000_aromatherapy_search_normalization.sql). İkisi
 * BYTE-EŞ davranmalıdır — regresyon testleri bunu doğrular.
 *
 * Sözleşme (Faz 1 kilidi):
 *   1) Türkçe harf katlaması (büyük+küçük → ASCII):
 *        İ I ı i → i ; Ş ş → s ; Ğ ğ → g ; Ç ç → c ; Ö ö → o ; Ü ü → u
 *   2) olası birleşik nokta (U+0307) silinir  (JS toLowerCase("İ") kalıntısı / NFD girdi)
 *   3) kalan Latin büyük harfler → küçük  (lower)
 *   4) ardışık boşluklar tek boşluğa iner + baş/son trim
 *
 * FAZ 1 KAPSAM NOTU: `â / î / û` (circumflex) KATLANMAZ. Yani "kar" ↔ "kâr"
 * OTOMATİK EŞLEŞMEZ — bu bilinçli bir karardır (agresif normalizasyonun
 * false-positive riskini bu fazda artırmıyoruz).
 *
 * Saf / deterministik / yan-etkisiz. null/undefined güvenli.
 */

/**
 * Türkçe harf → ASCII katlama haritası (büyük ve küçük). U+0307 (birleşik nokta)
 * boş string'e katlanır (SQL `translate(..., from||chr(775), to)` = silme ile eş).
 */
const SEARCH_FOLD_MAP: Record<string, string> = {
  "İ": "i",
  I: "i",
  "ı": "i",
  i: "i",
  "Ş": "s",
  "ş": "s",
  "Ğ": "g",
  "ğ": "g",
  "Ç": "c",
  "ç": "c",
  "Ö": "o",
  "ö": "o",
  "Ü": "u",
  "ü": "u",
  "̇": "", // birleşik nokta (combining dot above) — silinir
};

/**
 * Arama girdisini (sorgu VEYA kolon içeriği) tek sözleşmeye göre normalize eder.
 * Boş/null/undefined → "".
 */
export function normalizeForSearch(value: string | null | undefined): string {
  if (!value) return "";
  let out = "";
  // for..of code-point bazlı iterasyon (BMP dışı güvenli).
  for (const ch of value) {
    const mapped = SEARCH_FOLD_MAP[ch];
    out += mapped === undefined ? ch : mapped;
  }
  return out.toLowerCase().replace(/\s+/g, " ").trim();
}
