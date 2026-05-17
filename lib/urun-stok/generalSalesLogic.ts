/** Merkezi satış — tüm kategori envanterlerini birleştirir */

import {
  type AccessoryItem,
  type AccessorySaleLine,
  type AccessorySaleRecord,
  appendAccessorySales,
  calcLineAmounts as calcAccessoryLine,
  loadAccessoryInventory,
} from "@/lib/urun-stok/accessoryStockLogic";
import {
  type SaleLine,
  type SaleRecord,
  appendSales as appendDogaltasSales,
  fmtMoney,
  itemKey,
  loadInventory as loadDogaltasInventory,
  toFloat,
  turkishUpper,
  unitCostAndCurrency,
} from "@/lib/urun-stok/dogaltasStockLogic";
import {
  type OilInputUnit,
  type OilSaleLine,
  type OilSaleRecord,
  appendOilSales,
  calcLineAmounts as calcOilLine,
  fmtUnitCost as fmtOilUnitCost,
  loadOilInventory,
} from "@/lib/urun-stok/oilStockLogic";
import {
  type OtInputUnit,
  type OtherSaleLine,
  type OtherSaleRecord,
  appendOtherSales,
  calcLineAmounts as calcOtherLine,
  fmtUnitCost as fmtOtherUnitCost,
  loadOtherInventory,
} from "@/lib/urun-stok/otherStockLogic";
import {
  type ScInputUnit,
  type SoapCreamSaleLine,
  type SoapCreamSaleRecord,
  appendSoapCreamSales,
  calcLineAmounts as calcSoapLine,
  fmtUnitCost as fmtSoapUnitCost,
  loadSoapCreamInventory,
} from "@/lib/urun-stok/soapCreamStockLogic";
import {
  INVENTORY_SOURCE_KEYS,
  countCentralSalesInventory,
  deductCentralInventory,
  loadCentralSalesProducts,
} from "@/lib/urun-stok/centralSalesCatalog";
import { toCanonical as otherToCanonical } from "@/lib/urun-stok/otherStockLogic";
import { toCanonical as oilToCanonical } from "@/lib/urun-stok/oilStockLogic";

export const GENERAL_SALES_STORAGE_KEY = "general_sales_history_v1";
export const STOCK_MOVEMENTS_STORAGE_KEY = "stock_movements_v1";

export type ProductCategory = "dogaltas" | "oil" | "soap_cream" | "accessory" | "other";

export type StockMovementRecord = {
  id: string;
  timestamp: string;
  productName: string;
  category: ProductCategory;
  categoryLabel: string;
  movementType: string;
  movement_type: string;
  type: string;
  qty_delta: number;
  qty: number;
  unit: string;
  note?: string;
  source: string;
  reference?: string;
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  dogaltas: "Doğaltaş",
  oil: "Yağ",
  soap_cream: "Sabun / Krem",
  accessory: "Tespih / Takı / Aksesuar",
  other: "Diğer Ürünler",
};

export type UnifiedProduct = {
  category: ProductCategory;
  sourceKey: string;
  productId: string;
  name: string;
  productGroup: string;
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
  photoCount: number;
  dogaltasStone?: string;
  dogaltasType?: string;
};

export type LiveInventoryCounts = Record<ProductCategory, number>;

export type GeneralSaleLine = {
  category: ProductCategory;
  sourceKey: string;
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
  return loadCentralSalesProducts(usdRate) as UnifiedProduct[];
}

/** Stoklu ürün sayıları — normalize edilmiş canlı envanterden */
export function countLiveInventoryByCategory(): LiveInventoryCounts {
  return countCentralSalesInventory();
}

function loadStockMovements(): StockMovementRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STOCK_MOVEMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StockMovementRecord[]) : [];
  } catch {
    return [];
  }
}

function appendStockMovementsFromSales(basket: GeneralSaleRecord[]): void {
  if (typeof window === "undefined" || !basket.length) return;
  const movements: StockMovementRecord[] = [];
  for (const rec of basket) {
    for (const ln of rec.lines) {
      movements.push({
        id: `${rec.timestamp}-${ln.category}-${ln.productId}-${ln.saleBaseQty}`,
        timestamp: rec.timestamp,
        productName: ln.productName,
        category: ln.category,
        categoryLabel: CATEGORY_LABELS[ln.category],
        movementType: "sale",
        movement_type: "sale",
        type: "sale",
        qty_delta: -ln.saleBaseQty,
        qty: -ln.saleBaseQty,
        unit: ln.saleUnit,
        note: rec.name,
        source: "Merkezi Satış",
        reference: rec.timestamp,
      });
    }
  }
  localStorage.setItem(
    STOCK_MOVEMENTS_STORAGE_KEY,
    JSON.stringify([...loadStockMovements(), ...movements]),
  );
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
      p.productGroup.toLowerCase().includes(ql) ||
      p.subtitle.toLowerCase().includes(ql) ||
      CATEGORY_LABELS[p.category].toLowerCase().includes(ql),
  );
}

function measureSaleBaseQty(
  product: UnifiedProduct,
  saleQty: number,
  saleUnit: string,
): { saleBaseQty: number } | { error: string } {
  if (product.saleMode === "adet") {
    const qty = Math.floor(saleQty);
    if (qty <= 0) return { error: "Satılacak adet 0'dan büyük olmalı." };
    if (qty > product.stockAmount) {
      return { error: `Yetersiz stok. Mevcut: ${product.stockDisplay}` };
    }
    return { saleBaseQty: qty };
  }
  const toCanon = product.category === "other" ? otherToCanonical : oilToCanonical;
  const { amount: saleBaseQty, base } = toCanon(saleQty, saleUnit as OilInputUnit);
  if (base !== product.baseUnit) {
    return { error: "Satış birimi ürün ölçü tipi ile uyumlu değil." };
  }
  if (saleBaseQty <= 0) return { error: "Satılacak miktar 0'dan büyük olmalı." };
  if (saleBaseQty > product.stockAmount) {
    return { error: `Yetersiz stok. Mevcut: ${product.stockDisplay}` };
  }
  return { saleBaseQty };
}

function saleLineFromProduct(
  product: UnifiedProduct,
  saleQty: number,
  saleUnit: string,
  profitPct: number,
  lineCost: number,
  lineSale: number,
  saleBaseQty: number,
): GeneralSaleLine {
  return {
    category: product.category,
    sourceKey: product.sourceKey,
    productId: product.productId,
    productName: product.name,
    productSubtitle: product.subtitle,
    saleQty,
    saleUnit,
    saleBaseQty,
    lineCost,
    lineSale,
  };
}

export function fmtUnifiedUnitCost(p: UnifiedProduct): string {
  if (p.category === "oil") return fmtOilUnitCost(p.costPerUnit, p.baseUnit || "adet");
  if (p.category === "soap_cream") return fmtSoapUnitCost(p.costPerUnit, p.baseUnit || "adet");
  if (p.category === "other") return fmtOtherUnitCost(p.costPerUnit, p.baseUnit || "adet");
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
    if (inv) {
      const { unit, warning } = unitCostAndCurrency(inv, usdRate);
      if (warning) return { error: warning };
      if (unit <= 0) return { error: "Birim maliyet hesaplanamadı." };
      const lineCost = unit * qty;
      const lineSale = lineCost * (1 + pct / 100);
      return saleLineFromProduct(product, qty, "adet", pct, lineCost, lineSale, qty);
    }
    const lineCost = product.costPerUnit * qty;
    const lineSale = lineCost * (1 + pct / 100);
    return saleLineFromProduct(product, qty, "adet", pct, lineCost, lineSale, qty);
  }

  if (product.category === "oil") {
    const item = loadOilInventory().find((i) => i.id === product.productId);
    if (item) {
      const calc = calcOilLine(item, saleQty, saleUnit as OilInputUnit);
      if ("error" in calc) return calc;
      const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
      return saleLineFromProduct(
        product,
        saleQty,
        saleUnit,
        pct,
        calc.lineCost,
        lineSale,
        calc.saleBaseQty,
      );
    }
    const base = measureSaleBaseQty(product, saleQty, saleUnit);
    if ("error" in base) return base;
    const lineCost = product.costPerUnit * base.saleBaseQty;
    const lineSale = pct > 0 ? lineCost * (1 + pct / 100) : product.salePerUnit * base.saleBaseQty;
    return saleLineFromProduct(product, saleQty, saleUnit, pct, lineCost, lineSale, base.saleBaseQty);
  }

  if (product.category === "soap_cream") {
    const item = loadSoapCreamInventory().find((i) => i.id === product.productId);
    if (item) {
      const calc = calcSoapLine(item, saleQty, saleUnit as ScInputUnit);
      if ("error" in calc) return calc;
      const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
      return saleLineFromProduct(
        product,
        saleQty,
        saleUnit,
        pct,
        calc.lineCost,
        lineSale,
        calc.saleBaseQty,
      );
    }
    const base = measureSaleBaseQty(product, saleQty, saleUnit);
    if ("error" in base) return base;
    const lineCost = product.costPerUnit * base.saleBaseQty;
    const lineSale = pct > 0 ? lineCost * (1 + pct / 100) : product.salePerUnit * base.saleBaseQty;
    return saleLineFromProduct(product, saleQty, saleUnit, pct, lineCost, lineSale, base.saleBaseQty);
  }

  if (product.category === "other") {
    const item = loadOtherInventory().find((i) => i.id === product.productId);
    if (item) {
      const calc = calcOtherLine(item, saleQty, saleUnit as OtInputUnit);
      if ("error" in calc) return calc;
      const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
      return saleLineFromProduct(
        product,
        saleQty,
        saleUnit,
        pct,
        calc.lineCost,
        lineSale,
        calc.saleBaseQty,
      );
    }
    const base = measureSaleBaseQty(product, saleQty, saleUnit);
    if ("error" in base) return base;
    const lineCost = product.costPerUnit * base.saleBaseQty;
    const lineSale = pct > 0 ? lineCost * (1 + pct / 100) : product.salePerUnit * base.saleBaseQty;
    return saleLineFromProduct(product, saleQty, saleUnit, pct, lineCost, lineSale, base.saleBaseQty);
  }

  const item = loadAccessoryInventory().find((i) => i.id === product.productId);
  if (item) {
    const calc = calcAccessoryLine(item, saleQty);
    if ("error" in calc) return calc;
    const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
    return saleLineFromProduct(
      product,
      calc.saleQty,
      "adet",
      pct,
      calc.lineCost,
      lineSale,
      calc.saleQty,
    );
  }
  const qty = Math.floor(saleQty);
  if (qty <= 0) return { error: "Satılacak adet 0'dan büyük olmalı." };
  if (qty > product.stockAmount) {
    return { error: `Yetersiz stok. Mevcut: ${product.stockDisplay}` };
  }
  const lineCost = product.costPerUnit * qty;
  const lineSale = pct > 0 ? lineCost * (1 + pct / 100) : product.salePerUnit * qty;
  return saleLineFromProduct(product, qty, "adet", pct, lineCost, lineSale, qty);
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
        oilType: item?.oilType ?? l.productSubtitle.split(" · ")[0] ?? "",
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
        productGroup: item?.productGroup ?? l.productSubtitle.split(" · ")[0] ?? "",
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

function toOtherSaleRecord(rec: GeneralSaleRecord): OtherSaleRecord {
  const lines: OtherSaleLine[] = rec.lines
    .filter((l) => l.category === "other")
    .map((l) => {
      const item = loadOtherInventory().find((i) => i.id === l.productId);
      return {
        productId: l.productId,
        productName: l.productName,
        productGroup: item?.productGroup ?? l.productSubtitle.split(" · ")[0] ?? "",
        saleQty: l.saleQty,
        saleUnit: l.saleUnit as OtInputUnit,
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
        productGroup: item?.productGroup ?? l.productSubtitle.split(" · ")[0] ?? "",
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

  const deductMap = new Map<
    string,
    { category: ProductCategory; lines: { productId: string; saleBaseQty: number }[] }
  >();

  for (const rec of basket) {
    for (const ln of rec.lines) {
      const key = ln.sourceKey || INVENTORY_SOURCE_KEYS[ln.category];
      const entry = deductMap.get(key) ?? { category: ln.category, lines: [] };
      entry.lines.push({ productId: ln.productId, saleBaseQty: ln.saleBaseQty });
      deductMap.set(key, entry);
    }
  }

  for (const [sourceKey, { category, lines }] of deductMap) {
    const deduct = deductCentralInventory(sourceKey, category, lines);
    if (!deduct.ok) return deduct;
  }

  const dogaltasBasket: SaleRecord[] = [];
  const oilBasket: OilSaleRecord[] = [];
  const soapBasket: SoapCreamSaleRecord[] = [];
  const accessoryBasket: AccessorySaleRecord[] = [];
  const otherBasket: OtherSaleRecord[] = [];

  for (const rec of basket) {
    if (rec.lines.some((l) => l.category === "dogaltas")) dogaltasBasket.push(toDogaltasSaleRecord(rec));
    if (rec.lines.some((l) => l.category === "oil")) oilBasket.push(toOilSaleRecord(rec));
    if (rec.lines.some((l) => l.category === "soap_cream")) soapBasket.push(toSoapSaleRecord(rec));
    if (rec.lines.some((l) => l.category === "accessory")) accessoryBasket.push(toAccessorySaleRecord(rec));
    if (rec.lines.some((l) => l.category === "other")) otherBasket.push(toOtherSaleRecord(rec));
  }

  if (dogaltasBasket.length) appendDogaltasSales(dogaltasBasket);
  if (oilBasket.length) appendOilSales(oilBasket);
  if (soapBasket.length) appendSoapCreamSales(soapBasket);
  if (accessoryBasket.length) appendAccessorySales(accessoryBasket);
  if (otherBasket.length) appendOtherSales(otherBasket);

  void usdRate;
  appendGeneralSales(basket);
  appendStockMovementsFromSales(basket);
  return { ok: true };
}
