/**
 * Ürün stoku — Supabase public.dogaltas_inventory (öncelikli)
 * localStorage yalnızca önbellek / tablo yoksa yedek
 */

import { supabase } from "@/lib/supabase";
import {
  INVENTORY_STORAGE_KEY,
  itemKey,
  mergeInventoryJsonRows,
  normalizeDiziInventory,
  saveInventory,
  toFloat,
  type InvItem,
  type InventoryJsonMergeRow,
} from "@/lib/urun-stok/dogaltasStockLogic";

export const DOGALTAS_INVENTORY_TABLE = "dogaltas_inventory";

const ACTIVE_TENANT_CACHE_KEY = "dogaltas_inventory_active_tenant_v1";

const SELECT_COLUMNS =
  "id, tenant_id, name, type, adet, dizi_icerik, dizi_price, adet_price, dizi_price_usd, dizi_price_eur, photos, usd_rate, eur_rate, total_cost_try, unit_cost_try";

export type DogaltasInventoryDbRow = {
  id?: string;
  tenant_id: string;
  name: string;
  type: string;
  adet: number;
  dizi_icerik: number;
  dizi_price: number;
  adet_price: number;
  dizi_price_usd: number;
  dizi_price_eur: number;
  photos: string[];
  usd_rate: number;
  eur_rate: number;
  total_cost_try: number;
  unit_cost_try: number;
};

function dbRowToInvItem(row: Record<string, unknown>): InvItem {
  return {
    name: String(row.name ?? "").trim(),
    type: String(row.type ?? "").trim(),
    adet: toFloat(row.adet, 0),
    dizi_icerik: toFloat(row.dizi_icerik, 0),
    dizi_price: toFloat(row.dizi_price, 0),
    adet_price: toFloat(row.adet_price, 0),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    dizi_price_usd: toFloat(row.dizi_price_usd, 0),
    dizi_price_eur: toFloat(row.dizi_price_eur, 0),
    usd_rate: toFloat(row.usd_rate, 0),
    eur_rate: toFloat(row.eur_rate, 0),
    total_cost_try: toFloat(row.total_cost_try, 0),
    unit_cost_try: toFloat(row.unit_cost_try, 0),
  };
}

function invItemToDbPayload(tenantId: string, item: InvItem): Omit<DogaltasInventoryDbRow, "id"> {
  return {
    tenant_id: tenantId,
    name: item.name,
    type: item.type,
    adet: item.adet ?? 0,
    dizi_icerik: item.dizi_icerik ?? 0,
    dizi_price: item.dizi_price ?? 0,
    adet_price: item.adet_price ?? 0,
    dizi_price_usd: item.dizi_price_usd ?? 0,
    dizi_price_eur: item.dizi_price_eur ?? 0,
    photos: item.photos ?? [],
    usd_rate: item.usd_rate ?? 0,
    eur_rate: item.eur_rate ?? 0,
    total_cost_try: item.total_cost_try ?? 0,
    unit_cost_try: item.unit_cost_try ?? 0,
  };
}

function setActiveTenantCache(tenantId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_TENANT_CACHE_KEY, tenantId);
}

function readActiveTenantCache(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(ACTIVE_TENANT_CACHE_KEY)?.trim();
  return v || null;
}

/** Supabase'ten tenant envanteri — hata/boşta [] */
export async function fetchDogaltasInventoryFromDb(
  tenantId: string,
): Promise<{ items: InvItem[]; error: string | null; fromDb: boolean }> {
  const tid = tenantId.trim();
  if (!tid) {
    return { items: [], error: "tenant_id gerekli.", fromDb: false };
  }

  const { data, error } = await supabase
    .from(DOGALTAS_INVENTORY_TABLE)
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tid);

  if (error) {
    console.warn("[dogaltas_inventory] okuma:", error.message);
    return { items: [], error: error.message, fromDb: false };
  }

  const items = (data ?? []).map((row) =>
    dbRowToInvItem(row as Record<string, unknown>),
  );
  return { items, error: null, fromDb: items.length > 0 };
}

/**
 * JSON import birleştirme + Supabase kayıt (silme yok, name+type güncelleme).
 */
export async function upsertDogaltasInventoryFromJson(
  tenantId: string,
  incoming: InventoryJsonMergeRow[],
): Promise<
  | { ok: true; inserted: number; updated: number; total: number; tenantId: string }
  | { ok: false; error: string }
> {
  const tid = tenantId.trim();
  if (!tid) {
    return { ok: false, error: "tenant_id gerekli. Lütfen oturumda çalışma alanı tanımlı olsun." };
  }

  const { items: existing, error: readError } = await fetchDogaltasInventoryFromDb(tid);
  if (readError && existing.length === 0) {
    // Tablo yok veya RLS — yine de local birleştirme dene
    console.warn("[dogaltas_inventory] mevcut okunamadı:", readError);
  }

  const beforeKeys = new Set(existing.map((it) => itemKey(it.name, it.type)));
  const merged = mergeInventoryJsonRows(existing, incoming);
  const norm = normalizeDiziInventory(merged);
  const items = norm.items;

  let inserted = 0;
  let updated = 0;
  for (const row of incoming) {
    const k = itemKey(row.name, row.type);
    if (beforeKeys.has(k)) updated += 1;
    else inserted += 1;
  }

  for (const item of items) {
    const payload = invItemToDbPayload(tid, item);
    const { data: found, error: findError } = await supabase
      .from(DOGALTAS_INVENTORY_TABLE)
      .select("id")
      .eq("tenant_id", tid)
      .eq("name", item.name)
      .eq("type", item.type)
      .maybeSingle();

    if (findError) {
      return { ok: false, error: findError.message };
    }

    if (found?.id) {
      const { error: updateError } = await supabase
        .from(DOGALTAS_INVENTORY_TABLE)
        .update(payload)
        .eq("id", found.id);
      if (updateError) {
        return { ok: false, error: updateError.message };
      }
    } else {
      const { error: insertError } = await supabase
        .from(DOGALTAS_INVENTORY_TABLE)
        .insert(payload);
      if (insertError) {
        return { ok: false, error: insertError.message };
      }
    }
  }

  setActiveTenantCache(tid);
  saveInventory(items);

  console.log("[dogaltas_inventory] import tamam", {
    tenant_id: tid,
    inserted,
    updated,
    total: items.length,
  });

  return { ok: true, inserted, updated, total: items.length, tenantId: tid };
}

/** Supabase öncelikli; yoksa aynı tenant için localStorage önbellek */
export async function loadDogaltasInventoryForTenant(
  tenantId: string | null,
): Promise<{ items: InvItem[]; source: "supabase" | "localStorage" | "none"; tenantId: string | null }> {
  const tid = tenantId?.trim() || null;

  if (tid) {
    const db = await fetchDogaltasInventoryFromDb(tid);
    if (db.items.length > 0) {
      setActiveTenantCache(tid);
      saveInventory(db.items);
      return { items: db.items, source: "supabase", tenantId: tid };
    }
    if (db.error) {
      console.warn("[dogaltas_inventory] Supabase boş/hata, localStorage deneniyor:", db.error);
    }
  }

  if (typeof window !== "undefined") {
    const cachedTenant = readActiveTenantCache();
    if (tid && cachedTenant === tid) {
      try {
        const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            const items = parsed.map((r) =>
              dbRowToInvItem(r as Record<string, unknown>),
            );
            return { items, source: "localStorage", tenantId: tid };
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { items: [], source: "none", tenantId: tid };
}
