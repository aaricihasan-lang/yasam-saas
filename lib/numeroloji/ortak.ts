export type NumerolojiResult = {
  display: string;
  key: string;
  steps: string[];
};

export const SPECIAL_NUMBERS = new Set([11, 19, 22, 33]);

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
  return (text || "").toLocaleUpperCase("tr-TR");
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
  const parts = (birthDate || "").trim().replace(/-/g, ".").split(".");
  if (parts.length !== 3) return null;

  const [dayText, monthText, yearText] = parts.map((p) => p.trim());
  if (!/^\d+$/.test(dayText) || !/^\d+$/.test(monthText) || !/^\d+$/.test(yearText)) return null;

  return {
    day: Number(dayText),
    month: Number(monthText),
    year: Number(yearText),
    dayText,
    monthText,
    yearText,
  };
}

export function repeatX(count: number): string {
  return count > 0 ? "X".repeat(count) : "-----";
}
