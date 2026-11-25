"use client";

// Kronolojik bölümler (Değişim-Dönüşüm · Zirve · Mücadele · Harflerin Yankılanışı) için tek
// görünüm kaynağı: `currentYear` = "Aktif" dönem vurgusu (her zaman bugünün yılı);
// `limitYear` = gösterim sınırı (yetki KAPALI → currentYear, önceki davranış birebir;
// AÇIK → yöntemin doğal bitişine kadar tüm dönemler); `note` = yetkiye uygun bilgi notu.

// I18N-0003: `recordBirthDate` = kaydın yapısal doğum tarihi (ChronoRecordProvider; yoksa null → eski kayıt
// metin geri dönüşü). Sunucu kaydı kısıtlı süzdüyse (futureYearsView.restricted) istemci yetki önbelleği
// sınırı GENİŞLETEMEZ.

import { chronoNoteText, chronoViewLimit } from "../utils/chronoCutoff";
import { useChronoRecord } from "./ChronoRecordContext";
import { useCurrentYear } from "./useCurrentYear";
import { useNumerolojiFutureYears } from "./useNumerolojiFutureYears";

export type ChronoView = { currentYear: number; limitYear: number; futureYears: boolean; note: string; recordBirthDate: string | null };

export function useChronoView(): ChronoView {
  const currentYear = useCurrentYear();
  const granted = useNumerolojiFutureYears();
  const rec = useChronoRecord();
  const { limitYear, futureYears } = chronoViewLimit(currentYear, granted, rec.restrictedLimitYear);
  return {
    currentYear,
    limitYear,
    futureYears,
    note: chronoNoteText(futureYears),
    recordBirthDate: rec.birthDate,
  };
}
