// FAZ 4 — Olgunluk Sayısı (AŞAMA 2 §13). Kaynak: kitap 2. seviye.
// DOB tarafı (master 11/22 korunur) + isim+soyisim tüm harfleri → final 1–9 / 11 / 22. 33 YOK, 19 YOK.
// Golden: 29/03/1986 SEMA CAYLAR → DOB 38→11, isim→8, 11+8=19→10→1. Olgunluk = 1.
// Etki: ~45 yaştan itibaren, ~50 civarında daha belirgin (source interpretation).
import { sumDigits } from "../ortak";
import { birthParts } from "../timing/dateUtils";
import { reduceKeepMaster11or22, sumNameLetterValues } from "../timing/reduce";
import { MATURITY_CATALOG } from "./catalogs";
import type { ReducedResult } from "../timing/types";

export function maturityCatalogKey(value: number): string {
  if (value === 11) return "11/2";
  if (value === 22) return "22/4";
  return String(value);
}

export function maturityNumber(firstName: string, lastName: string, birthDate: string): ReducedResult {
  const p = birthParts(birthDate);
  if (!p) return { value: 0, display: "-", steps: ["Geçersiz doğum tarihi."] };

  const dobTotal = sumDigits(p.day) + sumDigits(p.month) + sumDigits(p.year);
  const dobSide = reduceKeepMaster11or22(dobTotal);

  const nameTotal = sumNameLetterValues(firstName, lastName);
  const nameSide = reduceKeepMaster11or22(nameTotal);

  const value = reduceKeepMaster11or22(dobSide + nameSide);
  return {
    value,
    display: String(value),
    steps: [
      `Olgunluk: DOB(${dobTotal}→${dobSide}) + isim(${nameTotal}→${nameSide}) = ${
        dobSide + nameSide
      } → ${value}`,
    ],
    interpretation: MATURITY_CATALOG[maturityCatalogKey(value)],
  };
}
