/**
 * Beslenme modülü — paylaşılan UI sabitleri: Türkçe etiket haritaları ve kullanıcı
 * dostu hata mesajları. SAF (IO yok). Enum kaynağı: @/lib/beslenme/contracts.
 */
import {
  PREP_STATES,
  SECTION_KEYS,
  RELATION_TYPES,
  SOURCE_TYPES,
} from "@/lib/beslenme/contracts";

/** prep_state → Türkçe etiket. */
export const PREP_STATE_LABELS: Record<string, string> = {
  raw: "Çiğ",
  cooked: "Pişmiş",
  processed: "İşlenmiş",
};
export const PREP_STATE_OPTIONS = PREP_STATES.map((v) => ({
  value: v,
  label: PREP_STATE_LABELS[v] ?? v,
}));

/** section_key → Türkçe etiket. */
export const SECTION_KEY_LABELS: Record<string, string> = {
  ozet: "Genel Özet",
  prensipler: "Temel Prensipler",
  uygun_besinler: "Uygun Besinler",
  notr_besinler: "Nötr Besinler",
  uzak_durulacak: "Uzak Durulacaklar",
  notlar: "Özel Notlar",
  diger: "Diğer",
};
export const SECTION_KEY_OPTIONS = SECTION_KEYS.map((v) => ({
  value: v,
  label: SECTION_KEY_LABELS[v] ?? v,
}));

/** relation_type → Türkçe etiket. */
export const RELATION_TYPE_LABELS: Record<string, string> = {
  recommended: "Önerilen",
  suitable: "Uygun",
  neutral: "Nötr",
  limit: "Sınırla",
  avoid: "Kaçın",
  caution: "Dikkat",
};
export const RELATION_TYPE_OPTIONS = RELATION_TYPES.map((v) => ({
  value: v,
  label: RELATION_TYPE_LABELS[v] ?? v,
}));

/** relation_type → renk sınıfı (küçük rozet). */
export const RELATION_TYPE_CHIP: Record<string, string> = {
  recommended: "border-emerald-200 bg-emerald-50 text-emerald-700",
  suitable: "border-teal-200 bg-teal-50 text-teal-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  limit: "border-amber-200 bg-amber-50 text-amber-700",
  avoid: "border-rose-200 bg-rose-50 text-rose-700",
  caution: "border-orange-200 bg-orange-50 text-orange-700",
};

/** source_type → Türkçe etiket. */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  book: "Kitap",
  article: "Makale",
  clinical_guide: "Klinik Kılavuz",
  official_institution: "Resmi Kurum",
  web: "Web Kaynağı",
  education: "Eğitim",
  traditional: "Geleneksel",
  other: "Diğer",
};
export const SOURCE_TYPE_OPTIONS = SOURCE_TYPES.map((v) => ({
  value: v,
  label: SOURCE_TYPE_LABELS[v] ?? v,
}));

/** Kullanıcı mesajının katalog anahtarı (beslenme.labels.errors.<anahtar>). */
export type BeslenmeErrorKey = "forkNameConflict" | "duplicateName" | "duplicateLabel" | "duplicateLink" | "sourceNotFound" | "inUse" | "notPersonalized" | "nothingToReset" | "demoReadonly" | "network" | "forbidden" | "notFound" | "duplicate" | "invalid" | "generic";

/**
 * API hata kodu / HTTP durumunu gösterilebilir mesaj ANAHTARINA çevirir (dil-bağımsız).
 * Ham kod ASLA kullanıcıya gösterilmez. Arayüz metni: useBeslenmeLabels().error(...).
 */
export function friendlyErrorKey(code?: string, status?: number): BeslenmeErrorKey {
  // Beslenme'ye özgü anlamlı kodlar (genel HTTP eşlemesinden ÖNCE).
  switch (code) {
    case "FORK_NAME_CONFLICT":
      return "forkNameConflict";
    case "DUPLICATE_NAME":
      return "duplicateName";
    case "DUPLICATE_LABEL":
      return "duplicateLabel";
    case "DUPLICATE_LINK":
      return "duplicateLink";
    case "SOURCE_NOT_FOUND":
    case "REF_NOT_FOUND":
      return "sourceNotFound";
    case "IN_USE":
      return "inUse";
    case "NOT_PERSONALIZED":
      return "notPersonalized";
    case "NOTHING_TO_RESET":
      return "nothingToReset";
    case "DEMO_READONLY":
      return "demoReadonly";
    default:
      break;
  }
  if (code === "NETWORK" || status === 0) return "network";
  if (
    status === 401 ||
    status === 403 ||
    code === "FORBIDDEN" ||
    code === "UNAUTHORIZED" ||
    code === "NOT_OWNER"
  ) {
    return "forbidden";
  }
  if (status === 404 || code === "NOT_FOUND") return "notFound";
  if (status === 409 || code === "CONFLICT" || code === "DUPLICATE") return "duplicate";
  if (status === 400 || status === 422 || code === "VALIDATION" || code === "INVALID") return "invalid";
  return "generic";
}

/** Kaynak dil (TR) metinleri — messages/tr/beslenme.json beslenme.labels.errors ile birebir. */
const ERROR_TR: Record<BeslenmeErrorKey, string> = {
  forkNameConflict: "Çalışma alanınızda aynı adlı başka bir besin var. Önce o besini yeniden adlandırın veya silin.",
  duplicateName: "Bu adla bir besin zaten var. Farklı bir ad deneyin.",
  duplicateLabel: "Aynı adlı iki porsiyon olamaz.",
  duplicateLink: "Bu kaynak zaten bağlı.",
  sourceNotFound: "Seçilen kaynak/çerçeve bulunamadı. Sayfayı yenileyip tekrar deneyin.",
  inUse: "Bu kayıt başka kayıtlarda kullanıldığı için silinemedi.",
  notPersonalized: "Bu besinde sistem değerlerinden farklı kişisel değer bulunmuyor.",
  nothingToReset: "Sistem değerine döndürülecek kişisel değişiklik bulunmuyor.",
  demoReadonly: "Demo hesabında değişiklik yapılamaz.",
  network: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  forbidden: "Bu işlem için yetkiniz bulunmuyor.",
  notFound: "Kayıt bulunamadı. Sayfayı yenilemeyi deneyin.",
  duplicate: "Bu kayıt zaten mevcut görünüyor.",
  invalid: "Girilen bilgiler geçerli değil. Lütfen kontrol edip tekrar deneyin.",
  generic: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
};

/**
 * API hata kodu / HTTP durumunu kullanıcıya gösterilebilir Türkçe mesaja çevirir (kaynak dil).
 * Arayüzde useBeslenmeLabels().error tercih edilir.
 */
export function friendlyError(code?: string, status?: number): string {
  return ERROR_TR[friendlyErrorKey(code, status)];
}
