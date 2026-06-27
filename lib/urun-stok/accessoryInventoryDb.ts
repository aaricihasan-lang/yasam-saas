/**
 * accessoryInventoryDb.ts — Tespih/Takı/Aksesuar ürün-stok kalıcılık katmanı (K-2).
 *
 * Yağ/Sabun-Krem (oilInventoryDb / soapCreamInventoryDb) deseninin aksesuar
 * karşılığı:
 *   • Tüm DB erişimi /api/urun-stok/aksesuar güvenli route'undan gider
 *     (service_role yalnızca sunucuda). tenant_id sunucuda oturumdan.
 *   • Supabase öncelikli yükleme; DB ulaşılamazsa localStorage yedek.
 *   • localStorage yalnızca aynı tenant önbelleği — DB verisini EZMEZ.
 *   • Manuel eklenen kayıt DB'ye yazılır → sayfa yenilenince kaybolmaz,
 *     cihazlar arası senkron olur.
 *
 * KİMLİK: AccessoryItem.id (acc_…) istemci tarafında üretilen KALICI kimliktir
 * ve satış geçmişi (productId) buna bağlıdır. DB'de client_id kolonunda
 * saklanır; güncelleme/silme için client_id → DB uuid eşlemesi kurulur.
 */

import {
  createAccessoryInventoryRow,
  deleteAccessoryInventoryRow,
  fetchAccessoryInventoryRows,
  updateAccessoryInventoryRow,
} from "@/lib/urun-stok/accessoryInventoryApi";
import {
  loadAccessoryInventory,
  saveAccessoryInventory,
  toFloat,
  type AccessoryItem,
} from "@/lib/urun-stok/accessoryStockLogic";

const ACC_ACTIVE_TENANT_CACHE_KEY = "accessory_inventory_active_tenant_v1";

export type AccessoryInventorySource = "supabase" | "localStorage" | "none";

function setAccActiveTenant(tenantId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACC_ACTIVE_TENANT_CACHE_KEY, tenantId);
}

function readAccActiveTenant(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(ACC_ACTIVE_TENANT_CACHE_KEY)?.trim();
  return v || null;
}

/** DB satırı (snake_case) → AccessoryItem. id = client_id (stabil istemci kimliği). */
function dbRowToAccItem(row: Record<string, unknown>): AccessoryItem {
  return {
    id: String(row.client_id ?? row.id ?? "").trim(),
    name: String(row.name ?? "").trim(),
    productGroup: String(row.product_group ?? ""),
    productModel: String(row.product_model ?? ""),
    material: String(row.material ?? ""),
    color: String(row.color ?? ""),
    sizeKind: String(row.size_kind ?? "standart"),
    sizeDetail: String(row.size_detail ?? ""),
    stockQty: toFloat(row.stock_qty, 0),
    costPerUnit: toFloat(row.cost_per_unit, 0),
    salePerUnit: toFloat(row.sale_per_unit, 0),
    profitPct: toFloat(row.profit_pct, 0),
    barcode: String(row.barcode ?? ""),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    note: String(row.note ?? ""),
  };
}

/** AccessoryItem → DB payload (snake_case). tenant_id/id sunucuda eklenir. */
function accItemToDbPayload(item: AccessoryItem): Record<string, unknown> {
  return {
    client_id: item.id,
    name: item.name,
    product_group: item.productGroup,
    product_model: item.productModel,
    material: item.material,
    color: item.color,
    size_kind: item.sizeKind,
    size_detail: item.sizeDetail,
    stock_qty: item.stockQty ?? 0,
    cost_per_unit: item.costPerUnit ?? 0,
    sale_per_unit: item.salePerUnit ?? 0,
    profit_pct: item.profitPct ?? 0,
    barcode: item.barcode ?? "",
    photos: item.photos ?? [],
    note: item.note ?? "",
  };
}

/** Güvenli API'den ham satırlar (uuid id + client_id). */
async function fetchAccRawRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  return fetchAccessoryInventoryRows();
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

/** Bu tenant'ın aksesuar stok kalemleri (güvenli API). */
export async function fetchAccessoryInventoryFromDb(): Promise<{
  items: AccessoryItem[];
  error: string | null;
}> {
  const { rows, error } = await fetchAccRawRows();
  if (error) return { items: [], error };
  return { items: rows.map(dbRowToAccItem), error: null };
}

/**
 * Supabase öncelikli yükleme.
 *  - tenant yoksa → yalnızca localStorage.
 *  - DB ulaşılamazsa → localStorage yedek (veri kaybı olmaz).
 *  - DB erişilebilir + aynı tenant'ta localStorage-only (eski) kalemler varsa
 *    DB'ye taşınır (best-effort migrasyon) → eski kayıtlar kaybolmaz.
 *  - Farklı tenant önbelleği DB'ye TAŞINMAZ (cross-tenant sızıntı engeli).
 */
export async function loadAccessoryInventoryForTenant(
  sessionTenantId: string | null,
): Promise<{ items: AccessoryItem[]; source: AccessoryInventorySource; error: string | null }> {
  const tid = sessionTenantId?.trim() || null;

  if (!tid) {
    const local = loadAccessoryInventory();
    return { items: local, source: local.length ? "localStorage" : "none", error: null };
  }

  let db = await fetchAccessoryInventoryFromDb();
  if (db.error) {
    // DB ulaşılamadı → localStorage yedek (sessiz veri kaybı olmasın).
    const local = loadAccessoryInventory();
    return { items: local, source: local.length ? "localStorage" : "none", error: db.error };
  }

  // Aynı tenant önbelleği değilse localStorage'ı yok say (başka çalışma alanı).
  const cachedTenant = readAccActiveTenant();
  const local = cachedTenant && cachedTenant !== tid ? [] : loadAccessoryInventory();

  // Eski (localStorage-only) kalemleri DB'ye taşı.
  const dbIds = new Set(db.items.map((it) => it.id));
  const localOnly = local.filter((it) => it.id && !dbIds.has(it.id));
  if (localOnly.length) {
    for (const it of localOnly) {
      const res = await upsertAccessoryInventoryItem(tid, it);
      if (!res.ok) {
        console.warn("[accessory_inventory] eski kayıt taşıma hatası:", res.error, it.name);
      }
    }
    const refetch = await fetchAccessoryInventoryFromDb();
    if (!refetch.error) db = refetch;
  }

  setAccActiveTenant(tid);
  saveAccessoryInventory(db.items);
  return { items: db.items, source: "supabase", error: null };
}

/**
 * Manuel "Ekle / Güncelle" — tek aksesuar kalemini güvenli API'ye yazar.
 * client_id ile mevcut DB satırı varsa günceller; yoksa oluşturur. Böylece
 * manuel eklenen kayıt yenilemede kaybolmaz ve cihazlar arası senkron olur.
 * Demo hesapta server no-op (demo:true) — çağıran yalnızca localStorage'a düşer.
 */
export async function upsertAccessoryInventoryItem(
  tenantId: string,
  item: AccessoryItem,
): Promise<{ ok: boolean; created: boolean; error: string | null; demo?: boolean }> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, created: false, error: "tenant_id boş." };
  if (!item.name?.trim()) return { ok: false, created: false, error: "Ürün adı boş olamaz." };
  if (!item.id?.trim()) return { ok: false, created: false, error: "Kayıt kimliği boş." };

  const { rows, error: rawError } = await fetchAccRawRows();
  if (rawError) return { ok: false, created: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  const payload = accItemToDbPayload(item);
  const foundUuid = idByClientId.get(item.id);

  if (foundUuid) {
    const { ok, error, demo } = await updateAccessoryInventoryRow(foundUuid, payload);
    return { ok, created: false, error: ok ? null : error ?? "Güncelleme hatası", demo };
  }

  const { ok, error, demo } = await createAccessoryInventoryRow(payload);
  return { ok, created: true, error: ok ? null : error ?? "Ekleme hatası", demo };
}

/**
 * Seçili aksesuar kalemlerini güvenli API'den siler (client_id → uuid eşlemesiyle).
 * DB'de bulunmayan (yalnız localStorage) kalemler sessizce atlanır.
 */
export async function deleteAccessoryInventoryItems(
  tenantId: string,
  items: AccessoryItem[],
): Promise<{ ok: boolean; deleted: number; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, deleted: 0, error: null };

  const { rows, error: rawError } = await fetchAccRawRows();
  if (rawError) return { ok: false, deleted: 0, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  let deleted = 0;
  let firstError: string | null = null;
  for (const it of items) {
    const uuid = idByClientId.get(it.id);
    if (!uuid) continue; // DB'de yok (eski localStorage-only kalem)
    const { ok, error } = await deleteAccessoryInventoryRow(uuid);
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
export async function syncAccessoryInventoryToDb(
  tenantId: string,
  items: AccessoryItem[],
): Promise<{ ok: boolean; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, error: null };

  const { rows, error: rawError } = await fetchAccRawRows();
  if (rawError) return { ok: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  let firstError: string | null = null;

  for (const item of items) {
    const uuid = idByClientId.get(item.id);
    if (!uuid) continue;
    const { ok, error } = await updateAccessoryInventoryRow(uuid, {
      stock_qty: item.stockQty ?? 0,
      cost_per_unit: item.costPerUnit ?? 0,
      sale_per_unit: item.salePerUnit ?? 0,
    });
    if (!ok && !firstError) firstError = error ?? "Güncelleme hatası";
  }

  return { ok: !firstError, error: firstError };
}
