// FAZ 4 — Doğum Günü Enerjisi (AŞAMA 2 §14). Kaynak: kitap 1. seviye.
// EXACT calendar day 1–31 kataloğu — REDUCE EDİLMEZ. (Book2'nin reduced 1–9 Doğum Günü Sayısı DEĞİL.)
import { birthParts } from "../timing/dateUtils";
import { BIRTH_DAY_ENERGY_CATALOG } from "./catalogs";
import type { ReducedResult } from "../timing/types";

export function birthDayEnergyExactDay(birthDate: string): ReducedResult {
  const p = birthParts(birthDate);
  if (!p) return { value: 0, display: "-", steps: ["Geçersiz doğum tarihi."] };
  return {
    value: p.day,
    display: String(p.day),
    steps: [`Doğum Günü Enerjisi: ayın ${p.day}. günü (exact, reduce edilmez)`],
    interpretation: BIRTH_DAY_ENERGY_CATALOG[p.day],
  };
}
