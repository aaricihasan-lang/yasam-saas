/**
 * app/cosmic-calendar/planetary-hours/plannerData.ts
 * Gezegen Saati Planlayıcısı — TEK canonical view-model (saf/deterministik).
 *
 * Astronomik motor DEĞİŞMEZ: yalnız mevcut getPlanetaryHoursForRange (Keldani/calcSunTimes)
 * + tz gösterim helper'ları (getTimeZoneOffsetMinutes / formatInTimeZone) yeniden kullanılır.
 * Bu, ana sayfadaki eski plannerData memo'sunun BİREBİR mantığıdır; ayrı sayfaya taşınırken
 * mantık kopyalanmasın diye buraya tek kaynak olarak çıkarıldı.
 */

import { getPlanetaryHoursForRange } from "@/lib/cosmic/planetary-hours";
import { getTimeZoneOffsetMinutes, formatInTimeZone } from "@/lib/location/tz";

export const PLANNER_MAX_DAYS = 90;
export const PLANNER_PRESETS: ReadonlyArray<number> = [30, 60, 90];

const MONTH_NAMES_TR: ReadonlyArray<string> = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAY_TR_FULL: ReadonlyArray<string> = [
  "Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi",
];

export type PlannerSlot = { planet: string; symbol: string; startLabel: string; endLabel: string; period: "day" | "night" };
export type PlannerDay = { dayKey: string; dateLabel: string; weekday: string; slots: PlannerSlot[] };
export type PlannerResult = { groups: PlannerDay[]; total: number; days: number; rangeLabel: string; startLabel: string };

export type PlannerInput = {
  start: Date;                 // başlangıç günü (yerel Y/M/D anlamlı)
  days: number;                // aralık uzunluğu (gün); 1..PLANNER_MAX_DAYS'e sıkıştırılır
  planets: ReadonlySet<string>;// seçili gezegen adları (Türkçe)
  lat: number; lon: number;    // seçili konum
  tz: string;                  // IANA saat dilimi (DST-doğru gösterim)
};

/**
 * Aralık = [start .. start + (days-1)] DAHİL. Her gün için offset HEDEF TARİHE göre çözülür
 * (DST-doğru). Yeni astronomik hesap YOK. Seçili gezegenlere denk gelen slotlar döner.
 */
export function buildPlannerData(input: PlannerInput): PlannerResult {
  const days = Math.min(PLANNER_MAX_DAYS, Math.max(1, input.days));
  const start = new Date(input.start.getFullYear(), input.start.getMonth(), input.start.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (days - 1));
  const resolveOffset = (d: Date) => getTimeZoneOffsetMinutes(d, input.tz);
  const range = getPlanetaryHoursForRange(start, end, input.lat, input.lon, resolveOffset);

  const groups: PlannerDay[] = [];
  let total = 0;
  for (const d of range) {
    const matched = d.slots.filter(s => input.planets.has(s.planet.name));
    if (matched.length === 0) continue;
    total += matched.length;
    const [y, mo, dd] = d.dayKey.split("-").map(n => Number.parseInt(n, 10));
    const dateObj = new Date(y!, (mo! - 1), dd!);
    groups.push({
      dayKey:    d.dayKey,
      dateLabel: `${dd} ${MONTH_NAMES_TR[(mo! - 1)]} ${y}`,
      weekday:   WEEKDAY_TR_FULL[dateObj.getDay()] ?? "",
      slots: matched.map(s => ({
        planet:     s.planet.name,
        symbol:     s.planet.symbol,
        startLabel: formatInTimeZone(s.start, input.tz),
        endLabel:   formatInTimeZone(s.end, input.tz),
        period:     s.period,
      })),
    });
  }
  const startLabel = `${start.getDate()} ${MONTH_NAMES_TR[start.getMonth()]} ${start.getFullYear()}`;
  const endLabel = `${end.getDate()} ${MONTH_NAMES_TR[end.getMonth()]} ${end.getFullYear()}`;
  return { groups, total, days, rangeLabel: `${start.getDate()} ${MONTH_NAMES_TR[start.getMonth()]} – ${endLabel}`, startLabel };
}

/** "YYYY-MM-DD" → yerel gün Date; geçersizse null (güvenli fallback için). */
export function parseDateParam(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  // taşma kontrolü (ör. 2026-02-31 → geçersiz)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Date → "YYYY-MM-DD" (yerel Y/M/D). */
export function toDateParam(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
