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
  clearInventoryPending,
  markInventoryPending,
  planLocalOnlyItems,
  readInventorySyncState,
  takeQuarantineNotice,
} from "@/lib/urun-stok/inventorySyncState";
import { STOCK_CONFLICT_CODE } from "@/lib/urun-stok/stockConflict";
import {
  loadAccessoryInventory,
  saveAccessoryInventory,
  toFloat,
  type AccessoryItem,
} from "@/lib/urun-stok/accessoryStockLogic";

const ACC_ACTIVE_TENANT_CACHE_KEY = "accessory_inventory_active_tenant_v1";
/** BUG-021 eşitleme durumu anahtar tabanı (bkz. inventorySyncState.ts). */
const SYNC_KEY = "accessory_inventory";

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
 *  - BUG-021: önbellekte olup DB'de olmayan kalemler artık KOŞULSUZ yeniden oluşturulmaz.
 *    Yalnız bu cihazda "bekleyen" (buluta yazılamamış yeni kayıt) olarak işaretlenenler yüklenir;
 *    silinmiş kalemler önbellekten düşer; eski önbellekteki belirsiz kalemler karantinaya alınır
 *    (bkz. inventorySyncState.ts).
 *  - Farklı tenant önbelleği DB'ye TAŞINMAZ (cross-tenant sızıntı engeli).
 */
export async function loadAccessoryInventoryForTenant(
  sessionTenantId: string | null,
): Promise<{ items: AccessoryItem[]; source: AccessoryInventorySource; error: string | null }> {
  const tid = sessionTenantId?.trim() || null;

  if (!tid) {
    const local = loadAccessoryInventory();
    return {
      items: local,
      source: local.length ? "localStorage" : "none",
      error: null,
    };
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

  const dbIds = new Set(db.items.map((it) => it.id));
  const localOnly = local.filter((it) => it.id && !dbIds.has(it.id));
  const plan = planLocalOnlyItems(SYNC_KEY, tid, localOnly, dbIds);
  if (plan.upload.length) {
    for (const it of plan.upload) {
      const res = await upsertAccessoryInventoryItem(tid, it);
      if (!res.ok) {
        console.warn("[accessory_inventory] bekleyen kayıt yükleme hatası:", res.error, it.name);
      }
    }
    const refetch = await fetchAccessoryInventoryFromDb();
    if (!refetch.error) db = refetch;
  }

  // Yüklenemeyen bekleyen kalemler önbellekte kalır (bir sonraki yüklemede yeniden denenir).
  const stillPending = readInventorySyncState(SYNC_KEY, tid).pending;
  const refreshedIds = new Set(db.items.map((it) => it.id));
  const keepLocal = plan.upload.filter((it) => stillPending.has(it.id) && !refreshedIds.has(it.id));

  setAccActiveTenant(tid);
  saveAccessoryInventory([...db.items, ...keepLocal]);
  return { items: [...db.items, ...keepLocal], source: "supabase", error: null };
}

/** Yeni kayıt önbelleğe yazılmadan ÖNCE çağrılır (bkz. inventorySyncState.ts). */
export function markAccessoryPendingSync(tenantId: string, id: string): void {
  const tid = tenantId.trim();
  if (tid && id) markInventoryPending(SYNC_KEY, tid, id);
}

/** Eski önbellekten karantinaya alınan kalem adları (bir kez). */
export function takeAccessoryQuarantineNotice(tenantId: string | null): string[] {
  const tid = tenantId?.trim();
  return tid ? takeQuarantineNotice(SYNC_KEY, tid) : [];
}

export type AccessoryUpsertResult = {
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
export async function upsertAccessoryInventoryItem(
  tenantId: string,
  item: AccessoryItem,
  opts: { mode?: "create" | "update"; stock?: { expected: number } } = {},
): Promise<AccessoryUpsertResult> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, created: false, error: "tenant_id boş." };
  if (!item.name?.trim()) return { ok: false, created: false, error: "Ürün adı boş olamaz." };
  if (!item.id?.trim()) return { ok: false, created: false, error: "Kayıt kimliği boş." };
  const mode = opts.mode ?? "create";

  const { rows, error: rawError } = await fetchAccRawRows();
  if (rawError) return { ok: false, created: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  const payload = accItemToDbPayload(item);
  const foundUuid = idByClientId.get(item.id);

  if (foundUuid) {
    // Beklenen stok: güncellemede formun dayandığı değer; yeniden denenen oluşturmada DB'deki değer.
    let expected: number | null = opts.stock ? opts.stock.expected : null;
    if (expected === null && mode === "create") {
      const row = rows.find((r) => String(r.id ?? "").trim() === foundUuid);
      expected = row ? toFloat(row.stock_qty, 0) : null;
    }
    if (expected === null || payload.stock_qty === expected) {
      delete payload.stock_qty;
    } else {
      payload.expected_stock = expected;
    }
    const r = await updateAccessoryInventoryRow(foundUuid, payload);
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

  const { ok, error, demo } = await createAccessoryInventoryRow(payload);
  if (ok && !demo) clearInventoryPending(SYNC_KEY, tid, [item.id]);
  return { ok, created: true, error: ok ? null : error ?? "Ekleme hatası", demo };
}

/**
 * Seçili kalemleri güvenli API'den siler (client_id → uuid eşlemesiyle).
 * BUG-021: başarıyla silinen (ve DB'de hiç olmayan yerel) kalemler önbellekten ve bekleyen
 * listesinden de çıkarılır → sonraki yüklemede geri oluşturulamaz.
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
  const removedIds: string[] = [];
  for (const it of items) {
    const uuid = idByClientId.get(it.id);
    if (!uuid) {
      // DB'de yok (yalnız bu cihazdaki bekleyen kalem) → yalnız yerelden kaldırılır.
      removedIds.push(it.id);
      deleted += 1;
      continue;
    }
    const { ok, error } = await deleteAccessoryInventoryRow(uuid);
    if (ok) {
      deleted += 1;
      removedIds.push(it.id);
    } else if (!firstError) firstError = error ?? "Silme hatası";
  }

  if (removedIds.length) {
    const gone = new Set(removedIds);
    saveAccessoryInventory(loadAccessoryInventory().filter((it) => !gone.has(it.id)));
    clearInventoryPending(SYNC_KEY, tid, removedIds);
  }

  return { ok: !firstError, deleted, error: firstError };
}

/**
 * STK-01: Canlı Stok "+ Stok ekle" — yalnız stok miktarını karşılaştır-ve-yaz ile günceller.
 * `expected` ekranın dayandığı DB stoğudur; DB'de stok değiştiyse 409 (conflict) döner, yazılmaz.
 * Maliyet / satış fiyatı alanlarına DOKUNMAZ.
 */
export async function setAccessoryInventoryStock(
  tenantId: string,
  clientId: string,
  expected: number,
  next: number,
): Promise<{ ok: boolean; conflict: boolean; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, conflict: false, error: "tenant_id boş." };

  const { rows, error: rawError } = await fetchAccRawRows();
  if (rawError) return { ok: false, conflict: false, error: rawError };

  const uuid = buildIdByClientId(rows).get(clientId);
  if (!uuid) return { ok: false, conflict: false, error: "Kayıt bulunamadı." };

  const r = await updateAccessoryInventoryRow(uuid, { stock_qty: next, expected_stock: expected });
  return {
    ok: r.ok,
    conflict: r.code === STOCK_CONFLICT_CODE,
    error: r.ok ? null : r.error ?? "Güncelleme hatası",
  };
}
