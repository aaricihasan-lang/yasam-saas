/**
 * Yaşam Hafızası™ — Retrieval Türkçe Metin Normalizasyonu (Sprint 2 / S2.14).
 *
 * Sorgu ve indeks metnine SİMETRİK uygulanan saf, deterministik Türkçe metin
 * normalizasyonu + tokenizasyon (kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md §1).
 *
 * DB SİMETRİSİ (production Supabase üzerinde salt-okunur SELECT ile doğrulandı):
 *   index tarafı = `to_tsvector('simple', yh_immutable_unaccent(text))` → önce unaccent
 *   (İ→I, ı→i, ğ→g, ş→s, ç→c, ö→o, ü→u), sonra generic lowercase. Bu birim aynı nihai
 *   token'ı üretir: fold (ASCII'ye) → generic lowercase. Doğrulanan eşleşmeler:
 *     IŞIK/Işık/ışık → isik · İĞNE/İğne/igne → igne · ŞİFA → sifa · ÇAKRA → cakra
 *     · GÖĞÜS → gogus · BÜTÜN → butun · (KRİTİK) ı → i, ışık → isik.
 *
 * DEĞİŞMEZ: SAF · deterministik · mutasyonsuz · IO/DB/AI/env YOK · LOCALE BAĞIMSIZ
 * (`toLocaleLowerCase` KULLANILMAZ — DB Türkçe-locale casing yapmaz) · exception-safe
 * (hiçbir girdide throw etmez). Stemmer / stop-list / dedupe / sort / dictionary YOK.
 */

/** Normalize sonucu (dışarıdan mutasyona kapalı). */
export type NormalizedSearchText = Readonly<{
  normalizedText: string;
  tokens: readonly string[];
}>;

/**
 * Türkçe + ilgili Latin karakterlerinin ASCII-fold eşlemesi. Hem büyük hem küçük
 * biçim verilir; nihai `toLowerCase()` zaten küçültür fakat fold, DB `unaccent` ile
 * simetriyi kesinleştirmek için lowercase'ten ÖNCE ASCII'ye indirger (İ→i̇ combining-dot
 * riskini de tümüyle önler). NFD sonrası temel harf + combining mark'a ayrışan
 * karakterler (â, î, û, ö, ü, …) 4. adımda combining mark temizliğiyle yakalanır.
 */
const FOLD_MAP: Readonly<Record<string, string>> = Object.freeze({
  I: "i",
  İ: "i",
  ı: "i",
  i: "i",
  Ç: "c",
  ç: "c",
  Ğ: "g",
  ğ: "g",
  Ö: "o",
  ö: "o",
  Ş: "s",
  ş: "s",
  Ü: "u",
  ü: "u",
  Â: "a",
  â: "a",
  Î: "i",
  î: "i",
  Û: "u",
  û: "u",
});

/** Boş/fail-safe sonuç (tek yerden, donuk). */
const EMPTY_RESULT: NormalizedSearchText = Object.freeze({
  normalizedText: "",
  tokens: Object.freeze([]) as readonly string[],
});

/** Combining mark'lar (aksan). \p{M} yerine güvenli açık aralık (ES hedef uyumu). */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Harf (fold sonrası ASCII) ve rakam DIŞINDAKİ her şey → ayırıcı (boşluk). */
const NON_ALNUM = /[^a-z0-9]+/g;

/**
 * Retrieval metnini normalize eder ve token'lara ayırır. Saf/deterministik/fail-safe.
 * String olmayan (null/undefined/number/boolean/object/array/function/symbol/bigint)
 * veya anlamlı içerik üretmeyen girdiler → `{ normalizedText: "", tokens: [] }`.
 */
export function normalizeSearchText(input: unknown): NormalizedSearchText {
  // 1) String değilse fail-safe boş sonuç.
  if (typeof input !== "string") return EMPTY_RESULT;

  // 2) Unicode NFD — combining mark'ları temel harften ayır (â → a + ̂).
  const decomposed = input.normalize("NFD");

  // 3) Türkçe/Latin özel harfleri ASCII'ye fold et (lowercase'ten ÖNCE; DB unaccent ayna).
  let folded = "";
  for (const ch of decomposed) {
    const mapped = FOLD_MAP[ch];
    folded += mapped !== undefined ? mapped : ch;
  }

  // 4) Combining mark'ları temizle (aksan kalıntıları).
  const stripped = folded.replace(COMBINING_MARKS, "");

  // 5) Generic lowercase (LOCALE BAĞIMSIZ — DB 'simple' ile simetrik).
  const lowered = stripped.toLowerCase();

  // 6+7) Harf/rakam dışını boşluğa çevir + çoklu boşluğu sadeleştir (tek geçiş).
  // 8) Trim.
  const normalizedText = lowered.replace(NON_ALNUM, " ").trim();

  // 9) Anlamlı içerik yoksa fail-safe boş sonuç.
  if (normalizedText.length === 0) return EMPTY_RESULT;

  // 10) Whitespace tokenizasyonu (sıra korunur; dedupe/sort/stop-list/stemmer YOK).
  const tokens = Object.freeze(normalizedText.split(" ")) as readonly string[];

  // 11) Dışarıdan mutasyona kapalı sonuç.
  return Object.freeze({ normalizedText, tokens });
}
