import { CHAKRA_LETTER_MAP, NumerolojiResult, SPECIAL_NUMBERS, VOWELS, reduceNumber, splitNameParts, turkishUpper } from "./ortak";

type PartResult = {
  finalValue: number;
  raw: number;
  isSpecial: boolean;
  step: string;
};

function sumPartVowels(part: string): PartResult {
  let total = 0;
  const usedTerms: string[] = [];

  for (const originalCh of Array.from(turkishUpper(part))) {
    const val = CHAKRA_LETTER_MAP[originalCh];
    if (!val) continue;
    if (!VOWELS.has(originalCh)) continue;
    total += val;
    usedTerms.push(`${originalCh} = ${val}`);
  }

  if (usedTerms.length === 0) {
    return { finalValue: 0, raw: 0, isSpecial: false, step: "" };
  }

  const raw = total;
  if (SPECIAL_NUMBERS.has(raw)) {
    return {
      finalValue: raw,
      raw,
      isSpecial: true,
      step: `${part.toLocaleLowerCase("tr-TR")} → ${usedTerms.join(" + ")} = ${raw} (ÖZEL)`,
    };
  }

  const finalValue = reduceNumber(raw, true);
  return {
    finalValue,
    raw,
    isSpecial: false,
    step:
      finalValue === raw
        ? `${part.toLocaleLowerCase("tr-TR")} → ${usedTerms.join(" + ")} = ${raw}`
        : `${part.toLocaleLowerCase("tr-TR")} → ${usedTerms.join(" + ")} = ${raw} → ${finalValue}`,
  };
}

export function calcAnaKulvar(firstName: string, lastName: string): NumerolojiResult {
  const parts = splitNameParts(firstName, lastName);
  const steps: string[] = [];

  if (parts.length === 0) return { display: "", key: "", steps: [] };

  const values: number[] = [];
  const usedForBase: boolean[] = [];
  const specialCandidates: number[] = [];

  for (const part of parts) {
    const result = sumPartVowels(part);
    if (result.step) steps.push(result.step);
    values.push(result.finalValue || 0);
    usedForBase.push(false);

    if (result.finalValue && result.isSpecial) {
      specialCandidates.push(result.raw);
      usedForBase[usedForBase.length - 1] = true;
    }
  }

  if (!values.some(Boolean)) return { display: "", key: "", steps };

  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (values[i] === 0 || values[j] === 0) continue;
      const s = values[i] + values[j];
      const sRed = reduceNumber(s, true);
      if (SPECIAL_NUMBERS.has(sRed)) {
        specialCandidates.push(sRed);
        if (!usedForBase[i] && !usedForBase[j]) {
          usedForBase[i] = true;
          usedForBase[j] = true;
        }
        steps.push(`${parts[i].toLocaleLowerCase("tr-TR")} + ${parts[j].toLocaleLowerCase("tr-TR")}: ${values[i]} + ${values[j]} = ${s} → ${sRed} (ÖZEL)`);
      }
    }
  }

  const nonZeroValues = values.filter((v) => v > 0);
  const valuesSorted = [...nonZeroValues].sort((a, b) => b - a);
  steps.push("");
  steps.push(`Ana Kulvar yolu (büyükten küçüğe): ${valuesSorted.join("-")}`);

  if (specialCandidates.length > 0) {
    const specialNum = Math.max(...specialCandidates);
    const baseValues = values.filter((v, index) => v > 0 && !usedForBase[index]);
    let mainDigit: number;

    if (baseValues.length > 0) {
      const baseSum = baseValues.reduce((a, b) => a + b, 0);
      const baseReduced = reduceNumber(baseSum, true);
      steps.push(`Özel olmayan parçaların toplamı: ${baseValues.join(" + ")} = ${baseSum} → ${baseReduced}`);
      mainDigit = baseReduced;
    } else {
      const uniqueSpecials = [...new Set(specialCandidates)].sort((a, b) => b - a);
      mainDigit = uniqueSpecials.length >= 2 ? uniqueSpecials[1] : Math.max(...nonZeroValues);
    }

    const display = `${specialNum}/${mainDigit}`;
    steps.push(`Özel sayılar (Ana Kulvar): ${[...new Set(specialCandidates)].sort((a, b) => a - b).join(", ")}`);
    steps.push(`SONUÇ → Ana Kulvar: ${display}`);
    return { display, key: String(mainDigit), steps };
  }

  const total = nonZeroValues.reduce((a, b) => a + b, 0);
  const finalValue = reduceNumber(total, true);
  const display = String(finalValue);
  steps.push(`Ana Kulvar toplamı: ${nonZeroValues.join(" + ")} = ${total} → ${finalValue}`);
  steps.push(`SONUÇ → Ana Kulvar: ${display}`);
  return { display, key: display, steps };
}
