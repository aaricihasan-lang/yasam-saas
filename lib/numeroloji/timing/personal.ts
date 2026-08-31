// FAZ 4 — Kişisel Yıl (nominal + aktif) / Ay / Gün (AŞAMA 2 §3, §4, §6, §7).
// 1–9, master preservation YOK. Kaynak: kitap 1. seviye.
// SOURCE_SEMANTIC_SPLIT_PERSONAL_YEAR: Kişisel Ay/Gün NOMINAL kişisel yılı kullanır;
// aktif (birthday-transition) değer yalnız "Aktif Kişisel Yıl" alanında gösterilir.
import { sumDigits } from "../ortak";
import { reduce1To9 } from "./reduce";
import {
  PERSONAL_YEAR_CATALOG,
  PERSONAL_MONTH_CATALOG,
  PERSONAL_DAY_CATALOG,
} from "./catalogs";
import { birthParts, birthdayReached, activePeriodBounds } from "./dateUtils";
import type { CalendarDate, ReducedResult, PersonalYearResult } from "./types";

/** Nominal Kişisel Yıl: doğum günü + doğum ayı + takvim yılının rakamları → 1–9. */
export function nominalPersonalYear(birthDate: string, calendarYear: number): ReducedResult {
  const p = birthParts(birthDate);
  if (!p) return { value: 0, display: "-", steps: ["Geçersiz doğum tarihi."] };
  const total = sumDigits(p.day) + sumDigits(p.month) + sumDigits(calendarYear);
  const value = reduce1To9(total);
  return {
    value,
    display: String(value),
    steps: [
      `Nominal Kişisel Yıl (${calendarYear}): gün(${sumDigits(p.day)}) + ay(${sumDigits(
        p.month,
      )}) + yıl(${sumDigits(calendarYear)}) = ${total} → ${value}`,
    ],
    interpretation: PERSONAL_YEAR_CATALOG[value],
  };
}

/** Aktif Kişisel Yıl: doğum gününden doğum gününe ilerleyen aktif dönem. */
export function personalYear(birthDate: string, ref: CalendarDate): PersonalYearResult {
  const p = birthParts(birthDate);
  const nominal = nominalPersonalYear(birthDate, ref.year);

  if (!p) {
    return {
      nominal,
      active: {
        value: 0,
        display: "-",
        steps: ["Geçersiz doğum tarihi."],
        periodStart: ref,
        periodEnd: ref,
      },
      provenance: "SOURCE_SEMANTIC_SPLIT_PERSONAL_YEAR",
    };
  }

  const { reached, leapUndefined } = birthdayReached(p.month, p.day, ref);
  const activeCalendarYear = reached ? ref.year : ref.year - 1;
  const activeVal = nominalPersonalYear(birthDate, activeCalendarYear);
  const bounds = activePeriodBounds(p.month, p.day, ref);

  return {
    nominal,
    active: {
      value: activeVal.value,
      display: activeVal.display,
      steps: [
        `Aktif Kişisel Yıl: referans ${ref.day}/${ref.month}/${ref.year}, doğum günü ${
          reached ? "geçildi" : "henüz gelmedi"
        } → aktif takvim yılı ${activeCalendarYear} → ${activeVal.value}`,
      ],
      interpretation: PERSONAL_YEAR_CATALOG[activeVal.value],
      periodStart: bounds.start,
      periodEnd: bounds.end,
      ...(leapUndefined ? { status: "SOURCE_RULE_UNDEFINED_FOR_LEAP_BIRTHDAY" as const } : {}),
    },
    provenance: "SOURCE_SEMANTIC_SPLIT_PERSONAL_YEAR",
  };
}

/** Kişisel Ay = NOMINAL Kişisel Yıl (ref yılı) + takvim ayı → 1–9. */
export function personalMonth(birthDate: string, ref: CalendarDate): ReducedResult {
  const py = nominalPersonalYear(birthDate, ref.year).value;
  const monthReduced = reduce1To9(ref.month);
  const value = reduce1To9(py + monthReduced);
  return {
    value,
    display: String(value),
    steps: [`Kişisel Ay: NominalKişiselYıl(${py}) + ay(${ref.month}→${monthReduced}) → ${value}`],
    interpretation: PERSONAL_MONTH_CATALOG[value],
  };
}

/** Kişisel Gün = NOMINAL Kişisel Yıl + Kişisel Ay + reduce(takvim günü) → 1–9. */
export function personalDay(birthDate: string, ref: CalendarDate): ReducedResult {
  const py = nominalPersonalYear(birthDate, ref.year).value;
  const pm = personalMonth(birthDate, ref).value;
  const dayReduced = reduce1To9(ref.day);
  const value = reduce1To9(py + pm + dayReduced);
  return {
    value,
    display: String(value),
    steps: [
      `Kişisel Gün: NominalKişiselYıl(${py}) + KişiselAy(${pm}) + gün(${ref.day}→${dayReduced}) → ${value}`,
    ],
    interpretation: PERSONAL_DAY_CATALOG[value],
  };
}
