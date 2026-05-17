/** Merkezi satış — tüm envanter localStorage kaynaklarını normalize ederek okur */

import {
  type AccessoryItem,
  formatStockDisplay as formatAccessoryStock,
  formatVariantLabel as formatAccessoryVariant,
} from "@/lib/urun-stok/accessoryStockLogic";
import {
  type InvItem,
  itemKey,
  unitCostAndCurrency,
} from "@/lib/urun-stok/dogaltasStockLogic";
import type { ProductCategory } from "@/lib/urun-stok/generalSalesLogic";

export type { ProductCategory };

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  dogaltas: "Doğaltaş",
  oil: "Yağ",
  soap_cream: "Sabun / Krem",
  accessory: "Tespih / Takı / Aksesuar",
  other: "Diğer Ürünler",
};

/** Merkezi satış ürün kartı — generalSalesLogic.UnifiedProduct ile uyumlu */
export type CatalogProduct = {
  category: ProductCategory;
  sourceKey: string;
  productId: string;
  name: string;
  productGroup: string;
  subtitle: string;
  stockDisplay: string;
  stockAmount: number;
  saleMode: "adet" | "measure";
  measureType?: string;
  saleUnits?: OilInputUnit[];
  baseUnit?: "adet" | "ml" | "gram";
  costPerUnit: number;
  salePerUnit: number;
  profitPct: number;
  unitLabel: string;
  photoCount: number;
  photos: string[];
  dogaltasStone?: string;
  dogaltasType?: string;
};

const STOCK_KEYS = [
  "stockBase",
  "stockAmount",
  "stock",
  "adet",
  "stokMiktari",
  "qty",
  "quantity",
  "stockQty",
] as const;

function unitsForMeasureType(measureType: string): OilInputUnit[] {
  if (measureType === "Adet") return ["adet"];
  if (measureType === "Gram / KG") return ["gram", "kg"];
  return ["ml", "litre"];
}
import {
  type OilInputUnit,
  type OilItem,
  formatStockDisplay as formatOilStock,
  fmtUnitCost as fmtOilUnitCost,
  measureTypeToBase as oilMeasureTypeToBase,
} from "@/lib/urun-stok/oilStockLogic";
import {
  type OtherItem,
  formatStockDisplay as formatOtherStock,
  formatVariantLabel as formatOtherVariantLabel,
  measureTypeToBase as otherMeasureTypeToBase,
} from "@/lib/urun-stok/otherStockLogic";
import {
  type SoapCreamItem,
  formatStockDisplay as formatSoapStock,
  measureTypeToBase as soapMeasureTypeToBase,
} from "@/lib/urun-stok/soapCreamStockLogic";
import { toFloat } from "@/lib/urun-stok/dogaltasStockLogic";

export const INVENTORY_SOURCE_KEYS: Record<ProductCategory, string> = {
  dogaltas: "dogaltas_inventory_v1",
  oil: "oil_inventory_v1",
  soap_cream: "soap_cream_inventory_v1",
  accessory: "accessory_inventory_v1",
  other: "other_inventory_v1",
};

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    if (r[k] != null && r[k] !== "") {
      const n = toFloat(r[k], NaN);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function pickPhotos(r: Record<string, unknown>): string[] {
  return Array.isArray(r.photos) ? (r.photos as string[]) : Array.isArray(r.images) ? (r.images as string[]) : [];
}

function loadRawArray(storageKey: string): Record<string, unknown>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadDogaltasProducts(usdRate: number): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  for (const r of loadRawArray(INVENTORY_SOURCE_KEYS.dogaltas)) {
    const name = pickStr(r, "name", "productName", "urunAdi");
    const type = pickStr(r, "type", "group", "productGroup", "urunGrubu");
    if (!name) continue;
    const adet = pickNum(r, "adet", "stockAmount", "stock", "stokMiktari", "qty", "quantity");
    if (adet <= 0) continue;
    const it: InvItem = {
      name,
      type,
      adet,
      dizi_icerik: pickNum(r, "dizi_icerik"),
      dizi_price: pickNum(r, "dizi_price"),
      adet_price: pickNum(r, "adet_price", "cost", "costPerBase", "purchaseCost", "alisMaliyeti"),
      photos: pickPhotos(r),
      dizi_price_usd: pickNum(r, "dizi_price_usd"),
    };
    const { unit } = unitCostAndCurrency(it, usdRate);
    const costPerUnit = unit > 0 ? unit : it.adet_price || 0;
    const salePerUnit =
      pickNum(r, "salePerBase", "salePrice", "sellingPrice", "satisFiyati") || costPerUnit;
    out.push({
      category: "dogaltas",
      sourceKey: INVENTORY_SOURCE_KEYS.dogaltas,
      productId: itemKey(name, type),
      name,
      productGroup: type,
      subtitle: type,
      stockDisplay: `${adet} adet`,
      stockAmount: adet,
      saleMode: "adet",
      costPerUnit,
      salePerUnit: salePerUnit > 0 ? salePerUnit : costPerUnit,
      profitPct: pickNum(r, "profitPct", "profit_pct") || 100,
      unitLabel: "adet",
      photoCount: it.photos.length,
      photos: it.photos,
      dogaltasStone: name,
      dogaltasType: type,
    });
  }
  return out;
}

function parseOilLikeItem(
  r: Record<string, unknown>,
  idPrefix: string,
): {
  id: string;
  name: string;
  productGroup: string;
  oilType: string;
  measureType: string;
  stockBase: number;
  baseUnit: "adet" | "ml" | "gram";
  costPerBase: number;
  salePerBase: number;
  profitPct: number;
  photos: string[];
} {
  const measureType = pickStr(r, "measureType", "measure_type") || "Adet";
  const baseUnit =
    (pickStr(r, "baseUnit", "unit", "birim") as "adet" | "ml" | "gram") ||
    oilMeasureTypeToBase(measureType);
  const stockBase = pickNum(
    r,
    "stockBase",
    "stockAmount",
    "stock",
    "adet",
    "stokMiktari",
    "qty",
    "quantity",
  );
  const costPerBase = pickNum(
    r,
    "costPerBase",
    "cost",
    "totalCost",
    "purchaseCost",
    "alisMaliyeti",
  );
  const salePerBase =
    pickNum(r, "salePerBase", "salePrice", "sellingPrice", "satisFiyati") || costPerBase;
  return {
    id: pickStr(r, "id") || newId(idPrefix),
    name: pickStr(r, "name", "productName", "urunAdi"),
    productGroup: pickStr(r, "productGroup", "group", "oilType", "urunGrubu", "type"),
    oilType: pickStr(r, "oilType", "type", "group"),
    measureType,
    stockBase,
    baseUnit,
    costPerBase,
    salePerBase,
    profitPct: pickNum(r, "profitPct", "profit_pct") || 100,
    photos: pickPhotos(r),
  };
}

function oilItemToUnified(
  it: OilItem,
  category: ProductCategory,
  sourceKey: string,
  subtitleParts: string[],
): CatalogProduct {
  return {
    category,
    sourceKey,
    productId: it.id,
    name: it.name,
    productGroup: subtitleParts[0] || it.oilType || "",
    subtitle: subtitleParts.filter(Boolean).join(" · "),
    stockDisplay: formatOilStock(it),
    stockAmount: it.stockBase,
    saleMode: it.baseUnit === "adet" ? "adet" : "measure",
    measureType: it.measureType,
    saleUnits: unitsForMeasureType(it.measureType) as OilInputUnit[],
    baseUnit: it.baseUnit,
    costPerUnit: it.costPerBase,
    salePerUnit: it.salePerBase,
    profitPct: it.profitPct,
    unitLabel: it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet",
    photoCount: it.photos?.length ?? 0,
    photos: it.photos ?? [],
  };
}

function loadOilProducts(): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  for (const r of loadRawArray(INVENTORY_SOURCE_KEYS.oil)) {
    const p = parseOilLikeItem(r, "oil");
    if (!p.name || p.stockBase <= 0) continue;
    const it: OilItem = {
      id: p.id,
      name: p.name,
      oilType: p.oilType,
      measureType: p.measureType as OilItem["measureType"],
      stockBase: p.stockBase,
      baseUnit: p.baseUnit,
      costPerBase: p.costPerBase,
      salePerBase: p.salePerBase,
      profitPct: p.profitPct,
      bottleVolume: pickStr(r, "bottleVolume", "bottle_volume"),
      bottleVolumeCustom: pickStr(r, "bottleVolumeCustom", "bottle_volume_custom"),
      packageType: pickStr(r, "packageType", "package_type"),
      photos: p.photos,
      note: pickStr(r, "note"),
    };
    out.push(
      oilItemToUnified(it, "oil", INVENTORY_SOURCE_KEYS.oil, [
        p.oilType,
        p.measureType,
      ]),
    );
  }
  return out;
}

function loadSoapProducts(): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  for (const r of loadRawArray(INVENTORY_SOURCE_KEYS.soap_cream)) {
    const p = parseOilLikeItem(r, "sc");
    if (!p.name || p.stockBase <= 0) continue;
    const productGroup = pickStr(r, "productGroup", "group", "urunGrubu") || p.productGroup;
    const it: SoapCreamItem = {
      id: p.id,
      name: p.name,
      productGroup,
      measureType: p.measureType as SoapCreamItem["measureType"],
      stockBase: p.stockBase,
      baseUnit: p.baseUnit,
      costPerBase: p.costPerBase,
      salePerBase: p.salePerBase,
      profitPct: p.profitPct,
      packagingType: pickStr(r, "packagingType", "packageType", "package_type"),
      netAmount: pickStr(r, "netAmount", "net_amount"),
      expiryDate: pickStr(r, "expiryDate", "expireDate", "expire_date"),
      lotNo: pickStr(r, "lotNo", "lot_no"),
      photos: pickPhotos(r),
      note: pickStr(r, "note"),
    };
    out.push({
      category: "soap_cream",
      sourceKey: INVENTORY_SOURCE_KEYS.soap_cream,
      productId: it.id,
      name: it.name,
      productGroup,
      subtitle: `${productGroup} · ${it.measureType}`,
      stockDisplay: formatSoapStock(it),
      stockAmount: it.stockBase,
      saleMode: it.baseUnit === "adet" ? "adet" : "measure",
      measureType: it.measureType,
      saleUnits: unitsForMeasureType(it.measureType) as OilInputUnit[],
      baseUnit: it.baseUnit,
      costPerUnit: it.costPerBase,
      salePerUnit: it.salePerBase,
      profitPct: it.profitPct,
      unitLabel: it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet",
      photoCount: it.photos?.length ?? 0,
      photos: it.photos ?? [],
    });
  }
  return out;
}

function loadAccessoryProducts(): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  for (const r of loadRawArray(INVENTORY_SOURCE_KEYS.accessory)) {
    const name = pickStr(r, "name", "productName", "urunAdi");
    if (!name) continue;
    const stockQty = pickNum(
      r,
      "stockQty",
      "stockBase",
      "stockAmount",
      "stock",
      "adet",
      "stokMiktari",
      "qty",
    );
    if (stockQty <= 0) continue;
    const productGroup = pickStr(r, "productGroup", "group", "type", "urunGrubu");
    const it: AccessoryItem = {
      id: pickStr(r, "id") || newId("acc"),
      name,
      productGroup,
      productModel: pickStr(r, "productModel", "variationDetail", "model", "variation_detail"),
      material: pickStr(r, "material"),
      color: pickStr(r, "color"),
      sizeKind: pickStr(r, "sizeKind", "size_kind"),
      sizeDetail: pickStr(r, "sizeDetail", "size_detail"),
      stockQty,
      costPerUnit: pickNum(r, "costPerUnit", "cost", "costPerBase", "purchaseCost", "alisMaliyeti"),
      salePerUnit: pickNum(r, "salePerUnit", "salePrice", "sellingPrice", "satisFiyati"),
      profitPct: pickNum(r, "profitPct", "profit_pct") || 100,
      barcode: pickStr(r, "barcode"),
      photos: pickPhotos(r),
      note: pickStr(r, "note"),
    };
    if (it.costPerUnit <= 0 && it.salePerUnit > 0) it.costPerUnit = it.salePerUnit;
    if (it.salePerUnit <= 0) it.salePerUnit = it.costPerUnit;
    out.push({
      category: "accessory",
      sourceKey: INVENTORY_SOURCE_KEYS.accessory,
      productId: it.id,
      name: it.name,
      productGroup,
      subtitle: formatAccessoryVariant(it),
      stockDisplay: formatAccessoryStock(it),
      stockAmount: it.stockQty,
      saleMode: "adet",
      costPerUnit: it.costPerUnit,
      salePerUnit: it.salePerUnit,
      profitPct: it.profitPct,
      unitLabel: "adet",
      photoCount: it.photos?.length ?? 0,
      photos: it.photos ?? [],
    });
  }
  return out;
}

function loadOtherProducts(): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  for (const r of loadRawArray(INVENTORY_SOURCE_KEYS.other)) {
    const name = pickStr(r, "name", "productName", "urunAdi");
    if (!name) continue;
    const measureType = (pickStr(r, "measureType", "measure_type") || "Adet") as OtherItem["measureType"];
    const baseUnit =
      (pickStr(r, "baseUnit", "unit", "birim") as OtherItem["baseUnit"]) ||
      otherMeasureTypeToBase(measureType);
    const stockBase = pickNum(
      r,
      "stockBase",
      "stockAmount",
      "stock",
      "adet",
      "stokMiktari",
      "qty",
      "quantity",
    );
    if (stockBase <= 0) continue;
    const productGroup = pickStr(r, "productGroup", "group", "type", "urunGrubu");
    const it: OtherItem = {
      id: pickStr(r, "id") || newId("oth"),
      name,
      productGroup,
      subCategory: pickStr(r, "subCategory", "sub_category", "model"),
      measureType,
      stockBase,
      baseUnit,
      costPerBase: pickNum(r, "costPerBase", "cost", "totalCost", "purchaseCost", "alisMaliyeti"),
      salePerBase: pickNum(r, "salePerBase", "salePrice", "sellingPrice", "satisFiyati"),
      profitPct: pickNum(r, "profitPct", "profit_pct") || 100,
      variationKind: pickStr(r, "variationKind", "variation_kind"),
      variationDetail: pickStr(r, "variationDetail", "variation_detail"),
      barcode: pickStr(r, "barcode"),
      photos: pickPhotos(r),
      note: pickStr(r, "note"),
    };
    if (!it.barcode) it.barcode = "";
    if (it.salePerBase <= 0) it.salePerBase = it.costPerBase;
    out.push({
      category: "other",
      sourceKey: INVENTORY_SOURCE_KEYS.other,
      productId: it.id,
      name: it.name,
      productGroup,
      subtitle: formatOtherVariantLabel(it),
      stockDisplay: formatOtherStock(it),
      stockAmount: it.stockBase,
      saleMode: it.baseUnit === "adet" ? "adet" : "measure",
      measureType: it.measureType,
      saleUnits: unitsForMeasureType(it.measureType) as OilInputUnit[],
      baseUnit: it.baseUnit,
      costPerUnit: it.costPerBase,
      salePerUnit: it.salePerBase,
      profitPct: it.profitPct,
      unitLabel: it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet",
      photoCount: it.photos?.length ?? 0,
      photos: it.photos ?? [],
    });
  }
  return out;
}

function recordStock(r: Record<string, unknown>): number {
  return pickNum(r, ...STOCK_KEYS);
}

function setRecordStock(r: Record<string, unknown>, value: number): void {
  let set = false;
  for (const k of STOCK_KEYS) {
    if (r[k] != null && r[k] !== "") {
      r[k] = value;
      set = true;
    }
  }
  if (!set) r.stockBase = value;
}

function recordMatches(
  r: Record<string, unknown>,
  category: ProductCategory,
  productId: string,
): boolean {
  if (category === "dogaltas") {
    const name = pickStr(r, "name", "productName", "urunAdi");
    const type = pickStr(r, "type", "group", "productGroup", "urunGrubu");
    return itemKey(name, type) === productId;
  }
  const id = pickStr(r, "id");
  return id === productId;
}

/** Satış sonrası ilgili localStorage envanterinden stok düşer */
export function deductCentralInventory(
  sourceKey: string,
  category: ProductCategory,
  lines: { productId: string; saleBaseQty: number }[],
): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: false, error: "Tarayıcı ortamı gerekli." };
  const rows = loadRawArray(sourceKey);
  if (!rows.length && lines.length) return { ok: false, error: "Envanter kaydı bulunamadı." };

  for (const ln of lines) {
    const idx = rows.findIndex((r) => recordMatches(r, category, ln.productId));
    if (idx < 0) return { ok: false, error: "Stokta ürün bulunamadı." };
    const cur = recordStock(rows[idx]);
    if (ln.saleBaseQty > cur) return { ok: false, error: "Yetersiz stok." };
    setRecordStock(rows[idx], Math.max(0, cur - ln.saleBaseQty));
  }

  localStorage.setItem(sourceKey, JSON.stringify(rows));
  return { ok: true };
}

/** Tüm kategorilerden satışa hazır ürünleri normalize ederek yükler */
export function loadCentralSalesProducts(usdRate = 0): CatalogProduct[] {
  return [
    ...loadDogaltasProducts(usdRate),
    ...loadOilProducts(),
    ...loadSoapProducts(),
    ...loadAccessoryProducts(),
    ...loadOtherProducts(),
  ];
}

export function countCentralSalesInventory(): Record<ProductCategory, number> {
  const products = loadCentralSalesProducts(0);
  const counts: Record<ProductCategory, number> = {
    dogaltas: 0,
    oil: 0,
    soap_cream: 0,
    accessory: 0,
    other: 0,
  };
  for (const p of products) counts[p.category] += 1;
  return counts;
}

export function filterCentralProducts(
  products: CatalogProduct[],
  category: ProductCategory | "all",
  q: string,
): CatalogProduct[] {
  let list = products;
  if (category !== "all") list = list.filter((p) => p.category === category);
  const ql = q.trim().toLowerCase();
  if (!ql) return list;
  return list.filter(
    (p) =>
      p.name.toLowerCase().includes(ql) ||
      p.productGroup.toLowerCase().includes(ql) ||
      p.subtitle.toLowerCase().includes(ql) ||
      CATEGORY_LABELS[p.category].toLowerCase().includes(ql),
  );
}

export function centralOptionLabel(p: CatalogProduct): string {
  const group = p.productGroup || p.subtitle || "—";
  return `${p.name} | ${group} | Stok: ${p.stockDisplay}`;
}
