/**
 * Beslenme FAZ 6 / Plan Analitiği — SAF reduce (IO/DB YOK; server+harness ortak).
 *
 * KAYNAK: YALNIZ plan SNAPSHOT satırları (nutrition_plan_days/_meals/_items/_item_nutrients).
 *   Canlı nutrition_foods OKUNMAZ — historical immutability (§13). Bu modül DB'ye hiç dokunmaz;
 *   çağıran (analytics.ts) tenant-scoped batched satırları verir, biz JS'te indirgeriz.
 *
 * BOŞ-GÜN KONTRATI (§26): ortalamalar YALNIZ içerik günü (≥1 item) üzerinden alınır; boş günler
 *   sıfır sayılmaz (dilut etmez). Hem planDayCount (tüm gün) hem contentDayCount açığa çıkar.
 *
 * HAM değer taşınır — erken yuvarlama YOK (display katmanı yuvarlar; §15, §37).
 */
import {
  sumNutrients,
  energyOf,
  effectiveDailyTarget,
  daysBetween,
  PRIMARY_NUTRIENT_CODES,
  SECONDARY_NUTRIENT_CODES,
} from "./planContracts";
import type { NutrientTotal, ItemNutrientSnapshot } from "./planContracts";

// ── Girdi satır şekilleri (Supabase/PGlite select projeksiyonlarıyla birebir) ──
export type AnalyticsDayRow = { id: string; plan_date: string; energy_target_override: number | null };
export type AnalyticsMealRow = { id: string; plan_day_id: string };
export type AnalyticsItemRow = { id: string; meal_id: string; grams: number | string };
export type AnalyticsNutrientRow = {
  item_id: string;
  nutrient_code: string;
  amount: number | string;
  unit_code: string;
};

export type ReducePlanAnalyticsInput = {
  days: AnalyticsDayRow[];
  meals: AnalyticsMealRow[];
  items: AnalyticsItemRow[];
  nutrients: AnalyticsNutrientRow[];
  /** plan.daily_energy_target (gün override yoksa geçerli). */
  planDefaultTarget: number | null;
  /** plan.start_date — haftalık kova köprüsü (null → weekly boş). */
  startDate: string | null;
};

// ── Çıktı şekilleri ──
export type DailyAnalytics = {
  dayId: string;
  plan_date: string;
  itemCount: number;
  isContentDay: boolean;
  energyTotal: number;
  nutrients: NutrientTotal[];
  effectiveTarget: number | null;
  energyDelta: number | null;
};

export type WeeklyAnalytics = {
  weekIndex: number;
  dateStart: string;
  dateEnd: string;
  contentDays: number;
  emptyDays: number;
  avgEnergy: number | null;
  avgMacros: Record<string, number>;
  targetAvg: number | null;
  delta: number | null;
};

export type PlanAnalyticsSummary = {
  planDayCount: number;
  contentDayCount: number;
  avgEnergyPerContentDay: number | null;
  avgMacros: Record<string, number>;
  targetAvg: number | null;
  delta: number | null;
  minEnergy: number | null;
  maxEnergy: number | null;
};

export type PlanAnalytics = {
  daily: DailyAnalytics[];
  weekly: WeeklyAnalytics[];
  summary: PlanAnalyticsSummary;
};

/** enerji hariç 4 makro (protein/carbohydrate/total_fat/fiber). */
const MACRO_CODES: string[] = (PRIMARY_NUTRIENT_CODES as readonly string[]).filter((c) => c !== "energy");
const SECONDARY_CODES: string[] = [...SECONDARY_NUTRIENT_CODES];

/** ISO gün (YYYY-MM-DD) + n gün (UTC, tarih-yalnız). */
function addDaysIso(iso: string, n: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  let s = 0;
  for (const n of nums) s += n;
  return s / nums.length;
}

/**
 * Snapshot satırlarını plan analitiğine indirger (SAF).
 *   - gün toplamları: sumNutrients ile full nutrient set (HAM).
 *   - içerik günü = ≥1 item; ortalamalar YALNIZ içerik günü üzerinden.
 *   - haftalık: start_date'ten ardışık 7-gün kovaları (boş günler emptyDays'e sayılır).
 */
export function reducePlanAnalytics(input: ReducePlanAnalyticsInput): PlanAnalytics {
  const { days, meals, items, nutrients, planDefaultTarget, startDate } = input;

  // meal → day.
  const mealToDay = new Map<string, string>();
  for (const m of meals) mealToDay.set(m.id, m.plan_day_id);

  // item → frozen nutrient snapshot listesi.
  const nutrByItem = new Map<string, ItemNutrientSnapshot[]>();
  for (const n of nutrients) {
    const snap: ItemNutrientSnapshot = {
      nutrient_code: n.nutrient_code,
      amount: Number(n.amount),
      unit_code: n.unit_code,
    };
    const arr = nutrByItem.get(n.item_id);
    if (arr) arr.push(snap);
    else nutrByItem.set(n.item_id, [snap]);
  }

  // item'ları güne grupla (+ item sayısı).
  const dayItems = new Map<string, Array<{ grams: number; nutrients: ItemNutrientSnapshot[] }>>();
  const dayItemCount = new Map<string, number>();
  for (const it of items) {
    const dayId = mealToDay.get(it.meal_id);
    if (!dayId) continue; // yetim item (olmamalı; fail-closed atla).
    const arr = dayItems.get(dayId) ?? [];
    arr.push({ grams: Number(it.grams), nutrients: nutrByItem.get(it.id) ?? [] });
    dayItems.set(dayId, arr);
    dayItemCount.set(dayId, (dayItemCount.get(dayId) ?? 0) + 1);
  }

  // gün başına indir (plan_date artan).
  const sortedDays = [...days].sort((a, b) =>
    a.plan_date < b.plan_date ? -1 : a.plan_date > b.plan_date ? 1 : 0,
  );

  const daily: DailyAnalytics[] = [];
  const dayCodeMap = new Map<string, Map<string, number>>(); // dayId → code → HAM amount

  for (const d of sortedDays) {
    const its = dayItems.get(d.id) ?? [];
    const itemCount = dayItemCount.get(d.id) ?? 0;
    const isContentDay = itemCount >= 1;
    const totals = sumNutrients(its);
    const energyTotal = energyOf(totals);
    const effectiveTarget = effectiveDailyTarget(d.energy_target_override, planDefaultTarget);
    const energyDelta = effectiveTarget != null ? energyTotal - effectiveTarget : null;

    daily.push({
      dayId: d.id,
      plan_date: d.plan_date,
      itemCount,
      isContentDay,
      energyTotal,
      nutrients: totals,
      effectiveTarget,
      energyDelta,
    });

    const codeMap = new Map<string, number>();
    for (const t of totals) codeMap.set(t.nutrient_code, t.amount);
    dayCodeMap.set(d.id, codeMap);
  }

  const contentDaily = daily.filter((d) => d.isContentDay);

  // gün-alt-kümesi üzerinden per-code ortalama (n = kümedeki içerik günü sayısı).
  const avgOver = (dayList: DailyAnalytics[], codes: string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    const n = dayList.length;
    for (const c of codes) {
      if (n === 0) {
        out[c] = 0;
        continue;
      }
      let s = 0;
      for (const d of dayList) s += dayCodeMap.get(d.dayId)?.get(c) ?? 0;
      out[c] = s / n;
    }
    return out;
  };

  const targetAvgOf = (dayList: DailyAnalytics[]): number | null =>
    mean(dayList.filter((d) => d.effectiveTarget != null).map((d) => d.effectiveTarget as number));

  // ── Haftalık kovalar (tüm günler emptyDays için; ortalamalar içerik günü) ──
  const weekly: WeeklyAnalytics[] = [];
  if (startDate) {
    const buckets = new Map<number, DailyAnalytics[]>();
    for (const d of daily) {
      const wi = Math.floor(daysBetween(startDate, d.plan_date) / 7);
      const arr = buckets.get(wi) ?? [];
      arr.push(d);
      buckets.set(wi, arr);
    }
    for (const wi of [...buckets.keys()].sort((a, b) => a - b)) {
      const arr = buckets.get(wi) as DailyAnalytics[];
      const content = arr.filter((d) => d.isContentDay);
      const avgEnergy = mean(content.map((d) => d.energyTotal));
      const targetAvg = targetAvgOf(content);
      weekly.push({
        weekIndex: wi,
        dateStart: addDaysIso(startDate, wi * 7),
        dateEnd: addDaysIso(startDate, wi * 7 + 6),
        contentDays: content.length,
        emptyDays: arr.length - content.length,
        avgEnergy,
        avgMacros: avgOver(content, MACRO_CODES),
        targetAvg,
        delta: avgEnergy != null && targetAvg != null ? avgEnergy - targetAvg : null,
      });
    }
  }

  // ── Plan özeti (içerik günü üzerinden) ──
  const avgEnergyPerContentDay = mean(contentDaily.map((d) => d.energyTotal));
  const presentSecondary = SECONDARY_CODES.filter((c) =>
    contentDaily.some((d) => dayCodeMap.get(d.dayId)?.has(c)),
  );
  const summaryCodes = [...MACRO_CODES, ...presentSecondary];
  const summaryTargetAvg = targetAvgOf(contentDaily);
  const energies = contentDaily.map((d) => d.energyTotal);

  const summary: PlanAnalyticsSummary = {
    planDayCount: days.length,
    contentDayCount: contentDaily.length,
    avgEnergyPerContentDay,
    avgMacros: avgOver(contentDaily, summaryCodes),
    targetAvg: summaryTargetAvg,
    delta:
      avgEnergyPerContentDay != null && summaryTargetAvg != null
        ? avgEnergyPerContentDay - summaryTargetAvg
        : null,
    minEnergy: energies.length ? Math.min(...energies) : null,
    maxEnergy: energies.length ? Math.max(...energies) : null,
  };

  return { daily, weekly, summary };
}
