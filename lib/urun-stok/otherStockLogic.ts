/** Diğer ürünler stok + satış — canonical birim: adet | ml | gram */

export const INVENTORY_STORAGE_KEY = "other_inventory_v1";
export const SALES_STORAGE_KEY = "other_sales_history_v1";

export const PRODUCT_GROUPS = [
  "Giyim",
  "İç Giyim",
  "Kozmetik",
  "Kişisel Bakım",
  "Ev Ürünü",
  "Hediyelik",
  "Kitap / Kart / Defter",
  "Dijital Ürün",
  "Hizmet Paketi",
  "Eğitim / Atölye",
  "Diğer",
] as const;

export const MEASURE_TYPES = ["Adet", "Gram / KG", "ML / Litre"] as const;

export const INPUT_UNITS = ["adet", "gram", "kg", "ml", "litre"] as const;

export const VARIATION_KINDS = [
  "beden",
  "renk",
  "model",
  "paket",
  "set",
  "özel",
] as const;

export type OtBaseUnit = "adet" | "ml" | "gram";
export type OtInputUnit = (typeof INPUT_UNITS)[number];
export type OtMeasureType = (typeof MEASURE_TYPES)[number];

export type OtherItem = {
  id: string;
  name: string;
  productGroup: string;
  subCategory: string;
  measureType: OtMeasureType;
  stockBase: number;
  baseUnit: OtBaseUnit;
  costPerBase: number;
  salePerBase: number;
  profitPct: number;
  variationKind: string;
  variationDetail: string;
  barcode: string;
  photos: string[];
  note: string;
};

export type OtherSaleLine = {
  productId: string;
  productName: string;
  productGroup: string;
  saleQty: number;
  saleUnit: OtInputUnit;
  saleBaseQty: number;
  lineCost: number;
  lineSale: number;
};

export type OtherSaleRecord = {
  name: string;
  lines: OtherSaleLine[];
  total_cost: number;
  sale_price: number;
  profit_pct: number;
  photos: string[];
  timestamp: string;
};

export function turkishUpper(s: string): string {
  if (!s) return "";
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

export function toFloat(v: unknown, d = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const s = v.replace(/[^0-9,.\-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isNaN(n) ? d : n;
  }
  return d;
}

export function fmtMoney(x: number): string {
  return `₺${x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtQty(x: number, maxDec = 2): string {
  const s = x.toFixed(maxDec).replace(/\.?0+$/, "");
  return s || "0";
}

export function measureTypeToBase(measureType: string): OtBaseUnit {
  if (measureType === "Adet") return "adet";
  if (measureType === "Gram / KG") return "gram";
  return "ml";
}

export function toCanonical(
  amount: number,
  unit: OtInputUnit,
): { amount: number; base: OtBaseUnit } {
  switch (unit) {
    case "adet":
      return { amount, base: "adet" };
    case "ml":
      return { amount, base: "ml" };
    case "litre":
      return { amount: amount * 1000, base: "ml" };
    case "gram":
      return { amount, base: "gram" };
    case "kg":
      return { amount: amount * 1000, base: "gram" };
    default:
      return { amount, base: "ml" };
  }
}

export function fromCanonical(
  baseAmount: number,
  unit: OtInputUnit,
  base: OtBaseUnit,
): number {
  if (base === "adet" && unit === "adet") return baseAmount;
  if (base === "ml") {
    if (unit === "ml") return baseAmount;
    if (unit === "litre") return baseAmount / 1000;
  }
  if (base === "gram") {
    if (unit === "gram") return baseAmount;
    if (unit === "kg") return baseAmount / 1000;
  }
  return baseAmount;
}

export function formatStockDisplay(item: OtherItem): string {
  const u = item.baseUnit;
  const a = item.stockBase;
  if (u === "ml" && a >= 1000) return `${fmtQty(a / 1000, 2)} litre (${fmtQty(a, 0)} ml)`;
  if (u === "gram" && a >= 1000) return `${fmtQty(a / 1000, 2)} kg (${fmtQty(a, 0)} g)`;
  if (u === "adet") return `${fmtQty(a, 0)} adet`;
  if (u === "ml") return `${fmtQty(a, 0)} ml`;
  return `${fmtQty(a, 0)} gram`;
}

export function unitLabel(base: OtBaseUnit): string {
  if (base === "adet") return "adet";
  if (base === "ml") return "ml";
  return "gram";
}

export function formatVariationLabel(item: OtherItem): string {
  const d = (item.variationDetail || "").trim();
  const k = (item.variationKind || "").trim();
  if (d && k && k !== "özel") return `${d} · ${k}`;
  if (d) return d;
  if (k) return k;
  return "";
}

export function formatVariantLabel(item: OtherItem): string {
  const parts = [item.name];
  if (item.subCategory) parts.push(item.subCategory);
  const v = formatVariationLabel(item);
  if (v) parts.push(v);
  return parts.join(" | ");
}

export function costPerBaseFromTotal(
  costTotal: number,
  stockQty: number,
  inputUnit: OtInputUnit,
): number | null {
  if (costTotal <= 0 || stockQty <= 0) return null;
  const { amount: baseQty } = toCanonical(stockQty, inputUnit);
  if (baseQty <= 0) return null;
  return costTotal / baseQty;
}

export function salePerBaseFromTotal(
  saleTotal: number,
  stockQty: number,
  inputUnit: OtInputUnit,
): number | null {
  if (saleTotal <= 0 || stockQty <= 0) return null;
  const { amount: baseQty } = toCanonical(stockQty, inputUnit);
  if (baseQty <= 0) return null;
  return saleTotal / baseQty;
}

export function fmtUnitCost(perBase: number, base: OtBaseUnit): string {
  return `${fmtMoney(perBase)} / ${unitLabel(base)}`;
}

export function salePerBaseWithProfit(costPerBase: number, profitPct: number): number {
  if (costPerBase <= 0) return 0;
  return costPerBase * (1 + profitPct / 100);
}

export function formatLineCostBreakdown(
  costPerBase: number,
  saleQty: number,
  saleUnit: OtInputUnit,
  baseUnit: OtBaseUnit,
  lineCost: number,
): string {
  return `${fmtQty(saleQty, 2)} ${saleUnit} × ${fmtUnitCost(costPerBase, baseUnit)} = ${fmtMoney(lineCost)}`;
}

export function formatCanonicalStockHint(stockQty: number, inputUnit: OtInputUnit): string | null {
  if (stockQty <= 0) return null;
  const { amount, base } = toCanonical(stockQty, inputUnit);
  if (inputUnit === "litre" || inputUnit === "kg") {
    const big = inputUnit === "litre" ? "litre" : "kg";
    return `${fmtQty(stockQty, 2)} ${big} = ${fmtQty(amount, 0)} ${unitLabel(base)} (iç stok)`;
  }
  if (inputUnit === "ml" || inputUnit === "gram") {
    return `${fmtQty(amount, 0)} ${unitLabel(base)}`;
  }
  return `${fmtQty(amount, 0)} adet`;
}

function newId(): string {
  return `oth_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseItem(r: Record<string, unknown>): OtherItem {
  return {
    id: String(r.id ?? newId()),
    name: String(r.name ?? ""),
    productGroup: String(r.productGroup ?? ""),
    subCategory: String(r.subCategory ?? ""),
    measureType: (r.measureType as OtMeasureType) || "Adet",
    stockBase: toFloat(r.stockBase, 0),
    baseUnit: (r.baseUnit as OtBaseUnit) || "adet",
    costPerBase: toFloat(r.costPerBase, 0),
    salePerBase: toFloat(r.salePerBase, 0),
    profitPct: toFloat(r.profitPct, 0),
    variationKind: String(r.variationKind ?? "özel"),
    variationDetail: String(r.variationDetail ?? ""),
    barcode: String(r.barcode ?? ""),
    photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    note: String(r.note ?? ""),
  };
}

export function loadOtherInventory(): OtherItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => parseItem(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export function saveOtherInventory(items: OtherItem[]): boolean {
  if (typeof window === "undefined") return true;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function loadOtherSales(): OtherSaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OtherSaleRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveOtherSales(records: OtherSaleRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(records));
}

export function appendOtherSales(records: OtherSaleRecord[]): void {
  saveOtherSales([...loadOtherSales(), ...records]);
}

export async function filesToDataUrls(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files);
  const out: string[] = [];
  for (const file of list) {
    if (!file.type.startsWith("image/")) continue;
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    out.push(url);
  }
  return out;
}

export type AddOtherInput = {
  id?: string;
  name: string;
  productGroup: string;
  subCategory: string;
  measureType: OtMeasureType;
  stockQty: number;
  inputUnit: OtInputUnit;
  costTotal: number;
  salePriceTotal: number;
  profitPct: number;
  variationKind: string;
  variationDetail: string;
  barcode: string;
  photos: string[];
  note: string;
  deltaMode: boolean;
};

export type AddOtherResult =
  | { ok: true; items: OtherItem[] }
  | { ok: false; error: string };

export function addOrUpdateOtherItem(items: OtherItem[], input: AddOtherInput): AddOtherResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Ürün adı boş olamaz." };

  const baseFromMeasure = measureTypeToBase(input.measureType);
  const { amount: deltaBase, base } = toCanonical(input.stockQty, input.inputUnit);

  if (input.deltaMode && deltaBase === 0) {
    return { ok: false, error: "Stok miktarı 0 olamaz." };
  }

  if (base !== baseFromMeasure) {
    return {
      ok: false,
      error: `Ölçü tipi (${input.measureType}) ile seçilen birim uyumsuz.`,
    };
  }

  const existingIdx = input.id ? items.findIndex((i) => i.id === input.id) : -1;

  if (existingIdx >= 0) {
    const cur = { ...items[existingIdx], photos: [...items[existingIdx].photos] };
    const before = cur.stockBase;
    const delta = input.deltaMode ? deltaBase : deltaBase - before;

    if (!input.deltaMode) {
      cur.stockBase = deltaBase;
    } else {
      const next = before + delta;
      if (next < 0) return { ok: false, error: "Stok eksiye düşemez." };
      cur.stockBase = next;
    }

    if (input.costTotal > 0 && delta > 0) {
      const addCostPer = input.costTotal / delta;
      cur.costPerBase =
        before + delta > 0
          ? (before * cur.costPerBase + delta * addCostPer) / (before + delta)
          : addCostPer;
    }

    if (input.salePriceTotal > 0 && (input.deltaMode ? delta : cur.stockBase) > 0) {
      const q = input.deltaMode ? delta : cur.stockBase;
      cur.salePerBase = input.salePriceTotal / q;
    } else if (input.profitPct > 0 && cur.costPerBase > 0) {
      cur.salePerBase = cur.costPerBase * (1 + input.profitPct / 100);
    }

    cur.profitPct = input.profitPct;
    cur.name = turkishUpper(name);
    cur.productGroup = input.productGroup;
    cur.subCategory = input.subCategory;
    cur.measureType = input.measureType;
    cur.variationKind = input.variationKind;
    cur.variationDetail = input.variationDetail;
    cur.barcode = input.barcode;
    cur.note = input.note;
    if (input.photos.length) cur.photos = [...cur.photos, ...input.photos];

    const next = [...items];
    next[existingIdx] = cur;
    return { ok: true, items: next };
  }

  if (!input.deltaMode && deltaBase < 0) {
    return { ok: false, error: "Yeni kayıt için negatif stok girilemez." };
  }
  if (deltaBase <= 0 && input.deltaMode) {
    return { ok: false, error: "Yeni kayıt için pozitif stok girin." };
  }

  const stockBase = deltaBase;
  let costPerBase = 0;
  if (input.costTotal > 0 && stockBase > 0) costPerBase = input.costTotal / stockBase;

  let salePerBase = 0;
  if (input.salePriceTotal > 0 && stockBase > 0) {
    salePerBase = input.salePriceTotal / stockBase;
  } else if (input.profitPct > 0 && costPerBase > 0) {
    salePerBase = costPerBase * (1 + input.profitPct / 100);
  }

  const item: OtherItem = {
    id: newId(),
    name: turkishUpper(name),
    productGroup: input.productGroup,
    subCategory: input.subCategory,
    measureType: input.measureType,
    stockBase,
    baseUnit: base,
    costPerBase,
    salePerBase,
    profitPct: input.profitPct,
    variationKind: input.variationKind,
    variationDetail: input.variationDetail,
    barcode: input.barcode,
    photos: [...input.photos],
    note: input.note,
  };

  return { ok: true, items: [...items, item] };
}

export function calcLineAmounts(
  item: OtherItem,
  saleQty: number,
  saleUnit: OtInputUnit,
): {
  saleBaseQty: number;
  lineCost: number;
  lineSale: number;
  costPerBase: number;
  salePerBase: number;
} | { error: string } {
  const { amount: saleBaseQty, base } = toCanonical(saleQty, saleUnit);
  if (base !== item.baseUnit) {
    return { error: "Satış birimi ürün ölçü tipi ile uyumlu değil." };
  }
  if (saleBaseQty <= 0) return { error: "Satılacak miktar 0'dan büyük olmalı." };
  if (saleBaseQty > item.stockBase) {
    return { error: `Yetersiz stok. Mevcut: ${formatStockDisplay(item)}` };
  }
  const lineCost = item.costPerBase * saleBaseQty;
  const lineSale = item.salePerBase * saleBaseQty;
  return {
    saleBaseQty,
    lineCost,
    lineSale,
    costPerBase: item.costPerBase,
    salePerBase: item.salePerBase,
  };
}

export function deductOtherInventory(
  items: OtherItem[],
  lines: { productId: string; saleBaseQty: number }[],
): OtherItem[] {
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  for (const ln of lines) {
    const it = map.get(ln.productId);
    if (!it) continue;
    it.stockBase = Math.max(0, it.stockBase - ln.saleBaseQty);
  }
  return Array.from(map.values());
}

export function filterOtherItems(items: OtherItem[], q: string): OtherItem[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return items;
  return items.filter(
    (it) =>
      it.name.toLowerCase().includes(ql) ||
      it.productGroup.toLowerCase().includes(ql) ||
      it.subCategory.toLowerCase().includes(ql) ||
      it.variationDetail.toLowerCase().includes(ql) ||
      it.barcode.toLowerCase().includes(ql),
  );
}

export function sortOtherItems(items: OtherItem[], mode: string): OtherItem[] {
  const rows = [...items];
  const k = (s: string) => (s || "").replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase();
  switch (mode) {
    case "Ürün (Z→A)":
      rows.sort((a, b) => k(b.name).localeCompare(k(a.name), "tr"));
      break;
    case "Stok (Az→Çok)":
      rows.sort((a, b) => a.stockBase - b.stockBase);
      break;
    case "Stok (Çok→Az)":
      rows.sort((a, b) => b.stockBase - a.stockBase);
      break;
    default:
      rows.sort((a, b) => k(a.name).localeCompare(k(b.name), "tr"));
  }
  return rows;
}

export function inventoryStockValue(items: OtherItem[]): number {
  return items.reduce((s, it) => s + it.costPerBase * it.stockBase, 0);
}
