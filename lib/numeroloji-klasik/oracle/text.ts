/**
 * Klasik Numeroloji oracle — ad metni katlama (saf, bağımlılıksız, istemci-güvenli).
 *
 * Kural (belgelenmiş + canlı doğrulanmış, 29.10.2026):
 *   • Türkçe: ı/İ/i/I → I, ş → S, ğ → G, ç → C, ö → O, ü → U.
 *   • Diğer aksanlar NFD ile taban harfe katlanır; ß → SS, æ → AE, œ → OE, ø → O, đ → D, ł → L, þ → TH.
 *   • Yalnız A–Z sayılır; kelimeler boşlukla ayrılır (harf içermeyen kelime atılır).
 *   • Kiril: ICAO 9303 pasaport çevirisi (ör. Иван Петров → Ivan Petrov). Yunan ve diğer yazılar oracle
 *     kapsamında DEĞİL: sayılmaz, `dropped` ile raporlanır (doğrulama "unverified" olmalı).
 */

const SPECIAL: Readonly<Record<string, string>> = Object.freeze({
  ı: "i",
  İ: "I",
  ß: "ss",
  ẞ: "SS",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  ø: "o",
  Ø: "O",
  đ: "d",
  Đ: "D",
  ł: "l",
  Ł: "L",
  þ: "th",
  Þ: "TH",
  ð: "d",
  Ð: "D",
});

/** Kiril → Latin, ICAO 9303 pasaport çevirisi (küçük harf anahtar). Yunan alfabesi kapsam dışı. */
const CYRILLIC: Readonly<Record<string, string>> = Object.freeze({
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "ie", ы: "y", ь: "", э: "e", ю: "iu", я: "ia",
  і: "i", ї: "i", є: "ie", ґ: "g",
});

function cyr(ch: string): string | undefined {
  const lo = ch.toLowerCase();
  const t = CYRILLIC[lo];
  if (t === undefined) return undefined;
  if (ch === lo || !t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Harfi büyük/küçük korunarak Latin tabanına katlar (gösterim için). */
export function foldPreserveCase(input: string): string {
  let out = "";
  for (const ch of input) {
    const sp = SPECIAL[ch] ?? cyr(ch);
    out += sp ?? ch;
  }
  return out.normalize("NFD").replace(/[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]+/g, "");
}

export type NameWord = {
  /** Katlanmış, büyük/küçük korunmuş, yalnız harf içeren gösterim (ör. "Işıl" → "Isil"). */
  display: string;
  /** Sayılan büyük harfler A–Z. */
  letters: string[];
};

export type FoldedName = { words: NameWord[]; letters: string[]; dropped: string[] };

export function foldName(input: string): FoldedName {
  const words: NameWord[] = [];
  const dropped: string[] = [];
  for (const raw of String(input).split(/\s+/u)) {
    if (!raw) continue;
    const folded = foldPreserveCase(raw);
    let display = "";
    const letters: string[] = [];
    for (const ch of folded) {
      const up = ch.toUpperCase();
      if (up.length === 1 && up >= "A" && up <= "Z") {
        display += ch;
        letters.push(up);
      } else if (ch.toLowerCase() !== ch.toUpperCase()) {
        dropped.push(ch);
      }
    }
    if (letters.length) words.push({ display, letters });
  }
  return { words, letters: words.flatMap((w) => w.letters), dropped };
}

export const VOWELS: ReadonlySet<string> = new Set(["A", "E", "I", "O", "U"]);
export const isVowel = (L: string): boolean => VOWELS.has(L);
