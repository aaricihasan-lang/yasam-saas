import { parseBirthDate } from "../ortak";
import { classifyCompatibilityNumber, compatibilityNameSum } from "../relationship/compatibilityAlphabet";
import { rawBirthDigitSum } from "../relationship/calculations";
import type {
  BusinessCompatibilityLayer,
  BusinessCompatibilityResult,
  BusinessIdentityMode,
  BusinessIdentityVariant,
  OpeningDateLayer,
} from "./types";

export const BUSINESS_SOURCE_PAGE = "kitap 2. seviye, s.205-211";

/**
 * SOURCE_SAMPLE_CONFLICT_WORKPLACE_89
 * Kaynak işyeri örneğinde (s.208) 89 için yanlışlıkla "İYİ K.Ç.B %75 UYUMLU" yazılmıştır.
 * Explicit tablo: 8 = KÖTÜ, 9 = K.Ç.B. → KÖTÜ + K.Ç.B. = %75 UYUMSUZ.
 * Canonical hiyerarşi: EXPLICIT RULE TABLE > CONTRADICTORY SAMPLE LABEL.
 * Bu yüzden 89 → %75 UYUMSUZ olarak hesaplanır (örnek etiketi KODLANMAZ).
 */
export const BUSINESS_SOURCE_NOTES = ["SOURCE_SAMPLE_CONFLICT_WORKPLACE_89"] as const;

function normDate(raw: string): string {
  return (raw || "").trim().replace(/\//g, ".");
}

/** Bir tarihin BÜTÜN rakamlarının HAM toplamı (sadeleştirme YOK). */
function rawDateSum(dateStr: string): number {
  return Array.from(dateStr).filter((c) => /\d/.test(c)).reduce((a, c) => a + Number(c), 0);
}

/**
 * Çalışan toplamı, kaynak yüzde tablosuyla değerlendirir.
 * Kaynak tablo YALNIZ 2 veya 3 basamak için yüzde verir; 1 veya 4+ basamak, ya da
 * tabloda olmayan kombinasyon → percentage NULL (kaynakta olmayan yüzde ÜRETİLMEZ).
 */
export function evaluateLayer(total: number): BusinessCompatibilityLayer {
  const cls = classifyCompatibilityNumber(total);
  const digitCount = cls.digits.length;

  let resultStatus: BusinessCompatibilityLayer["resultStatus"];
  if (cls.percentage !== null) {
    resultStatus = "COMPUTED";
  } else if (digitCount === 2 || digitCount === 3) {
    resultStatus = "SOURCE_COMBINATION_UNDEFINED";
  } else {
    resultStatus = "SOURCE_RULE_UNDEFINED_FOR_DIGIT_COUNT";
  }

  return {
    total,
    digits: cls.digits,
    digitClasses: cls.classes,
    resultStatus,
    compatibilityPercent: cls.percentage,
    polarity: cls.polarity,
    compatibilityLabel: cls.label,
  };
}

function buildVariant(
  mode: BusinessIdentityMode,
  identityName: string, // "AD" veya "AD SOYAD"
  birthDateRawSum: number,
  businessNameValue: number,
  personNameValue: number,
  openingDateInput: string,
): BusinessIdentityVariant {
  const personBaseValue = personNameValue + birthDateRawSum;
  const personBase = evaluateLayer(personBaseValue);

  const personBusinessTotal = personBaseValue + businessNameValue;
  const businessName = evaluateLayer(personBusinessTotal);

  let openingDate: OpeningDateLayer | null = null;
  if (openingDateInput.trim()) {
    const nd = normDate(openingDateInput);
    const valid = parseBirthDate(nd) !== null; // gerçek takvim doğrulaması
    if (valid) {
      const rawSum = rawDateSum(nd);
      const finalTotal = personBusinessTotal + rawSum;
      openingDate = { input: openingDateInput, valid: true, normalizedDate: nd, rawSum, finalTotal, classification: evaluateLayer(finalTotal) };
    } else {
      openingDate = { input: openingDateInput, valid: false, normalizedDate: null, rawSum: null, finalTotal: null, classification: null };
    }
  }

  return {
    mode,
    personNameValue,
    birthDateRawSum,
    personBaseValue,
    personBase,
    businessNameValue,
    personBusinessTotal,
    businessName,
    openingDate,
  };
}

export type BusinessCompatibilityInput = {
  name: string;
  surname?: string;
  birthDate: string;
  businessName: string;
  openingDate?: string;
};

/**
 * İşyeri (sahip) uyumu — 3 katmanlı kümülatif zincir (kitap 2 s.208).
 * Soyad varsa iki BAĞIMSIZ variant üretir (name / name_surname); biri diğerini
 * override etmez, global bir kazanan seçilmez.
 * Doğum tarihi geçersizse null döner (temel hesap yapılamaz).
 */
export function analyzeBusinessCompatibility(input: BusinessCompatibilityInput): BusinessCompatibilityResult | null {
  const name = (input.name || "").trim();
  const surname = (input.surname || "").trim();
  const businessName = (input.businessName || "").trim();
  const birthDate = normDate(input.birthDate);

  if (!name || !businessName) return null;
  const birthDateRawSum = rawBirthDigitSum(birthDate); // null ise geçersiz tarih
  if (birthDateRawSum == null) return null;

  const businessSum = compatibilityNameSum(businessName);
  const nameSum = compatibilityNameSum(name);
  const openingDateInput = input.openingDate || "";

  const variants: BusinessIdentityVariant[] = [];
  const unsupported = new Set<string>([...nameSum.unmapped, ...businessSum.unmapped]);

  // VARIANT A — yalnız Ad
  variants.push(buildVariant("name", name, birthDateRawSum, businessSum.sum, nameSum.sum, openingDateInput));

  // VARIANT B — Ad + Soyad (yalnız soyad girildiyse; biri diğerini override ETMEZ)
  if (surname) {
    const nameSurnameSum = compatibilityNameSum(`${name} ${surname}`);
    nameSurnameSum.unmapped.forEach((c) => unsupported.add(c));
    variants.push(buildVariant("name_surname", `${name} ${surname}`, birthDateRawSum, businessSum.sum, nameSurnameSum.sum, openingDateInput));
  }

  return {
    businessName,
    businessNameValue: businessSum.sum,
    variants,
    unsupportedCharacters: Array.from(unsupported),
    sourcePage: BUSINESS_SOURCE_PAGE,
  };
}
