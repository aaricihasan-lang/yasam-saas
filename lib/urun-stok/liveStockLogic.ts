/** Canlı stok merkezi — tüm modül envanterlerini salt okunur birleştirir */

import {
  formatStockDisplay as formatAccessoryStock,
  formatVariantLabel as formatAccessoryVariant,
  loadAccessoryInventory,
} from "@/lib/urun-stok/accessoryStockLogic";
import { loadDogaltasInventoryForTenant } from "@/lib/urun-stok/dogaltasInventoryDb";
import {
  fmtMoney,
  itemKey,
  unitCostAndCurrency,
  type InvItem,
} from "@/lib/urun-stok/dogaltasStockLogic";
import {
  CATEGORY_LABELS,
  type ProductCategory,
} from "@/lib/urun-stok/generalSalesLogic";
import {
  formatStockDisplay as formatOilStock,
  fmtUnitCost as fmtOilUnitCost,
  loadOilInventory,
  unitLabel as oilUnitLabel,
} from "@/lib/urun-stok/oilStockLogic";
import {
  formatVariantLabel as formatOtherVariant,
  formatStockDisplay as formatOtherStock,
  fmtUnitCost as fmtOtherUnitCost,
  loadOtherInventory,
} from "@/lib/urun-stok/otherStockLogic";
import {
  formatStockDisplay as formatSoapStock,
  fmtUnitCost as fmtSoapUnitCost,
  loadSoapCreamInventory,
} from "@/lib/urun-stok/soapCreamStockLogic";

export type LiveStockCategory = ProductCategory;

export type LiveStockRow = {
  id: string;
  category: LiveStockCategory;
  categoryLabel: string;
  name: string;
  groupLabel: string;
  stockDisplay: string;
  stockAmount: number;
  unitLabel: string;
  costPerUnit: number;
  costPerUnitLabel: string;
  stockValue: number;
  isCritical: boolean;
  photos: string[];
};

export type LiveStockSummary = {
  totalVarieties: number;
  stockByUnit: { adet: number; ml: number; gram: number };
  criticalCount: number;
  totalValue: number;
};

const CRITICAL_ADET = 5;
const CRITICAL_ML = 150;
const CRITICAL_GRAM = 150;

function isCriticalStock(amount: number, unit: string): boolean {
  if (unit === "adet") return amount <= CRITICAL_ADET;
  if (unit === "ml") return amount <= CRITICAL_ML;
  if (unit === "gram") return amount <= CRITICAL_GRAM;
  return amount <= CRITICAL_ADET;
}

function fmtQty(n: number): string {
  const s = n.toFixed(2).replace(/\.?0+$/, "");
  return s || "0";
}

function dogaltasItemsToLiveRows(items: InvItem[], usdRate: number): LiveStockRow[] {
  const rows: LiveStockRow[] = [];
  for (const it of items) {
    const qty = it.adet || 0;
    if (qty <= 0) continue;
    const { unit, warning } = unitCostAndCurrency(it, usdRate);
    const costPerUnit = unit > 0 ? unit : it.adet_price || 0;
    rows.push({
      id: `dogaltas:${itemKey(it.name, it.type)}`,
      category: "dogaltas",
      categoryLabel: CATEGORY_LABELS.dogaltas,
      name: it.name,
      groupLabel: it.type,
      stockDisplay: `${fmtQty(qty)} adet`,
      stockAmount: qty,
      unitLabel: "adet",
      costPerUnit,
      costPerUnitLabel: warning
        ? "USD kuru gerekli (dizi)"
        : costPerUnit > 0
          ? `${fmtMoney(costPerUnit)} / adet`
          : "—",
      stockValue: warning ? 0 : costPerUnit * qty,
      isCritical: isCriticalStock(qty, "adet"),
      photos: it.photos ?? [],
    });
  }
  return rows;
}

function appendOtherModuleStockRows(rows: LiveStockRow[]): void {
  for (const it of loadOilInventory()) {
    if (it.stockBase <= 0) continue;
    const u = it.baseUnit;
    rows.push({
      id: `oil:${it.id}`,
      category: "oil",
      categoryLabel: CATEGORY_LABELS.oil,
      name: it.name,
      groupLabel: `${it.oilType} · ${it.measureType}`,
      stockDisplay: formatOilStock(it),
      stockAmount: it.stockBase,
      unitLabel: oilUnitLabel(u),
      costPerUnit: it.costPerBase,
      costPerUnitLabel: fmtOilUnitCost(it.costPerBase, u),
      stockValue: it.costPerBase * it.stockBase,
      isCritical: isCriticalStock(it.stockBase, u),
      photos: it.photos ?? [],
    });
  }

  for (const it of loadSoapCreamInventory()) {
    if (it.stockBase <= 0) continue;
    const u = it.baseUnit;
    rows.push({
      id: `soap_cream:${it.id}`,
      category: "soap_cream",
      categoryLabel: CATEGORY_LABELS.soap_cream,
      name: it.name,
      groupLabel: `${it.productGroup} · ${it.measureType}`,
      stockDisplay: formatSoapStock(it),
      stockAmount: it.stockBase,
      unitLabel: oilUnitLabel(u),
      costPerUnit: it.costPerBase,
      costPerUnitLabel: fmtSoapUnitCost(it.costPerBase, u),
      stockValue: it.costPerBase * it.stockBase,
      isCritical: isCriticalStock(it.stockBase, u),
      photos: it.photos ?? [],
    });
  }

  for (const it of loadAccessoryInventory()) {
    if (it.stockQty <= 0) continue;
    rows.push({
      id: `accessory:${it.id}`,
      category: "accessory",
      categoryLabel: CATEGORY_LABELS.accessory,
      name: it.name,
      groupLabel: formatAccessoryVariant(it),
      stockDisplay: formatAccessoryStock(it),
      stockAmount: it.stockQty,
      unitLabel: "adet",
      costPerUnit: it.costPerUnit,
      costPerUnitLabel: `${fmtMoney(it.costPerUnit)} / adet`,
      stockValue: it.costPerUnit * it.stockQty,
      isCritical: isCriticalStock(it.stockQty, "adet"),
      photos: it.photos ?? [],
    });
  }

  for (const it of loadOtherInventory()) {
    if (it.stockBase <= 0) continue;
    const u = it.baseUnit;
    rows.push({
      id: `other:${it.id}`,
      category: "other",
      categoryLabel: CATEGORY_LABELS.other,
      name: it.name,
      groupLabel: formatOtherVariant(it),
      stockDisplay: formatOtherStock(it),
      stockAmount: it.stockBase,
      unitLabel: oilUnitLabel(u),
      costPerUnit: it.costPerBase,
      costPerUnitLabel: fmtOtherUnitCost(it.costPerBase, u),
      stockValue: it.costPerBase * it.stockBase,
      isCritical: isCriticalStock(it.stockBase, u),
      photos: it.photos ?? [],
    });
  }
}

/** Supabase dogaltas_inventory öncelikli (tenant_id ile) */
export async function loadLiveStockRowsAsync(
  tenantId: string | null,
  usdRate = 0,
): Promise<{
  rows: LiveStockRow[];
  dogaltasSource: "supabase" | "localStorage" | "none";
  tenantId: string | null;
}> {
  const rows: LiveStockRow[] = [];
  const inv = await loadDogaltasInventoryForTenant(tenantId);
  rows.push(...dogaltasItemsToLiveRows(inv.items, usdRate));
  appendOtherModuleStockRows(rows);
  return { rows, dogaltasSource: inv.source, tenantId: inv.tenantId };
}

/** Senkron — doğaltaş için localStorage önbellek; diğer modüller aynı */
export function loadLiveStockRows(usdRate = 0): LiveStockRow[] {
  const rows: LiveStockRow[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("dogaltas_inventory_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          rows.push(
            ...dogaltasItemsToLiveRows(
              parsed.map((r) => {
                const row = r as Record<string, unknown>;
                return {
                  name: String(row.name ?? ""),
                  type: String(row.type ?? ""),
                  adet: Number(row.adet) || 0,
                  dizi_icerik: Number(row.dizi_icerik) || 0,
                  dizi_price: Number(row.dizi_price) || 0,
                  adet_price: Number(row.adet_price) || 0,
                  photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
                  dizi_price_usd: Number(row.dizi_price_usd) || 0,
                  dizi_price_eur: Number(row.dizi_price_eur) || 0,
                  usd_rate: Number(row.usd_rate) || 0,
                  eur_rate: Number(row.eur_rate) || 0,
                  total_cost_try: Number(row.total_cost_try) || 0,
                  unit_cost_try: Number(row.unit_cost_try) || 0,
                };
              }),
              usdRate,
            ),
          );
        }
      }
    } catch {
      /* ignore */
    }
  }
  appendOtherModuleStockRows(rows);
  return rows;
}

export function summarizeLiveStock(rows: LiveStockRow[]): LiveStockSummary {
  const stockByUnit = { adet: 0, ml: 0, gram: 0 };
  let criticalCount = 0;
  let totalValue = 0;
  for (const r of rows) {
    if (r.unitLabel === "adet") stockByUnit.adet += r.stockAmount;
    else if (r.unitLabel === "ml") stockByUnit.ml += r.stockAmount;
    else if (r.unitLabel === "gram") stockByUnit.gram += r.stockAmount;
    if (r.isCritical) criticalCount += 1;
    totalValue += r.stockValue;
  }
  return {
    totalVarieties: rows.length,
    stockByUnit,
    criticalCount,
    totalValue,
  };
}

export function formatStockTotals(summary: LiveStockSummary): string {
  const parts: string[] = [];
  if (summary.stockByUnit.adet > 0) parts.push(`${fmtQty(summary.stockByUnit.adet)} adet`);
  if (summary.stockByUnit.ml > 0) parts.push(`${fmtQty(summary.stockByUnit.ml)} ml`);
  if (summary.stockByUnit.gram > 0) parts.push(`${fmtQty(summary.stockByUnit.gram)} g`);
  return parts.length ? parts.join(" · ") : "—";
}

export function filterLiveStock(
  rows: LiveStockRow[],
  opts: {
    q: string;
    category: LiveStockCategory | "all";
    criticalOnly: boolean;
  },
): LiveStockRow[] {
  let list = rows;
  if (opts.category !== "all") list = list.filter((r) => r.category === opts.category);
  if (opts.criticalOnly) list = list.filter((r) => r.isCritical);
  const ql = opts.q.trim().toLowerCase();
  if (!ql) return list;
  return list.filter(
    (r) =>
      r.name.toLowerCase().includes(ql) ||
      r.groupLabel.toLowerCase().includes(ql) ||
      r.categoryLabel.toLowerCase().includes(ql),
  );
}

export function sortLiveStock(
  rows: LiveStockRow[],
  mode: "stock-asc" | "stock-desc" | "name",
): LiveStockRow[] {
  const next = [...rows];
  if (mode === "stock-asc") next.sort((a, b) => a.stockAmount - b.stockAmount);
  else if (mode === "stock-desc") next.sort((a, b) => b.stockAmount - a.stockAmount);
  else {
    const k = (s: string) => (s || "").replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase();
    next.sort((a, b) => k(a.name).localeCompare(k(b.name), "tr"));
  }
  return next;
}

export { CATEGORY_LABELS, fmtMoney };
