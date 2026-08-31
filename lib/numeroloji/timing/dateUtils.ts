// FAZ 4 — deterministik tarih yardımcıları. Engine içinde new Date() YOK.
import { parseBirthDate, daysInMonth, type BirthDateParts } from "../ortak";
import type { CalendarDate } from "./types";

export function birthParts(birthDate: string): BirthDateParts | null {
  return parseBirthDate(birthDate);
}

/**
 * Doğum günü, referans yılda gerçekleşmiş (ulaşılmış) mı?
 * Artık gün (29/02) referans yılı artık değilse: takvim gereği 28/02 eşdeğeri kullanılır
 * (source-safe calendar fallback); leapUndefined=true işaretlenir.
 */
export function birthdayReached(
  birthMonth: number,
  birthDay: number,
  ref: CalendarDate,
): { reached: boolean; leapUndefined: boolean } {
  const leapUndefined = birthMonth === 2 && birthDay === 29 && daysInMonth(2, ref.year) === 28;
  const effDay = Math.min(birthDay, daysInMonth(birthMonth, ref.year));
  const reached =
    ref.month > birthMonth || (ref.month === birthMonth && ref.day >= effDay);
  return { reached, leapUndefined };
}

/** Referans tarihine göre deterministik takvim yaşı. */
export function calendarAge(
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  ref: CalendarDate,
): number {
  const { reached } = birthdayReached(birthMonth, birthDay, ref);
  return ref.year - birthYear - (reached ? 0 : 1);
}

/** Aktif kişisel yıl döneminin başlangıç (doğum günü) ve bitiş (bir sonraki doğum günü − 1) tarihleri. */
export function activePeriodBounds(
  birthMonth: number,
  birthDay: number,
  ref: CalendarDate,
): { start: CalendarDate; end: CalendarDate } {
  const { reached } = birthdayReached(birthMonth, birthDay, ref);
  const startYear = reached ? ref.year : ref.year - 1;
  const effStartDay = Math.min(birthDay, daysInMonth(birthMonth, startYear));
  const start: CalendarDate = { year: startYear, month: birthMonth, day: effStartDay };
  // Bitiş = bir sonraki doğum günü − 1 gün.
  const nextYear = startYear + 1;
  const effNextDay = Math.min(birthDay, daysInMonth(birthMonth, nextYear));
  const end = addDays({ year: nextYear, month: birthMonth, day: effNextDay }, -1);
  return { start, end };
}

/** Basit gün ekleme/çıkarma (küçük offset'ler için). */
export function addDays(d: CalendarDate, delta: number): CalendarDate {
  let { year, month, day } = d;
  day += delta;
  while (day < 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    day += daysInMonth(month, year);
  }
  while (day > daysInMonth(month, year)) {
    day -= daysInMonth(month, year);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { year, month, day };
}
