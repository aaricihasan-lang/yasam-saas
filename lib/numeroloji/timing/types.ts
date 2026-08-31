// FAZ 4 — Zamanlama (Timing) tipleri.
// Tüm hesaplar date-only deterministik; engine katmanında new Date() ÇAĞRILMAZ.

/** Date-only takvim tarihi. Referans tarih UI'da bir kez çözülüp engine'e açıkça geçirilir. */
export type CalendarDate = {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
};

/** Bir hesabın izlenebilir sonucu. steps = provenance (kullanıcıya gösterilmez). */
export type ReducedResult = {
  value: number;
  display: string;
  steps: string[];
  interpretation?: string;
};

/**
 * Kişisel Yıl iki ayrı semantik değer taşır (SOURCE_SEMANTIC_SPLIT_PERSONAL_YEAR):
 *  - nominal: ilgili takvim yılının kişisel yılı (doğum günü+ayı+takvim yılı).
 *  - active: doğum gününden doğum gününe ilerleyen aktif dönemin kişisel yılı.
 * Kişisel Ay/Gün hesabı kaynağa göre NOMINAL değeri kullanır.
 */
export type PersonalYearResult = {
  nominal: ReducedResult;
  active: ReducedResult & {
    periodStart: CalendarDate;
    periodEnd: CalendarDate;
    status?: "SOURCE_RULE_UNDEFINED_FOR_LEAP_BIRTHDAY";
  };
  provenance: "SOURCE_SEMANTIC_SPLIT_PERSONAL_YEAR";
};

export type UniversalTimingResult = {
  universalYear: ReducedResult;
  universalMonth: ReducedResult;
  universalDay: ReducedResult;
};

export type PersonalTimingResult = {
  personalYear: PersonalYearResult;
  personalMonth: ReducedResult;
  personalDay: ReducedResult;
};

export type EvreInfo = { index: number; energy: number; interpretation?: string };
export type DonguInfo = { index: number; interpretation?: string };

export type CycleResult = {
  age: number;
  evre: EvreInfo | null;
  dongu: DonguInfo | null;
  timeline: { evreIndex: number; ageStart: number; ageEnd: number; energy: number }[];
  status?: "SOURCE_BIRTH_YEAR_SPECIAL_CASE" | "SOURCE_RULE_UNDEFINED_AFTER_81";
};
