// FAZ 6 — İlişki analizi "Nasıl hesaplandı?" SUNUM dökümleri.
//
// Engine (lib/numeroloji/relationship) bu değerleri yalnız NİHAİ sayı olarak döndürür
// (calcLifeCodeDigit/calcBirthdayDigit/calcAcquisition/calcNameNumberSingle). Bu saf
// yardımcı, YENİ formül eklemeden AYNI canonical primitive'lerle (parseBirthDate,
// sumDigits, reduce1To9, CHAKRA_LETTER_MAP) adım dökümü üretir. Yalnız sunum içindir;
// motor sonucu değişmez.

import {
  CHAKRA_LETTER_MAP,
  parseBirthDate,
  sumDigits,
  turkishUpper,
} from "@/lib/numeroloji";

export type Breakdown = { steps: string[]; value: number };

function reduceSteps(total: number): { steps: string[]; value: number } {
  const steps: string[] = [];
  let cur = total;
  while (cur > 9) {
    const next = sumDigits(cur);
    steps.push(`${String(cur).split("").join(" + ")} = ${next}`);
    cur = next;
  }
  return { steps, value: cur === 0 ? 9 : cur };
}

/** Yaşam Kodu: doğum tarihinin tüm rakamları toplanır → tek hane. */
export function lifeCodeBreakdown(birthDate: string): Breakdown | null {
  const p = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!p) return null;
  const digits = `${p.dayText}${p.monthText}${p.yearText}`.split("").map(Number);
  const total = digits.reduce((a, b) => a + b, 0);
  const steps = [`${birthDate}`, `${digits.join(" + ")} = ${total}`];
  const red = reduceSteps(total);
  return { steps: [...steps, ...red.steps], value: red.value };
}

/** Doğum Günü Sayısı: yalnız günün rakamları → tek hane. */
export function birthdayBreakdown(birthDate: string): Breakdown | null {
  const p = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!p) return null;
  const dayDigits = p.dayText.split("").map(Number);
  const total = dayDigits.reduce((a, b) => a + b, 0);
  const steps = [`Gün: ${p.dayText}`, `${dayDigits.join(" + ")} = ${total}`];
  const red = reduceSteps(total);
  return { steps: [...steps, ...red.steps], value: red.value };
}

/** Edinim Sayısı: (gün + ay rakamları) → tek hane. */
export function acquisitionBreakdown(birthDate: string): Breakdown | null {
  const p = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!p) return null;
  const dayDigits = p.dayText.split("").map(Number);
  const monthDigits = p.monthText.split("").map(Number);
  const total = [...dayDigits, ...monthDigits].reduce((a, b) => a + b, 0);
  const steps = [
    `Gün + Ay: ${p.dayText} + ${p.monthText}`,
    `${[...dayDigits, ...monthDigits].join(" + ")} = ${total}`,
  ];
  const red = reduceSteps(total);
  return { steps: [...steps, ...red.steps], value: red.value };
}

/** İsim Sayısı: isim+soyisim harflerinin CHAKRA_LETTER_MAP değerleri toplanır → tek hane. */
export function nameNumberBreakdown(firstName: string, lastName: string): Breakdown | null {
  const full = `${firstName || ""} ${lastName || ""}`;
  const pairs: string[] = [];
  const values: number[] = [];
  for (const ch of Array.from(turkishUpper(full))) {
    const val = CHAKRA_LETTER_MAP[ch];
    if (val) {
      pairs.push(`${ch}=${val}`);
      values.push(val);
    }
  }
  if (values.length === 0) return null;
  const total = values.reduce((a, b) => a + b, 0);
  const steps = [pairs.join("  "), `${values.join(" + ")} = ${total}`];
  const red = reduceSteps(total);
  return { steps: [...steps, ...red.steps], value: red.value };
}

/** Ortak Rakam: iki kişinin İsim Sayısı tek-hane değerleri toplanır → yine tek hane. */
export function commonDigitBreakdown(
  firstA: string,
  lastA: string,
  firstB: string,
  lastB: string,
): Breakdown | null {
  const a = nameNumberBreakdown(firstA, lastA);
  const b = nameNumberBreakdown(firstB, lastB);
  if (!a || !b) return null;
  const total = a.value + b.value;
  const steps = [`İsim Sayısı: ${a.value} + ${b.value} = ${total}`];
  const red = reduceSteps(total);
  return { steps: [...steps, ...red.steps], value: red.value === 0 ? 9 : red.value };
}
