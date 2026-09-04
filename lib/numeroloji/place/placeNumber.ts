import { EV_OFIS_CATALOG, EV_OFIS_SOURCE_PAGE } from "./placeCatalog";
import type { PlaceNumberResult } from "./types";

/**
 * Ev / Ofis Sayısı (Motor A) — kitap 1. seviye.
 *
 * CANONICAL: apartman/bina no + daire/kapı no → HAM toplam → TAM sadeleştirme (1–9).
 * MASTER SAYI KORUMASI YOKTUR (örn. 11+4=15 → 6).
 *
 * NOT: "Tekrar eden sayılar (11/22)" kaynakta AYRI bir konudur (melek-sayı/farkındalık),
 * mekân sayısıyla ilgili değildir; burada 11/22 korunmaz.
 */
export function calcPlaceNumber(buildingNumber: number, unitNumber: number): PlaceNumberResult | null {
  if (!Number.isFinite(buildingNumber) || !Number.isFinite(unitNumber)) return null;
  if (buildingNumber <= 0 || unitNumber <= 0) return null;

  const rawTotal = Math.trunc(buildingNumber) + Math.trunc(unitNumber);
  const steps: string[] = [];
  let current = rawTotal;
  while (current > 9) {
    const digits = String(current).split("").map(Number);
    const next = digits.reduce((a, b) => a + b, 0);
    steps.push(`${digits.join(" + ")} = ${next}`);
    current = next;
  }

  return {
    buildingNumber: Math.trunc(buildingNumber),
    unitNumber: Math.trunc(unitNumber),
    rawTotal,
    reducedNumber: current,
    steps,
    interpretation: EV_OFIS_CATALOG[current] ?? null,
    sourcePage: EV_OFIS_SOURCE_PAGE,
  };
}
