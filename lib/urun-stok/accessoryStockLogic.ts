/** Tespih / takı / aksesuar — stok ve satış adet bazlı */

export const INVENTORY_STORAGE_KEY = "accessory_inventory_v1";
export const SALES_STORAGE_KEY = "accessory_sales_history_v1";

export const PRODUCT_GROUPS = [
  "Tespih",
  "Bileklik",
  "Kolye",
  "Küpe",
  "Yüzük",
  "Anahtarlık",
  "Takı Seti",
  "Aksesuar",
  "Diğer",
] as const;

export const MATERIALS = [
  "doğal taş",
  "gümüş",
  "çelik",
  "ip",
  "deri",
  "ahşap",
  "cam",
  "karışık",
  "diğer",
] as const;

export const SIZE_KINDS = [
  "yüzük ölçüsü",
  "bileklik cm",
  "kolye cm",
  "tespih tane sayısı",
  "standart",
] as const;

export type AccessoryItem = {
  id: string;
  name: string;
  productGroup: string;
  productModel: string;
  material: string;
  color: string;
  sizeKind: string;
  sizeDetail: string;
  stockQty: number;
  costPerUnit: number;
  salePerUnit: number;
  profitPct: number;
  barcode: string;
  photos: string[];
  note: string;
};

export type AccessorySaleLine = {
  productId: string;
  productName: string;
  productGroup: string;
  saleQty: number;
  lineCost: number;
  lineSale: number;
};

export type AccessorySaleRecord = {
  name: string;
  lines: AccessorySaleLine[];
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

export function fmtQty(x: number, maxDec = 0): string {
  const s = x.toFixed(maxDec).replace(/\.?0+$/, "");
  return s || "0";
}

export function formatSizeLabel(item: AccessoryItem): string {
  const d = (item.sizeDetail || "").trim();
  const k = (item.sizeKind || "").trim();
  if (d && k && k !== "standart") return `${d} · ${k}`;
  if (d) return d;
  if (k) return k;
  return "—";
}

export function formatVariantLabel(item: AccessoryItem): string {
  const parts = [item.name, formatSizeLabel(item), item.color].filter(
    (p) => p && p !== "—",
  );
  return parts.join(" | ");
}

export function formatStockDisplay(item: AccessoryItem): string {
  return `${fmtQty(item.stockQty, 0)} adet`;
}

export function fmtUnitCost(perUnit: number): string {
  return `${fmtMoney(perUnit)} / adet`;
}

export function costPerUnitFromTotal(costTotal: number, qty: number): number | null {
  if (costTotal <= 0 || qty <= 0) return null;
  return costTotal / qty;
}

export function salePerUnitFromTotal(saleTotal: number, qty: number): number | null {
  if (saleTotal <= 0 || qty <= 0) return null;
  return saleTotal / qty;
}

export function salePerUnitWithProfit(costPerUnit: number, profitPct: number): number {
  if (costPerUnit <= 0) return 0;
  return costPerUnit * (1 + profitPct / 100);
}

export function formatLineCostBreakdown(
  costPerUnit: number,
  saleQty: number,
  lineCost: number,
): string {
  return `${fmtQty(saleQty, 0)} adet × ${fmtUnitCost(costPerUnit)} = ${fmtMoney(lineCost)}`;
}

function newId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseItem(r: Record<string, unknown>): AccessoryItem {
  return {
    id: String(r.id ?? newId()),
    name: String(r.name ?? ""),
    productGroup: String(r.productGroup ?? ""),
    productModel: String(r.productModel ?? ""),
    material: String(r.material ?? ""),
    color: String(r.color ?? ""),
    sizeKind: String(r.sizeKind ?? "standart"),
    sizeDetail: String(r.sizeDetail ?? ""),
    stockQty: toFloat(r.stockQty, 0),
    costPerUnit: toFloat(r.costPerUnit, 0),
    salePerUnit: toFloat(r.salePerUnit, 0),
    profitPct: toFloat(r.profitPct, 0),
    barcode: String(r.barcode ?? ""),
    photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    note: String(r.note ?? ""),
  };
}

export function loadAccessoryInventory(): AccessoryItem[] {
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

export function saveAccessoryInventory(items: AccessoryItem[]): boolean {
  if (typeof window === "undefined") return true;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function loadAccessorySales(): AccessorySaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AccessorySaleRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveAccessorySales(records: AccessorySaleRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(records));
}

export function appendAccessorySales(records: AccessorySaleRecord[]): void {
  saveAccessorySales([...loadAccessorySales(), ...records]);
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

export type AddAccessoryInput = {
  id?: string;
  name: string;
  productGroup: string;
  productModel: string;
  material: string;
  color: string;
  sizeKind: string;
  sizeDetail: string;
  stockQty: number;
  costTotal: number;
  salePriceTotal: number;
  profitPct: number;
  barcode: string;
  photos: string[];
  note: string;
  deltaMode: boolean;
};

export type AddAccessoryResult =
  | { ok: true; items: AccessoryItem[] }
  | { ok: false; error: string };

export function addOrUpdateAccessoryItem(
  items: AccessoryItem[],
  input: AddAccessoryInput,
): AddAccessoryResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Ürün adı boş olamaz." };

  const deltaQty = input.stockQty;
  if (input.deltaMode && deltaQty === 0) {
    return { ok: false, error: "Stok adedi 0 olamaz." };
  }

  const existingIdx = input.id ? items.findIndex((i) => i.id === input.id) : -1;

  if (existingIdx >= 0) {
    const cur = { ...items[existingIdx], photos: [...items[existingIdx].photos] };
    const before = cur.stockQty;
    const delta = input.deltaMode ? deltaQty : deltaQty - before;

    if (!input.deltaMode) {
      cur.stockQty = deltaQty;
    } else {
      const next = before + delta;
      if (next < 0) return { ok: false, error: "Stok eksiye düşemez." };
      cur.stockQty = next;
    }

    if (input.costTotal > 0 && delta > 0) {
      const addCost = input.costTotal / delta;
      cur.costPerUnit =
        before + delta > 0
          ? (before * cur.costPerUnit + delta * addCost) / (before + delta)
          : addCost;
    }

    if (input.salePriceTotal > 0 && (input.deltaMode ? delta : cur.stockQty) > 0) {
      const q = input.deltaMode ? delta : cur.stockQty;
      cur.salePerUnit = input.salePriceTotal / q;
    } else if (input.profitPct > 0 && cur.costPerUnit > 0) {
      cur.salePerUnit = cur.costPerUnit * (1 + input.profitPct / 100);
    }

    cur.profitPct = input.profitPct;
    cur.name = turkishUpper(name);
    cur.productGroup = input.productGroup;
    cur.productModel = input.productModel;
    cur.material = input.material;
    cur.color = input.color;
    cur.sizeKind = input.sizeKind;
    cur.sizeDetail = input.sizeDetail;
    cur.barcode = input.barcode;
    cur.note = input.note;
    if (input.photos.length) cur.photos = [...cur.photos, ...input.photos];

    const next = [...items];
    next[existingIdx] = cur;
    return { ok: true, items: next };
  }

  if (!input.deltaMode && deltaQty < 0) {
    return { ok: false, error: "Yeni kayıt için negatif stok girilemez." };
  }
  if (deltaQty <= 0 && input.deltaMode) {
    return { ok: false, error: "Yeni kayıt için pozitif stok adedi girin." };
  }

  const stockQty = deltaQty;
  let costPerUnit = 0;
  if (input.costTotal > 0 && stockQty > 0) costPerUnit = input.costTotal / stockQty;

  let salePerUnit = 0;
  if (input.salePriceTotal > 0 && stockQty > 0) {
    salePerUnit = input.salePriceTotal / stockQty;
  } else if (input.profitPct > 0 && costPerUnit > 0) {
    salePerUnit = costPerUnit * (1 + input.profitPct / 100);
  }

  const item: AccessoryItem = {
    id: newId(),
    name: turkishUpper(name),
    productGroup: input.productGroup,
    productModel: input.productModel,
    material: input.material,
    color: input.color,
    sizeKind: input.sizeKind,
    sizeDetail: input.sizeDetail,
    stockQty,
    costPerUnit,
    salePerUnit,
    profitPct: input.profitPct,
    barcode: input.barcode,
    photos: [...input.photos],
    note: input.note,
  };

  return { ok: true, items: [...items, item] };
}

export function calcLineAmounts(
  item: AccessoryItem,
  saleQty: number,
): {
  saleQty: number;
  lineCost: number;
  lineSale: number;
  costPerUnit: number;
  salePerUnit: number;
} | { error: string } {
  const qty = Math.floor(saleQty);
  if (qty <= 0) return { error: "Satılacak adet 0'dan büyük olmalı." };
  if (qty > item.stockQty) {
    return { error: `Yetersiz stok. Mevcut: ${formatStockDisplay(item)}` };
  }
  const lineCost = item.costPerUnit * qty;
  const lineSale = item.salePerUnit * qty;
  return {
    saleQty: qty,
    lineCost,
    lineSale,
    costPerUnit: item.costPerUnit,
    salePerUnit: item.salePerUnit,
  };
}

export function deductAccessoryInventory(
  items: AccessoryItem[],
  lines: { productId: string; saleQty: number }[],
): AccessoryItem[] {
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  for (const ln of lines) {
    const it = map.get(ln.productId);
    if (!it) continue;
    it.stockQty = Math.max(0, it.stockQty - ln.saleQty);
  }
  return Array.from(map.values());
}

export function filterAccessoryItems(items: AccessoryItem[], q: string): AccessoryItem[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return items;
  return items.filter(
    (it) =>
      it.name.toLowerCase().includes(ql) ||
      it.productGroup.toLowerCase().includes(ql) ||
      it.productModel.toLowerCase().includes(ql) ||
      it.material.toLowerCase().includes(ql) ||
      it.color.toLowerCase().includes(ql) ||
      it.sizeDetail.toLowerCase().includes(ql) ||
      it.barcode.toLowerCase().includes(ql),
  );
}

export function sortAccessoryItems(items: AccessoryItem[], mode: string): AccessoryItem[] {
  const rows = [...items];
  const k = (s: string) => (s || "").replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase();
  switch (mode) {
    case "Ürün (Z→A)":
      rows.sort((a, b) => k(b.name).localeCompare(k(a.name), "tr"));
      break;
    case "Stok (Az→Çok)":
      rows.sort((a, b) => a.stockQty - b.stockQty);
      break;
    case "Stok (Çok→Az)":
      rows.sort((a, b) => b.stockQty - a.stockQty);
      break;
    default:
      rows.sort((a, b) => k(a.name).localeCompare(k(b.name), "tr"));
  }
  return rows;
}

export function inventoryStockValue(items: AccessoryItem[]): number {
  return items.reduce((s, it) => s + it.costPerUnit * it.stockQty, 0);
}

export function countSoldUnits(records: AccessorySaleRecord[]): number {
  return records.reduce(
    (s, r) => s + r.lines.reduce((ls, ln) => ls + ln.saleQty, 0),
    0,
  );
}
