/** Masaüstü base.py + inventory.py + pricing_sales.py mantığı (birebir port) */

import {
  calculateCurrencyCost,
  calculateInventoryItemTotals,
} from "@/lib/urun-stok/calculateCurrencyCost";

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
  /** Kümülatif EUR (Supabase: cost_eur / dizi_price_eur) */
  dizi_price_eur: number;
  /** Son kullanılan kurlar (Supabase: usd_rate, eur_rate) */
  usd_rate: number;
  eur_rate: number;
  /** Hesaplanan toplam TL (Supabase: total_cost_try) */
  total_cost_try: number;
  /** Hesaplanan birim TL (Supabase: unit_cost_try) */
  unit_cost_try: number;
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

export function applyItemCostTotals(item: InvItem): InvItem {
  const usdRate = item.usd_rate || 0;
  const eurRate = item.eur_rate || 0;
  const { totalCostTry, unitCostTry } = calculateInventoryItemTotals({
    dizi_price: item.dizi_price,
    dizi_price_usd: item.dizi_price_usd,
    dizi_price_eur: item.dizi_price_eur,
    usd_rate: usdRate,
    eur_rate: eurRate,
    adet: item.adet,
  });
  return {
    ...item,
    total_cost_try: totalCostTry,
    unit_cost_try: unitCostTry ?? 0,
  };
}

function parseInvItem(r: Record<string, unknown>): InvItem {
  const base: InvItem = {
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    adet: toFloat(r.adet, 0),
    dizi_icerik: toFloat(r.dizi_icerik, 0),
    dizi_price: toFloat(r.cost_try ?? r.dizi_price, 0),
    adet_price: toFloat(r.adet_price, 0),
    photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    dizi_price_usd: toFloat(r.cost_usd ?? r.dizi_price_usd, 0),
    dizi_price_eur: toFloat(r.cost_eur ?? r.dizi_price_eur, 0),
    usd_rate: toFloat(r.usd_rate, 0),
    eur_rate: toFloat(r.eur_rate, 0),
    total_cost_try: toFloat(r.total_cost_try, 0),
    unit_cost_try: toFloat(r.unit_cost_try, 0),
  };
  return applyItemCostTotals(base);
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

export function saveInventory(items: InvItem[]): boolean {
  if (typeof window === "undefined") return true;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

/** inventory.json satırı — masaüstü export formatı */
export type InventoryJsonMergeRow = {
  name: string;
  type: string;
  adet: number;
  dizi_icerik: number;
  dizi_price: number;
  adet_price: number;
  photos: string[];
  dizi_price_usd: number;
  dizi_price_eur?: number;
  usd_rate?: number;
  eur_rate?: number;
  total_cost_try?: number;
  unit_cost_try?: number;
};

/**
 * Mevcut envanter + JSON — silme yok.
 * Aynı taş adı + tür: adet, dizi_price, adet_price, dizi_price_usd güncellenir.
 */
export function mergeInventoryJsonRows(
  items: InvItem[],
  incoming: InventoryJsonMergeRow[],
): InvItem[] {
  const map = new Map<string, InvItem>();
  for (const it of items) {
    map.set(itemKey(it.name, it.type), {
      ...it,
      photos: [...(it.photos || [])],
    });
  }

  for (const row of incoming) {
    const name = row.name.trim();
    const type = row.type.trim();
    if (!name) continue;

    const key = itemKey(name, type);
    const photos = Array.isArray(row.photos) ? row.photos : [];
    const existing = map.get(key);

    if (existing) {
      existing.adet = row.adet;
      existing.dizi_icerik = row.dizi_icerik;
      existing.dizi_price = row.dizi_price;
      existing.adet_price = row.adet_price;
      existing.dizi_price_usd = row.dizi_price_usd;
      if (row.dizi_price_eur != null) existing.dizi_price_eur = row.dizi_price_eur;
      if (row.usd_rate != null) existing.usd_rate = row.usd_rate;
      if (row.eur_rate != null) existing.eur_rate = row.eur_rate;
      if (row.total_cost_try != null) existing.total_cost_try = row.total_cost_try;
      if (row.unit_cost_try != null) existing.unit_cost_try = row.unit_cost_try;
      if (photos.length > 0) existing.photos = photos;
      map.set(key, applyItemCostTotals(existing));
      continue;
    }

    map.set(
      key,
      applyItemCostTotals({
        name,
        type,
        adet: row.adet,
        dizi_icerik: row.dizi_icerik,
        dizi_price: row.dizi_price,
        adet_price: row.adet_price,
        photos,
        dizi_price_usd: row.dizi_price_usd,
        dizi_price_eur: row.dizi_price_eur ?? 0,
        usd_rate: row.usd_rate ?? 0,
        eur_rate: row.eur_rate ?? 0,
        total_cost_try: row.total_cost_try ?? 0,
        unit_cost_try: row.unit_cost_try ?? 0,
      }),
    );
  }

  return Array.from(map.values());
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
    return applyItemCostTotals(copy);
  });
  return { items: next, dirty };
}

export type AddItemInput = {
  name: string;
  type: string;
  stokIn: number;
  diziTlIn: number;
  diziUsdIn: number;
  diziEurIn: number;
  usdRateIn: number;
  eurRateIn: number;
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
  const diziEurIn = input.diziEurIn;
  const usdRateIn = input.usdRateIn;
  const eurRateIn = input.eurRateIn;
  const adetTlIn = input.adetTlIn;

  if (stokIn === 0) return { ok: false, error: "0 giremezsiniz." };

  const entryCost = calculateCurrencyCost({
    costTry: diziTlIn,
    costUsd: diziUsdIn,
    costEur: diziEurIn,
    usdRate: usdRateIn,
    eurRate: eurRateIn,
    stockQty: Math.abs(stokIn),
  });
  if (entryCost.errors.length > 0) {
    return { ok: false, error: entryCost.errors[0] };
  }

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
      if (diziEurIn > 0) target.dizi_price_eur = (target.dizi_price_eur || 0) + diziEurIn;
    }

    if (usdRateIn > 0) target.usd_rate = usdRateIn;
    if (eurRateIn > 0) target.eur_rate = eurRateIn;

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
      target.dizi_price_eur = 0;
    }

    if (
      entryCost.unitCostTry != null &&
      entryCost.unitCostTry > 0 &&
      adetTlIn <= 0 &&
      isDiziType
    ) {
      target.adet_price = entryCost.unitCostTry;
    }

    if (input.pendingPhotos.length) {
      target.photos = [...target.photos, ...input.pendingPhotos];
    }

    const next = [...items];
    next[targetIdx] = applyItemCostTotals(target);
    return { ok: true, items: next };
  }

  if (stokIn < 0) return { ok: false, error: "Yeni kayıt için negatif stok girilemez." };

  let stok = stokIn;
  let diziTl = diziTlIn;
  let diziUsd = diziUsdIn;
  let diziEur = diziEurIn;
  let adetTl = adetTlIn;

  if (isDiziType) {
    if (adetTl <= 0 && diziTl > 0 && stok > 0) adetTl = diziTl / stok;
    if (adetTl <= 0 && entryCost.unitCostTry != null && entryCost.unitCostTry > 0) {
      adetTl = entryCost.unitCostTry;
    }
  } else if (entryCost.unitCostTry != null && entryCost.unitCostTry > 0) {
    adetTl = entryCost.unitCostTry;
  }

  const it = applyItemCostTotals({
    name,
    type: typ,
    adet: stok,
    dizi_icerik: 0,
    dizi_price: diziTl,
    dizi_price_usd: diziUsd,
    dizi_price_eur: diziEur,
    usd_rate: usdRateIn,
    eur_rate: eurRateIn,
    adet_price: adetTl,
    photos: [...input.pendingPhotos],
    total_cost_try: 0,
    unit_cost_try: 0,
  });

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
  eurRate = 0,
): { unit: number; currency: string; warning?: string } {
  const rateUsd = usdRate > 0 ? usdRate : it.usd_rate || 0;
  const rateEur = eurRate > 0 ? eurRate : it.eur_rate || 0;
  const costCheck = calculateCurrencyCost({
    costTry: 0,
    costUsd: it.dizi_price_usd,
    costEur: it.dizi_price_eur,
    usdRate: rateUsd,
    eurRate: rateEur,
    stockQty: 1,
  });
  if (costCheck.errors.length > 0) {
    return { unit: 0, currency: "₺", warning: costCheck.errors[0] };
  }

  if ((it.unit_cost_try || 0) > 0) {
    return { unit: it.unit_cost_try, currency: "₺" };
  }

  if (isDizi(it.type)) {
    const icerik = it.adet || 0;
    const { totalCostTry, unitCostTry } = calculateInventoryItemTotals({
      ...it,
      usd_rate: rateUsd,
      eur_rate: rateEur,
    });
    if (unitCostTry != null && unitCostTry > 0) {
      return { unit: unitCostTry, currency: "₺" };
    }
    if (totalCostTry > 0 && icerik > 0) {
      return { unit: totalCostTry / icerik, currency: "₺" };
    }
    if ((it.adet_price || 0) > 0) return { unit: it.adet_price, currency: "₺" };
    return { unit: 0, currency: "₺" };
  }
  return { unit: it.adet_price || it.unit_cost_try || 0, currency: "₺" };
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
        if ((it.dizi_price_eur || 0) > 0) {
          const unitEur = it.dizi_price_eur / beforeQty;
          it.dizi_price_eur = Math.max(0, it.dizi_price_eur - unitEur * sellQty);
        }
        if ((it.dizi_price || 0) > 0) {
          const unitTry = it.dizi_price / beforeQty;
          it.dizi_price = Math.max(0, it.dizi_price - unitTry * sellQty);
        }
      }

      it.adet = Math.max(0, beforeQty - sellQty);
      const refreshed = applyItemCostTotals(it);
      Object.assign(it, refreshed);
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
