/**
 * Bağımsız Kalde (Cheiro) hesaplayıcısı — saf, bağımlılıksız, istemci-güvenli.
 *
 * Harf tablosu (Cheiro; 9 hiçbir harfe atanmaz):
 *   1: A I J Q Y   2: B K R   3: C G L S   4: D M T   5: E H N X   6: U V W   7: O Z   8: F P
 * Belge + canlı gözlem (29.10.2026):
 *   • Tek kelime: toplam = harf toplamı.
 *   • Çok kelime: her kelime TEK HANEYE indirgenir (Kalde'de usta koruması yok), toplam = kelime köklerinin toplamı.
 *   • Bileşik (compound) = indirgeme yolunda 10..52 aralığındaki ilk değer; yoksa null (compoundOf).
 *   • Kök = toplamın tek haneye indirgenmesi.
 *   • Sesli A E I O U; Y sessiz (Kalde ucu belgesi).
 *   • Uyarı (caution) kök 4 ve 8.
 *   • İşletme puanı: kök 1,3,5,6 mükemmel; 2,9 iyi; 7,8 dikkat; 4 kaçın.
 */
import { foldName, isVowel } from "./text";
import { pathText, reducePath, reduceSingle } from "./reduce";
import type { OracleError } from "./pythagorean";

export const CHALDEAN_TABLE: Readonly<Record<string, number>> = Object.freeze({
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
});

export const chaldeanLetterValue = (L: string): number => CHALDEAN_TABLE[L] ?? 0;

/** Cheiro'nun kök sayı gezegenleri (sağlayıcının İngilizce adlarıyla karşılaştırma için). */
export const CHALDEAN_PLANET_EN: Readonly<Record<number, string>> = Object.freeze({
  1: "Sun",
  2: "Moon",
  3: "Jupiter",
  4: "Uranus",
  5: "Mercury",
  6: "Venus",
  7: "Neptune",
  8: "Saturn",
  9: "Mars",
});

export type ChaldeanNumber = {
  total: number;
  compound: number | null;
  root: number;
  trace: string;
  letters: Array<{ letter: string; value: number }>;
};

export const COMPOUND_MIN = 10;
export const COMPOUND_MAX = 52;

/**
 * Bileşik sayı: indirgeme yolunda 10..52 aralığına düşen İLK değer (toplam aralıktaysa toplamın kendisi).
 * > 52 toplamlar için kural belgede yok; Cheiro'nun "rakamları topla" uygulaması ile tutarlı biçimde
 * 69 → 15 (bileşik 15), 60 → 6 (bileşik yok) — canlı yanıtla aynı (29.10.2026).
 */
export function compoundOf(total: number): number | null {
  for (const v of reducePath(total, [])) if (v >= COMPOUND_MIN && v <= COMPOUND_MAX) return v;
  return null;
}

function chaldeanName(name: string, filter: (L: string) => boolean): ChaldeanNumber | OracleError {
  const words = foldName(name).words;
  const parts: string[] = [];
  const sums: number[] = [];
  const roots: number[] = [];
  const letters: ChaldeanNumber["letters"] = [];
  for (const w of words) {
    const ls = w.letters.filter(filter);
    if (!ls.length) continue;
    const vals = ls.map((L) => ({ letter: L, value: chaldeanLetterValue(L) }));
    letters.push(...vals);
    const s = vals.reduce((a, b) => a + b.value, 0);
    const p = reducePath(s, []);
    sums.push(s);
    roots.push(p.at(-1)!);
    parts.push(`${w.display}: ${vals.map((v) => `${v.letter}=${v.value}`).join(", ")} = ${pathText(p)}`);
  }
  if (!sums.length) return { error: "no_letters" };
  let total: number;
  let trace: string;
  if (sums.length === 1) {
    total = sums[0];
    trace = `${parts[0].replace(/^[^:]+: /, "")}`;
  } else {
    total = roots.reduce((a, b) => a + b, 0);
    trace = `${parts.join("; ")} → ${roots.join("+")} = ${pathText(reducePath(total, []))}`;
  }
  return { total, compound: compoundOf(total), root: reduceSingle(total), trace, letters };
}

export const chaldeanDestiny = (name: string) => chaldeanName(name, () => true);
export const chaldeanSoulUrge = (name: string) => chaldeanName(name, isVowel);
export const chaldeanPersonality = (name: string) => chaldeanName(name, (L) => !isVowel(L));

export const chaldeanCaution = (root: number): boolean => root === 4 || root === 8;

export type BusinessRating = "excellent" | "good" | "caution" | "avoid";
export function businessRating(root: number): BusinessRating {
  if ([1, 3, 5, 6].includes(root)) return "excellent";
  if ([2, 9].includes(root)) return "good";
  if ([7, 8].includes(root)) return "caution";
  return "avoid";
}
