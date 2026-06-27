/**
 * oilInventoryDb.ts — Yağ ürün/stok kalıcılık katmanı (K-2).
 *
 * Doğaltaş'taki dogaltasInventoryDb deseninin yağ karşılığı:
 *   • Tüm DB erişimi /api/urun-stok/yag güvenli route'undan gider (service_role
 *     yalnızca sunucuda). tenant_id sunucuda oturumdan belirlenir.
 *   • Supabase öncelikli yükleme; DB ulaşılamazsa localStorage yedek.
 *   • localStorage yalnızca aynı tenant önbelleği — DB verisini EZMEZ.
 *   • Manuel eklenen kayıt DB'ye yazılır → sayfa yenilenince kaybolmaz,
 *     cihazlar arası senkron olur.
 *
 * KİMLİK: OilItem.id (oil_…) istemci tarafında üretilen KALICI kimliktir ve
 * satış geçmişi (productId) buna bağlıdır. DB'de client_id kolonunda saklanır;
 * güncelleme/silme için client_id → DB uuid eşlemesi kurulur. dbRowToOilItem,
 * id alanını DB uuid'iyle değil client_id ile doldurur ki id stabil kalsın.
 */

import {
  createOilInventoryRow,
  deleteOilInventoryRow,
  fetchOilInventoryRows,
  updateOilInventoryRow,
} from "@/lib/urun-stok/oilInventoryApi";
import {
  loadOilInventory,
  saveOilInventory,
  toFloat,
  type OilBaseUnit,
  type OilItem,
  type OilMeasureType,
} from "@/lib/urun-stok/oilStockLogic";

const OIL_ACTIVE_TENANT_CACHE_KEY = "oil_inventory_active_tenant_v1";

export type OilInventorySource = "supabase" | "localStorage" | "none";

function setOilActiveTenant(tenantId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OIL_ACTIVE_TENANT_CACHE_KEY, tenantId);
}

function readOilActiveTenant(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(OIL_ACTIVE_TENANT_CACHE_KEY)?.trim();
  return v || null;
}

/** DB satırı (snake_case) → OilItem. id = client_id (stabil istemci kimliği). */
function dbRowToOilItem(row: Record<string, unknown>): OilItem {
  return {
    id: String(row.client_id ?? row.id ?? "").trim(),
    name: String(row.name ?? "").trim(),
    oilType: String(row.oil_type ?? "").trim(),
    measureType: (String(row.measure_type ?? "") as OilMeasureType) || "ML / Litre",
    stockBase: toFloat(row.stock_base, 0),
    baseUnit: (String(row.base_unit ?? "") as OilBaseUnit) || "ml",
    costPerBase: toFloat(row.cost_per_base, 0),
    salePerBase: toFloat(row.sale_per_base, 0),
    profitPct: toFloat(row.profit_pct, 0),
    bottleVolume: String(row.bottle_volume ?? ""),
    bottleVolumeCustom: String(row.bottle_volume_custom ?? ""),
    packageType: String(row.package_type ?? ""),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    note: String(row.note ?? ""),
  };
}

/** OilItem → DB payload (snake_case). tenant_id/id sunucuda eklenir. */
function oilItemToDbPayload(item: OilItem): Record<string, unknown> {
  return {
    client_id: item.id,
    name: item.name,
    oil_type: item.oilType,
    measure_type: item.measureType,
    base_unit: item.baseUnit,
    stock_base: item.stockBase ?? 0,
    cost_per_base: item.costPerBase ?? 0,
    sale_per_base: item.salePerBase ?? 0,
    profit_pct: item.profitPct ?? 0,
    bottle_volume: item.bottleVolume ?? "",
    bottle_volume_custom: item.bottleVolumeCustom ?? "",
    package_type: item.packageType ?? "",
    photos: item.photos ?? [],
    note: item.note ?? "",
  };
}

/** Güvenli API'den ham satırlar (uuid id + client_id). */
async function fetchOilRawRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  return fetchOilInventoryRows();
}

/** client_id → DB uuid eşlemesi (güncelleme/silme için). */
function buildIdByClientId(rows: Record<string, unknown>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const clientId = String(row.client_id ?? "").trim();
    const uuid = String(row.id ?? "").trim();
    if (clientId && uuid) map.set(clientId, uuid);
  }
  return map;
}

/** Bu tenant'ın yağ stok kalemleri (güvenli API). */
export async function fetchOilInventoryFromDb(): Promise<{
  items: OilItem[];
  error: string | null;
}> {
  const { rows, error } = await fetchOilRawRows();
  if (error) return { items: [], error };
  return { items: rows.map(dbRowToOilItem), error: null };
}

/**
 * Supabase öncelikli yükleme.
 *  - tenant yoksa → yalnızca localStorage.
 *  - DB ulaşılamazsa → localStorage yedek (veri kaybı olmaz).
 *  - DB erişilebilir + aynı tenant'ta localStorage-only (eski) kalemler varsa
 *    DB'ye taşınır (best-effort migrasyon) → eski kayıtlar kaybolmaz.
 *  - Farklı tenant önbelleği DB'ye TAŞINMAZ (cross-tenant sızıntı engeli).
 */
export async function loadOilInventoryForTenant(
  sessionTenantId: string | null,
): Promise<{ items: OilItem[]; source: OilInventorySource; error: string | null }> {
  const tid = sessionTenantId?.trim() || null;

  if (!tid) {
    const local = loadOilInventory();
    return {
      items: local,
      source: local.length ? "localStorage" : "none",
      error: null,
    };
  }

  let db = await fetchOilInventoryFromDb();
  if (db.error) {
    // DB ulaşılamadı → localStorage yedek (sessiz veri kaybı olmasın).
    const local = loadOilInventory();
    return { items: local, source: local.length ? "localStorage" : "none", error: db.error };
  }

  // Aynı tenant önbelleği değilse localStorage'ı yok say (başka çalışma alanı).
  const cachedTenant = readOilActiveTenant();
  const local = cachedTenant && cachedTenant !== tid ? [] : loadOilInventory();

  // Eski (localStorage-only) kalemleri DB'ye taşı.
  const dbIds = new Set(db.items.map((it) => it.id));
  const localOnly = local.filter((it) => it.id && !dbIds.has(it.id));
  if (localOnly.length) {
    for (const it of localOnly) {
      const res = await upsertOilInventoryItem(tid, it);
      if (!res.ok) {
        console.warn("[oil_inventory] eski kayıt taşıma hatası:", res.error, it.name);
      }
    }
    const refetch = await fetchOilInventoryFromDb();
    if (!refetch.error) db = refetch;
  }

  setOilActiveTenant(tid);
  saveOilInventory(db.items);
  return { items: db.items, source: "supabase", error: null };
}

/**
 * Manuel "Ekle / Güncelle" — tek yağ kalemini güvenli API'ye yazar.
 * client_id ile mevcut DB satırı varsa günceller; yoksa oluşturur. Böylece
 * manuel eklenen kayıt yenilemede kaybolmaz ve cihazlar arası senkron olur.
 * Demo hesapta server no-op (demo:true) — çağıran yalnızca localStorage'a düşer.
 */
export async function upsertOilInventoryItem(
  tenantId: string,
  item: OilItem,
): Promise<{ ok: boolean; created: boolean; error: string | null; demo?: boolean }> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, created: false, error: "tenant_id boş." };
  if (!item.name?.trim()) return { ok: false, created: false, error: "Ürün adı boş olamaz." };
  if (!item.id?.trim()) return { ok: false, created: false, error: "Kayıt kimliği boş." };

  const { rows, error: rawError } = await fetchOilRawRows();
  if (rawError) return { ok: false, created: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  const payload = oilItemToDbPayload(item);
  const foundUuid = idByClientId.get(item.id);

  if (foundUuid) {
    const { ok, error, demo } = await updateOilInventoryRow(foundUuid, payload);
    return { ok, created: false, error: ok ? null : error ?? "Güncelleme hatası", demo };
  }

  const { ok, error, demo } = await createOilInventoryRow(payload);
  return { ok, created: true, error: ok ? null : error ?? "Ekleme hatası", demo };
}

/**
 * Seçili yağ kalemlerini güvenli API'den siler (client_id → uuid eşlemesiyle).
 * DB'de bulunmayan (yalnız localStorage) kalemler sessizce atlanır.
 */
export async function deleteOilInventoryItems(
  tenantId: string,
  items: OilItem[],
): Promise<{ ok: boolean; deleted: number; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, deleted: 0, error: null };

  const { rows, error: rawError } = await fetchOilRawRows();
  if (rawError) return { ok: false, deleted: 0, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  let deleted = 0;
  let firstError: string | null = null;
  for (const it of items) {
    const uuid = idByClientId.get(it.id);
    if (!uuid) continue; // DB'de yok (eski localStorage-only kalem)
    const { ok, error } = await deleteOilInventoryRow(uuid);
    if (ok) deleted += 1;
    else if (!firstError) firstError = error ?? "Silme hatası";
  }

  return { ok: !firstError, deleted, error: firstError };
}

/**
 * Satış / stok iadesi sonrası DB'deki stok ve fiyat alanlarını günceller.
 * Drift önleme: sayfa yenilenince stok eski haline dönmez.
 * Sadece DB'de kayıtlı (client_id eşleşen) kalemleri günceller; yeni
 * (localStorage-only) kalemler atlanır.
 */
export async function syncOilInventoryToDb(
  tenantId: string,
  items: OilItem[],
): Promise<{ ok: boolean; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, error: null };

  const { rows, error: rawError } = await fetchOilRawRows();
  if (rawError) return { ok: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  let firstError: string | null = null;

  for (const item of items) {
    const uuid = idByClientId.get(item.id);
    if (!uuid) continue;
    const { ok, error } = await updateOilInventoryRow(uuid, {
      stock_base: item.stockBase ?? 0,
      cost_per_base: item.costPerBase ?? 0,
      sale_per_base: item.salePerBase ?? 0,
    });
    if (!ok && !firstError) firstError = error ?? "Güncelleme hatası";
  }

  return { ok: !firstError, error: firstError };
}
