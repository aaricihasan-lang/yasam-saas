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
  clearInventoryPending,
  markInventoryPending,
  planLocalOnlyItems,
  readInventorySyncState,
  takeQuarantineNotice,
} from "@/lib/urun-stok/inventorySyncState";
import { STOCK_CONFLICT_CODE } from "@/lib/urun-stok/stockConflict";
import {
  loadOtherInventory,
  saveOtherInventory,
  toFloat,
  type OtBaseUnit,
  type OtMeasureType,
  type OtherItem,
} from "@/lib/urun-stok/otherStockLogic";

const OTHER_ACTIVE_TENANT_CACHE_KEY = "other_inventory_active_tenant_v1";
/** BUG-021 eşitleme durumu anahtar tabanı (bkz. inventorySyncState.ts). */
const SYNC_KEY = "other_inventory";

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
 *  - BUG-021: önbellekte olup DB'de olmayan kalemler artık KOŞULSUZ yeniden oluşturulmaz.
 *    Yalnız bu cihazda "bekleyen" (buluta yazılamamış yeni kayıt) olarak işaretlenenler yüklenir;
 *    silinmiş kalemler önbellekten düşer; eski önbellekteki belirsiz kalemler karantinaya alınır
 *    (bkz. inventorySyncState.ts).
 *  - Farklı tenant önbelleği DB'ye TAŞINMAZ (cross-tenant sızıntı engeli).
 */
export async function loadOtherInventoryForTenant(
  sessionTenantId: string | null,
): Promise<{ items: OtherItem[]; source: OtherInventorySource; error: string | null }> {
  const tid = sessionTenantId?.trim() || null;

  if (!tid) {
    const local = loadOtherInventory();
    return {
      items: local,
      source: local.length ? "localStorage" : "none",
      error: null,
    };
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

  const dbIds = new Set(db.items.map((it) => it.id));
  const localOnly = local.filter((it) => it.id && !dbIds.has(it.id));
  const plan = planLocalOnlyItems(SYNC_KEY, tid, localOnly, dbIds);
  if (plan.upload.length) {
    for (const it of plan.upload) {
      const res = await upsertOtherInventoryItem(tid, it);
      if (!res.ok) {
        console.warn("[other_inventory] bekleyen kayıt yükleme hatası:", res.error, it.name);
      }
    }
    const refetch = await fetchOtherInventoryFromDb();
    if (!refetch.error) db = refetch;
  }

  // Yüklenemeyen bekleyen kalemler önbellekte kalır (bir sonraki yüklemede yeniden denenir).
  const stillPending = readInventorySyncState(SYNC_KEY, tid).pending;
  const refreshedIds = new Set(db.items.map((it) => it.id));
  const keepLocal = plan.upload.filter((it) => stillPending.has(it.id) && !refreshedIds.has(it.id));

  setOtherActiveTenant(tid);
  saveOtherInventory([...db.items, ...keepLocal]);
  return { items: [...db.items, ...keepLocal], source: "supabase", error: null };
}

/** Yeni kayıt önbelleğe yazılmadan ÖNCE çağrılır (bkz. inventorySyncState.ts). */
export function markOtherPendingSync(tenantId: string, id: string): void {
  const tid = tenantId.trim();
  if (tid && id) markInventoryPending(SYNC_KEY, tid, id);
}

/** Eski önbellekten karantinaya alınan kalem adları (bir kez). */
export function takeOtherQuarantineNotice(tenantId: string | null): string[] {
  const tid = tenantId?.trim();
  return tid ? takeQuarantineNotice(SYNC_KEY, tid) : [];
}

export type OtherUpsertResult = {
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
export async function upsertOtherInventoryItem(
  tenantId: string,
  item: OtherItem,
  opts: { mode?: "create" | "update"; stock?: { expected: number } } = {},
): Promise<OtherUpsertResult> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, created: false, error: "tenant_id boş." };
  if (!item.name?.trim()) return { ok: false, created: false, error: "Ürün adı boş olamaz." };
  if (!item.id?.trim()) return { ok: false, created: false, error: "Kayıt kimliği boş." };
  const mode = opts.mode ?? "create";

  const { rows, error: rawError } = await fetchOtherRawRows();
  if (rawError) return { ok: false, created: false, error: rawError };

  const idByClientId = buildIdByClientId(rows);
  const payload = otherItemToDbPayload(item);
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
    const r = await updateOtherInventoryRow(foundUuid, payload);
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

  const { ok, error, demo } = await createOtherInventoryRow(payload);
  if (ok && !demo) clearInventoryPending(SYNC_KEY, tid, [item.id]);
  return { ok, created: true, error: ok ? null : error ?? "Ekleme hatası", demo };
}

/**
 * Seçili kalemleri güvenli API'den siler (client_id → uuid eşlemesiyle).
 * BUG-021: başarıyla silinen (ve DB'de hiç olmayan yerel) kalemler önbellekten ve bekleyen
 * listesinden de çıkarılır → sonraki yüklemede geri oluşturulamaz.
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
  const removedIds: string[] = [];
  for (const it of items) {
    const uuid = idByClientId.get(it.id);
    if (!uuid) {
      // DB'de yok (yalnız bu cihazdaki bekleyen kalem) → yalnız yerelden kaldırılır.
      removedIds.push(it.id);
      deleted += 1;
      continue;
    }
    const { ok, error } = await deleteOtherInventoryRow(uuid);
    if (ok) {
      deleted += 1;
      removedIds.push(it.id);
    } else if (!firstError) firstError = error ?? "Silme hatası";
  }

  if (removedIds.length) {
    const gone = new Set(removedIds);
    saveOtherInventory(loadOtherInventory().filter((it) => !gone.has(it.id)));
    clearInventoryPending(SYNC_KEY, tid, removedIds);
  }

  return { ok: !firstError, deleted, error: firstError };
}

/**
 * STK-01: Canlı Stok "+ Stok ekle" — yalnız stok miktarını karşılaştır-ve-yaz ile günceller.
 * `expected` ekranın dayandığı DB stoğudur; DB'de stok değiştiyse 409 (conflict) döner, yazılmaz.
 * Maliyet / satış fiyatı alanlarına DOKUNMAZ.
 */
export async function setOtherInventoryStock(
  tenantId: string,
  clientId: string,
  expected: number,
  next: number,
): Promise<{ ok: boolean; conflict: boolean; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, conflict: false, error: "tenant_id boş." };

  const { rows, error: rawError } = await fetchOtherRawRows();
  if (rawError) return { ok: false, conflict: false, error: rawError };

  const uuid = buildIdByClientId(rows).get(clientId);
  if (!uuid) return { ok: false, conflict: false, error: "Kayıt bulunamadı." };

  const r = await updateOtherInventoryRow(uuid, { stock_base: next, expected_stock: expected });
  return {
    ok: r.ok,
    conflict: r.code === STOCK_CONFLICT_CODE,
    error: r.ok ? null : r.error ?? "Güncelleme hatası",
  };
}
