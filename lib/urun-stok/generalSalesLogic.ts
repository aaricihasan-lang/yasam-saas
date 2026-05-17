/** Merkezi satış — tüm kategori envanterlerini birleştirir */

import {
  type AccessoryItem,
  type AccessorySaleLine,
  type AccessorySaleRecord,
  appendAccessorySales,
  calcLineAmounts as calcAccessoryLine,
  deductAccessoryInventory,
  formatStockDisplay as formatAccessoryStock,
  formatVariantLabel,
  loadAccessoryInventory,
  saveAccessoryInventory,
} from "@/lib/urun-stok/accessoryStockLogic";
import {
  type InvItem,
  type SaleLine,
  type SaleRecord,
  appendSales as appendDogaltasSales,
  deductInventoryForSales,
  fmtMoney,
  itemKey,
  loadInventory as loadDogaltasInventory,
  saveInventory as saveDogaltasInventory,
  toFloat,
  turkishUpper,
  unitCostAndCurrency,
} from "@/lib/urun-stok/dogaltasStockLogic";
import {
  type OilInputUnit,
  type OilItem,
  type OilSaleLine,
  type OilSaleRecord,
  appendOilSales,
  calcLineAmounts as calcOilLine,
  deductOilInventory,
  formatStockDisplay as formatOilStock,
  fmtUnitCost as fmtOilUnitCost,
  loadOilInventory,
  saveOilInventory,
} from "@/lib/urun-stok/oilStockLogic";
import {
  type ScInputUnit,
  type SoapCreamItem,
  type SoapCreamSaleLine,
  type SoapCreamSaleRecord,
  appendSoapCreamSales,
  calcLineAmounts as calcSoapLine,
  deductSoapCreamInventory,
  formatStockDisplay as formatSoapStock,
  fmtUnitCost as fmtSoapUnitCost,
  loadSoapCreamInventory,
  saveSoapCreamInventory,
} from "@/lib/urun-stok/soapCreamStockLogic";

export const GENERAL_SALES_STORAGE_KEY = "general_sales_history_v1";

export type ProductCategory = "dogaltas" | "oil" | "soap_cream" | "accessory";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  dogaltas: "Doğaltaş",
  oil: "Yağ",
  soap_cream: "Sabun / Krem",
  accessory: "Tespih / Takı / Aksesuar",
};

export type UnifiedProduct = {
  category: ProductCategory;
  productId: string;
  name: string;
  subtitle: string;
  stockDisplay: string;
  stockAmount: number;
  /** adet = tek adet alanı; measure = birim seçici (ml/litre/gram/kg) */
  saleMode: "adet" | "measure";
  measureType?: string;
  saleUnits?: OilInputUnit[];
  baseUnit?: "adet" | "ml" | "gram";
  costPerUnit: number;
  salePerUnit: number;
  profitPct: number;
  unitLabel: string;
  dogaltasStone?: string;
  dogaltasType?: string;
};

export type GeneralSaleLine = {
  category: ProductCategory;
  productId: string;
  productName: string;
  productSubtitle: string;
  saleQty: number;
  saleUnit: string;
  saleBaseQty: number;
  lineCost: number;
  lineSale: number;
};

export type GeneralSaleRecord = {
  name: string;
  lines: GeneralSaleLine[];
  total_cost: number;
  sale_price: number;
  profit_pct: number;
  photos: string[];
  timestamp: string;
};

export { fmtMoney, toFloat, turkishUpper };

export function unitsForMeasureType(measureType: string): ScInputUnit[] {
  if (measureType === "Adet") return ["adet"];
  if (measureType === "Gram / KG") return ["gram", "kg"];
  return ["ml", "litre"];
}

export function loadUnifiedProducts(usdRate = 0): UnifiedProduct[] {
  const out: UnifiedProduct[] = [];

  for (const it of loadDogaltasInventory()) {
    const qty = it.adet || 0;
    if (qty <= 0) continue;
    const { unit, warning } = unitCostAndCurrency(it, usdRate);
    if (warning || unit <= 0) continue;
    out.push({
      category: "dogaltas",
      productId: itemKey(it.name, it.type),
      name: it.name,
      subtitle: it.type,
      stockDisplay: `${qty} adet`,
      stockAmount: qty,
      saleMode: "adet",
      costPerUnit: unit,
      salePerUnit: unit,
      profitPct: 100,
      unitLabel: "adet",
      dogaltasStone: it.name,
      dogaltasType: it.type,
    });
  }

  for (const it of loadOilInventory()) {
    if (it.stockBase <= 0) continue;
    out.push({
      category: "oil",
      productId: it.id,
      name: it.name,
      subtitle: `${it.oilType} · ${it.measureType}`,
      stockDisplay: formatOilStock(it),
      stockAmount: it.stockBase,
      saleMode: it.baseUnit === "adet" ? "adet" : "measure",
      measureType: it.measureType,
      saleUnits: unitsForMeasureType(it.measureType) as OilInputUnit[],
      baseUnit: it.baseUnit,
      costPerUnit: it.costPerBase,
      salePerUnit: it.salePerBase,
      profitPct: it.profitPct,
      unitLabel: it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet",
    });
  }

  for (const it of loadSoapCreamInventory()) {
    if (it.stockBase <= 0) continue;
    out.push({
      category: "soap_cream",
      productId: it.id,
      name: it.name,
      subtitle: `${it.productGroup} · ${it.measureType}`,
      stockDisplay: formatSoapStock(it),
      stockAmount: it.stockBase,
      saleMode: it.baseUnit === "adet" ? "adet" : "measure",
      measureType: it.measureType,
      saleUnits: unitsForMeasureType(it.measureType) as OilInputUnit[],
      baseUnit: it.baseUnit,
      costPerUnit: it.costPerBase,
      salePerUnit: it.salePerBase,
      profitPct: it.profitPct,
      unitLabel: it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet",
    });
  }

  for (const it of loadAccessoryInventory()) {
    if (it.stockQty <= 0) continue;
    out.push({
      category: "accessory",
      productId: it.id,
      name: it.name,
      subtitle: formatVariantLabel(it),
      stockDisplay: formatAccessoryStock(it),
      stockAmount: it.stockQty,
      saleMode: "adet",
      costPerUnit: it.costPerUnit,
      salePerUnit: it.salePerUnit,
      profitPct: it.profitPct,
      unitLabel: "adet",
    });
  }

  return out;
}

export function filterUnifiedProducts(
  products: UnifiedProduct[],
  category: ProductCategory | "all",
  q: string,
): UnifiedProduct[] {
  let list = products;
  if (category !== "all") list = list.filter((p) => p.category === category);
  const ql = q.trim().toLowerCase();
  if (!ql) return list;
  return list.filter(
    (p) =>
      p.name.toLowerCase().includes(ql) ||
      p.subtitle.toLowerCase().includes(ql) ||
      CATEGORY_LABELS[p.category].toLowerCase().includes(ql),
  );
}

export function fmtUnifiedUnitCost(p: UnifiedProduct): string {
  if (p.category === "oil") return fmtOilUnitCost(p.costPerUnit, p.baseUnit || "adet");
  if (p.category === "soap_cream") return fmtSoapUnitCost(p.costPerUnit, p.baseUnit || "adet");
  return `${fmtMoney(p.costPerUnit)} / ${p.unitLabel}`;
}

export function calcUnifiedSale(
  product: UnifiedProduct,
  saleQty: number,
  saleUnit: string,
  profitPct: number,
  usdRate = 0,
): GeneralSaleLine | { error: string } {
  const pct = profitPct > 0 ? profitPct : product.profitPct;

  if (product.category === "dogaltas") {
    const qty = Math.floor(saleQty);
    if (qty <= 0) return { error: "Satılacak adet 0'dan büyük olmalı." };
    if (qty > product.stockAmount) {
      return { error: `Yetersiz stok. Mevcut: ${product.stockDisplay}` };
    }
    const inv = loadDogaltasInventory().find(
      (i) => itemKey(i.name, i.type) === product.productId,
    );
    if (!inv) return { error: "Ürün stokta bulunamadı." };
    const { unit, warning } = unitCostAndCurrency(inv, usdRate);
    if (warning) return { error: warning };
    if (unit <= 0) return { error: "Birim maliyet hesaplanamadı." };
    const lineCost = unit * qty;
    const lineSale = lineCost * (1 + pct / 100);
    return {
      category: "dogaltas",
      productId: product.productId,
      productName: product.name,
      productSubtitle: product.subtitle,
      saleQty: qty,
      saleUnit: "adet",
      saleBaseQty: qty,
      lineCost,
      lineSale,
    };
  }

  if (product.category === "oil") {
    const item = loadOilInventory().find((i) => i.id === product.productId);
    if (!item) return { error: "Ürün stokta bulunamadı." };
    const calc = calcOilLine(item, saleQty, saleUnit as OilInputUnit);
    if ("error" in calc) return calc;
    const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
    return {
      category: "oil",
      productId: product.productId,
      productName: product.name,
      productSubtitle: product.subtitle,
      saleQty,
      saleUnit,
      saleBaseQty: calc.saleBaseQty,
      lineCost: calc.lineCost,
      lineSale,
    };
  }

  if (product.category === "soap_cream") {
    const item = loadSoapCreamInventory().find((i) => i.id === product.productId);
    if (!item) return { error: "Ürün stokta bulunamadı." };
    const calc = calcSoapLine(item, saleQty, saleUnit as ScInputUnit);
    if ("error" in calc) return calc;
    const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
    return {
      category: "soap_cream",
      productId: product.productId,
      productName: product.name,
      productSubtitle: product.subtitle,
      saleQty,
      saleUnit,
      saleBaseQty: calc.saleBaseQty,
      lineCost: calc.lineCost,
      lineSale,
    };
  }

  const item = loadAccessoryInventory().find((i) => i.id === product.productId);
  if (!item) return { error: "Ürün stokta bulunamadı." };
  const calc = calcAccessoryLine(item, saleQty);
  if ("error" in calc) return calc;
  const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
  return {
    category: "accessory",
    productId: product.productId,
    productName: product.name,
    productSubtitle: product.subtitle,
    saleQty: calc.saleQty,
    saleUnit: "adet",
    saleBaseQty: calc.saleQty,
    lineCost: calc.lineCost,
    lineSale,
  };
}

export function loadGeneralSales(): GeneralSaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GENERAL_SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GeneralSaleRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveGeneralSales(records: GeneralSaleRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GENERAL_SALES_STORAGE_KEY, JSON.stringify(records));
}

export function appendGeneralSales(records: GeneralSaleRecord[]): void {
  saveGeneralSales([...loadGeneralSales(), ...records]);
}

function toDogaltasSaleRecord(rec: GeneralSaleRecord): SaleRecord {
  const lines: SaleLine[] = rec.lines
    .filter((l) => l.category === "dogaltas")
    .map((l) => ({
      stone: l.productName,
      type: l.productSubtitle,
      currency: "₺",
      unit: l.saleQty > 0 ? l.lineCost / l.saleQty : 0,
      qty: l.saleQty,
      line_total: l.lineCost,
    }));
  return {
    name: rec.name,
    lines,
    total_cost: rec.total_cost,
    sale_price: rec.sale_price,
    profit_pct: rec.profit_pct,
    photos: rec.photos,
    timestamp: rec.timestamp,
  };
}

function toOilSaleRecord(rec: GeneralSaleRecord): OilSaleRecord {
  const lines: OilSaleLine[] = rec.lines
    .filter((l) => l.category === "oil")
    .map((l) => {
      const item = loadOilInventory().find((i) => i.id === l.productId);
      return {
        productId: l.productId,
        productName: l.productName,
        oilType: item?.oilType ?? "",
        saleQty: l.saleQty,
        saleUnit: l.saleUnit as OilInputUnit,
        saleBaseQty: l.saleBaseQty,
        lineCost: l.lineCost,
        lineSale: l.lineSale,
      };
    });
  return {
    name: rec.name,
    lines,
    total_cost: rec.total_cost,
    sale_price: rec.sale_price,
    profit_pct: rec.profit_pct,
    photos: rec.photos,
    timestamp: rec.timestamp,
  };
}

function toSoapSaleRecord(rec: GeneralSaleRecord): SoapCreamSaleRecord {
  const lines: SoapCreamSaleLine[] = rec.lines
    .filter((l) => l.category === "soap_cream")
    .map((l) => {
      const item = loadSoapCreamInventory().find((i) => i.id === l.productId);
      return {
        productId: l.productId,
        productName: l.productName,
        productGroup: item?.productGroup ?? "",
        saleQty: l.saleQty,
        saleUnit: l.saleUnit as ScInputUnit,
        saleBaseQty: l.saleBaseQty,
        lineCost: l.lineCost,
        lineSale: l.lineSale,
      };
    });
  return {
    name: rec.name,
    lines,
    total_cost: rec.total_cost,
    sale_price: rec.sale_price,
    profit_pct: rec.profit_pct,
    photos: rec.photos,
    timestamp: rec.timestamp,
  };
}

function toAccessorySaleRecord(rec: GeneralSaleRecord): AccessorySaleRecord {
  const lines: AccessorySaleLine[] = rec.lines
    .filter((l) => l.category === "accessory")
    .map((l) => {
      const item = loadAccessoryInventory().find((i) => i.id === l.productId);
      return {
        productId: l.productId,
        productName: l.productName,
        productGroup: item?.productGroup ?? "",
        saleQty: l.saleQty,
        lineCost: l.lineCost,
        lineSale: l.lineSale,
      };
    });
  return {
    name: rec.name,
    lines,
    total_cost: rec.total_cost,
    sale_price: rec.sale_price,
    profit_pct: rec.profit_pct,
    photos: rec.photos,
    timestamp: rec.timestamp,
  };
}

/** Sepeti kaydeder: stok düşer, genel + kategori satış geçmişleri güncellenir. */
export function commitCentralSales(
  basket: GeneralSaleRecord[],
  usdRate = 0,
): { ok: true } | { ok: false; error: string } {
  if (!basket.length) return { ok: false, error: "Sepet boş." };

  let dogaltas = loadDogaltasInventory();
  let oil = loadOilInventory();
  let soap = loadSoapCreamInventory();
  let accessory = loadAccessoryInventory();

  const dogaltasBasket: SaleRecord[] = [];
  const oilBasket: OilSaleRecord[] = [];
  const soapBasket: SoapCreamSaleRecord[] = [];
  const accessoryBasket: AccessorySaleRecord[] = [];

  for (const rec of basket) {
    const hasDog = rec.lines.some((l) => l.category === "dogaltas");
    const hasOil = rec.lines.some((l) => l.category === "oil");
    const hasSoap = rec.lines.some((l) => l.category === "soap_cream");
    const hasAcc = rec.lines.some((l) => l.category === "accessory");

    if (hasDog) dogaltasBasket.push(toDogaltasSaleRecord(rec));
    if (hasOil) oilBasket.push(toOilSaleRecord(rec));
    if (hasSoap) soapBasket.push(toSoapSaleRecord(rec));
    if (hasAcc) accessoryBasket.push(toAccessorySaleRecord(rec));
  }

  if (dogaltasBasket.length) {
    dogaltas = deductInventoryForSales(dogaltas, dogaltasBasket);
    saveDogaltasInventory(dogaltas);
    appendDogaltasSales(dogaltasBasket);
  }

  if (oilBasket.length) {
    const deductLines = oilBasket.flatMap((r) =>
      r.lines.map((l) => ({ productId: l.productId, saleBaseQty: l.saleBaseQty })),
    );
    oil = deductOilInventory(oil, deductLines);
    saveOilInventory(oil);
    appendOilSales(oilBasket);
  }

  if (soapBasket.length) {
    const deductLines = soapBasket.flatMap((r) =>
      r.lines.map((l) => ({ productId: l.productId, saleBaseQty: l.saleBaseQty })),
    );
    soap = deductSoapCreamInventory(soap, deductLines);
    saveSoapCreamInventory(soap);
    appendSoapCreamSales(soapBasket);
  }

  if (accessoryBasket.length) {
    const deductLines = accessoryBasket.flatMap((r) =>
      r.lines.map((l) => ({ productId: l.productId, saleQty: l.saleQty })),
    );
    accessory = deductAccessoryInventory(accessory, deductLines);
    saveAccessoryInventory(accessory);
    appendAccessorySales(accessoryBasket);
  }

  void usdRate;
  appendGeneralSales(basket);
  return { ok: true };
}
