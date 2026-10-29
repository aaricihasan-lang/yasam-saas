/** Klasik Numeroloji oracle — indirgeme yardımcıları (saf). */

export const MASTER_NUMBERS = [11, 22, 33] as const;
export const KARMIC_DEBT_NUMBERS = [13, 14, 16, 19] as const;
const NONE: readonly number[] = [];

export function digitSum(n: number): number {
  let s = 0;
  for (const c of String(Math.abs(Math.trunc(n)))) s += Number(c);
  return s;
}

/**
 * Adım adım rakam toplamı; `keep` içindeki değerlerde durur.
 * Dönüş: [başlangıç, ..., son] (ör. 19 → 10 → 1 için [19, 10, 1]).
 */
export function reducePath(n: number, keep: readonly number[] = MASTER_NUMBERS): number[] {
  const path = [n];
  let x = n;
  while (x > 9 && !keep.includes(x)) {
    x = digitSum(x);
    path.push(x);
  }
  return path;
}

export const reduceKeep = (n: number, keep: readonly number[] = MASTER_NUMBERS): number => reducePath(n, keep).at(-1)!;
/** Tek haneye tam indirgeme (usta korumasız, 0 → 0). */
export const reduceSingle = (n: number): number => reducePath(n, NONE).at(-1)!;

export function pathText(path: readonly number[]): string {
  return path.join(" → ");
}

export function karmicOnPath(path: readonly number[]): number | null {
  for (const v of path) if ((KARMIC_DEBT_NUMBERS as readonly number[]).includes(v)) return v;
  return null;
}

export const numberType = (v: number): "single" | "master" => ((MASTER_NUMBERS as readonly number[]).includes(v) ? "master" : "single");
