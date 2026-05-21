/**
 * Masaüstü inventory.json → web ürün stoku
 * Öncelik: Supabase public.dogaltas_inventory (tenant_id ile)
 * Yedek: localStorage dogaltas_inventory_v1 (aynı tenant önbelleği)
 */

import {
  DOGALTAS_INVENTORY_TABLE,
  upsertDogaltasInventoryFromJson,
} from "@/lib/urun-stok/dogaltasInventoryDb";
import { toFloat } from "@/lib/urun-stok/dogaltasStockLogic";

import { INVENTORY_STORAGE_KEY } from "@/lib/urun-stok/dogaltasStockLogic";

export const DOGALTAS_INVENTORY_SUPABASE_TABLE = DOGALTAS_INVENTORY_TABLE;
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
  dizi_price_eur?: number;
  usd_rate?: number;
  eur_rate?: number;
  total_cost_try?: number;
  unit_cost_try?: number;
};

export type InventoryJsonParseResult = {
  rows: InventoryJsonRow[];
  error: string | null;
};

export type InventoryJsonImportResult =
  | {
      ok: true;
      inserted: number;
      updated: number;
      total: number;
      tenantId: string;
      supabaseVerifiedCount: number;
    }
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
    dizi_price_eur: toFloat(r.dizi_price_eur ?? r.cost_eur, 0),
    usd_rate: toFloat(r.usd_rate, 0),
    eur_rate: toFloat(r.eur_rate, 0),
    total_cost_try: toFloat(r.total_cost_try, 0),
    unit_cost_try: toFloat(r.unit_cost_try, 0),
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

function toMergeRows(rows: InventoryJsonRow[]) {
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    adet: row.adet,
    dizi_icerik: row.dizi_icerik,
    dizi_price: row.dizi_price,
    adet_price: row.adet_price,
    photos: row.photos,
    dizi_price_usd: row.dizi_price_usd,
    dizi_price_eur: row.dizi_price_eur ?? 0,
    usd_rate: row.usd_rate ?? 0,
    eur_rate: row.eur_rate ?? 0,
    total_cost_try: row.total_cost_try ?? 0,
    unit_cost_try: row.unit_cost_try ?? 0,
  }));
}

/**
 * Web stok — Supabase dogaltas_inventory + localStorage önbellek.
 */
export async function importInventoryJsonToWebStock(
  rows: InventoryJsonRow[],
  tenantId: string,
): Promise<InventoryJsonImportResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "İçe aktarım yalnızca tarayıcıda çalışır." };
  }

  const tid = tenantId.trim();
  if (!tid) {
    return {
      ok: false,
      error: "tenant_id gerekli. Admin oturumunda çalışma alanı tanımlı olmalı.",
    };
  }

  console.log("[stok-json] import başlıyor tenant_id=", tid, "kayıt=", rows.length);

  const result = await upsertDogaltasInventoryFromJson(tid, toMergeRows(rows));
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    inserted: result.inserted,
    updated: result.updated,
    total: result.total,
    tenantId: result.tenantId,
    supabaseVerifiedCount: result.supabaseVerifiedCount,
  };
}
