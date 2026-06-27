/**
 * Ürün stoku — güvenli server API: /api/dogaltas/inventory (öncelikli)
 * localStorage dogaltas_inventory_v1 yalnızca yedek (aynı tenant önbelleği)
 *
 * NOT (Faz 1): Bu modül artık tarayıcıdan doğrudan supabase.from("dogaltas_inventory")
 * ÇAĞIRMAZ. Tüm liste/ekle/güncelle/sil erişimi /api/dogaltas/inventory güvenli
 * route'una gider; tenant_id sunucuda oturumdan belirlenir (istemciden gönderilmez).
 */

import {
  createInventoryRow,
  deleteInventoryRow,
  fetchInventoryRows,
  updateInventoryRow,
} from "@/lib/urun-stok/dogaltasInventoryApi";
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

export type DogaltasInventoryLoadDebug = {
  tableName: string;
  sessionTenantId: string | null;
  cachedImportTenantId: string | null;
  supabaseRawCount: number;
  supabaseError: string | null;
  localStorageCount: number;
  inventorySource: "supabase" | "localStorage" | "none";
  adetPositiveCount: number;
};

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

export function setActiveTenantCache(tenantId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_TENANT_CACHE_KEY, tenantId);
}

export function readActiveTenantCache(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(ACTIVE_TENANT_CACHE_KEY)?.trim();
  return v || null;
}

export function countAdetPositive(items: InvItem[]): number {
  return items.filter((it) => (it.adet ?? 0) > 0).length;
}

/**
 * Güvenli server API'den ham satırları (id dahil) çeker.
 * tenant sunucuda oturumdan; tenantId parametresi geriye-uyum için tutulur.
 */
async function fetchInventoryRawRows(
  tenantId: string,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid) {
    return { rows: [], error: "tenant_id boş — sorgu atlanmadı." };
  }

  const { rows, error } = await fetchInventoryRows();
  if (error) {
    console.warn("[dogaltas_inventory] API liste hata:", error, "tenant_id=", tid);
    return { rows: [], error };
  }
  return { rows, error: null };
}

/** Güvenli server API üzerinden bu tenant'ın stok kalemleri (tenant sunucuda). */
export async function fetchDogaltasInventoryFromDb(
  tenantId: string,
): Promise<{ items: InvItem[]; error: string | null; count: number }> {
  const tid = tenantId.trim();
  if (!tid) {
    return { items: [], error: "tenant_id boş — sorgu atlanmadı.", count: 0 };
  }

  const { rows, error } = await fetchInventoryRawRows(tid);
  if (error) return { items: [], error, count: 0 };

  const items = rows.map((row) => dbRowToInvItem(row));

  console.log("[dogaltas_inventory] API liste ok", {
    tenant_id: tid,
    count: items.length,
  });

  return { items, error: null, count: items.length };
}

function loadLocalInventoryCache(expectedTenantId: string | null): InvItem[] {
  if (typeof window === "undefined") return [];

  const cachedTenant = readActiveTenantCache();
  if (expectedTenantId && cachedTenant && cachedTenant !== expectedTenantId) {
    console.warn(
      "[dogaltas_inventory] localStorage tenant uyuşmazlığı",
      { beklenen: expectedTenantId, onbellek: cachedTenant },
    );
    return [];
  }

  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => dbRowToInvItem(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

/**
 * Supabase öncelikli yükleme.
 * Supabase boş/hatalıysa — aynı tenant önbelleği varsa localStorage yedek.
 */
export async function loadDogaltasInventoryForTenant(
  sessionTenantId: string | null,
): Promise<{
  items: InvItem[];
  source: "supabase" | "localStorage" | "none";
  tenantId: string | null;
  debug: DogaltasInventoryLoadDebug;
}> {
  const tid = sessionTenantId?.trim() || null;
  const cachedTenant = readActiveTenantCache();

  const debug: DogaltasInventoryLoadDebug = {
    tableName: DOGALTAS_INVENTORY_TABLE,
    sessionTenantId: tid,
    cachedImportTenantId: cachedTenant,
    supabaseRawCount: 0,
    supabaseError: null,
    localStorageCount: 0,
    inventorySource: "none",
    adetPositiveCount: 0,
  };

  if (!tid) {
    debug.supabaseError =
      "Oturum tenant_id yok. Stok JSON import tenant_id ile canlı oturum eşleşmeli.";
    const localOnly = loadLocalInventoryCache(null);
    debug.localStorageCount = localOnly.length;
    if (localOnly.length > 0) {
      debug.inventorySource = "localStorage";
      debug.adetPositiveCount = countAdetPositive(localOnly);
      return { items: localOnly, source: "localStorage", tenantId: cachedTenant, debug };
    }
    return { items: [], source: "none", tenantId: null, debug };
  }

  if (cachedTenant && cachedTenant !== tid) {
    debug.supabaseError = `Import tenant (${cachedTenant}) ≠ oturum tenant (${tid}). Kayıtlar farklı çalışma alanında.`;
  }

  const db = await fetchDogaltasInventoryFromDb(tid);
  debug.supabaseRawCount = db.count;
  debug.supabaseError = db.error;

  if (db.items.length > 0) {
    setActiveTenantCache(tid);
    saveInventory(db.items);
    debug.inventorySource = "supabase";
    debug.adetPositiveCount = countAdetPositive(db.items);
    return { items: db.items, source: "supabase", tenantId: tid, debug };
  }

  const localItems = loadLocalInventoryCache(tid);
  debug.localStorageCount = localItems.length;

  if (localItems.length > 0) {
    debug.inventorySource = "localStorage";
    debug.adetPositiveCount = countAdetPositive(localItems);
    if (!debug.supabaseError && db.count === 0) {
      debug.supabaseError =
        "Supabase 0 kayıt döndü; localStorage önbellek kullanıldı (import aynı tarayıcıda yapıldıysa normal).";
    }
    return { items: localItems, source: "localStorage", tenantId: tid, debug };
  }

  if (!debug.supabaseError) {
    debug.supabaseError =
      "Supabase ve localStorage boş. Import tenant_id ile oturum tenant_id aynı mı kontrol edin.";
  }

  return { items: [], source: "none", tenantId: tid, debug };
}

export async function upsertDogaltasInventoryFromJson(
  tenantId: string,
  incoming: InventoryJsonMergeRow[],
): Promise<
  | {
      ok: true;
      inserted: number;
      updated: number;
      total: number;
      tenantId: string;
      supabaseVerifiedCount: number;
    }
  | { ok: false; error: string }
> {
  const tid = tenantId.trim();
  if (!tid) {
    return { ok: false, error: "tenant_id gerekli. Lütfen oturumda çalışma alanı tanımlı olsun." };
  }

  const { items: existing, error: readError } = await fetchDogaltasInventoryFromDb(tid);
  if (readError) {
    console.warn("[dogaltas_inventory] import öncesi okuma:", readError);
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

  // Mevcut kayıtların name+type → id eşlemesi (güvenli API listesinden).
  const { rows: existingRows, error: rawError } = await fetchInventoryRawRows(tid);
  if (rawError) {
    return { ok: false, error: `${DOGALTAS_INVENTORY_TABLE}: ${rawError}` };
  }
  const idByKey = new Map<string, string>();
  for (const row of existingRows) {
    const k = itemKey(String(row.name ?? ""), String(row.type ?? ""));
    const id = String(row.id ?? "").trim();
    if (id) idByKey.set(k, id);
  }

  let dbWriteError: string | null = null;

  for (const item of items) {
    const payload = invItemToDbPayload(tid, item);
    const foundId = idByKey.get(itemKey(item.name, item.type));

    if (foundId) {
      const { ok, error: updateError } = await updateInventoryRow(foundId, payload);
      if (!ok) {
        dbWriteError = updateError ?? "Güncelleme hatası";
        break;
      }
    } else {
      const { ok, error: insertError } = await createInventoryRow(payload);
      if (!ok) {
        dbWriteError = insertError ?? "Ekleme hatası";
        break;
      }
    }
  }

  if (dbWriteError) {
    return {
      ok: false,
      error: `${DOGALTAS_INVENTORY_TABLE}: ${dbWriteError}`,
    };
  }

  setActiveTenantCache(tid);
  saveInventory(items);

  const verify = await fetchDogaltasInventoryFromDb(tid);

  console.log("[dogaltas_inventory] import tamam", {
    tenant_id: tid,
    inserted,
    updated,
    total: items.length,
    supabase_dogrulama: verify.count,
    verify_error: verify.error,
  });

  if (verify.error) {
    return {
      ok: false,
      error: `Yazıldı ancak doğrulama okuması başarısız: ${verify.error}`,
    };
  }

  return {
    ok: true,
    inserted,
    updated,
    total: items.length,
    tenantId: tid,
    supabaseVerifiedCount: verify.count,
  };
}

/**
 * Satış / stok iadesi sonrası Supabase'deki adet ve maliyet alanlarını günceller.
 * Drift önleme: sayfa yenilenince stok eski haline dönmez.
 * Sadece mevcut Supabase kayıtlarını günceller; yeni (localStorage-only) kayıtlar atlanır.
 */
export async function syncDogaltasInventoryToDb(
  tenantId: string,
  items: InvItem[],
): Promise<{ ok: boolean; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, error: null };

  // name+type → id eşlemesi (güvenli API listesinden; tenant sunucuda).
  const { rows, error: rawError } = await fetchInventoryRawRows(tid);
  if (rawError) return { ok: false, error: rawError };

  const idByKey = new Map<string, string>();
  for (const row of rows) {
    const k = itemKey(String(row.name ?? ""), String(row.type ?? ""));
    const id = String(row.id ?? "").trim();
    if (id) idByKey.set(k, id);
  }

  let firstError: string | null = null;

  for (const item of items) {
    // Sadece mevcut (server'da kayıtlı) kalemleri günceller; yeni kalemler atlanır.
    const foundId = idByKey.get(itemKey(item.name, item.type));
    if (!foundId) continue;

    const { ok, error } = await updateInventoryRow(foundId, {
      adet: item.adet ?? 0,
      dizi_price: item.dizi_price ?? 0,
      adet_price: item.adet_price ?? 0,
      total_cost_try: item.total_cost_try ?? 0,
      unit_cost_try: item.unit_cost_try ?? 0,
    });

    if (!ok && !firstError) firstError = error ?? "Güncelleme hatası";
  }

  return { ok: !firstError, error: firstError };
}

/**
 * Manuel "Yeni Kayıt Ekle" — tek bir stok kalemini güvenli server API'ye yazar.
 * name+type ile mevcut DB satırı varsa TÜM alanları günceller; yoksa yeni satır
 * oluşturur (create path). Böylece manuel eklenen kayıt yenilemede kaybolmaz ve
 * cihazlar arası senkron olur. Demo hesaplarda server no-op (demo:true) — çağıran
 * yalnızca localStorage'a düşer.
 */
export async function upsertDogaltasInventoryItem(
  tenantId: string,
  item: InvItem,
): Promise<{
  ok: boolean;
  id?: string;
  created: boolean;
  error: string | null;
  demo?: boolean;
}> {
  const tid = tenantId.trim();
  if (!tid) return { ok: false, created: false, error: "tenant_id boş." };
  if (!item.name?.trim()) {
    return { ok: false, created: false, error: "Taş adı boş olamaz." };
  }

  const { rows, error: rawError } = await fetchInventoryRawRows(tid);
  if (rawError) return { ok: false, created: false, error: rawError };

  const idByKey = new Map<string, string>();
  for (const row of rows) {
    const k = itemKey(String(row.name ?? ""), String(row.type ?? ""));
    const id = String(row.id ?? "").trim();
    if (id) idByKey.set(k, id);
  }

  const payload = invItemToDbPayload(tid, item);
  const foundId = idByKey.get(itemKey(item.name, item.type));

  if (foundId) {
    const { ok, error, demo } = await updateInventoryRow(foundId, payload);
    return {
      ok,
      id: foundId,
      created: false,
      error: ok ? null : error ?? "Güncelleme hatası",
      demo,
    };
  }

  const { ok, id, error, demo } = await createInventoryRow(payload);
  return {
    ok,
    id,
    created: true,
    error: ok ? null : error ?? "Ekleme hatası",
    demo,
  };
}

/**
 * Seçili stok kalemlerini güvenli server API'den siler (name+type → id eşlemesiyle).
 * DB'de bulunmayan (yalnız localStorage) kalemler sessizce atlanır.
 */
export async function deleteDogaltasInventoryItems(
  tenantId: string,
  items: InvItem[],
): Promise<{ ok: boolean; deleted: number; error: string | null }> {
  const tid = tenantId.trim();
  if (!tid || !items.length) return { ok: true, deleted: 0, error: null };

  const { rows, error: rawError } = await fetchInventoryRawRows(tid);
  if (rawError) return { ok: false, deleted: 0, error: rawError };

  const idByKey = new Map<string, string>();
  for (const row of rows) {
    const k = itemKey(String(row.name ?? ""), String(row.type ?? ""));
    const id = String(row.id ?? "").trim();
    if (id) idByKey.set(k, id);
  }

  let deleted = 0;
  let firstError: string | null = null;
  for (const it of items) {
    const id = idByKey.get(itemKey(it.name, it.type));
    if (!id) continue; // DB'de yok (eski localStorage-only kalem)
    const { ok, error } = await deleteInventoryRow(id);
    if (ok) deleted += 1;
    else if (!firstError) firstError = error ?? "Silme hatası";
  }

  return { ok: !firstError, deleted, error: firstError };
}
