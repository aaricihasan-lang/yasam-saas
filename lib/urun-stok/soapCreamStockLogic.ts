/** Sabun / krem ürün stok + satış — canonical birim: adet | ml | gram */

export const INVENTORY_STORAGE_KEY = "soap_cream_inventory_v1";
export const SALES_STORAGE_KEY = "soap_cream_sales_history_v1";

export const PRODUCT_GROUPS = [
  "Doğal Sabun",
  "Krem",
  "Losyon",
  "Balm",
  "Serum",
  "Şampuan",
  "Maske",
  "Diğer",
] as const;

export const MEASURE_TYPES = ["Adet", "Gram / KG", "ML / Litre"] as const;

export const INPUT_UNITS = ["adet", "gram", "kg", "ml", "litre"] as const;

export const PACKAGING_TYPES = [
  "kalıp",
  "kavanoz",
  "tüp",
  "şişe",
  "pompalı şişe",
  "kutu",
  "paket",
  "diğer",
] as const;

export type ScBaseUnit = "adet" | "ml" | "gram";
export type ScInputUnit = (typeof INPUT_UNITS)[number];
export type ScMeasureType = (typeof MEASURE_TYPES)[number];

export type SoapCreamItem = {
  id: string;
  name: string;
  productGroup: string;
  measureType: ScMeasureType;
  stockBase: number;
  baseUnit: ScBaseUnit;
  costPerBase: number;
  salePerBase: number;
  profitPct: number;
  packagingType: string;
  netAmount: string;
  expiryDate: string;
  lotNo: string;
  photos: string[];
  note: string;
};

export type SoapCreamSaleLine = {
  productId: string;
  productName: string;
  productGroup: string;
  saleQty: number;
  saleUnit: ScInputUnit;
  saleBaseQty: number;
  lineCost: number;
  lineSale: number;
};

export type SoapCreamSaleRecord = {
  name: string;
  lines: SoapCreamSaleLine[];
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
  const s = x.toFixed(maxDec);
  // Yalnızca ONDALIK kısmın sonundaki sıfırları kırp; tam sayı sıfırlarını koru
  // (aksi halde 1000→"1", 50→"5" gibi yanlış gösterim oluşur).
  if (!s.includes(".")) return s;
  const trimmed = s.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed || "0";
}

export function measureTypeToBase(measureType: string): ScBaseUnit {
  if (measureType === "Adet") return "adet";
  if (measureType === "Gram / KG") return "gram";
  return "ml";
}

export function toCanonical(
  amount: number,
  unit: ScInputUnit,
): { amount: number; base: ScBaseUnit } {
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
  unit: ScInputUnit,
  base: ScBaseUnit,
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

export function formatStockDisplay(item: SoapCreamItem): string {
  const u = item.baseUnit;
  const a = item.stockBase;
  if (u === "ml" && a >= 1000) return `${fmtQty(a / 1000, 2)} litre (${fmtQty(a, 0)} ml)`;
  if (u === "gram" && a >= 1000) return `${fmtQty(a / 1000, 2)} kg (${fmtQty(a, 0)} g)`;
  if (u === "adet") return `${fmtQty(a, 0)} adet`;
  if (u === "ml") return `${fmtQty(a, 0)} ml`;
  return `${fmtQty(a, 0)} gram`;
}

export function unitLabel(base: ScBaseUnit): string {
  if (base === "adet") return "adet";
  if (base === "ml") return "ml";
  return "gram";
}

export function costPerBaseFromTotal(
  costTotal: number,
  stockQty: number,
  inputUnit: ScInputUnit,
): number | null {
  if (costTotal <= 0 || stockQty <= 0) return null;
  const { amount: baseQty } = toCanonical(stockQty, inputUnit);
  if (baseQty <= 0) return null;
  return costTotal / baseQty;
}

export function salePerBaseFromTotal(
  saleTotal: number,
  stockQty: number,
  inputUnit: ScInputUnit,
): number | null {
  if (saleTotal <= 0 || stockQty <= 0) return null;
  const { amount: baseQty } = toCanonical(stockQty, inputUnit);
  if (baseQty <= 0) return null;
  return saleTotal / baseQty;
}

export function fmtUnitCost(perBase: number, base: ScBaseUnit): string {
  return `${fmtMoney(perBase)} / ${unitLabel(base)}`;
}

export function salePerBaseWithProfit(costPerBase: number, profitPct: number): number {
  if (costPerBase <= 0) return 0;
  return costPerBase * (1 + profitPct / 100);
}

export function formatLineCostBreakdown(
  costPerBase: number,
  saleQty: number,
  saleUnit: ScInputUnit,
  baseUnit: ScBaseUnit,
  lineCost: number,
): string {
  return `${fmtQty(saleQty, 2)} ${saleUnit} × ${fmtUnitCost(costPerBase, baseUnit)} = ${fmtMoney(lineCost)}`;
}

export function formatCanonicalStockHint(stockQty: number, inputUnit: ScInputUnit): string | null {
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
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseItem(r: Record<string, unknown>): SoapCreamItem {
  return {
    id: String(r.id ?? newId()),
    name: String(r.name ?? ""),
    productGroup: String(r.productGroup ?? r.oilType ?? ""),
    measureType: (r.measureType as ScMeasureType) || "Gram / KG",
    stockBase: toFloat(r.stockBase, 0),
    baseUnit: (r.baseUnit as ScBaseUnit) || "gram",
    costPerBase: toFloat(r.costPerBase, 0),
    salePerBase: toFloat(r.salePerBase, 0),
    profitPct: toFloat(r.profitPct, 0),
    packagingType: String(r.packagingType ?? r.packageType ?? ""),
    netAmount: String(r.netAmount ?? ""),
    expiryDate: String(r.expiryDate ?? ""),
    lotNo: String(r.lotNo ?? ""),
    photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    note: String(r.note ?? ""),
  };
}

export function loadSoapCreamInventory(): SoapCreamItem[] {
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

export function saveSoapCreamInventory(items: SoapCreamItem[]): boolean {
  if (typeof window === "undefined") return true;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function loadSoapCreamSales(): SoapCreamSaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SoapCreamSaleRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveSoapCreamSales(records: SoapCreamSaleRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(records));
}

export function appendSoapCreamSales(records: SoapCreamSaleRecord[]): void {
  saveSoapCreamSales([...loadSoapCreamSales(), ...records]);
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

export type AddSoapCreamInput = {
  id?: string;
  name: string;
  productGroup: string;
  measureType: ScMeasureType;
  stockQty: number;
  inputUnit: ScInputUnit;
  costTotal: number;
  salePriceTotal: number;
  profitPct: number;
  packagingType: string;
  netAmount: string;
  expiryDate: string;
  lotNo: string;
  photos: string[];
  note: string;
  deltaMode: boolean;
};

export type AddSoapCreamResult =
  | { ok: true; items: SoapCreamItem[] }
  | { ok: false; error: string };

export function addOrUpdateSoapCreamItem(
  items: SoapCreamItem[],
  input: AddSoapCreamInput,
): AddSoapCreamResult {
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
    cur.measureType = input.measureType;
    cur.packagingType = input.packagingType;
    cur.netAmount = input.netAmount;
    cur.expiryDate = input.expiryDate;
    cur.lotNo = input.lotNo;
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

  const item: SoapCreamItem = {
    id: newId(),
    name: turkishUpper(name),
    productGroup: input.productGroup,
    measureType: input.measureType,
    stockBase,
    baseUnit: base,
    costPerBase,
    salePerBase,
    profitPct: input.profitPct,
    packagingType: input.packagingType,
    netAmount: input.netAmount,
    expiryDate: input.expiryDate,
    lotNo: input.lotNo,
    photos: [...input.photos],
    note: input.note,
  };

  return { ok: true, items: [...items, item] };
}

export function calcLineAmounts(
  item: SoapCreamItem,
  saleQty: number,
  saleUnit: ScInputUnit,
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

export function deductSoapCreamInventory(
  items: SoapCreamItem[],
  lines: { productId: string; saleBaseQty: number }[],
): SoapCreamItem[] {
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  for (const ln of lines) {
    const it = map.get(ln.productId);
    if (!it) continue;
    it.stockBase = Math.max(0, it.stockBase - ln.saleBaseQty);
  }
  return Array.from(map.values());
}

export function filterSoapCreamItems(items: SoapCreamItem[], q: string): SoapCreamItem[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return items;
  return items.filter(
    (it) =>
      it.name.toLowerCase().includes(ql) ||
      it.productGroup.toLowerCase().includes(ql) ||
      it.packagingType.toLowerCase().includes(ql) ||
      it.netAmount.toLowerCase().includes(ql) ||
      it.lotNo.toLowerCase().includes(ql),
  );
}

export function sortSoapCreamItems(items: SoapCreamItem[], mode: string): SoapCreamItem[] {
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

export function inventoryStockValue(items: SoapCreamItem[]): number {
  return items.reduce((s, it) => s + it.costPerBase * it.stockBase, 0);
}
