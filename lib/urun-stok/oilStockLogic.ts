/** Yağ ürün stok + satış — canonical birim: adet | ml | gram */

export const INVENTORY_STORAGE_KEY = "oil_inventory_v1";
export const SALES_STORAGE_KEY = "oil_sales_history_v1";

export const OIL_TYPES = [
  "Uçucu Yağ",
  "Sabit Yağ",
  "Karışım Yağ",
  "Maserasyon Yağı",
  "Diğer",
] as const;

export const MEASURE_TYPES = ["Adet", "ML / Litre", "Gram / KG"] as const;

export const INPUT_UNITS = ["adet", "ml", "litre", "gram", "kg"] as const;

export const BOTTLE_VOLUMES = [
  "5 ml",
  "10 ml",
  "20 ml",
  "30 ml",
  "50 ml",
  "100 ml",
  "özel",
] as const;

export const PACKAGE_TYPES = [
  "damlalıklı şişe",
  "sprey şişe",
  "roll-on",
  "kavanoz",
  "dökme",
  "diğer",
] as const;

export type OilBaseUnit = "adet" | "ml" | "gram";
export type OilInputUnit = (typeof INPUT_UNITS)[number];
export type OilMeasureType = (typeof MEASURE_TYPES)[number];

export type OilItem = {
  id: string;
  name: string;
  oilType: string;
  measureType: OilMeasureType;
  stockBase: number;
  baseUnit: OilBaseUnit;
  costPerBase: number;
  salePerBase: number;
  profitPct: number;
  bottleVolume: string;
  bottleVolumeCustom: string;
  packageType: string;
  photos: string[];
  note: string;
};

export type OilSaleLine = {
  productId: string;
  productName: string;
  oilType: string;
  saleQty: number;
  saleUnit: OilInputUnit;
  saleBaseQty: number;
  lineCost: number;
  lineSale: number;
};

export type OilSaleRecord = {
  name: string;
  lines: OilSaleLine[];
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

export function measureTypeToBase(measureType: string): OilBaseUnit {
  if (measureType === "Adet") return "adet";
  if (measureType === "Gram / KG") return "gram";
  return "ml";
}

/** Giriş birimini canonical stok birimine çevirir (litre→ml, kg→gram). */
export function toCanonical(
  amount: number,
  unit: OilInputUnit,
): { amount: number; base: OilBaseUnit } {
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

/** Canonical miktarı seçilen satış birimine çevirir (gösterim için). */
export function fromCanonical(
  baseAmount: number,
  unit: OilInputUnit,
  base: OilBaseUnit,
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

export function formatStockDisplay(item: OilItem): string {
  const u = item.baseUnit;
  const a = item.stockBase;
  if (u === "ml" && a >= 1000) return `${fmtQty(a / 1000, 2)} litre (${fmtQty(a, 0)} ml)`;
  if (u === "gram" && a >= 1000) return `${fmtQty(a / 1000, 2)} kg (${fmtQty(a, 0)} g)`;
  if (u === "adet") return `${fmtQty(a, 0)} adet`;
  if (u === "ml") return `${fmtQty(a, 0)} ml`;
  return `${fmtQty(a, 0)} gram`;
}

export function unitLabel(base: OilBaseUnit): string {
  if (base === "adet") return "adet";
  if (base === "ml") return "ml";
  return "gram";
}

/** Toplam alış maliyetinden canonical birim maliyeti (örn. 3000₺ / 1 litre → 3₺/ml). */
export function costPerBaseFromTotal(
  costTotal: number,
  stockQty: number,
  inputUnit: OilInputUnit,
): number | null {
  if (costTotal <= 0 || stockQty <= 0) return null;
  const { amount: baseQty } = toCanonical(stockQty, inputUnit);
  if (baseQty <= 0) return null;
  return costTotal / baseQty;
}

/** Toplam satış fiyatından canonical birim satış fiyatı. */
export function salePerBaseFromTotal(
  saleTotal: number,
  stockQty: number,
  inputUnit: OilInputUnit,
): number | null {
  if (saleTotal <= 0 || stockQty <= 0) return null;
  const { amount: baseQty } = toCanonical(stockQty, inputUnit);
  if (baseQty <= 0) return null;
  return saleTotal / baseQty;
}

export function fmtUnitCost(perBase: number, base: OilBaseUnit): string {
  return `${fmtMoney(perBase)} / ${unitLabel(base)}`;
}

/** Kâr oranına göre birim satış fiyatı. */
export function salePerBaseWithProfit(costPerBase: number, profitPct: number): number {
  if (costPerBase <= 0) return 0;
  return costPerBase * (1 + profitPct / 100);
}

/** Satış satırı maliyet formülü: "10 ml × ₺3,00 / ml = ₺30,00" */
export function formatLineCostBreakdown(
  costPerBase: number,
  saleQty: number,
  saleUnit: OilInputUnit,
  baseUnit: OilBaseUnit,
  lineCost: number,
): string {
  return `${fmtQty(saleQty, 2)} ${saleUnit} × ${fmtUnitCost(costPerBase, baseUnit)} = ${fmtMoney(lineCost)}`;
}

export function formatCanonicalStockHint(stockQty: number, inputUnit: OilInputUnit): string | null {
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
  return `oil_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseItem(r: Record<string, unknown>): OilItem {
  return {
    id: String(r.id ?? newId()),
    name: String(r.name ?? ""),
    oilType: String(r.oilType ?? ""),
    measureType: (r.measureType as OilMeasureType) || "ML / Litre",
    stockBase: toFloat(r.stockBase, 0),
    baseUnit: (r.baseUnit as OilBaseUnit) || "ml",
    costPerBase: toFloat(r.costPerBase, 0),
    salePerBase: toFloat(r.salePerBase, 0),
    profitPct: toFloat(r.profitPct, 0),
    bottleVolume: String(r.bottleVolume ?? ""),
    bottleVolumeCustom: String(r.bottleVolumeCustom ?? ""),
    packageType: String(r.packageType ?? ""),
    photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    note: String(r.note ?? ""),
  };
}

export function loadOilInventory(): OilItem[] {
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

export function saveOilInventory(items: OilItem[]): boolean {
  if (typeof window === "undefined") return true;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function loadOilSales(): OilSaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OilSaleRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveOilSales(records: OilSaleRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(records));
}

export function appendOilSales(records: OilSaleRecord[]): void {
  saveOilSales([...loadOilSales(), ...records]);
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

export type AddOilInput = {
  id?: string;
  name: string;
  oilType: string;
  measureType: OilMeasureType;
  stockQty: number;
  inputUnit: OilInputUnit;
  costTotal: number;
  salePriceTotal: number;
  profitPct: number;
  bottleVolume: string;
  bottleVolumeCustom: string;
  packageType: string;
  photos: string[];
  note: string;
  /** Mevcut stoğa ekle (+) veya düş (-); yeni kayıtta negatif olamaz */
  deltaMode: boolean;
};

export type AddOilResult =
  | { ok: true; items: OilItem[] }
  | { ok: false; error: string };

export function addOrUpdateOilItem(items: OilItem[], input: AddOilInput): AddOilResult {
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

  const existingIdx = input.id
    ? items.findIndex((i) => i.id === input.id)
    : -1;

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
    cur.oilType = input.oilType;
    cur.measureType = input.measureType;
    cur.bottleVolume = input.bottleVolume;
    cur.bottleVolumeCustom = input.bottleVolumeCustom;
    cur.packageType = input.packageType;
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

  const stockBase = input.deltaMode ? deltaBase : deltaBase;
  let costPerBase = 0;
  if (input.costTotal > 0 && stockBase > 0) costPerBase = input.costTotal / stockBase;

  let salePerBase = 0;
  if (input.salePriceTotal > 0 && stockBase > 0) {
    salePerBase = input.salePriceTotal / stockBase;
  } else if (input.profitPct > 0 && costPerBase > 0) {
    salePerBase = costPerBase * (1 + input.profitPct / 100);
  }

  const item: OilItem = {
    id: newId(),
    name: turkishUpper(name),
    oilType: input.oilType,
    measureType: input.measureType,
    stockBase,
    baseUnit: base,
    costPerBase,
    salePerBase,
    profitPct: input.profitPct,
    bottleVolume: input.bottleVolume,
    bottleVolumeCustom: input.bottleVolumeCustom,
    packageType: input.packageType,
    photos: [...input.photos],
    note: input.note,
  };

  return { ok: true, items: [...items, item] };
}

export function calcLineAmounts(
  item: OilItem,
  saleQty: number,
  saleUnit: OilInputUnit,
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

export function deductOilInventory(
  items: OilItem[],
  lines: { productId: string; saleBaseQty: number }[],
): OilItem[] {
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  for (const ln of lines) {
    const it = map.get(ln.productId);
    if (!it) continue;
    it.stockBase = Math.max(0, it.stockBase - ln.saleBaseQty);
  }
  return Array.from(map.values());
}

export function filterOilItems(items: OilItem[], q: string): OilItem[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return items;
  return items.filter(
    (it) =>
      it.name.toLowerCase().includes(ql) ||
      it.oilType.toLowerCase().includes(ql) ||
      it.packageType.toLowerCase().includes(ql),
  );
}

export function sortOilItems(items: OilItem[], mode: string): OilItem[] {
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

export function inventoryStockValue(items: OilItem[]): number {
  return items.reduce((s, it) => s + it.costPerBase * it.stockBase, 0);
}
