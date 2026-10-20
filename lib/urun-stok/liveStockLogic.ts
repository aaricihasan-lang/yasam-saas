/** Canlı stok merkezi — tüm modül envanterlerini salt okunur birleştirir */

import {
  formatStockDisplay as formatAccessoryStock,
  formatVariantLabel as formatAccessoryVariant,
  loadAccessoryInventory,
  saveAccessoryInventory,
  type AccessoryItem,
} from "@/lib/urun-stok/accessoryStockLogic";
import {
  loadAccessoryInventoryForTenant,
  setAccessoryInventoryStock,
} from "@/lib/urun-stok/accessoryInventoryDb";
import {
  DOGALTAS_INVENTORY_TABLE,
  fetchDogaltasInventoryFromDb,
  loadDogaltasInventoryForTenant,
  syncDogaltasInventoryToDb,
  type DogaltasInventoryLoadDebug,
} from "@/lib/urun-stok/dogaltasInventoryDb";
import {
  applyItemCostTotals,
  fmtMoney,
  isDizi,
  itemKey,
  loadInventory as loadDogaltasInventory,
  saveInventory as saveDogaltasInventory,
  unitCostAndCurrency,
  type InvItem,
} from "@/lib/urun-stok/dogaltasStockLogic";
import {
  CATEGORY_LABELS,
  type ProductCategory,
} from "@/lib/urun-stok/generalSalesLogic";
import {
  formatStockDisplay as formatOilStock,
  fmtUnitCost as fmtOilUnitCost,
  loadOilInventory,
  saveOilInventory,
  unitLabel as oilUnitLabel,
  type OilItem,
} from "@/lib/urun-stok/oilStockLogic";
import {
  loadOilInventoryForTenant,
  setOilInventoryStock,
} from "@/lib/urun-stok/oilInventoryDb";
import {
  formatVariantLabel as formatOtherVariant,
  formatStockDisplay as formatOtherStock,
  fmtUnitCost as fmtOtherUnitCost,
  loadOtherInventory,
  saveOtherInventory,
  type OtherItem,
} from "@/lib/urun-stok/otherStockLogic";
import {
  loadOtherInventoryForTenant,
  setOtherInventoryStock,
} from "@/lib/urun-stok/otherInventoryDb";
import {
  formatStockDisplay as formatSoapStock,
  fmtUnitCost as fmtSoapUnitCost,
  loadSoapCreamInventory,
  saveSoapCreamInventory,
  type SoapCreamItem,
} from "@/lib/urun-stok/soapCreamStockLogic";
import {
  loadSoapCreamInventoryForTenant,
  setSoapCreamInventoryStock,
} from "@/lib/urun-stok/soapCreamInventoryDb";
import { createCategorySale, newIdempotencyKey } from "@/lib/urun-stok/salesApi";

export type LiveStockCategory = ProductCategory;

export type LiveStockRow = {
  id: string;
  category: LiveStockCategory;
  categoryLabel: string;
  name: string;
  groupLabel: string;
  stockDisplay: string;
  stockAmount: number;
  unitLabel: string;
  costPerUnit: number;
  costPerUnitLabel: string;
  /** Birim satış fiyatı — modülde tanımlıysa; doğaltaşta kombinasyonla kurulur (null). */
  salePerUnit: number | null;
  salePerUnitLabel: string;
  /** Kâr marjı % (maliyet üzerine markup) — hesaplanabiliyorsa. */
  marginPct: number | null;
  stockValue: number;
  isCritical: boolean;
  photos: string[];
};

/** Maliyet üzerine kâr (markup) % — telefon başında "kâr marjı?" sorusu için. */
function marginOf(cost: number, sale: number | null): number | null {
  if (sale == null || cost <= 0 || sale <= 0) return null;
  return Math.round(((sale - cost) / cost) * 100);
}

export type LiveStockSummary = {
  totalVarieties: number;
  stockByUnit: { adet: number; ml: number; gram: number };
  criticalCount: number;
  totalValue: number;
};

export type StockThresholds = { adet: number; ml: number; gram: number };

/** Varsayılan kritik eşikler. ml/gram 300'e çıkarıldı (örn. 250 ml lavanta da kritik sayılsın). */
export const DEFAULT_THRESHOLDS: StockThresholds = { adet: 5, ml: 300, gram: 300 };

const THRESHOLD_KEY = "stock_critical_thresholds_v1";

export function loadStockThresholds(): StockThresholds {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  try {
    const raw = localStorage.getItem(THRESHOLD_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const p = JSON.parse(raw) as Partial<StockThresholds>;
    const pick = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    return {
      adet: pick(p.adet, DEFAULT_THRESHOLDS.adet),
      ml: pick(p.ml, DEFAULT_THRESHOLDS.ml),
      gram: pick(p.gram, DEFAULT_THRESHOLDS.gram),
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function saveStockThresholds(t: StockThresholds): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THRESHOLD_KEY, JSON.stringify(t));
  } catch {
    /* kota dolabilir; kritik eşik kaybı veri kaybı değil */
  }
}

/** Eşiğe göre kritik mi (ayarlanabilir; UI canlı yeniden hesaplar). */
export function isCriticalAmount(
  amount: number,
  unitLabel: string,
  t: StockThresholds = DEFAULT_THRESHOLDS,
): boolean {
  if (unitLabel === "adet") return amount <= t.adet;
  if (unitLabel === "ml") return amount <= t.ml;
  if (unitLabel === "gram") return amount <= t.gram;
  return amount <= t.adet;
}

function isCriticalStock(amount: number, unit: string): boolean {
  return isCriticalAmount(amount, unit, DEFAULT_THRESHOLDS);
}

/**
 * Toptancıya gönderilebilir düz-metin kritik liste (panoya kopyala).
 * Senaryo 2: "🔴 Ay Taşı — 2 adet" satırları; WhatsApp'a yapıştırılır.
 */
export function buildCriticalListText(rows: LiveStockRow[]): string {
  const crit = rows.filter((r) => r.isCritical).sort((a, b) => a.stockAmount - b.stockAmount);
  if (!crit.length) return "Kritik stokta ürün yok.";
  const lines = crit.map((r) => `🔴 ${r.name} — ${r.stockDisplay}`);
  return `KRİTİK STOK (${crit.length})\n${lines.join("\n")}`;
}

function fmtQty(n: number): string {
  const s = n.toFixed(2).replace(/\.?0+$/, "");
  return s || "0";
}

function dogaltasItemsToLiveRows(items: InvItem[], usdRate: number): LiveStockRow[] {
  const rows: LiveStockRow[] = [];
  for (const it of items) {
    const qty = it.adet || 0;
    // USM-006: 0 / negatif stok da dahil edilir → tükenmiş ürün kritik listede görünür.
    const { unit, warning } = unitCostAndCurrency(it, usdRate);
    const costPerUnit = unit > 0 ? unit : it.adet_price || 0;
    rows.push({
      id: `dogaltas:${itemKey(it.name, it.type)}`,
      category: "dogaltas",
      categoryLabel: CATEGORY_LABELS.dogaltas,
      name: it.name,
      groupLabel: it.type,
      stockDisplay: `${fmtQty(qty)} adet`,
      stockAmount: qty,
      unitLabel: "adet",
      costPerUnit,
      costPerUnitLabel: warning
        ? "USD kuru gerekli (dizi)"
        : costPerUnit > 0
          ? `${fmtMoney(costPerUnit)} / adet`
          : "—",
      // Doğaltaşta per-taş satış fiyatı yok (satış kombinasyonla kurulur).
      salePerUnit: null,
      salePerUnitLabel: "—",
      marginPct: null,
      stockValue: warning ? 0 : costPerUnit * Math.max(qty, 0),
      isCritical: isCriticalStock(qty, "adet"),
      photos: it.photos ?? [],
    });
  }
  return rows;
}

// ——— Tekil item → LiveStockRow eşleyiciler (sync ve async yolu paylaşır) ———

function oilItemToRow(it: OilItem): LiveStockRow | null {
  // USM-006: 0 / negatif stok dahil → tükenmiş ürün kritik listede görünür.
  const u = it.baseUnit;
  const sale = it.salePerBase > 0 ? it.salePerBase : null;
  return {
    id: `oil:${it.id}`,
    category: "oil",
    categoryLabel: CATEGORY_LABELS.oil,
    name: it.name,
    groupLabel: `${it.oilType} · ${it.measureType}`,
    stockDisplay: formatOilStock(it),
    stockAmount: it.stockBase,
    unitLabel: oilUnitLabel(u),
    costPerUnit: it.costPerBase,
    costPerUnitLabel: fmtOilUnitCost(it.costPerBase, u),
    salePerUnit: sale,
    salePerUnitLabel: sale != null ? fmtOilUnitCost(sale, u) : "—",
    marginPct: marginOf(it.costPerBase, sale),
    stockValue: it.costPerBase * Math.max(it.stockBase, 0),
    isCritical: isCriticalStock(it.stockBase, u),
    photos: it.photos ?? [],
  };
}

function soapItemToRow(it: SoapCreamItem): LiveStockRow | null {
  // USM-006: 0 / negatif stok dahil.
  const u = it.baseUnit;
  const sale = it.salePerBase > 0 ? it.salePerBase : null;
  return {
    id: `soap_cream:${it.id}`,
    category: "soap_cream",
    categoryLabel: CATEGORY_LABELS.soap_cream,
    name: it.name,
    groupLabel: `${it.productGroup} · ${it.measureType}`,
    stockDisplay: formatSoapStock(it),
    stockAmount: it.stockBase,
    unitLabel: oilUnitLabel(u),
    costPerUnit: it.costPerBase,
    costPerUnitLabel: fmtSoapUnitCost(it.costPerBase, u),
    salePerUnit: sale,
    salePerUnitLabel: sale != null ? fmtSoapUnitCost(sale, u) : "—",
    marginPct: marginOf(it.costPerBase, sale),
    stockValue: it.costPerBase * Math.max(it.stockBase, 0),
    isCritical: isCriticalStock(it.stockBase, u),
    photos: it.photos ?? [],
  };
}

function accessoryItemToRow(it: AccessoryItem): LiveStockRow | null {
  // USM-006: 0 / negatif stok dahil.
  const sale = it.salePerUnit > 0 ? it.salePerUnit : null;
  return {
    id: `accessory:${it.id}`,
    category: "accessory",
    categoryLabel: CATEGORY_LABELS.accessory,
    name: it.name,
    groupLabel: formatAccessoryVariant(it),
    stockDisplay: formatAccessoryStock(it),
    stockAmount: it.stockQty,
    unitLabel: "adet",
    costPerUnit: it.costPerUnit,
    costPerUnitLabel: `${fmtMoney(it.costPerUnit)} / adet`,
    salePerUnit: sale,
    salePerUnitLabel: sale != null ? `${fmtMoney(sale)} / adet` : "—",
    marginPct: marginOf(it.costPerUnit, sale),
    stockValue: it.costPerUnit * Math.max(it.stockQty, 0),
    isCritical: isCriticalStock(it.stockQty, "adet"),
    photos: it.photos ?? [],
  };
}

function otherItemToRow(it: OtherItem): LiveStockRow | null {
  // USM-006: 0 / negatif stok dahil.
  const u = it.baseUnit;
  const sale = it.salePerBase > 0 ? it.salePerBase : null;
  return {
    id: `other:${it.id}`,
    category: "other",
    categoryLabel: CATEGORY_LABELS.other,
    name: it.name,
    groupLabel: formatOtherVariant(it),
    stockDisplay: formatOtherStock(it),
    stockAmount: it.stockBase,
    unitLabel: oilUnitLabel(u),
    costPerUnit: it.costPerBase,
    costPerUnitLabel: fmtOtherUnitCost(it.costPerBase, u),
    salePerUnit: sale,
    salePerUnitLabel: sale != null ? fmtOtherUnitCost(sale, u) : "—",
    marginPct: marginOf(it.costPerBase, sale),
    stockValue: it.costPerBase * Math.max(it.stockBase, 0),
    isCritical: isCriticalStock(it.stockBase, u),
    photos: it.photos ?? [],
  };
}

function pushNonNull(rows: LiveStockRow[], built: (LiveStockRow | null)[]): void {
  for (const r of built) if (r) rows.push(r);
}

/** Sync (localStorage) — demo modu ve çevrimdışı yedek için. */
function appendOtherModuleStockRows(rows: LiveStockRow[]): void {
  pushNonNull(rows, loadOilInventory().map(oilItemToRow));
  pushNonNull(rows, loadSoapCreamInventory().map(soapItemToRow));
  pushNonNull(rows, loadAccessoryInventory().map(accessoryItemToRow));
  pushNonNull(rows, loadOtherInventory().map(otherItemToRow));
}

/**
 * Async (Supabase öncelikli) — yağ/sabun-krem/aksesuar/diğer modüllerini DB'den
 * yükler (her biri localStorage yedekli + eski kayıt migrasyonlu). Böylece taze
 * cihaz/oturumda (cache boşken) tüm modüller görünür — mobil "elinde var mı?"
 * hızlı kontrolü her cihazda çalışır.
 */
async function appendOtherModuleStockRowsAsync(
  rows: LiveStockRow[],
  tenantId: string | null,
): Promise<void> {
  const [oil, soap, accessory, other] = await Promise.all([
    loadOilInventoryForTenant(tenantId),
    loadSoapCreamInventoryForTenant(tenantId),
    loadAccessoryInventoryForTenant(tenantId),
    loadOtherInventoryForTenant(tenantId),
  ]);
  pushNonNull(rows, oil.items.map(oilItemToRow));
  pushNonNull(rows, soap.items.map(soapItemToRow));
  pushNonNull(rows, accessory.items.map(accessoryItemToRow));
  pushNonNull(rows, other.items.map(otherItemToRow));
}

export type LiveStockLoadResult = {
  rows: LiveStockRow[];
  dogaltasSource: "supabase" | "localStorage" | "none";
  tenantId: string | null;
  inventoryDebug: DogaltasInventoryLoadDebug;
  dogaltasListedCount: number;
};

/** Supabase public.dogaltas_inventory öncelikli (tenant_id ile) */
export async function loadLiveStockRowsAsync(
  tenantId: string | null,
  usdRate = 0,
): Promise<LiveStockLoadResult> {
  const rows: LiveStockRow[] = [];
  const inv = await loadDogaltasInventoryForTenant(tenantId);
  const dogaltasRows = dogaltasItemsToLiveRows(inv.items, usdRate);
  rows.push(...dogaltasRows);
  // K-3: yağ/sabun-krem/aksesuar/diğer modülleri de DB öncelikli yüklenir
  // (önceden yalnız localStorage idi → taze cihazda görünmüyordu).
  await appendOtherModuleStockRowsAsync(rows, tenantId);
  return {
    rows,
    dogaltasSource: inv.source,
    tenantId: inv.tenantId,
    inventoryDebug: inv.debug,
    dogaltasListedCount: dogaltasRows.length,
  };
}

export { DOGALTAS_INVENTORY_TABLE };

/** Senkron — doğaltaş için localStorage önbellek; diğer modüller aynı */
export function loadLiveStockRows(usdRate = 0): LiveStockRow[] {
  const rows: LiveStockRow[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("dogaltas_inventory_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          rows.push(
            ...dogaltasItemsToLiveRows(
              parsed.map((r) => {
                const row = r as Record<string, unknown>;
                return {
                  name: String(row.name ?? ""),
                  type: String(row.type ?? ""),
                  adet: Number(row.adet) || 0,
                  dizi_icerik: Number(row.dizi_icerik) || 0,
                  dizi_price: Number(row.dizi_price) || 0,
                  adet_price: Number(row.adet_price) || 0,
                  photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
                  dizi_price_usd: Number(row.dizi_price_usd) || 0,
                  dizi_price_eur: Number(row.dizi_price_eur) || 0,
                  usd_rate: Number(row.usd_rate) || 0,
                  eur_rate: Number(row.eur_rate) || 0,
                  total_cost_try: Number(row.total_cost_try) || 0,
                  unit_cost_try: Number(row.unit_cost_try) || 0,
                };
              }),
              usdRate,
            ),
          );
        }
      }
    } catch {
      /* ignore */
    }
  }
  appendOtherModuleStockRows(rows);
  return rows;
}

export function summarizeLiveStock(rows: LiveStockRow[]): LiveStockSummary {
  const stockByUnit = { adet: 0, ml: 0, gram: 0 };
  let criticalCount = 0;
  let totalValue = 0;
  for (const r of rows) {
    if (r.unitLabel === "adet") stockByUnit.adet += r.stockAmount;
    else if (r.unitLabel === "ml") stockByUnit.ml += r.stockAmount;
    else if (r.unitLabel === "gram") stockByUnit.gram += r.stockAmount;
    if (r.isCritical) criticalCount += 1;
    totalValue += r.stockValue;
  }
  return {
    totalVarieties: rows.length,
    stockByUnit,
    criticalCount,
    totalValue,
  };
}

export function formatStockTotals(summary: LiveStockSummary): string {
  const parts: string[] = [];
  if (summary.stockByUnit.adet > 0) parts.push(`${fmtQty(summary.stockByUnit.adet)} adet`);
  if (summary.stockByUnit.ml > 0) parts.push(`${fmtQty(summary.stockByUnit.ml)} ml`);
  if (summary.stockByUnit.gram > 0) parts.push(`${fmtQty(summary.stockByUnit.gram)} g`);
  return parts.length ? parts.join(" · ") : "—";
}

export function filterLiveStock(
  rows: LiveStockRow[],
  opts: {
    q: string;
    category: LiveStockCategory | "all";
    criticalOnly: boolean;
  },
): LiveStockRow[] {
  let list = rows;
  if (opts.category !== "all") list = list.filter((r) => r.category === opts.category);
  if (opts.criticalOnly) list = list.filter((r) => r.isCritical);
  const ql = opts.q.trim().toLowerCase();
  if (!ql) return list;
  return list.filter(
    (r) =>
      r.name.toLowerCase().includes(ql) ||
      r.groupLabel.toLowerCase().includes(ql) ||
      r.categoryLabel.toLowerCase().includes(ql),
  );
}

export function sortLiveStock(
  rows: LiveStockRow[],
  mode: "stock-asc" | "stock-desc" | "name",
): LiveStockRow[] {
  const next = [...rows];
  if (mode === "stock-asc") next.sort((a, b) => a.stockAmount - b.stockAmount);
  else if (mode === "stock-desc") next.sort((a, b) => b.stockAmount - a.stockAmount);
  else {
    const k = (s: string) => (s || "").replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase();
    next.sort((a, b) => k(a.name).localeCompare(k(b.name), "tr"));
  }
  return next;
}

export type StockDeltaResult = {
  ok: boolean;
  error: string | null;
  newAmount: number | null;
  /** Başarı bilgisi (ör. sunucunun kaydettiği satış tutarı). */
  message?: string | null;
  /** STK-01: stok bu arada başka işlemle değişti; hiçbir şey yazılmadı (liste yenilenmeli). */
  conflict?: boolean;
};

const STOCK_CHANGED_MSG =
  "Stok bu arada başka bir işlemle değişti; hiçbir değişiklik yapılmadı. Güncel stok yüklendi, lütfen tekrar deneyin.";

/**
 * Canlı Stok kartından hızlı "− Sat" / "+ Ekle". deltaBase ürünün taban biriminde (satışta NEGATİF).
 *
 * Gerçek hesap:
 *  - "− Sat" (BUG-019 + STK-01): CANONICAL atomik satış RPC'si (inventory_sale_create_atomic) —
 *    stok sunucuda kilitli satırda düşer, satış geçmişine/raporlara yazılır. Fiyat sunucu kuralıyla
 *    (ürünün satış fiyatı; yoksa maliyet) hesaplanır ve kaydedilen tutar kullanıcıya bildirilir.
 *    `idempotencyKey` aynı denemenin tekrarında aynı kalır (STK-03): ikinci kez satış oluşmaz.
 *  - "+ Ekle" (STK-01): yalnız stok miktarı, ekranın dayandığı DB değeri (row.stockAmount) hâlâ
 *    geçerliyse yazılır (karşılaştır-ve-yaz); değiştiyse hiçbir şey yazılmaz → conflict.
 *    Tarayıcı önbelleği stok hesabına KATILMAZ.
 * Demo / tenant'sız: eski yerel (localStorage) önizleme davranışı.
 */
export async function applyStockDelta(
  row: LiveStockRow,
  deltaBase: number,
  tenantId: string | null,
  isDemo: boolean,
  idempotencyKey?: string,
): Promise<StockDeltaResult> {
  if (!Number.isFinite(deltaBase) || deltaBase === 0) {
    return { ok: false, error: "Geçerli bir miktar girin.", newAmount: null };
  }
  const clientId = row.id.slice(row.category.length + 1); // "oil:xyz" → "xyz"
  const guard = (current: number): { ok: true; next: number } | { ok: false; error: string } => {
    const next = current + deltaBase;
    if (next < 0) return { ok: false, error: `Stokta sadece ${fmtQty(current)} ${row.unitLabel} var.` };
    return { ok: true, next };
  };

  if (isDemo || !tenantId) return applyStockDeltaLocal(row, clientId, guard);

  const current = row.stockAmount;
  const g = guard(current);
  if (!g.ok) return { ok: false, error: g.error, newAmount: null };

  if (deltaBase < 0) {
    const quantity = -deltaBase;
    const line =
      row.category === "dogaltas"
        ? { name: row.name, type: row.groupLabel, quantity }
        : { clientId, quantity };
    const res = await createCategorySale({
      category: row.category,
      idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
      lines: [line],
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Satış kaydedilemedi.", newAmount: null };
    const total = Number(res.sale?.total_sale);
    return {
      ok: true,
      error: null,
      newAmount: null,
      message: Number.isFinite(total)
        ? `Satış kaydedildi: ${fmtQty(quantity)} ${row.unitLabel} · ${fmtMoney(total)}`
        : "Satış kaydedildi.",
    };
  }

  const stockWrite = async (
    write: (tid: string, cid: string, expected: number, next: number) =>
      Promise<{ ok: boolean; conflict: boolean; error: string | null }>,
  ): Promise<StockDeltaResult> => {
    const r = await write(tenantId, clientId, current, g.next);
    if (r.conflict) return { ok: false, conflict: true, error: STOCK_CHANGED_MSG, newAmount: null };
    if (!r.ok) return { ok: false, error: r.error ?? "Bulut güncellenemedi.", newAmount: null };
    return { ok: true, error: null, newAmount: g.next };
  };

  if (row.category === "oil") return stockWrite(setOilInventoryStock);
  if (row.category === "soap_cream") return stockWrite(setSoapCreamInventoryStock);
  if (row.category === "accessory") return stockWrite(setAccessoryInventoryStock);
  if (row.category === "other") return stockWrite(setOtherInventoryStock);

  if (row.category === "dogaltas") {
    // Doğaltaş stoğu Doğaltaş'ın kendi API'si üzerinden yazılır (bu turda DEĞİŞTİRİLMEDİ).
    // Önbellek yerine DB'den taze okunur; ekranın dayandığı değer değiştiyse yazılmaz.
    // Kalan risk: taze okuma ile yazma arasındaki kısa pencere atomik DEĞİL (BLOKE; rapora bkz.).
    const fresh = await fetchDogaltasInventoryFromDb(tenantId);
    if (fresh.error) return { ok: false, error: fresh.error, newAmount: null };
    const cur = fresh.items.find((it) => itemKey(it.name, it.type) === clientId);
    if (!cur) return { ok: false, error: "Kayıt bulunamadı.", newAmount: null };
    if ((cur.adet || 0) !== current) {
      return { ok: false, conflict: true, error: STOCK_CHANGED_MSG, newAmount: null };
    }
    let it: InvItem = { ...cur, adet: g.next, photos: [...(cur.photos || [])] };
    if (isDizi(it.type) && (it.adet_price || 0) > 0) {
      it.dizi_price = Math.round((it.adet_price || 0) * it.adet * 100) / 100;
    }
    it = applyItemCostTotals(it);
    const r = await syncDogaltasInventoryToDb(tenantId, [it]);
    if (!r.ok) return { ok: false, error: r.error ?? "Bulut güncellenemedi.", newAmount: null };
    return { ok: true, error: null, newAmount: g.next };
  }

  return { ok: false, error: "Bilinmeyen kategori.", newAmount: null };
}

/** Demo / tenant'sız yerel önizleme (kalıcı kayıt yok) — eski davranış korunur. */
function applyStockDeltaLocal(
  row: LiveStockRow,
  clientId: string,
  guard: (current: number) => { ok: true; next: number } | { ok: false; error: string },
): StockDeltaResult {
  if (row.category === "oil") {
    const items = loadOilInventory();
    const idx = items.findIndex((it) => it.id === clientId);
    if (idx < 0) return { ok: false, error: "Kayıt bulunamadı.", newAmount: null };
    const g = guard(items[idx].stockBase);
    if (!g.ok) return { ok: false, error: g.error, newAmount: null };
    items[idx] = { ...items[idx], stockBase: g.next };
    saveOilInventory(items);
    return { ok: true, error: null, newAmount: g.next };
  }
  if (row.category === "soap_cream") {
    const items = loadSoapCreamInventory();
    const idx = items.findIndex((it) => it.id === clientId);
    if (idx < 0) return { ok: false, error: "Kayıt bulunamadı.", newAmount: null };
    const g = guard(items[idx].stockBase);
    if (!g.ok) return { ok: false, error: g.error, newAmount: null };
    items[idx] = { ...items[idx], stockBase: g.next };
    saveSoapCreamInventory(items);
    return { ok: true, error: null, newAmount: g.next };
  }
  if (row.category === "accessory") {
    const items = loadAccessoryInventory();
    const idx = items.findIndex((it) => it.id === clientId);
    if (idx < 0) return { ok: false, error: "Kayıt bulunamadı.", newAmount: null };
    const g = guard(items[idx].stockQty);
    if (!g.ok) return { ok: false, error: g.error, newAmount: null };
    items[idx] = { ...items[idx], stockQty: g.next };
    saveAccessoryInventory(items);
    return { ok: true, error: null, newAmount: g.next };
  }
  if (row.category === "other") {
    const items = loadOtherInventory();
    const idx = items.findIndex((it) => it.id === clientId);
    if (idx < 0) return { ok: false, error: "Kayıt bulunamadı.", newAmount: null };
    const g = guard(items[idx].stockBase);
    if (!g.ok) return { ok: false, error: g.error, newAmount: null };
    items[idx] = { ...items[idx], stockBase: g.next };
    saveOtherInventory(items);
    return { ok: true, error: null, newAmount: g.next };
  }
  if (row.category === "dogaltas") {
    const items = loadDogaltasInventory();
    const idx = items.findIndex((it) => itemKey(it.name, it.type) === clientId);
    if (idx < 0) return { ok: false, error: "Kayıt bulunamadı.", newAmount: null };
    const g = guard(items[idx].adet);
    if (!g.ok) return { ok: false, error: g.error, newAmount: null };
    // Modülün kendi yeniden-hesabı: dizi ise dizi_price = adet_price × adet,
    // sonra total/unit maliyet alanları (kâr modelini bozmadan).
    let it: InvItem = { ...items[idx], adet: g.next, photos: [...(items[idx].photos || [])] };
    if (isDizi(it.type) && (it.adet_price || 0) > 0) {
      it.dizi_price = Math.round((it.adet_price || 0) * it.adet * 100) / 100;
    }
    it = applyItemCostTotals(it);
    items[idx] = it;
    saveDogaltasInventory(items);
    return { ok: true, error: null, newAmount: g.next };
  }
  return { ok: false, error: "Bilinmeyen kategori.", newAmount: null };
}

export { CATEGORY_LABELS, fmtMoney };
