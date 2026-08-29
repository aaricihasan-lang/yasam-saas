import { turkishUpper } from "../ortak";
import type { CompatClass, CompatibilityClassification } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// EŞ UYUMU — ÖZEL COMPATIBILITY ALPHABET
//
// DİKKAT: Bu alfabe, ana numerolojinin CHAKRA_LETTER_MAP'İNDEN FARKLIDIR ve
// yalnızca Eş Uyumu motorunda kullanılır. Kaynak: Hasan Hoca eğitim notu.
//
// turkishUpper() İ→I dönüştürür; bu yüzden hem "İ" hem "I" 10 değerini alır
// (kaynakta ikisi de 10).
//
// Q ve W: canonical PDF'de açıkça 0'dır.
// X: canonical kaynak değeri DOĞRULANMADI → haritada YOK, unmapped olarak raporlanır
//    (UYDURULMAZ).
// ─────────────────────────────────────────────────────────────────────────────

export const COMPATIBILITY_ALPHABET: Record<string, number> = {
  A: 1, B: 2, C: 3, Ç: 3, D: 4, E: 5, F: 3, G: 8, Ğ: 8, H: 8,
  I: 10, İ: 10, J: 3, K: 4, L: 6, M: 4, N: 2, O: 7, Ö: 7, P: 2,
  Q: 0, R: 8, S: 0, Ş: 0, T: 4, U: 7, Ü: 7, V: 6, W: 0, Y: 10, Z: 7,
};

export type NameSumResult = {
  sum: number;
  unmapped: string[]; // kaynak alfabesinde olmayan harfler
};

/** İsmin compatibility-alphabet harf toplamı (SADELEŞTİRME YOK — ham toplam). */
export function compatibilityNameSum(name: string): NameSumResult {
  const upper = turkishUpper(name || "");
  let sum = 0;
  const unmapped: string[] = [];
  for (const ch of Array.from(upper)) {
    if (!/[A-ZÇĞÖŞÜ]/.test(ch)) continue; // boşluk/rakam vb. atla
    const val = COMPATIBILITY_ALPHABET[ch];
    if (val === undefined) {
      unmapped.push(ch); // Q/W/X gibi — UYDURMA YOK
      continue;
    }
    sum += val;
  }
  return { sum, unmapped };
}

/** Tek basamak sınıfı. 1,2,3,7=İYİ · 4,5,6,8=KÖTÜ · 0,9=K.Ç.B. */
export function classifyDigit(d: number): CompatClass | null {
  if (d === 1 || d === 2 || d === 3 || d === 7) return "İYİ";
  if (d === 4 || d === 5 || d === 6 || d === 8) return "KÖTÜ";
  if (d === 0 || d === 9) return "KÇB";
  return null;
}

// Kombinasyon tablosu — sınıf SAYILARINA göre (sıra bağımsız).
// key: `${iyi}-${kotu}-${kcb}`
const COMBO_2: Record<string, { percentage: number; polarity: "UYUMLU" | "UYUMSUZ" }> = {
  "2-0-0": { percentage: 100, polarity: "UYUMLU" }, // İYİ+İYİ
  "1-1-0": { percentage: 50, polarity: "UYUMLU" }, // İYİ+KÖTÜ
  "0-2-0": { percentage: 100, polarity: "UYUMSUZ" }, // KÖTÜ+KÖTÜ
  "1-0-1": { percentage: 75, polarity: "UYUMLU" }, // İYİ+KÇB
  "0-1-1": { percentage: 75, polarity: "UYUMSUZ" }, // KÖTÜ+KÇB
};

const COMBO_3: Record<string, { percentage: number; polarity: "UYUMLU" | "UYUMSUZ" }> = {
  "3-0-0": { percentage: 100, polarity: "UYUMLU" }, // İYİ+İYİ+İYİ
  "0-3-0": { percentage: 100, polarity: "UYUMSUZ" }, // KÖTÜ+KÖTÜ+KÖTÜ
  "2-1-0": { percentage: 75, polarity: "UYUMLU" }, // İYİ+İYİ+KÖTÜ
  "1-2-0": { percentage: 75, polarity: "UYUMSUZ" }, // KÖTÜ+KÖTÜ+İYİ
  "1-1-1": { percentage: 75, polarity: "UYUMSUZ" }, // İYİ+KÖTÜ+KÇB
};

/**
 * Bir çok-basamaklı sayının HER BASAMAĞINI ayrı sınıflandırır ve kaynak
 * kombinasyon tablosundan yüzde döndürür.
 *
 * ÖNEMLİ: Sayı TEK HANEYE İNDİRGENMEZ. 118 → 1/1/8 olarak okunur.
 *
 * Kaynak-içi çelişki kuralı (talimat S): açık TABLO, aritmetik olarak hatalı
 * örnek sonucun üstünde tutulur. Örn. 151 → İYİ+İYİ+KÖTÜ → %75 UYUMLU
 * (bazı örnek metinlerdeki "%75 UYUMSUZ" hatası KODLANMAZ).
 *
 * Tabloda açık karşılığı olmayan kombinasyonlar → SOURCE_MISSING (uydurma yok).
 */
export function classifyCompatibilityNumber(n: number): CompatibilityClassification {
  const digits = Array.from(String(Math.abs(Math.trunc(n)))).map(Number);
  const classes = digits.map(classifyDigit);

  if (classes.some((c) => c === null)) {
    return {
      status: "SOURCE_MISSING",
      number: n,
      digits,
      classes: classes.filter(Boolean) as CompatClass[],
      percentage: null,
      polarity: null,
      label: null,
      note: "Basamaklardan biri sınıflandırılamadı.",
    };
  }

  const cls = classes as CompatClass[];
  const iyi = cls.filter((c) => c === "İYİ").length;
  const kotu = cls.filter((c) => c === "KÖTÜ").length;
  const kcb = cls.filter((c) => c === "KÇB").length;
  const key = `${iyi}-${kotu}-${kcb}`;

  const table = digits.length === 2 ? COMBO_2 : digits.length === 3 ? COMBO_3 : null;
  const hit = table ? table[key] : undefined;

  if (!hit) {
    return {
      status: "SOURCE_MISSING",
      number: n,
      digits,
      classes: cls,
      percentage: null,
      polarity: null,
      label: null,
      note:
        digits.length === 2 || digits.length === 3
          ? `Bu kombinasyon (${key}) kaynak tablosunda açıkça tanımlı değil.`
          : `${digits.length} basamaklı kombinasyon kaynak tablosunda tanımlı değil (yalnız 2–3 basamak).`,
    };
  }

  return {
    status: "COMPUTED",
    number: n,
    digits,
    classes: cls,
    percentage: hit.percentage,
    polarity: hit.polarity,
    label: `%${hit.percentage} ${hit.polarity}`,
  };
}
