"use client";
/**
 * Beslenme Plan Motoru — SAF sunum yardımcıları (IO yok). Tarih/enerji biçimleme,
 * durum etiketleri, kullanıcı dostu hata mesajları ve gün/öğün toplam hesabı.
 * Ham hesap @/lib/beslenme/planContracts.sumNutrients üzerinden yapılır.
 */
import { energyCoverage, sumNutrients, type EnergyCoverage, type NutrientTotal } from "@/lib/beslenme/planContracts";

/** Enerji (kcal ham) → tam sayı, tr-TR binlik ("1.930"). */
export function formatEnergy(kcalRaw: number | null | undefined): string {
  if (kcalRaw == null || !Number.isFinite(kcalRaw)) return "—";
  return Math.round(kcalRaw).toLocaleString("tr-TR");
}

/** ISO (YYYY-MM-DD) → "02.08.2026". Geçersizse "—". */
export function formatDateTr(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

const TR_MONTHS_SHORT = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
// getUTCDay(): 0 = Pazar
const TR_WEEKDAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** ISO → "2 Ağu Cum" (gün + kısa ay + kısa gün adı, Türkçe). */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  const day = Number(m[3]);
  const mon = TR_MONTHS_SHORT[Number(m[2]) - 1] ?? "";
  const wd = TR_WEEKDAYS_SHORT[d.getUTCDay()] ?? "";
  return `${day} ${mon} ${wd}`.trim();
}

/** ISO → gün numarası (takvim hücresi için, örn "2"). */
export function dayOfMonth(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "";
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso);
  return m ? String(Number(m[1])) : "";
}

export type PlanStatusLike = "draft" | "active" | "archived" | string;

const STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  archived: "Kilitli",
};
export function statusLabel(status: PlanStatusLike): string {
  return STATUS_LABELS[status] ?? "Taslak";
}

const STATUS_CLASSES: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  archived: "border-amber-200 bg-amber-50 text-amber-700",
};
export function statusClass(status: PlanStatusLike): string {
  return STATUS_CLASSES[status] ?? STATUS_CLASSES.draft;
}

/** Revizyon numarası → "V2". */
export function revisionLabel(n: number | null | undefined): string {
  return `V${n && n > 0 ? n : 1}`;
}

/** Kullanıcı dostu plan hata mesajının katalog anahtarı (beslenme.fmt.errors.<anahtar>). */
export type PlanErrorKey = "archived" | "notDraft" | "refreshStale" | "nothingToClear" | "deleteUnavailable" | "rangeHasContent" | "targetNotEmpty" | "rangeOutOfBounds" | "planStale" | "versionRequired" | "demoReadonly" | "membershipInactive" | "network" | "forbidden" | "notFound" | "conflict" | "invalid" | "generic";

/**
 * API hata kodu / HTTP durumunu gösterilebilir mesaj ANAHTARINA çevirir (dil-bağımsız).
 * Ham kod ASLA kullanıcıya gösterilmez. Plan-motoru domain kodları öncelikli.
 * Arayüz metni: usePlanFormat().error(...) (çevrilmiş); friendlyPlanError → kaynak dil (TR) metni.
 */
export function planErrorKey(code?: string, status?: number): PlanErrorKey {
  switch (code) {
    case "PLAN_ARCHIVED":
      return "archived";
    case "PLAN_NOT_DRAFT":
      return "notDraft";
    case "REFRESH_STALE":
      return "refreshStale";
    case "NOTHING_TO_CLEAR":
      return "nothingToClear";
    case "DELETE_UNAVAILABLE":
      return "deleteUnavailable";
    case "RANGE_HAS_CONTENT":
      return "rangeHasContent";
    case "TARGET_NOT_EMPTY":
      return "targetNotEmpty";
    case "RANGE_OUT_OF_BOUNDS":
      return "rangeOutOfBounds";
    case "PLAN_STALE":
      return "planStale";
    case "VERSION_REQUIRED":
      return "versionRequired";
    case "DEMO_READONLY":
      return "demoReadonly";
    case "MEMBERSHIP_INACTIVE":
      return "membershipInactive";
    case "NETWORK":
      return "network";
    default:
      break;
  }
  if (code === "NETWORK" || status === 0) return "network";
  if (
    status === 401 ||
    status === 403 ||
    code === "FORBIDDEN" ||
    code === "UNAUTHORIZED" ||
    code === "NOT_OWNER" ||
    code === "OWNER_ONLY"
  ) {
    return "forbidden";
  }
  if (status === 404 || code === "NOT_FOUND") return "notFound";
  if (status === 409 || code === "CONFLICT") return "conflict";
  if (status === 400 || status === 422 || code === "VALIDATION" || code === "INVALID") return "invalid";
  return "generic";
}

/** Kaynak dil (TR) metinleri — messages/tr/beslenme.json beslenme.fmt.errors ile birebir (React dışı çağıranlar / testler). */
const PLAN_ERROR_TR: Record<PlanErrorKey, string> = {
  archived: "Bu plan düzenlemeye kapalı. Düzenlemek için planı kopyalayın.",
  notDraft: "Besin değerleri yalnızca taslak planlarda güncellenebilir.",
  refreshStale: "Plan bu arada değişti. Güncel farkları görmek için önizlemeyi yenileyin.",
  nothingToClear: "Bu günde silinecek öğün yok.",
  deleteUnavailable: "Plan silme şu anda kullanılamıyor (sistem güncellemesi bekleniyor). Plan silinmedi; lütfen daha sonra tekrar deneyin.",
  rangeHasContent: "Yeni tarih aralığının dışında öğün bulunan günler var. Önce bu günleri temizleyin veya planı kopyalayın.",
  targetNotEmpty: "Hedef gün boş değil.",
  rangeOutOfBounds: "Seçilen aralık plan sınırları dışında.",
  planStale: "Bu plan başka bir sekmede veya cihazda güncellendi. Değişiklikleriniz kaydedilmedi; güncel veriyi yükleyip tekrar deneyin.",
  versionRequired: "Plan sürümü doğrulanamadı. Sayfayı yenileyip tekrar deneyin.",
  demoReadonly: "Demo hesabında değişiklik yapılamaz.",
  membershipInactive: "Üyeliğiniz aktif değil. Beslenme planlarına erişmek için yöneticinizle iletişime geçin.",
  network: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  forbidden: "Bu işlem için yetkiniz bulunmuyor.",
  notFound: "Kayıt bulunamadı. Sayfayı yenilemeyi deneyin.",
  conflict: "Bu kayıt başka yerde değişmiş olabilir. Sayfayı yenileyin.",
  invalid: "Girilen bilgiler geçerli değil. Lütfen kontrol edip tekrar deneyin.",
  generic: "İşlem başarısız.",
};

/** API hata kodu / HTTP durumu → Türkçe kullanıcı mesajı (kaynak dil). Arayüzde usePlanFormat().error tercih edilir. */
export function friendlyPlanError(code?: string, status?: number): string {
  return PLAN_ERROR_TR[planErrorKey(code, status)];
}

// ── Gün / öğün toplam hesabı (HAM; display yuvarlaması formatAmount ile) ──
type NutrientLike = { nutrient_code: string; amount: number; unit_code: string };
type ItemLike = { grams: number; nutrients: NutrientLike[] };
type MealLike = { items: ItemLike[] };

/** Bir öğünün item listesini nutrient_code bazında toplar. */
export function mealTotals(items: ItemLike[] | null | undefined): NutrientTotal[] {
  if (!items || items.length === 0) return [];
  return sumNutrients(items.map((i) => ({ grams: i.grams, nutrients: i.nutrients })));
}

/** Günün tüm öğünlerindeki item'ları tek toplamda birleştirir. */
export function buildTotals(meals: MealLike[] | null | undefined): NutrientTotal[] {
  if (!meals || meals.length === 0) return [];
  const items: ItemLike[] = [];
  for (const m of meals) {
    for (const it of m.items ?? []) items.push(it);
  }
  return sumNutrients(items.map((i) => ({ grams: i.grams, nutrients: i.nutrients })));
}

/** Bir öğünün enerji kapsamı (bilinen kcal + eksik/girilmemiş item sayısı). */
export function mealEnergyCoverage(items: ItemLike[] | null | undefined): EnergyCoverage {
  if (!items || items.length === 0) return { known: 0, missingCount: 0 };
  return energyCoverage(items.map((i) => ({ grams: i.grams, nutrients: i.nutrients })));
}

/** Günün (tüm öğünler) enerji kapsamı. */
export function dayEnergyCoverage(meals: MealLike[] | null | undefined): EnergyCoverage {
  if (!meals || meals.length === 0) return { known: 0, missingCount: 0 };
  const items: ItemLike[] = [];
  for (const m of meals) {
    for (const it of m.items ?? []) items.push(it);
  }
  return energyCoverage(items.map((i) => ({ grams: i.grams, nutrients: i.nutrients })));
}
