// FAZ 4 — Evrensel Yıl / Ay / Gün (AŞAMA 2 §5). 1–9, master preservation YOK.
// Kaynak: kitap 1. seviye. Golden: 2024→8 ; 23/01/2024 → yıl8, ay1, gün5, EvrenselGün5.
import { sumDigits } from "../ortak";
import { reduce1To9 } from "./reduce";
import {
  UNIVERSAL_YEAR_CATALOG,
  PERSONAL_MONTH_CATALOG,
  PERSONAL_DAY_CATALOG,
} from "./catalogs";
import type { ReducedResult } from "./types";

export function universalYear(year: number): ReducedResult {
  const total = sumDigits(year);
  const value = reduce1To9(total);
  return {
    value,
    display: String(value),
    steps: [`Evrensel Yıl: ${String(year).split("").join("+")} = ${total} → ${value}`],
    interpretation: UNIVERSAL_YEAR_CATALOG[value],
  };
}

export function universalMonth(year: number, month: number): ReducedResult {
  const uy = reduce1To9(sumDigits(year));
  const value = reduce1To9(uy + month);
  return {
    value,
    display: String(value),
    steps: [`Evrensel Ay: EvrenselYıl(${uy}) + ay(${month}) = ${uy + month} → ${value}`],
    // §8: Evrensel Ay, Kişisel Ay katalog metnini semantic-context ile reuse eder (identity ayrı).
    interpretation: PERSONAL_MONTH_CATALOG[value],
  };
}

export function universalDay(year: number, month: number, day: number): ReducedResult {
  const uy = reduce1To9(sumDigits(year));
  const um = reduce1To9(uy + month);
  const dayReduced = reduce1To9(day);
  const value = reduce1To9(um + dayReduced);
  return {
    value,
    display: String(value),
    steps: [
      `Evrensel Gün: EvrenselAy(${um}) + gün(${day}→${dayReduced}) = ${um + dayReduced} → ${value}`,
    ],
    // §8: Evrensel Gün, Kişisel Gün katalog metnini semantic-context ile reuse eder (identity ayrı).
    interpretation: PERSONAL_DAY_CATALOG[value],
  };
}
