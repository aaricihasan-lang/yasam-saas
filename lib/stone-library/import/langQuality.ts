// Doğaltaş Kütüphanesi · DİL KALİTESİ (SAF). Sağlayıcı, çevirisi olmayan alanı `lang=tr` isteğinde sessizce
// İngilizce döndürebilir. Owner kuralı: Türkçe veri SİLİNMEZ; şüpheli alan işaretlenir ('lang_suspect') ve owner
// dili doğrulayana kadar uzmana YAYIMLANMAZ (DB yayın kilidi). Bu dosya yalnız tespiti yapar.

export type DetectedLang = "tr" | "en" | "unknown";

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;
const TR_WORDS = new Set([
  "ve", "bir", "bu", "için", "ile", "olarak", "da", "de", "çok", "daha", "en", "gibi", "olan", "taş", "taşı", "taşıdır",
  "eder", "sağlar", "destekler", "yardımcı", "olur", "kişinin", "enerji", "enerjisi", "ruhsal", "duygusal", "fiziksel",
  "ruhani", "ki", "veya", "ise", "her", "hem", "kadar", "sonra", "önce", "üzerinde", "arasında", "değil",
]);
const EN_WORDS = new Set([
  "the", "and", "of", "is", "with", "to", "in", "for", "a", "an", "it", "this", "that", "are", "be", "as", "on", "by",
  "its", "from", "your", "you", "helps", "supports", "stone", "crystal", "energy", "can", "which", "or", "known", "used",
]);

export type LangScore = { lang: DetectedLang; trScore: number; enScore: number; words: number };

/** Kısa metinlerde (≤ 2 kelime) karar verilmez → 'unknown'. */
export function detectLanguage(text: string | null | undefined): LangScore {
  const t = (text ?? "").trim();
  const words = t.toLowerCase().split(/[^a-zçğıöşü]+/i).filter(Boolean);
  if (words.length <= 2) return { lang: "unknown", trScore: 0, enScore: 0, words: words.length };
  const trChars = (t.match(TR_CHARS) ?? []).length;
  let trW = 0;
  let enW = 0;
  for (const w of words) {
    if (TR_WORDS.has(w)) trW++;
    if (EN_WORDS.has(w)) enW++;
  }
  const trScore = trW + Math.min(trChars, words.length) * 0.5;
  const enScore = enW;
  let lang: DetectedLang = "unknown";
  if (trScore >= 1 && trScore > enScore * 1.2) lang = "tr";
  else if (enScore >= 2 && enScore > trScore * 1.5) lang = "en";
  return { lang, trScore, enScore, words: words.length };
}

export type QualityFlag = "lang_suspect" | "tr_equals_en" | "duplicate_text" | "health_lexicon";

/** TR alanı için işaretler. TR metin SİLİNMEZ; yalnız işaretlenir. */
export function trFieldFlags(tr: string, en: string | null | undefined): QualityFlag[] {
  const flags = new Set<QualityFlag>();
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  if (en && norm(tr) === norm(en)) {
    flags.add("tr_equals_en");
    flags.add("lang_suspect");
  }
  const det = detectLanguage(tr);
  if (det.lang === "en") flags.add("lang_suspect");
  // Karar verilemeyen (unknown) ve hiç Türkçe karakter içermeyen ≥ 3 kelimelik TR metin: owner dil doğrulaması ister.
  if (det.lang === "unknown" && det.words >= 3 && !/[çğıöşüÇĞİÖŞÜ]/.test(tr)) flags.add("lang_suspect");
  return [...flags];
}

/** EN alanı için işaretler (İngilizce yanıtta Türkçe metin olması da şüphelidir). */
export function enFieldFlags(en: string): QualityFlag[] {
  return detectLanguage(en).lang === "tr" ? ["lang_suspect"] : [];
}

/** Aynı yanıtta bir alan başka bir alanın metnini (veya cümlelerinin çoğunu) tekrar ediyorsa. */
export function isDuplicateOf(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const sents = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim().toLowerCase()).filter((x) => x.length > 20);
  const sa = sents(a);
  const sb = new Set(sents(b));
  if (sa.length === 0) return false;
  const shared = sa.filter((x) => sb.has(x)).length;
  return shared / sa.length >= 0.5;
}
