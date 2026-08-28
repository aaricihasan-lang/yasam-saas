/**
 * Beslenme FAZ 4 — Besin hesap motoru (SAF; server-authoritative).
 *
 * TEK, DETERMİNİSTİK hesap:   total = grams / 100 × per100g
 * Porsiyon:                   grams = quantity × gram_weight → aynı hesap.
 * Dinamik eval / expression engine YOK.
 *
 * Kesinlik: tek-besin ölçekleme için Number yeterlidir (52×182/100 = 94.64).
 *   Ham hesap (raw) ile display-rounding AYRIDIR — raw değer saklanır/döndürülür,
 *   yuvarlama yalnız sunum katmanında (formatAmount) yapılır. Gelecekteki öğün
 *   TOPLAMLARI için decimal-safe accumulator ayrıca tasarlanmalı (bu faz dışı).
 */

export type Per100g = { nutrient_code: string; amount: number; unit_code: string };
export type CalcValue = { nutrient_code: string; unit_code: string; amount: number };

/** per-100 g değeri verilen gram için ölçekler (ham). */
export function scaleFor(per100g: number, grams: number): number {
  if (!Number.isFinite(per100g) || !Number.isFinite(grams) || grams < 0) return 0;
  return (per100g * grams) / 100;
}

/** Bir besnin /100 g nutrient setini verilen gram için hesaplar (ham değerler). */
export function calculateFoodForGrams(per100g: Per100g[], grams: number): CalcValue[] {
  return per100g.map((n) => ({
    nutrient_code: n.nutrient_code,
    unit_code: n.unit_code,
    amount: scaleFor(n.amount, grams),
  }));
}

/** Porsiyon (quantity × gram_weight) için hesap. */
export function calculateFoodForPortion(
  per100g: Per100g[],
  quantity: number,
  gramWeight: number,
): { grams: number; values: CalcValue[] } {
  const grams = (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(gramWeight) ? gramWeight : 0);
  return { grams, values: calculateFoodForGrams(per100g, grams) };
}

/**
 * Sunum yuvarlaması (yalnız display; ham değer korunur).
 *   kcal → tam sayı; g → 1 ondalık (küçükse 2); mg/mcg → tam/1 ondalık.
 */
export function formatAmount(value: number, unitCode: string): string {
  if (!Number.isFinite(value)) return "—";
  let digits: number;
  switch (unitCode) {
    case "kcal":
    case "kj":
      digits = 0;
      break;
    case "g":
      digits = value < 10 ? 1 : 1;
      break;
    case "mg":
      digits = value < 1 ? 2 : value < 10 ? 1 : 0;
      break;
    case "mcg":
      digits = value < 10 ? 1 : 0;
      break;
    default:
      digits = 1;
  }
  const rounded = Number(value.toFixed(digits));
  return rounded.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
