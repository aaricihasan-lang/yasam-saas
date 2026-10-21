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
  clearInventoryPending,
  markInventoryPending,
  planLocalOnlyItems,
  readInventorySyncState,
  takeQuarantineNotice,
} from "@/lib/urun-stok/inventorySyncState";
import { STOCK_CONFLICT_CODE } from "@/lib/urun-stok/stockConflict";
import {
  loadOilInventory,
  saveOilInventory,
  toFloat,
  type OilBaseUnit,
  type OilItem,
  type OilMeasureType,
} from "@/lib/urun-stok/oilStockLogic";

const OIL_ACTIVE_TENANT_CACHE_KEY = "oil_inventory_active_tenant_v1";
/** BUG-021 eşitleme durumu anahtar tabanı (bkz. inventorySyncState.ts). */
const SYNC_KEY = "oil_inventory";

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
 *  - BUG-021: önbellekte olup DB'de olmayan kalemler artık KOŞULSUZ yeniden oluşturulmaz.
 *    Yalnız bu cihazda "bekleyen" (buluta yazılamamış yeni kayıt) olarak işaretlenenler yüklenir;
 *    silinmiş kalemler önbellekten düşer; eski önbellekteki belirsiz kalemler karantinaya alınır
 *    (bkz. inventorySyncState.ts).
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

  const dbIds = new Set(db.items.map((it) => it.id));
  const localOnly = local.filter((it) => it.id && !dbIds.has(it.id));
  const plan = planLocalOnlyItems(SYNC_KEY, tid, localOnly, dbIds);
  if (plan.upload.length) {
    for (const it of plan.upload) {
      const res = await upsertOilInventoryItem(tid, it);
      if (!res.ok) {
        console.warn("[oil_inventory] bekleyen kayıt yükleme hatası:", res.error, it.name);
      }
    }
    const refetch = await fetchOilInventoryFromDb();
    if (!refetch.error) db = refetch;
  }

  // Yüklenemeyen bekleyen kalemler önbellekte kalır (bir sonraki yüklemede yeniden denenir).
  const stillPending = readInventorySyncState(SYNC_KEY, tid).pending;
  const refreshedIds = new Set(db.items.map((it) => it.id));
  const keepLocal = plan.upload.filter((it) => stillPending.has(it.id) && !refreshedIds.has(it.id));

  setOilActiveTenant(tid);
  saveOilInventory([...db.items, ...keepLocal]);
  return { items: [...db.items, ...keepLocal], source: "supabase", error: null };
}

/** Yeni kayıt önbelleğe yazılmadan ÖNCE çağrılır (bkz. inventorySyncState.ts). */
export function markOilPendingSync(tenantId: string, id: string): void {
  const tid = tenantId.trim();
  if (tid && id) markInventoryPending(SYNC_KEY, tid, id);
}

/** Eski önbellekten karantinaya alınan kalem adları (bir kez). */
export function takeOilQuarantineNotice(tenantId: string | null): string[] {
  const tid = tenantId?.trim();
  return tid ? takeQuarantineNotice(SYNC_KEY, tid) : [];
}

export type OilUpsertResult = {
  ok: boolean;
  created: boolean;
  error: string | null;
  demo?: boolean;
  /** STK-01: stok bu arada başka işlemle değişti (409) — hiçbir alan yazılmadı. */
  conflict?: boolean;
  /** BUG-021: güncellenmek istenen kayıt sunucuda yok (başka cihazda silinmiş) — yeniden oluşturulmadı. */
  notFound?: boolean;
};

/**
 * Manuel "Ekle / Güncelle" — tek kalemi güvenli API'ye yazar.
 * client_id ile mevcut DB satırı varsa günceller; yoksa oluşturur.
 *
 * STK-01: güncellemede stok yalnız `stock.expected` (formun dayandığı DB stoğu) hâlâ geçerliyse
 * yazılır; stok değişmediyse stok alanı HİÇ gönderilmez (ad/fiyat düzenlemesi stoğu ezemez).
 * `stock` verilmeyen güncellemede stok alanı gönderilmez.
 * BUG-021: `mode: "update"` iken kayıt sunucuda yoksa (başka cihazda silinmiş) YENİDEN OLUŞTURULMAZ.
 */
export async function upsertOilInventoryItem(
  tenantId: string,
  item: OilItem,
  opts: { mode?: "create" | "update"; stock?: { expected: number } } = {},
): Promise<OilUpsertResult> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, created: false, error: "tenant_id boş." };
  if (!item.name?.trim()) return { ok: false, created: false, error: "Ürün adı boş olamaz." };
  if (!item.id?.trim()) return { ok: false, created: false, error: "Kayıt kimliği boş." };
  const mode = opts.mode ?? "create";

  const { rows, error: rawError } = await fetchOilRawRows();
  if (rawError) return { ok: false, created: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  const payload = oilItemToDbPayload(item);
  const foundUuid = idByClientId.get(item.id);

  if (foundUuid) {
    // Beklenen stok: güncellemede formun dayandığı değer; yeniden denenen oluşturmada DB'deki değer.
    let expected: number | null = opts.stock ? opts.stock.expected : null;
    if (expected === null && mode === "create") {
      const row = rows.find((r) => String(r.id ?? "").trim() === foundUuid);
      expected = row ? toFloat(row.stock_base, 0) : null;
    }
    if (expected === null || payload.stock_base === expected) {
      delete payload.stock_base;
    } else {
      payload.expected_stock = expected;
    }
    const r = await updateOilInventoryRow(foundUuid, payload);
    if (r.ok && mode === "create") clearInventoryPending(SYNC_KEY, tid, [item.id]);
    return {
      ok: r.ok,
      created: false,
      error: r.ok ? null : r.error ?? "Güncelleme hatası",
      demo: r.demo,
      conflict: r.code === STOCK_CONFLICT_CODE,
    };
  }

  if (mode === "update" && !readInventorySyncState(SYNC_KEY, tid).pending.has(item.id)) {
    return {
      ok: false,
      created: false,
      notFound: true,
      error: "Kayıt sunucuda bulunamadı (başka bir cihazda silinmiş olabilir). Liste yenilendi.",
    };
  }

  const { ok, error, demo } = await createOilInventoryRow(payload);
  if (ok && !demo) clearInventoryPending(SYNC_KEY, tid, [item.id]);
  return { ok, created: true, error: ok ? null : error ?? "Ekleme hatası", demo };
}

/**
 * Seçili kalemleri güvenli API'den siler (client_id → uuid eşlemesiyle).
 * BUG-021: başarıyla silinen (ve DB'de hiç olmayan yerel) kalemler önbellekten ve bekleyen
 * listesinden de çıkarılır → sonraki yüklemede geri oluşturulamaz.
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
  const removedIds: string[] = [];
  for (const it of items) {
    const uuid = idByClientId.get(it.id);
    if (!uuid) {
      // DB'de yok (yalnız bu cihazdaki bekleyen kalem) → yalnız yerelden kaldırılır.
      removedIds.push(it.id);
      deleted += 1;
      continue;
    }
    const { ok, error } = await deleteOilInventoryRow(uuid);
    if (ok) {
      deleted += 1;
      removedIds.push(it.id);
    } else if (!firstError) firstError = error ?? "Silme hatası";
  }

  if (removedIds.length) {
    const gone = new Set(removedIds);
    saveOilInventory(loadOilInventory().filter((it) => !gone.has(it.id)));
    clearInventoryPending(SYNC_KEY, tid, removedIds);
  }

  return { ok: !firstError, deleted, error: firstError };
}

/**
 * STK-01: Canlı Stok "+ Stok ekle" — yalnız stok miktarını karşılaştır-ve-yaz ile günceller.
 * `expected` ekranın dayandığı DB stoğudur; DB'de stok değiştiyse 409 (conflict) döner, yazılmaz.
 * Maliyet / satış fiyatı alanlarına DOKUNMAZ.
 */
export async function setOilInventoryStock(
  tenantId: string,
  clientId: string,
  expected: number,
  next: number,
): Promise<{ ok: boolean; conflict: boolean; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, conflict: false, error: "tenant_id boş." };

  const { rows, error: rawError } = await fetchOilRawRows();
  if (rawError) return { ok: false, conflict: false, error: rawError };

  const uuid = buildIdByClientId(rows).get(clientId);
  if (!uuid) return { ok: false, conflict: false, error: "Kayıt bulunamadı." };

  const r = await updateOilInventoryRow(uuid, { stock_base: next, expected_stock: expected });
  return {
    ok: r.ok,
    conflict: r.code === STOCK_CONFLICT_CODE,
    error: r.ok ? null : r.error ?? "Güncelleme hatası",
  };
}
