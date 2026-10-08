/**
 * Kupa & Hacamat takvimi — "Yeni Takvim → yıl/ay" kanonik plan çözümü (WT6). SAF, test edilebilir.
 *
 * Veri modeli aynı (tenant, yıl) için birden fazla plana izin verir (UNIQUE yok). Yeni akışta bir
 * yıl için ZATEN plan varsa YENİ plan üretilmez; mevcut plan açılır ve uzman o ayın kayıtlı günlerinin
 * (renk, kısa açıklama, not) üstünden düzenler. Çoklu-plan (eski veri) durumunda öncelik:
 *   1) şu an AÇIK plan o yıla aitse o (uzmanın bağlamı korunur),
 *   2) değilse listede o yılın İLK planı (liste created_at DESC → en son oluşturulan).
 */
import { CUPPING_PLAN_YEAR_MIN, CUPPING_PLAN_YEAR_MAX } from "@/lib/cupping/calendarTypes";

export type PlanLike = { id: string; year: number };

export function pickPlanForYear<T extends PlanLike>(plans: readonly T[], year: number, activeId: string | null): T | null {
  const active = activeId ? plans.find((p) => p.id === activeId) : undefined;
  if (active && active.year === year) return active;
  return plans.find((p) => p.year === year) ?? null;
}

/** Yıl seçenekleri: (bu yıl − 1 … bu yıl + 5) ∪ mevcut planların yılları, artan; geçerli aralıkta. */
export function calendarYearOptions(plans: readonly PlanLike[], nowYear: number): number[] {
  const set = new Set<number>();
  for (let y = nowYear - 1; y <= nowYear + 5; y++) set.add(y);
  for (const p of plans) set.add(p.year);
  return [...set].filter((y) => y >= CUPPING_PLAN_YEAR_MIN && y <= CUPPING_PLAN_YEAR_MAX).sort((a, b) => a - b);
}

/** Pencere açılışında önerilen ay: seçili yıl bu yılsa bu ay, değilse Ocak. */
export function defaultMonthFor(year: number, now: Date): number {
  return year === now.getFullYear() ? now.getMonth() + 1 : 1;
}

/** Bir ayın kayıtlı günlerini sayar ("YYYY-MM-DD" anahtarları; saat dilimi YOK — saf metin). */
export function countDaysInMonth(ymds: Iterable<string>, year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  let n = 0;
  for (const d of ymds) if (d.startsWith(prefix)) n++;
  return n;
}
