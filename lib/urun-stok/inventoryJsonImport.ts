/**
 * Masaüstü inventory.json → web ürün stoku (Doğaltaş)
 *
 * Depolama: localStorage `dogaltas_inventory_v1` (/urun-stok/dogaltas ile aynı)
 * Supabase stok tablosu henüz yok — ileride `dogaltas_inventory` kullanılabilir.
 */

import {
  INVENTORY_STORAGE_KEY,
  itemKey,
  loadInventory,
  mergeInventoryJsonRows,
  normalizeDiziInventory,
  saveInventory,
  toFloat,
} from "@/lib/urun-stok/dogaltasStockLogic";

/** Gelecekte Supabase migration için önerilen tablo adı (şu an aktif değil) */
export const DOGALTAS_INVENTORY_SUPABASE_TABLE = "dogaltas_inventory";

export const DOGALTAS_WEB_STOCK_STORAGE_KEY = INVENTORY_STORAGE_KEY;

export type InventoryJsonRow = {
  name: string;
  type: string;
  adet: number;
  dizi_icerik: number;
  dizi_price: number;
  adet_price: number;
  photos: string[];
  dizi_price_usd: number;
};

export type InventoryJsonParseResult = {
  rows: InventoryJsonRow[];
  error: string | null;
};

export type InventoryJsonImportResult =
  | { ok: true; inserted: number; updated: number; total: number }
  | { ok: false; error: string };

function normalizeJsonRecord(raw: unknown): InventoryJsonRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? r.stone_name ?? "").trim();
  if (!name) return null;
  const type = String(r.type ?? r.stock_type ?? "").trim();
  const photos = Array.isArray(r.photos)
    ? (r.photos as unknown[]).map((p) => String(p)).filter(Boolean)
    : [];
  return {
    name,
    type,
    adet: toFloat(r.adet ?? r.stock_count, 0),
    dizi_icerik: toFloat(r.dizi_icerik, 0),
    dizi_price: toFloat(r.dizi_price ?? r.cost_try, 0),
    adet_price: toFloat(r.adet_price ?? r.unit_cost_try, 0),
    photos,
    dizi_price_usd: toFloat(r.dizi_price_usd ?? r.cost_usd, 0),
  };
}

/** inventory.json — kök dizi veya { inventory: [...] } */
export function parseInventoryJsonPayload(text: string): InventoryJsonParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rows: [], error: "Geçersiz JSON dosyası." };
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.inventory)) list = obj.inventory;
    else if (Array.isArray(obj.items)) list = obj.items;
    else if (Array.isArray(obj.data)) list = obj.data;
  }

  if (list.length === 0) {
    return { rows: [], error: "JSON içinde stok kaydı bulunamadı." };
  }

  const rows: InventoryJsonRow[] = [];
  for (const item of list) {
    const row = normalizeJsonRecord(item);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    return { rows: [], error: "İşlenebilir kayıt yok (name zorunlu)." };
  }

  return { rows, error: null };
}

/**
 * Web stok envanterine birleştir — eski kayıtları silmez;
 * aynı name+type varsa adet ve maliyet alanlarını günceller.
 */
export function importInventoryJsonToWebStock(
  rows: InventoryJsonRow[],
): InventoryJsonImportResult {
  if (typeof window === "undefined") {
    return { ok: false, error: "İçe aktarım yalnızca tarayıcıda çalışır." };
  }

  const before = loadInventory();
  const beforeKeys = new Set(before.map((it) => itemKey(it.name, it.type)));

  const merged = mergeInventoryJsonRows(before, rows);
  const norm = normalizeDiziInventory(merged);
  saveInventory(norm.items);

  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const k = itemKey(r.name, r.type);
    if (beforeKeys.has(k)) updated += 1;
    else inserted += 1;
  }

  return {
    ok: true,
    inserted,
    updated,
    total: norm.items.length,
  };
}
