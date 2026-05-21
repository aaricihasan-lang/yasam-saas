/** TL / USD / EUR maliyet birleştirme — stok girişi ve liste önizlemesi */

export function safeCostNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const s = value.replace(/[^0-9,.\-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export type CurrencyCostInput = {
  costTry?: unknown;
  costUsd?: unknown;
  costEur?: unknown;
  usdRate?: unknown;
  eurRate?: unknown;
  stockQty?: unknown;
};

export type CurrencyCostResult = {
  costTry: number;
  costUsd: number;
  costEur: number;
  usdRate: number;
  eurRate: number;
  stockQty: number;
  totalCostTry: number;
  unitCostTry: number | null;
  errors: string[];
  warnings: string[];
};

/**
 * TL maliyet doğrudan; USD/EUR kur ile TL'ye çevrilir.
 * Stok adedi 0 ise birim maliyet hesaplanmaz (uyarı).
 */
export function calculateCurrencyCost(input: CurrencyCostInput): CurrencyCostResult {
  const costTry = safeCostNumber(input.costTry, 0);
  const costUsd = safeCostNumber(input.costUsd, 0);
  const costEur = safeCostNumber(input.costEur, 0);
  const usdRate = safeCostNumber(input.usdRate, 0);
  const eurRate = safeCostNumber(input.eurRate, 0);
  const stockQty = safeCostNumber(input.stockQty, 0);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (costUsd > 0 && usdRate <= 0) {
    errors.push("Lütfen güncel dolar kurunu giriniz.");
  }
  if (costEur > 0 && eurRate <= 0) {
    errors.push("Lütfen güncel euro kurunu giriniz.");
  }

  let totalCostTry = 0;
  if (costTry > 0) totalCostTry += costTry;
  if (costUsd > 0 && usdRate > 0) totalCostTry += costUsd * usdRate;
  if (costEur > 0 && eurRate > 0) totalCostTry += costEur * eurRate;

  let unitCostTry: number | null = null;
  if (stockQty <= 0 && totalCostTry > 0) {
    warnings.push("Stok adedi 0 olduğu için birim maliyet hesaplanamadı.");
  } else if (stockQty > 0 && totalCostTry > 0) {
    unitCostTry = totalCostTry / stockQty;
  }

  return {
    costTry,
    costUsd,
    costEur,
    usdRate,
    eurRate,
    stockQty,
    totalCostTry: Math.round(totalCostTry * 100) / 100,
    unitCostTry:
      unitCostTry != null ? Math.round(unitCostTry * 10000) / 10000 : null,
    errors,
    warnings,
  };
}

/** Kayıtlı stok satırı — kümülatif TL / USD / EUR + son kurlar */
export function calculateInventoryItemTotals(item: {
  cost_try?: unknown;
  cost_usd?: unknown;
  cost_eur?: unknown;
  dizi_price?: unknown;
  dizi_price_usd?: unknown;
  dizi_price_eur?: unknown;
  usd_rate?: unknown;
  eur_rate?: unknown;
  adet?: unknown;
}): Pick<CurrencyCostResult, "totalCostTry" | "unitCostTry" | "warnings"> {
  const costTry = safeCostNumber(item.cost_try ?? item.dizi_price, 0);
  const costUsd = safeCostNumber(item.cost_usd ?? item.dizi_price_usd, 0);
  const costEur = safeCostNumber(item.cost_eur ?? item.dizi_price_eur, 0);
  const { totalCostTry, unitCostTry, warnings } = calculateCurrencyCost({
    costTry,
    costUsd,
    costEur,
    usdRate: item.usd_rate,
    eurRate: item.eur_rate,
    stockQty: item.adet,
  });
  return { totalCostTry, unitCostTry, warnings };
}
