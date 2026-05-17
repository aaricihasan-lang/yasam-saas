/** Masaüstü base.py + inventory.py + pricing_sales.py mantığı (birebir port) */

export const INVENTORY_STORAGE_KEY = "dogaltas_inventory_v1";
export const SALES_STORAGE_KEY = "dogaltas_sales_history_v1";

export const STONE_TYPES = ["8 MM DİZİ", "6 MM DİZİ", "4 MM DİZİ", "10 MM DİZİ", "KÜTLE"] as const;

export type InvItem = {
  name: string;
  type: string;
  adet: number;
  dizi_icerik: number;
  dizi_price: number;
  adet_price: number;
  photos: string[];
  dizi_price_usd: number;
};

export type SaleLine = {
  stone: string;
  type: string;
  currency: string;
  unit: number;
  qty: number;
  line_total: number;
};

export type SaleRecord = {
  name: string;
  lines: SaleLine[];
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

export function itemKey(name: string, type: string): string {
  return `${(name || "").trim().toLowerCase()}|${(type || "").trim().toLowerCase()}`;
}

export function isDizi(t: string): boolean {
  return (t || "").toUpperCase().includes("DİZİ") || (t || "").toUpperCase().includes("DIZI");
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

export function fmtTrim(x: number, maxDec = 4): string {
  let s = x.toFixed(maxDec).replace(/\.?0+$/, "");
  return s || "0";
}

function parseInvItem(r: Record<string, unknown>): InvItem {
  return {
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    adet: toFloat(r.adet, 0),
    dizi_icerik: toFloat(r.dizi_icerik, 0),
    dizi_price: toFloat(r.dizi_price, 0),
    adet_price: toFloat(r.adet_price, 0),
    photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    dizi_price_usd: toFloat(r.dizi_price_usd, 0),
  };
}

export function loadInventory(): InvItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => parseInvItem(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export function saveInventory(items: InvItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
}

export function loadSales(): SaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SaleRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveSales(records: SaleRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(records));
}

export function appendSales(records: SaleRecord[]): void {
  const old = loadSales();
  saveSales([...old, ...records]);
}

/** inventory.py _refresh içindeki DİZİ normalizasyonu */
export function normalizeDiziInventory(items: InvItem[]): { items: InvItem[]; dirty: boolean } {
  let dirty = false;
  const next = items.map((it) => {
    const copy = { ...it, photos: [...(it.photos || [])] };
    if (!isDizi(copy.type)) return copy;
    const qty = copy.adet || 0;
    const unit = copy.adet_price || 0;
    let newTotal = 0;
    if (qty <= 0 || unit <= 0) newTotal = 0;
    else newTotal = Math.round(unit * qty * 100) / 100;
    const oldTotal = copy.dizi_price || 0;
    if (Math.abs(oldTotal - newTotal) > 0.009) {
      copy.dizi_price = newTotal;
      dirty = true;
    }
    return copy;
  });
  return { items: next, dirty };
}

export type AddItemInput = {
  name: string;
  type: string;
  stokIn: number;
  diziTlIn: number;
  diziUsdIn: number;
  adetTlIn: number;
  pendingPhotos: string[];
};

export type AddItemResult =
  | { ok: true; items: InvItem[] }
  | { ok: false; error: string };

export function addOrUpdateInventoryItem(
  items: InvItem[],
  input: AddItemInput,
): AddItemResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Taş adı boş olamaz." };

  const typ = input.type;
  const stokIn = input.stokIn;
  const diziTlIn = input.diziTlIn;
  const diziUsdIn = input.diziUsdIn;
  const adetTlIn = input.adetTlIn;

  if (stokIn === 0) return { ok: false, error: "0 giremezsiniz." };

  const k = itemKey(name, typ);
  const isDiziType = isDizi(typ);
  let targetIdx = items.findIndex((it) => itemKey(it.name, it.type) === k);

  const autoDiziTl = (deltaQty: number, unitTry: number) =>
    deltaQty > 0 && unitTry > 0 ? unitTry * deltaQty : 0;

  if (targetIdx >= 0) {
    const target = { ...items[targetIdx], photos: [...(items[targetIdx].photos || [])] };
    const beforeQty = target.adet || 0;
    const deltaQty = stokIn;

    if (adetTlIn > 0) target.adet_price = adetTlIn;

    if (isDiziType) {
      let addTl = 0;
      if (diziTlIn > 0) {
        addTl = diziTlIn;
        if (adetTlIn <= 0 && deltaQty > 0) target.adet_price = addTl / deltaQty;
      } else {
        addTl = autoDiziTl(deltaQty, target.adet_price || 0);
      }
      if (addTl > 0) target.dizi_price = (target.dizi_price || 0) + addTl;
      if (diziUsdIn > 0) target.dizi_price_usd = (target.dizi_price_usd || 0) + diziUsdIn;
    }

    target.adet = Math.max(0, beforeQty + deltaQty);

    if (isDiziType && adetTlIn > 0) {
      try {
        target.dizi_price = target.adet_price * target.adet;
      } catch {
        /* ignore */
      }
    }

    if (isDiziType && deltaQty < 0 && diziTlIn <= 0 && adetTlIn <= 0) {
      try {
        target.dizi_price = (target.adet_price || 0) * (target.adet || 0);
      } catch {
        /* ignore */
      }
    }

    if (isDiziType && (target.adet || 0) <= 0) {
      target.dizi_price = 0;
      target.dizi_price_usd = 0;
    }

    if (input.pendingPhotos.length) {
      target.photos = [...target.photos, ...input.pendingPhotos];
    }

    const next = [...items];
    next[targetIdx] = target;
    return { ok: true, items: next };
  }

  if (stokIn < 0) return { ok: false, error: "Yeni kayıt için negatif stok girilemez." };

  let stok = stokIn;
  let diziTl = diziTlIn;
  let diziUsd = diziUsdIn;
  let adetTl = adetTlIn;

  if (isDiziType) {
    if (adetTl <= 0 && diziTl > 0 && stok > 0) adetTl = diziTl / stok;
  }

  const it: InvItem = {
    name,
    type: typ,
    adet: stok,
    dizi_icerik: 0,
    dizi_price: diziTl,
    dizi_price_usd: diziUsd,
    adet_price: adetTl,
    photos: [...input.pendingPhotos],
  };

  return { ok: true, items: [...items, it] };
}

export function sortInventory(items: InvItem[], mode: string): InvItem[] {
  const k = (s: string) => (s || "").replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase();
  const rows = [...items];
  switch (mode) {
    case "Taş Adı (Z→A)":
      rows.sort((a, b) => k(b.name).localeCompare(k(a.name), "tr"));
      break;
    case "Tür (A→Z)":
      rows.sort((a, b) => k(a.type).localeCompare(k(b.type), "tr") || k(a.name).localeCompare(k(b.name), "tr"));
      break;
    case "Stok (Az→Çok)":
      rows.sort((a, b) => (a.adet || 0) - (b.adet || 0) || k(a.name).localeCompare(k(b.name), "tr"));
      break;
    case "Stok (Çok→Az)":
      rows.sort((a, b) => (b.adet || 0) - (a.adet || 0) || k(a.name).localeCompare(k(b.name), "tr"));
      break;
    default:
      rows.sort((a, b) => k(a.name).localeCompare(k(b.name), "tr"));
  }
  return rows;
}

export function filterInventory(items: InvItem[], q: string): InvItem[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return items;
  return items.filter(
    (it) => (it.name || "").toLowerCase().includes(ql) || (it.type || "").toLowerCase().includes(ql),
  );
}

export function calcInventoryTotals(items: InvItem[]): { totalTl: number; totalUsd: number } {
  let totalTl = 0;
  let totalUsd = 0;
  for (const it of items) {
    if (isDizi(it.type)) {
      totalTl += it.dizi_price || 0;
      totalUsd += it.dizi_price_usd || 0;
    } else {
      totalTl += (it.adet_price || 0) * (it.adet || 0);
    }
  }
  return { totalTl, totalUsd };
}

export function formatTotalsCard(totalTl: number, totalUsd: number): string {
  const tl = fmtMoney(totalTl);
  if (totalUsd > 0.000001) {
    const usd = `$${totalUsd.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `Toplam Tutar: ${tl} · Toplam $: ${usd}`;
  }
  return `Toplam Tutar: ${tl}`;
}

export function unitCostAndCurrency(
  it: InvItem,
  usdRate: number,
): { unit: number; currency: string; warning?: string } {
  if (isDizi(it.type)) {
    const icerik = it.adet || 0;
    if ((it.dizi_price_usd || 0) > 0) {
      if (usdRate <= 0) {
        return { unit: 0, currency: "$", warning: "Lütfen güncel dolar kuru giriniz." };
      }
      if (icerik > 0) return { unit: (it.dizi_price_usd * usdRate) / icerik, currency: "₺" };
      return { unit: 0, currency: "$" };
    }
    if ((it.dizi_price || 0) > 0 && icerik > 0) {
      return { unit: it.dizi_price / icerik, currency: "₺" };
    }
    if ((it.adet_price || 0) > 0) return { unit: it.adet_price, currency: "₺" };
    return { unit: 0, currency: "₺" };
  }
  return { unit: it.adet_price || 0, currency: "₺" };
}

export function deductInventoryForSales(
  items: InvItem[],
  basket: SaleRecord[],
): InvItem[] {
  const invByKey = new Map<string, InvItem>();
  for (const i of items) {
    invByKey.set(itemKey(i.name, i.type), { ...i, photos: [...(i.photos || [])] });
  }

  for (const rec of basket) {
    for (const line of rec.lines || []) {
      const stone = (line.stone || "").trim();
      const t = (line.type || "").trim();
      const qty = line.qty || 0;
      if (qty <= 0) continue;

      const it = invByKey.get(itemKey(stone, t));
      if (!it) continue;

      const beforeQty = it.adet || 0;
      if (beforeQty <= 0) continue;

      const sellQty = Math.min(qty, beforeQty);

      if (isDizi(it.type)) {
        if ((it.dizi_price_usd || 0) > 0) {
          const unitUsd = it.dizi_price_usd / beforeQty;
          it.dizi_price_usd = Math.max(0, it.dizi_price_usd - unitUsd * sellQty);
        }
        if ((it.dizi_price || 0) > 0) {
          const unitTry = it.dizi_price / beforeQty;
          it.dizi_price = Math.max(0, it.dizi_price - unitTry * sellQty);
        }
      }

      it.adet = Math.max(0, beforeQty - sellQty);
    }
  }

  return Array.from(invByKey.values());
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
