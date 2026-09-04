// FAZ 4 — Zamanlama (Timing) barrel + üst düzey compute.
export type {
  CalendarDate,
  ReducedResult,
  PersonalYearResult,
  UniversalTimingResult,
  PersonalTimingResult,
  CycleResult,
  EvreInfo,
  DonguInfo,
} from "./types";
export { universalYear, universalMonth, universalDay } from "./universal";
export {
  nominalPersonalYear,
  personalYear,
  personalMonth,
  personalDay,
} from "./personal";
export { evreDonguFromAge, computeCycle } from "./cycles";
export * from "./catalogs";

import { universalYear, universalMonth, universalDay } from "./universal";
import { personalYear, personalMonth, personalDay } from "./personal";
import { computeCycle } from "./cycles";
import type {
  CalendarDate,
  UniversalTimingResult,
  PersonalTimingResult,
  CycleResult,
} from "./types";

export function computeUniversalTiming(ref: CalendarDate): UniversalTimingResult {
  return {
    universalYear: universalYear(ref.year),
    universalMonth: universalMonth(ref.year, ref.month),
    universalDay: universalDay(ref.year, ref.month, ref.day),
  };
}

export function computePersonalTiming(birthDate: string, ref: CalendarDate): PersonalTimingResult {
  return {
    personalYear: personalYear(birthDate, ref),
    personalMonth: personalMonth(birthDate, ref),
    personalDay: personalDay(birthDate, ref),
  };
}

export function computeCycleTiming(birthDate: string, ref: CalendarDate): CycleResult {
  return computeCycle(birthDate, ref);
}
