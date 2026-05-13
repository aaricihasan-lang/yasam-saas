import { CHAKRA_LETTER_MAP, NumerolojiResult, SPECIAL_NUMBERS, VOWELS, reduceNumber, splitNameParts, turkishUpper } from "./ortak";

type PartResult = {
  finalValue: number;
  raw: number;
  isSpecial: boolean;
  step: string;
};

function sumPartConsonants(part: string): PartResult {
  let total = 0;
  const usedTerms: string[] = [];

  for (const ch of Array.from(turkishUpper(part))) {
    const val = CHAKRA_LETTER_MAP[ch];
    if (!val) continue;
    if (VOWELS.has(ch)) continue;
    total += val;
    usedTerms.push(`${ch} = ${val}`);
  }

  if (usedTerms.length === 0) return { finalValue: 0, raw: 0, isSpecial: false, step: "" };

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

export function calcYanKulvar(firstName: string, lastName: string): NumerolojiResult {
  const parts = splitNameParts(firstName, lastName);
  const steps: string[] = [];

  if (parts.length === 0) return { display: "", key: "", steps: [] };

  const values: number[] = [];
  const usedForBase: boolean[] = [];
  const specialCandidates: number[] = [];

  for (const part of parts) {
    const result = sumPartConsonants(part);
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
        usedForBase[i] = true;
        usedForBase[j] = true;
        steps.push(`${parts[i].toLocaleLowerCase("tr-TR")} + ${parts[j].toLocaleLowerCase("tr-TR")}: ${values[i]} + ${values[j]} = ${s} → ${sRed} (ÖZEL)`);
      }
    }
  }

  const nonZeroValues = values.filter((v) => v > 0);
  const valuesSorted = [...nonZeroValues].sort((a, b) => b - a);
  steps.push("");
  steps.push(`Yan Kulvar yolu (büyükten küçüğe): ${valuesSorted.join("-")}`);

  if (specialCandidates.length > 0) {
    const specialNum = Math.max(...specialCandidates);
    const uniqueSpecials = [...new Set(specialCandidates)].sort((a, b) => b - a);
    let mainDigit: number | null;

    if (uniqueSpecials.length >= 2) {
      mainDigit = uniqueSpecials[1];
    } else {
      const baseValues = values.filter((v, index) => v > 0 && !usedForBase[index]);
      if (baseValues.length > 0) {
        const baseSum = baseValues.reduce((a, b) => a + b, 0);
        const baseReduced = reduceNumber(baseSum, true);
        steps.push(`Özel olmayan parçaların toplamı: ${baseValues.join(" + ")} = ${baseSum} → ${baseReduced}`);
        mainDigit = baseReduced;
      } else {
        mainDigit = uniqueSpecials.length === 1 ? null : Math.max(...nonZeroValues);
      }
    }

    steps.push(`Özel sayılar (Yan Kulvar): ${[...new Set(specialCandidates)].sort((a, b) => a - b).join(", ")}`);

    if (mainDigit === null) {
      const display = String(specialNum);
      steps.push(`SONUÇ → Yan Kulvar: ${display}`);
      return { display, key: String(specialNum), steps };
    }

    const display = `${specialNum}/${mainDigit}`;
    steps.push(`SONUÇ → Yan Kulvar: ${display}`);
    return { display, key: String(mainDigit), steps };
  }

  const total = nonZeroValues.reduce((a, b) => a + b, 0);
  const finalValue = reduceNumber(total, true);
  const display = String(finalValue);
  steps.push(`Yan Kulvar toplamı: ${nonZeroValues.join(" + ")} = ${total} → ${finalValue}`);
  steps.push(`SONUÇ → Yan Kulvar: ${display}`);
  return { display, key: display, steps };
}
