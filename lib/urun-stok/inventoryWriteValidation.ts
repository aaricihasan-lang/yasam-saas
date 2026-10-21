/**
 * inventoryWriteValidation.ts — Ürün & Stok CRUD sunucu doğrulaması (STK-05).
 *
 * Eski davranış: route'lar yalnız `tenant_id / id / created_at` alanlarını ATIYOR (denylist),
 * geri kalan her alanı olduğu gibi DB'ye yazıyordu → negatif stok, "abc" maliyet, bilinmeyen
 * kolon, client_id değişimi kabul ediliyor; hata olunca ham Postgres metni dönüyordu.
 *
 * Yeni kural (ALLOWLIST): her kategori için yazılabilir alanlar AÇIKÇA listelenir.
 *  - Listede olmayan alan → 400 (tenant_id / id / created_at / updated_at dahil).
 *  - Sayısal alanlar: sonlu sayı (NaN / Infinity / metin / null RED); stok / maliyet / satış
 *    fiyatı 0 ≤ değer ≤ üst sınır; kâr % yalnız |değer| ≤ üst sınır (negatif mevcut sözleşmede var).
 *    Kesirli değerler (ör. 12,5 ml; 0,35 ₺/ml) GEÇERLİ kalır.
 *  - Ölçü tipi / taban birim: yalnız mevcut sözleşmedeki değerler ("Adet", "ML / Litre",
 *    "Gram / KG" ↔ "adet", "ml", "gram"). Yeni kayıtta ikisi birbiriyle tutarlı olmalı
 *    (satış RPC'si birimi base_unit'ten okur). Güncellemede yalnız tek tek geçerlilik aranır:
 *    geçmişte tutarsız kaydedilmiş bir ürünün düzenlenmesi kilitlenmez.
 *  - Metin alanları: string olmalı, kırpılır, üst sınır uygulanır. Sınırlar istemcinin
 *    bugünkü sınırlarından GENİŞ tutulur (mevcut kayıtlar düzenlenebilir kalır).
 *  - client_id yalnız oluştururken alınır; güncellemede DEĞİŞTİRİLEMEZ (yok sayılır).
 *  - Stok alanının eşzamanlılık koruması (expected_stock, 409/428) S1'deki
 *    guardedStockPatch.ts'te kalır; burada yalnız değer geçerliliği denetlenir.
 */

export type InventoryCategory = "oil" | "soap_cream" | "accessory" | "other";
export type WriteMode = "create" | "update";

const MAX_AMOUNT = 1_000_000_000; // stok / maliyet / satış üst sınırı (satış RPC'siyle aynı ölçek)
const MAX_PROFIT_PCT = 1_000_000; // satış RPC'si markup_pct üst sınırı
const NAME_MAX = 200;
const LABEL_MAX = 80; // serbest metinli tür/grup/ambalaj/malzeme (FREE_TEXT_SERVER_MAX)
const SHORT_MAX = 120;
const NOTE_MAX = 5000;
const CLIENT_ID_MAX = 120;
const PHOTOS_MAX = 20; // istemci 5 ile sınırlar; eski kayıtlar için pay bırakılır
const PHOTO_CHARS_MAX = 6 * 1024 * 1024;

export const MEASURE_TYPES = ["Adet", "ML / Litre", "Gram / KG"] as const;
export const BASE_UNITS = ["adet", "ml", "gram"] as const;
const BASE_FOR_MEASURE: Record<string, string> = { "Adet": "adet", "ML / Litre": "ml", "Gram / KG": "gram" };

type FieldSpec =
  | { kind: "text"; max: number; label: string; required?: boolean }
  | { kind: "amount"; label: string }
  | { kind: "pct"; label: string }
  | { kind: "enum"; values: readonly string[]; label: string }
  | { kind: "photos" };

const COMMON: Record<string, FieldSpec> = {
  name: { kind: "text", max: NAME_MAX, label: "Ürün adı", required: true },
  profit_pct: { kind: "pct", label: "Kâr oranı" },
  photos: { kind: "photos" },
  note: { kind: "text", max: NOTE_MAX, label: "Not" },
};
const MEASURED: Record<string, FieldSpec> = {
  measure_type: { kind: "enum", values: MEASURE_TYPES, label: "Ölçü tipi" },
  base_unit: { kind: "enum", values: BASE_UNITS, label: "Birim" },
  stock_base: { kind: "amount", label: "Stok miktarı" },
  cost_per_base: { kind: "amount", label: "Alış maliyeti" },
  sale_per_base: { kind: "amount", label: "Satış fiyatı" },
};

/** Kategori başına YAZILABİLİR alanlar (istemcinin *ItemToDbPayload alanlarıyla birebir). */
export const INVENTORY_FIELDS: Record<InventoryCategory, Record<string, FieldSpec>> = {
  oil: {
    ...COMMON, ...MEASURED,
    oil_type: { kind: "text", max: LABEL_MAX, label: "Yağ türü" },
    bottle_volume: { kind: "text", max: LABEL_MAX, label: "Şişe hacmi" },
    bottle_volume_custom: { kind: "text", max: LABEL_MAX, label: "Özel şişe hacmi" },
    package_type: { kind: "text", max: LABEL_MAX, label: "Paket tipi" },
  },
  soap_cream: {
    ...COMMON, ...MEASURED,
    product_group: { kind: "text", max: LABEL_MAX, label: "Ürün grubu" },
    packaging_type: { kind: "text", max: LABEL_MAX, label: "Ambalaj tipi" },
    net_amount: { kind: "text", max: SHORT_MAX, label: "Net miktar" },
    expiry_date: { kind: "text", max: SHORT_MAX, label: "Son kullanma tarihi" },
    lot_no: { kind: "text", max: SHORT_MAX, label: "Lot no" },
  },
  accessory: {
    ...COMMON,
    product_group: { kind: "text", max: LABEL_MAX, label: "Ürün grubu" },
    product_model: { kind: "text", max: SHORT_MAX, label: "Model" },
    material: { kind: "text", max: LABEL_MAX, label: "Malzeme" },
    color: { kind: "text", max: SHORT_MAX, label: "Renk" },
    size_kind: { kind: "text", max: LABEL_MAX, label: "Ölçü türü" },
    size_detail: { kind: "text", max: SHORT_MAX, label: "Ölçü detayı" },
    stock_qty: { kind: "amount", label: "Stok miktarı" },
    cost_per_unit: { kind: "amount", label: "Alış maliyeti" },
    sale_per_unit: { kind: "amount", label: "Satış fiyatı" },
    barcode: { kind: "text", max: SHORT_MAX, label: "Barkod" },
  },
  other: {
    ...COMMON, ...MEASURED,
    product_group: { kind: "text", max: LABEL_MAX, label: "Ürün grubu" },
    sub_category: { kind: "text", max: LABEL_MAX, label: "Alt kategori" },
    variation_kind: { kind: "text", max: LABEL_MAX, label: "Varyasyon türü" },
    variation_detail: { kind: "text", max: SHORT_MAX, label: "Varyasyon detayı" },
    barcode: { kind: "text", max: SHORT_MAX, label: "Barkod" },
  },
};

/** İstek gövdesinde bulunabilen ama DB'ye doğrudan yazılmayan kontrol alanları. */
const CONTROL_KEYS = new Set(["id", "expected_stock", "client_id"]);

export type ValidationResult =
  | { ok: true; fields: Record<string, unknown>; clientId: string | null }
  | { ok: false; error: string; field?: string };

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || !/^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/.test(t)) return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Gövdeyi kategori allowlist'ine göre doğrular ve DB'ye yazılacak alanları döndürür.
 * `create`: ürün adı ve client_id zorunlu; ölçü tipi ↔ birim tutarlılığı aranır.
 * `update`: yalnız gönderilen alanlar doğrulanır; client_id yok sayılır (değiştirilemez).
 */
export function validateInventoryWrite(
  category: InventoryCategory,
  body: Record<string, unknown>,
  mode: WriteMode,
): ValidationResult {
  const spec = INVENTORY_FIELDS[category];
  const fields: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(body)) {
    if (CONTROL_KEYS.has(key)) continue;
    const f = spec[key];
    if (!f) return { ok: false, field: key, error: `İzin verilmeyen alan: ${key}.` };

    if (f.kind === "text") {
      if (typeof raw !== "string") return { ok: false, field: key, error: `${f.label} metin olmalıdır.` };
      const t = raw.trim();
      if (t.length > f.max) return { ok: false, field: key, error: `${f.label} en fazla ${f.max} karakter olabilir.` };
      if (f.required && !t) return { ok: false, field: key, error: `${f.label} zorunludur.` };
      fields[key] = t;
    } else if (f.kind === "amount" || f.kind === "pct") {
      const n = toFiniteNumber(raw);
      const max = f.kind === "pct" ? MAX_PROFIT_PCT : MAX_AMOUNT;
      if (n === null) return { ok: false, field: key, error: `${f.label} geçerli bir sayı olmalıdır.` };
      // Kâr %: arayüz negatif değeri kabul ediyor ve eski kayıtlarda bulunabilir; anlamı "satış
      // fiyatını kullan" (satış RPC'si markup'ı yalnız > 0 ise uygular) → yalnız büyüklük sınırı.
      if (f.kind === "amount" && n < 0) return { ok: false, field: key, error: `${f.label} negatif olamaz.` };
      if (Math.abs(n) > max) return { ok: false, field: key, error: `${f.label} izin verilen üst sınırı aşıyor.` };
      fields[key] = n;
    } else if (f.kind === "enum") {
      if (typeof raw !== "string" || !f.values.includes(raw)) {
        return { ok: false, field: key, error: `${f.label} geçersiz.` };
      }
      fields[key] = raw;
    } else {
      if (!Array.isArray(raw)) return { ok: false, field: key, error: "Fotoğraf listesi geçersiz." };
      if (raw.length > PHOTOS_MAX) return { ok: false, field: key, error: `En fazla ${PHOTOS_MAX} fotoğraf kaydedilebilir.` };
      for (const p of raw) {
        if (typeof p !== "string" || p.length > PHOTO_CHARS_MAX) {
          return { ok: false, field: key, error: "Fotoğraf listesi geçersiz." };
        }
      }
      fields[key] = raw;
    }
  }

  let clientId: string | null = null;
  if (mode === "create") {
    const name = typeof fields.name === "string" ? fields.name : "";
    if (!name) return { ok: false, field: "name", error: "Ürün adı zorunludur." };
    const cid = typeof body.client_id === "string" ? body.client_id.trim() : "";
    if (!cid) return { ok: false, field: "client_id", error: "client_id zorunludur." };
    if (cid.length > CLIENT_ID_MAX) return { ok: false, field: "client_id", error: "client_id geçersiz." };
    clientId = cid;
    if ("measure_type" in spec) {
      const m = fields.measure_type as string | undefined;
      const b = fields.base_unit as string | undefined;
      if (m !== undefined && b !== undefined && BASE_FOR_MEASURE[m] !== b) {
        return { ok: false, field: "base_unit", error: "Ölçü tipi ile birim uyumsuz." };
      }
      if ((m === undefined) !== (b === undefined)) {
        return { ok: false, field: m === undefined ? "measure_type" : "base_unit", error: "Ölçü tipi ve birim birlikte gönderilmelidir." };
      }
    }
  }

  return { ok: true, fields, clientId };
}
