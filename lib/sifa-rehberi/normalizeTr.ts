/**
 * Şifa Rehberi — Türkçe deterministik arama/eşleştirme normalizasyonu.
 *
 * Amaç: canlı denetimde doğrulanan arama kusurunu (astım↔astim, siğil↔sigil)
 * gidermek. AI / fuzzy / pg_trgm YOK — yalnızca deterministik harf katlama +
 * Unicode normalizasyonu. Hem sorgu hem de aranan metin AYNI fonksiyondan geçer.
 */

/**
 * Türkçe'ye özgü harfleri ASCII köküne katlar ve Unicode/boşluk/harf durumunu
 * normalize eder. `astım` ve `astim`, `siğil` ve `sigil` aynı sonucu üretir.
 */
export function foldTr(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return "";

  // 1) Composed/decomposed girişleri birleştir, Türkçe kurallı küçült.
  //    ('I'→'ı', 'İ'→'i' Türkçe locale ile doğru çalışır.)
  let s = input.normalize("NFC").toLocaleLowerCase("tr-TR");

  // 2) Türkçe'ye özgü harfleri ASCII köküne katla.
  s = s
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i") // güvenlik: kombine noktalı i
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o");

  // 3) Kalan aksan/kombine işaretlerini (â, î, decomposed artıklar) temizle.
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");

  // 4) Boşlukları sadeleştir + kırp.
  return s.replace(/\s+/g, " ").trim();
}

/** Katlanmış haystack içinde katlanmış query alt-dizge olarak var mı? */
export function foldedIncludes(haystack: unknown, query: unknown): boolean {
  const q = foldTr(query);
  if (!q) return true;
  return foldTr(haystack).includes(q);
}

/**
 * Anlamlı olmayan (boş veya bilinen "placeholder / henüz içerik yok") metinler.
 * Bunlar önizleme/dolu-bölüm hesaplarında İÇERİK SAYILMAZ.
 *
 * Kök neden (production'da doğrulandı): bazı kayıtların `symptoms` kolonuna
 * import sırasında "Bu bölüm için henüz bilgi eklenmemiş." placeholder'ı yazılmış
 * ve önizleme bunu gerçek section içeriğinin önüne alıyordu.
 */
export const PLACEHOLDER_TEXTS: readonly string[] = [
  "bu bolum icin henuz bilgi eklenmemis.",
  "bu bolum icin icerik henuz eklenmemis.",
  "bu baslik icin henuz aciklama eklenmemis.",
  "henuz ozet eklenmedi.",
  "henuz ozet eklenmemis.",
  "henuz kayit yok",
  "bilgi eklenmemis",
  "icerik eklenmemis",
].map((t) => foldTr(t));

/** Metin gerçek içerik mi? (boş / whitespace / bilinen placeholder → false) */
export function isMeaningfulText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const folded = foldTr(trimmed);
  if (folded.length === 0) return false;
  // Tam eşleşme: placeholder cümlesinin kendisi → anlamsız. (İçinde geçen uzun
  // gerçek metinleri yanlışlıkla elemeyelim diye "includes" değil, eşitlik.)
  return !PLACEHOLDER_TEXTS.includes(folded);
}
