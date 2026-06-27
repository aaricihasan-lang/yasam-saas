/**
 * otherInventoryDb.ts — Diğer Ürünler ürün-stok kalıcılık katmanı (K-2).
 *
 * Yağ/Sabun-Krem/Aksesuar deseninin "diğer ürünler" karşılığı:
 *   • Tüm DB erişimi /api/urun-stok/diger güvenli route'undan gider
 *     (service_role yalnızca sunucuda). tenant_id sunucuda oturumdan.
 *   • Supabase öncelikli yükleme; DB ulaşılamazsa localStorage yedek.
 *   • localStorage yalnızca aynı tenant önbelleği — DB verisini EZMEZ.
 *   • Manuel eklenen kayıt DB'ye yazılır → sayfa yenilenince kaybolmaz,
 *     cihazlar arası senkron olur.
 *
 * KİMLİK: OtherItem.id (oth_…) istemci tarafında üretilen KALICI kimliktir ve
 * satış geçmişi (productId) buna bağlıdır. DB'de client_id kolonunda saklanır;
 * güncelleme/silme için client_id → DB uuid eşlemesi kurulur.
 */

import {
  createOtherInventoryRow,
  deleteOtherInventoryRow,
  fetchOtherInventoryRows,
  updateOtherInventoryRow,
} from "@/lib/urun-stok/otherInventoryApi";
import {
  loadOtherInventory,
  saveOtherInventory,
  toFloat,
  type OtBaseUnit,
  type OtMeasureType,
  type OtherItem,
} from "@/lib/urun-stok/otherStockLogic";

const OTHER_ACTIVE_TENANT_CACHE_KEY = "other_inventory_active_tenant_v1";

export type OtherInventorySource = "supabase" | "localStorage" | "none";

function setOtherActiveTenant(tenantId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OTHER_ACTIVE_TENANT_CACHE_KEY, tenantId);
}

function readOtherActiveTenant(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(OTHER_ACTIVE_TENANT_CACHE_KEY)?.trim();
  return v || null;
}

/** DB satırı (snake_case) → OtherItem. id = client_id (stabil istemci kimliği). */
function dbRowToOtherItem(row: Record<string, unknown>): OtherItem {
  return {
    id: String(row.client_id ?? row.id ?? "").trim(),
    name: String(row.name ?? "").trim(),
    productGroup: String(row.product_group ?? ""),
    subCategory: String(row.sub_category ?? ""),
    measureType: (String(row.measure_type ?? "") as OtMeasureType) || "Adet",
    stockBase: toFloat(row.stock_base, 0),
    baseUnit: (String(row.base_unit ?? "") as OtBaseUnit) || "adet",
    costPerBase: toFloat(row.cost_per_base, 0),
    salePerBase: toFloat(row.sale_per_base, 0),
    profitPct: toFloat(row.profit_pct, 0),
    variationKind: String(row.variation_kind ?? "özel"),
    variationDetail: String(row.variation_detail ?? ""),
    barcode: String(row.barcode ?? ""),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    note: String(row.note ?? ""),
  };
}

/** OtherItem → DB payload (snake_case). tenant_id/id sunucuda eklenir. */
function otherItemToDbPayload(item: OtherItem): Record<string, unknown> {
  return {
    client_id: item.id,
    name: item.name,
    product_group: item.productGroup,
    sub_category: item.subCategory,
    measure_type: item.measureType,
    base_unit: item.baseUnit,
    stock_base: item.stockBase ?? 0,
    cost_per_base: item.costPerBase ?? 0,
    sale_per_base: item.salePerBase ?? 0,
    profit_pct: item.profitPct ?? 0,
    variation_kind: item.variationKind ?? "özel",
    variation_detail: item.variationDetail ?? "",
    barcode: item.barcode ?? "",
    photos: item.photos ?? [],
    note: item.note ?? "",
  };
}

/** Güvenli API'den ham satırlar (uuid id + client_id). */
async function fetchOtherRawRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  return fetchOtherInventoryRows();
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

/** Bu tenant'ın "diğer ürün" stok kalemleri (güvenli API). */
export async function fetchOtherInventoryFromDb(): Promise<{
  items: OtherItem[];
  error: string | null;
}> {
  const { rows, error } = await fetchOtherRawRows();
  if (error) return { items: [], error };
  return { items: rows.map(dbRowToOtherItem), error: null };
}

/**
 * Supabase öncelikli yükleme.
 *  - tenant yoksa → yalnızca localStorage.
 *  - DB ulaşılamazsa → localStorage yedek (veri kaybı olmaz).
 *  - DB erişilebilir + aynı tenant'ta localStorage-only (eski) kalemler varsa
 *    DB'ye taşınır (best-effort migrasyon) → eski kayıtlar kaybolmaz.
 *  - Farklı tenant önbelleği DB'ye TAŞINMAZ (cross-tenant sızıntı engeli).
 */
export async function loadOtherInventoryForTenant(
  sessionTenantId: string | null,
): Promise<{ items: OtherItem[]; source: OtherInventorySource; error: string | null }> {
  const tid = sessionTenantId?.trim() || null;

  if (!tid) {
    const local = loadOtherInventory();
    return { items: local, source: local.length ? "localStorage" : "none", error: null };
  }

  let db = await fetchOtherInventoryFromDb();
  if (db.error) {
    // DB ulaşılamadı → localStorage yedek (sessiz veri kaybı olmasın).
    const local = loadOtherInventory();
    return { items: local, source: local.length ? "localStorage" : "none", error: db.error };
  }

  // Aynı tenant önbelleği değilse localStorage'ı yok say (başka çalışma alanı).
  const cachedTenant = readOtherActiveTenant();
  const local = cachedTenant && cachedTenant !== tid ? [] : loadOtherInventory();

  // Eski (localStorage-only) kalemleri DB'ye taşı.
  const dbIds = new Set(db.items.map((it) => it.id));
  const localOnly = local.filter((it) => it.id && !dbIds.has(it.id));
  if (localOnly.length) {
    for (const it of localOnly) {
      const res = await upsertOtherInventoryItem(tid, it);
      if (!res.ok) {
        console.warn("[other_inventory] eski kayıt taşıma hatası:", res.error, it.name);
      }
    }
    const refetch = await fetchOtherInventoryFromDb();
    if (!refetch.error) db = refetch;
  }

  setOtherActiveTenant(tid);
  saveOtherInventory(db.items);
  return { items: db.items, source: "supabase", error: null };
}

/**
 * Manuel "Ekle / Güncelle" — tek "diğer ürün" kalemini güvenli API'ye yazar.
 * client_id ile mevcut DB satırı varsa günceller; yoksa oluşturur. Böylece
 * manuel eklenen kayıt yenilemede kaybolmaz ve cihazlar arası senkron olur.
 * Demo hesapta server no-op (demo:true) — çağıran yalnızca localStorage'a düşer.
 */
export async function upsertOtherInventoryItem(
  tenantId: string,
  item: OtherItem,
): Promise<{ ok: boolean; created: boolean; error: string | null; demo?: boolean }> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, created: false, error: "tenant_id boş." };
  if (!item.name?.trim()) return { ok: false, created: false, error: "Ürün adı boş olamaz." };
  if (!item.id?.trim()) return { ok: false, created: false, error: "Kayıt kimliği boş." };

  const { rows, error: rawError } = await fetchOtherRawRows();
  if (rawError) return { ok: false, created: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  const payload = otherItemToDbPayload(item);
  const foundUuid = idByClientId.get(item.id);

  if (foundUuid) {
    const { ok, error, demo } = await updateOtherInventoryRow(foundUuid, payload);
    return { ok, created: false, error: ok ? null : error ?? "Güncelleme hatası", demo };
  }

  const { ok, error, demo } = await createOtherInventoryRow(payload);
  return { ok, created: true, error: ok ? null : error ?? "Ekleme hatası", demo };
}

/**
 * Seçili "diğer ürün" kalemlerini güvenli API'den siler (client_id → uuid eşlemesiyle).
 * DB'de bulunmayan (yalnız localStorage) kalemler sessizce atlanır.
 */
export async function deleteOtherInventoryItems(
  tenantId: string,
  items: OtherItem[],
): Promise<{ ok: boolean; deleted: number; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, deleted: 0, error: null };

  const { rows, error: rawError } = await fetchOtherRawRows();
  if (rawError) return { ok: false, deleted: 0, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  let deleted = 0;
  let firstError: string | null = null;
  for (const it of items) {
    const uuid = idByClientId.get(it.id);
    if (!uuid) continue; // DB'de yok (eski localStorage-only kalem)
    const { ok, error } = await deleteOtherInventoryRow(uuid);
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
export async function syncOtherInventoryToDb(
  tenantId: string,
  items: OtherItem[],
): Promise<{ ok: boolean; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, error: null };

  const { rows, error: rawError } = await fetchOtherRawRows();
  if (rawError) return { ok: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  let firstError: string | null = null;

  for (const item of items) {
    const uuid = idByClientId.get(item.id);
    if (!uuid) continue;
    const { ok, error } = await updateOtherInventoryRow(uuid, {
      stock_base: item.stockBase ?? 0,
      cost_per_base: item.costPerBase ?? 0,
      sale_per_base: item.salePerBase ?? 0,
    });
    if (!ok && !firstError) firstError = error ?? "Güncelleme hatası";
  }

  return { ok: !firstError, error: firstError };
}
