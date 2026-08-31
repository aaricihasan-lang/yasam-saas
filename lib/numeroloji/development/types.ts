// FAZ 4 — Bireysel Gelişim tipleri.
import type { CalendarDate, ReducedResult } from "../timing/types";

export type { CalendarDate, ReducedResult };

export type DevelopmentResult = {
  yearChakra: ReducedResult;
  maturity: ReducedResult;
  birthDayEnergy: ReducedResult; // exact 1–31, reduce YOK
  personalityEnergy: ReducedResult;
  lifeLesson: ReducedResult;
  destiny: ReducedResult;
};
