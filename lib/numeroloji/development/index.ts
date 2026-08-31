// FAZ 4 — Bireysel Gelişim barrel + üst düzey compute.
export type { DevelopmentResult } from "./types";
export { personalityEnergy } from "./personalityLesson";
export { birthDayEnergyExactDay } from "./birthDayEnergy";
export { yearChakra } from "./yearChakra";
export { maturityNumber, maturityCatalogKey } from "./maturity";
export { lifeLesson } from "./lifeLesson";
export { destinyNumber } from "./destinyNumber";
export * from "./catalogs";

import { personalityEnergy } from "./personalityLesson";
import { birthDayEnergyExactDay } from "./birthDayEnergy";
import { yearChakra } from "./yearChakra";
import { maturityNumber } from "./maturity";
import { lifeLesson } from "./lifeLesson";
import { destinyNumber } from "./destinyNumber";
import type { CalendarDate } from "../timing/types";
import type { DevelopmentResult } from "./types";

export function computeDevelopment(
  firstName: string,
  lastName: string,
  birthDate: string,
  ref: CalendarDate,
): DevelopmentResult {
  return {
    yearChakra: yearChakra(birthDate, ref),
    maturity: maturityNumber(firstName, lastName, birthDate),
    birthDayEnergy: birthDayEnergyExactDay(birthDate),
    personalityEnergy: personalityEnergy(birthDate),
    lifeLesson: lifeLesson(birthDate),
    destiny: destinyNumber(firstName, lastName),
  };
}
