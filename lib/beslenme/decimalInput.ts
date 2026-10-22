/**
 * BUG-002 (AŞAMA 2 / B1) — kullanıcı ondalık girişi (SAF; DOM/istemci bağımsız).
 *
 * `Number("65,5")` → NaN → JSON'da `null` olur; kilo "zorunlu" hatasına, boy/bel/kalça ise
 * SESSİZCE boş değere dönüşüyordu. Bu ayrıştırıcı Türkçe virgülü ve noktayı kabul eder,
 * geçersiz metni AÇIKÇA "invalid" olarak döndürür (asla sessiz null), yuvarlama YAPMAZ.
 *
 * Kabul: "65,5" · "65.5" · " 65,5 " · "70" · ",5" değil (baştaki rakam zorunlu).
 * Ret: "abc" · "6,5,5" · "1.234,5" (binlik ayırıcı belirsiz) · "-3" · "Infinity" · "NaN" · "1e3".
 */
export type DecimalParse =
  | { kind: "empty" }
  | { kind: "ok"; value: number }
  | { kind: "invalid" }
  | { kind: "out_of_range"; value: number };

const DECIMAL_RE = /^\d+(?:[.,]\d+)?$/;

export function parseDecimalInput(raw: string | null | undefined, range: { min: number; max: number }): DecimalParse {
  const t = String(raw ?? "").trim();
  if (!t) return { kind: "empty" };
  if (!DECIMAL_RE.test(t)) return { kind: "invalid" };
  const value = Number(t.replace(",", "."));
  if (!Number.isFinite(value)) return { kind: "invalid" };
  if (value < range.min || value > range.max) return { kind: "out_of_range", value };
  return { kind: "ok", value };
}

/** Sunucu aralıklarıyla (measurements route cleanNumber) BİREBİR; 0 kabul edilmez. */
export const MEASUREMENT_RANGES = {
  weight_kg: { min: 0.0001, max: 500 },
  height_cm: { min: 0.0001, max: 300 },
  waist_cm: { min: 0.0001, max: 400 },
  hip_cm: { min: 0.0001, max: 400 },
} as const;

export type MeasurementField = keyof typeof MEASUREMENT_RANGES;

/**
 * Ölçüm formu → API gövdesi. Kilo zorunlu; boy/bel/kalça boşsa null, doluysa geçerli olmalı.
 * Hata: ilk geçersiz alan (kullanıcıya alan bazlı Türkçe mesaj gösterilir).
 */
export function buildMeasurementBody(
  form: { weight: string; height: string; waist: string; hip: string },
): { ok: true; values: Record<MeasurementField, number | null> } | { ok: false; field: MeasurementField; reason: "required" | "invalid" | "out_of_range" } {
  const fields: Array<[MeasurementField, string]> = [
    ["weight_kg", form.weight],
    ["height_cm", form.height],
    ["waist_cm", form.waist],
    ["hip_cm", form.hip],
  ];
  const values = {} as Record<MeasurementField, number | null>;
  for (const [field, raw] of fields) {
    const r = parseDecimalInput(raw, MEASUREMENT_RANGES[field]);
    if (r.kind === "empty") {
      if (field === "weight_kg") return { ok: false, field, reason: "required" };
      values[field] = null;
    } else if (r.kind === "ok") {
      values[field] = r.value;
    } else {
      return { ok: false, field, reason: r.kind };
    }
  }
  return { ok: true, values };
}

/**
 * BUG-004: API hata kodu → çeviri anahtarı (`beslenme.detail.errors.*`). Ham kod/SQL/stack
 * kullanıcıya ASLA gösterilmez; bilinmeyen kod genel mesaja düşer.
 */
const ERROR_KEYS: Record<string, string> = {
  WEIGHT_REQUIRED: "weightRequired",
  BAD_HEIGHT_CM: "badHeight",
  BAD_WAIST_CM: "badWaist",
  BAD_HIP_CM: "badHip",
  BAD_MEASURED_AT: "badDate",
  BAD_TARGET_WEIGHT: "badTargetWeight",
  BAD_MEAL_COUNT: "badMealCount",
  BAD_GOAL_TYPE: "invalidInput",
  BAD_ACTIVITY_LEVEL: "invalidInput",
  BAD_STANCE: "invalidInput",
  BAD_FOOD_ID: "invalidInput",
  LABEL_REQUIRED: "labelRequired",
  TOO_MANY: "tooManyAllergens",
  CUSTOM_TOO_LONG: "customTooLong",
  CUSTOM_DUPLICATE: "customDuplicate",
  UNKNOWN_ALLERGEN: "invalidAllergen",
  BAD_ALLERGEN_ID: "invalidAllergen",
  BAD_ALLERGEN_ITEM: "invalidAllergen",
  BAD_ALLERGENS: "invalidAllergen",
  FOOD_NOT_ACCESSIBLE: "foodNotAccessible",
  MEASUREMENT_NOT_FOUND: "measurementNotFound",
  CLIENT_NOT_FOUND: "notFound",
  NOT_FOUND: "notFound",
  DEMO_READONLY: "demoReadonly",
  FORBIDDEN: "forbidden",
  NETWORK: "network",
};

export function beslenmeErrorKey(code: string | null | undefined, status?: number): string {
  if (code && ERROR_KEYS[code]) return ERROR_KEYS[code]!;
  if (status === 0) return "network";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 400 || status === 422) return "invalidInput";
  return "generic";
}
