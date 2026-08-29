// ─────────────────────────────────────────────────────────────────────────────
// MOTOR B — İŞYERİ (SAHİP) UYUMU  (kitap 2. seviye, s.205-211)
//
// FAZ 2 compatibility primitive'lerini REUSE eder (yeni alfabe/tablo/yüzde YAZILMAZ).
// GLOBAL SKOR YOKTUR (globalScore/overallScore/compatibilityScore YOK).
// ─────────────────────────────────────────────────────────────────────────────

import type { CompatClass } from "../relationship/types";

/**
 * Bir katman toplamının değerlendirme durumu.
 * - COMPUTED: kaynak yüzde tablosu (2 veya 3 basamak) tarafından desteklenen sonuç.
 * - SOURCE_COMBINATION_UNDEFINED: 2/3 basamak ama kombinasyon tabloda tanımlı değil.
 * - SOURCE_RULE_UNDEFINED_FOR_DIGIT_COUNT: 1 basamak veya 4+ basamak → kaynak kural yok.
 * Son iki durumda percentage NULL kalır; kaynakta olmayan yüzde ÜRETİLMEZ.
 */
export type BusinessDigitStatus =
  | "COMPUTED"
  | "SOURCE_COMBINATION_UNDEFINED"
  | "SOURCE_RULE_UNDEFINED_FOR_DIGIT_COUNT";

export type BusinessCompatibilityLayer = {
  total: number;
  digits: number[];
  digitClasses: CompatClass[];
  resultStatus: BusinessDigitStatus;
  compatibilityPercent: number | null; // yalnız 2/3 basamak + tablo desteğinde dolu
  polarity: "UYUMLU" | "UYUMSUZ" | null;
  compatibilityLabel: string | null; // "%75 UYUMSUZ" vb.
};

export type OpeningDateLayer = {
  input: string;
  valid: boolean; // gerçek takvim doğrulaması
  normalizedDate: string | null; // GG.AA.YYYY
  rawSum: number | null; // tarihteki tüm rakamların HAM toplamı
  finalTotal: number | null; // personBusinessTotal + rawSum
  classification: BusinessCompatibilityLayer | null;
};

export type BusinessIdentityMode = "name" | "name_surname";

export type BusinessIdentityVariant = {
  mode: BusinessIdentityMode;

  // Layer 1 — Kişi Temel Uyumu
  personNameValue: number; // compatibility alphabet(isim[+soyad])
  birthDateRawSum: number; // doğum tarihi HAM toplam
  personBaseValue: number; // personNameValue + birthDateRawSum
  personBase: BusinessCompatibilityLayer;

  // Layer 2 — İşyeri Adı Uyumu
  businessNameValue: number;
  personBusinessTotal: number; // personBaseValue + businessNameValue
  businessName: BusinessCompatibilityLayer;

  // Layer 3 — Açılış Tarihi Etkisi (opsiyonel)
  openingDate: OpeningDateLayer | null;
};

export type BusinessCompatibilityResult = {
  businessName: string;
  businessNameValue: number;
  variants: BusinessIdentityVariant[]; // 1 (yalnız ad) veya 2 (ad + ad_soyad)
  unsupportedCharacters: string[]; // kaynak alfabede olmayan harfler (X vb.)
  sourcePage: string;
  // BİLEREK YOK: globalScore / overallScore / compatibilityScore
};
