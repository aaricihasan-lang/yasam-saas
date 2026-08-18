/**
 * Aromaterapi Word/DOCX rapor sistemi — ortak tema, adlandırma ve sabitler.
 * SAF (server/client-agnostic; supabase/secret YOK).
 */

/** Aromaterapi modül kimliği — kapak/başlık. */
export const AROMA_MODULE_TITLE = "AROMATERAPİ";
export const AROMA_SYSTEM_TITLE = "YAŞAM SİSTEMİ";

/** Bölüm aksan renkleri (kurumsal; reportHelpers renk paramına verilir). */
export const AROMA_COLORS = {
  oils: "b45309", // amber-700
  blends: "9f1239", // rose-800
  taxa: "166534", // green-800
  preparations: "115e59", // teal-800
  methods: "3730a3", // indigo-800
  knowledge: "9a3412", // orange-800
  sources: "1e40af", // blue-800
  glossary: "6b21a8", // purple-800
  general: "1e293b",
} as const;

/** oil_type → okunur etiket (server-safe; client OIL_TYPE_LABELS ile eş). */
export const OIL_TYPE_LABEL: Record<string, string> = {
  essential: "Uçucu Yağ",
  carrier: "Sabit Yağ",
  maceration: "Maserasyon Yağı",
  hydrosol: "Hidrosol",
  resin: "Reçine",
  absolute: "Mutlak / Ekstrakt",
};

/** Genel raporda yağ bölümlerinin sırası. */
export const OIL_TYPE_ORDER = ["essential", "carrier", "maceration", "hydrosol", "resin", "absolute"] as const;

export function oilTypeLabel(t: string | null | undefined): string {
  return OIL_TYPE_LABEL[(t ?? "").trim()] ?? (t ?? "—");
}

/**
 * Adaptif front-matter sınıfı — rapor boyutuna göre kapak sonrası akış:
 *  - "none"    : tek/çok-kısa rapor → Kapak → doğrudan içerik (ayrı Özet/İçindekiler YOK)
 *  - "compact" : küçük seçili (2–10) → Kapak → tek "Rapor Özeti + İçindekiler" sayfası → içerik
 *  - "full"    : büyük/genel → Kapak → Sistem Özeti → İçindekiler → içerik
 */
export type FrontMatterMode = "none" | "compact" | "full";

/** Kayıt sayısına göre front-matter sınıfı. Genel/çok-bölümlü rapor daima "full" verilir (çağıran zorlar). */
export function classifyFrontMatter(count: number): FrontMatterMode {
  if (count <= 1) return "none";
  if (count <= 10) return "compact";
  return "full";
}

/** İstemci-verili seçili ID üst sınırı (mode=all bu sınıra TABİ DEĞİLDİR). */
export const MAX_SELECTED_IDS = 500;

/** Export request gövde boyutu üst sınırı (byte). */
export const MAX_EXPORT_BODY_BYTES = 256 * 1024;

/** Büyük "all" okumalarında sayfa/chunk boyutu (deterministik batched read). */
export const EXPORT_READ_CHUNK = 500;

/**
 * Dosya-adı güvenli slug: Türkçe harfleri ASCII'ye indirger, [a-z0-9-] dışını
 * "_" yapar, uzunluğu sınırlar. Path-traversal/injection güvenli.
 */
const TR_FOLD: Record<string, string> = {
  İ: "I", I: "I", ı: "i", Ş: "S", ş: "s", Ğ: "G", ğ: "g", Ç: "C", ç: "c", Ö: "O", ö: "o", Ü: "U", ü: "u",
};
export function slugifyTr(input: string, max = 60): string {
  const folded = [...(input ?? "")].map((c) => TR_FOLD[c] ?? c).join("");
  const s = folded
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, max);
  return s || "kayit";
}

/** YYYY-MM-DD (rapor tarihi; çağıran Date verir — saf fonksiyon). */
export function dateStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** İnsan-okur tarih (kapak). */
export function humanDate(d: Date): string {
  const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  return `${d.getDate()} ${aylar[d.getMonth()]} ${d.getFullYear()}`;
}

/** Aromaterapi_<parça>_<tarih>.docx — profesyonel, filesystem-safe. */
export function reportFilename(parts: string[], d: Date): string {
  const slug = parts.map((p) => slugifyTr(p, 40)).filter(Boolean).join("_");
  return `Aromaterapi_${slug}_${dateStamp(d)}.docx`;
}
