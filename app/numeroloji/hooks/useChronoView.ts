"use client";

// Kronolojik bölümler (Değişim-Dönüşüm · Zirve · Mücadele · Harflerin Yankılanışı) için tek
// görünüm kaynağı: `currentYear` = "Aktif" dönem vurgusu (her zaman bugünün yılı);
// `limitYear` = gösterim sınırı (yetki KAPALI → currentYear, önceki davranış birebir;
// AÇIK → yöntemin doğal bitişine kadar tüm dönemler); `note` = yetkiye uygun bilgi notu.

import { chronoLimitYear, chronoNoteText } from "../utils/chronoCutoff";
import { useCurrentYear } from "./useCurrentYear";
import { useNumerolojiFutureYears } from "./useNumerolojiFutureYears";

export type ChronoView = { currentYear: number; limitYear: number; futureYears: boolean; note: string };

export function useChronoView(): ChronoView {
  const currentYear = useCurrentYear();
  const futureYears = useNumerolojiFutureYears();
  return {
    currentYear,
    limitYear: chronoLimitYear(currentYear, futureYears),
    futureYears,
    note: chronoNoteText(futureYears),
  };
}
