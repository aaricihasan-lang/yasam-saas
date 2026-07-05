export type NumerolojiResult = {
  display: string;
  key: string;
  steps: string[];
};

// 19, bu sistemde karma borç sayısı olarak master sayı setine dahil edilmiştir.
export const SPECIAL_NUMBERS = new Set([11, 19, 22, 33]);

// Hayat Yolu gibi klasik master-sayı kuralı: yalnız 11/22/33 korunur (19 hariç).
export const MASTER_NUMBERS = new Set([11, 22, 33]);

export const CHAKRA_LETTER_MAP: Record<string, number> = {
  A: 1, J: 1, S: 1, Ş: 1,
  B: 2, K: 2, T: 2,
  C: 3, Ç: 3, L: 3, U: 3, Ü: 3,
  D: 4, M: 4, V: 4,
  E: 5, N: 5, W: 5,
  F: 6, O: 6, Ö: 6, X: 6,
  G: 7, Ğ: 7, P: 7, Y: 7,
  H: 8, Q: 8, Z: 8,
  I: 9, İ: 9, R: 9,
};

export const VOWELS = new Set(["A", "E", "I", "İ", "O", "Ö", "U", "Ü"]);

export function turkishUpper(text: string): string {
  return (text || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I"); // İ (U+0130) → I (U+0049): Python .upper() davranışıyla uyumlu
}

export function sumDigits(n: number): number {
  return Math.abs(n)
    .toString()
    .split("")
    .filter((ch) => /\d/.test(ch))
    .reduce((acc, ch) => acc + Number(ch), 0);
}

export function reduceNumber(n: number, keepSpecial = true): number {
  let current = Math.abs(n);
  while (current > 9) {
    if (keepSpecial && SPECIAL_NUMBERS.has(current)) return current;
    current = sumDigits(current);
  }
  return current;
}

export function reduceToDigit(n: number): number {
  let current = Math.abs(n);
  while (current > 9) current = sumDigits(current);
  return current;
}

/**
 * Tam indirger ama zincir 11/22/33'ten geçerse master olarak durur (Hayat Yolu kuralı).
 * Örn: 39 → 3, 38 → 11, 29 → 11, 5 → 5.
 */
export function reduceKeepMaster(n: number): number {
  let current = Math.abs(n);
  while (current > 9) {
    if (MASTER_NUMBERS.has(current)) return current;
    current = sumDigits(current);
  }
  return current;
}

export function reduce1To9(n: number): number {
  const reduced = reduceToDigit(Math.abs(n));
  return reduced === 0 ? 9 : reduced;
}

export function onlyLetters(text: string): string {
  return turkishUpper(text).replace(/[^A-ZÇĞİÖŞÜ]/g, "");
}

export function splitNameParts(firstName: string, lastName: string): string[] {
  const parts: string[] = [];
  if (firstName) parts.push(...firstName.trim().split(/\s+/).filter(Boolean));
  if (lastName) parts.push(...lastName.trim().split(/\s+/).filter(Boolean));
  return parts;
}

export type BirthDateParts = {
  day: number;
  month: number;
  year: number;
  dayText: string;
  monthText: string;
  yearText: string;
};

export function parseBirthDate(birthDate: string): BirthDateParts | null {
  // GG.AA.YYYY, GG-AA-YYYY ve GG/AA/YYYY biçimlerinin hepsini kabul et.
  const parts = (birthDate || "").trim().replace(/[-/]/g, ".").split(".");
  if (parts.length !== 3) return null;

  const [dayText, monthText, yearText] = parts.map((p) => p.trim());
  if (!/^\d+$/.test(dayText) || !/^\d+$/.test(monthText) || !/^\d+$/.test(yearText)) return null;

  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  // Gerçek takvim doğrulaması — 32/13/2000 veya 30/02 gibi imkânsız tarihler reddedilir.
  if (!isValidCalendarDate(day, month, year)) return null;

  return {
    day,
    month,
    year,
    dayText,
    monthText,
    yearText,
  };
}

/** Artık yıl mı? (Gregoryen kural) */
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Belirli ay/yıldaki gün sayısı. */
export function daysInMonth(month: number, year: number): number {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1] ?? 0;
}

/**
 * Gerçek takvim kontrolü: gün 1..(aydaki gün), ay 1..12, makul yıl aralığı.
 * `YYYY-MM-DD` / `DD.MM.YYYY` biçim doğrulaması ÖNCEDEN yapılmış olmalı.
 */
export function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 1000 || year > 3000) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(month, year)) return false;
  return true;
}

/** Ekran biçimi "GG/AA/YYYY" veya "GG.AA.YYYY" için tam geçerlilik (biçim + takvim). */
export function isValidBirthDateDisplay(display: string): boolean {
  return parseBirthDate(display) !== null;
}

export function repeatX(count: number): string {
  return count > 0 ? "X".repeat(count) : "-----";
}

/**
 * Özel sayı path display üretir (Ana/Yan Kulvar için).
 *
 * Kural:
 * - Per-part değerlerinde ÖZEL SAYI yoksa: boş string döner (caller reduced total kullanır).
 * - Özel sayılar varsa ama SPECIAL+SPECIAL kombinasyonu ÖZEL bir sayı vermiyorsa:
 *     tüm nonZero değerleri "-" ile birleştirir.   Örn: 22-22-3
 * - İki özel sayının toplamı yine özel sayıysa birleşim gösterilir:
 *     ana display = birleşmiş değer + kalanlar, parantez = orijinal sıra.
 *     Örn: 22-3 (11-11-3)
 */
export function buildSpecialPathDisplay(values: number[]): string {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return "";

  const hasPerPartSpecial = nonZero.some((v) => SPECIAL_NUMBERS.has(v));
  if (!hasPerPartSpecial) return ""; // caller "eski davranış" uygular

  // SPECIAL+SPECIAL → SPECIAL kombinasyonu ara
  const specialItems = nonZero
    .map((v, idx) => ({ v, idx }))
    .filter((x) => SPECIAL_NUMBERS.has(x.v));

  let bestCombo: { combined: number; idxA: number; idxB: number } | null = null;
  for (let a = 0; a < specialItems.length; a++) {
    for (let b = a + 1; b < specialItems.length; b++) {
      const sum = specialItems[a].v + specialItems[b].v;
      if (SPECIAL_NUMBERS.has(sum)) {
        if (!bestCombo || sum > bestCombo.combined) {
          bestCombo = { combined: sum, idxA: specialItems[a].idx, idxB: specialItems[b].idx };
        }
      }
    }
  }

  if (!bestCombo) {
    // Kombinasyon yok → büyükten küçüğe sırala
    return [...nonZero].sort((a, b) => b - a).join("-");
  }

  // Kombinasyon bulundu → ana path üret, büyükten küçüğe sırala
  // origPath orijinal sırayı korur (hesap izi için)
  const { combined, idxA, idxB } = bestCombo;
  const mainParts: number[] = [];
  let inserted = false;
  for (let i = 0; i < nonZero.length; i++) {
    if (i === idxA || i === idxB) {
      if (!inserted) {
        mainParts.push(combined);
        inserted = true;
      }
    } else {
      mainParts.push(nonZero[i]);
    }
  }

  const mainPath = [...mainParts].sort((a, b) => b - a).join("-");
  const origPath = nonZero.join("-");
  return mainPath === origPath ? mainPath : `${mainPath} (${origPath})`;
}
