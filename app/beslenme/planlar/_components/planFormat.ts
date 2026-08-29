"use client";
/**
 * Beslenme Plan Motoru — SAF sunum yardımcıları (IO yok). Tarih/enerji biçimleme,
 * durum etiketleri, kullanıcı dostu hata mesajları ve gün/öğün toplam hesabı.
 * Ham hesap @/lib/beslenme/planContracts.sumNutrients üzerinden yapılır.
 */
import { sumNutrients, type NutrientTotal } from "@/lib/beslenme/planContracts";

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
  archived: "Arşiv",
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

/**
 * API hata kodu / HTTP durumunu kullanıcıya gösterilebilir Türkçe mesaja çevirir.
 * Ham kod ASLA kullanıcıya gösterilmez. Plan-motoru domain kodları öncelikli.
 */
export function friendlyPlanError(code?: string, status?: number): string {
  switch (code) {
    case "PLAN_ARCHIVED":
      return "Arşivlenmiş plan düzenlenemez.";
    case "RANGE_HAS_CONTENT":
      return "Yeni tarih aralığının dışında öğün bulunan günler var. Önce bu günleri temizleyin veya planı kopyalayın.";
    case "TARGET_NOT_EMPTY":
      return "Hedef gün boş değil.";
    case "RANGE_OUT_OF_BOUNDS":
      return "Seçilen aralık plan sınırları dışında.";
    case "PLAN_STALE":
      return "Plan başka yerde güncellendi, sayfayı yenileyin.";
    case "DEMO_READONLY":
      return "Demo hesabında değişiklik yapılamaz.";
    case "NETWORK":
      return "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
    default:
      break;
  }
  if (code === "NETWORK" || status === 0) {
    return "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
  }
  if (
    status === 401 ||
    status === 403 ||
    code === "FORBIDDEN" ||
    code === "UNAUTHORIZED" ||
    code === "NOT_OWNER" ||
    code === "OWNER_ONLY"
  ) {
    return "Bu işlem için yetkiniz bulunmuyor.";
  }
  if (status === 404 || code === "NOT_FOUND") {
    return "Kayıt bulunamadı. Sayfayı yenilemeyi deneyin.";
  }
  if (status === 409 || code === "CONFLICT") {
    return "Bu kayıt başka yerde değişmiş olabilir. Sayfayı yenileyin.";
  }
  if (status === 400 || status === 422 || code === "VALIDATION" || code === "INVALID") {
    return "Girilen bilgiler geçerli değil. Lütfen kontrol edip tekrar deneyin.";
  }
  return "İşlem başarısız.";
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
