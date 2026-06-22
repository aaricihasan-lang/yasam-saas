import { CHAKRA_LETTER_MAP, NumerolojiResult, SPECIAL_NUMBERS, VOWELS, reduceNumber, splitNameParts, turkishUpper } from "./ortak";

type PartResult = {
  finalValue: number;
  raw: number;
  isSpecial: boolean;
  step: string;
};

type SpecialCandidate = {
  specialNum: number;
  usedIndices: number[];
  priority: number; // 1 = single part, 2 = pair
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

  for (const part of parts) {
    const result = sumPartVowels(part);
    if (result.step) steps.push(result.step);
    values.push(result.finalValue || 0);
  }

  if (!values.some(Boolean)) return { display: "", key: "", steps };

  const specialCandidates: SpecialCandidate[] = [];

  for (let i = 0; i < values.length; i++) {
    if (values[i] && SPECIAL_NUMBERS.has(values[i])) {
      specialCandidates.push({ specialNum: values[i], usedIndices: [i], priority: 1 });
    }
  }

  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (values[i] === 0 || values[j] === 0) continue;
      const s = values[i] + values[j];
      const sRed = reduceNumber(s, true);
      if (SPECIAL_NUMBERS.has(sRed)) {
        specialCandidates.push({ specialNum: sRed, usedIndices: [i, j], priority: 2 });
        steps.push(
          `${parts[i].toLocaleLowerCase("tr-TR")} + ${parts[j].toLocaleLowerCase("tr-TR")}: ${values[i]} + ${values[j]} = ${s} → ${sRed} (ÖZEL)`
        );
      }
    }
  }

  const nonZeroValues = values.filter((v) => v > 0);
  const valuesSorted = [...nonZeroValues].sort((a, b) => b - a);
  steps.push("");
  steps.push(`Ana Kulvar yolu (büyükten küçüğe): ${valuesSorted.join("-")}`);

  if (specialCandidates.length > 0) {
    const best = [...specialCandidates].sort((a, b) =>
      a.specialNum !== b.specialNum ? b.specialNum - a.specialNum : b.priority - a.priority
    )[0];

    const specialNum = best.specialNum;
    const usedSet = new Set(best.usedIndices);
    const baseValues = values.filter((v, i) => v > 0 && !usedSet.has(i));
    let mainDigit: number;

    if (baseValues.length > 0) {
      const baseSum = baseValues.reduce((a, b) => a + b, 0);
      mainDigit = reduceNumber(baseSum, true);
      steps.push(
        `Özel oluşum dışında kalan parçaların toplamı: ${baseValues.join(" + ")} = ${baseSum} → ${mainDigit}`
      );
    } else {
      const usedValues = best.usedIndices.map((i) => values[i]).filter((v) => v > 0);
      mainDigit = usedValues.length >= 2 ? Math.min(...usedValues) : specialNum;
    }

    // Parantez içi görünüm: kullanılan parçalar (büyükten küçüğe) + dışarıda kalanlar
    // Örn: 33/6 (22/11/6) — yan_kulvar.py _build_parenthesis_values mantığından uyarlandı
    const usedVals = best.usedIndices
      .map((i) => values[i])
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    const remainVals = baseValues.slice().sort((a, b) => b - a);
    const parenVals = [...usedVals, ...remainVals];
    const paren = parenVals.length >= 2 ? ` (${parenVals.join("/")})` : "";

    const display = `${specialNum}/${mainDigit}${paren}`;
    const uniqueSpecialNums = [...new Set(specialCandidates.map((c) => c.specialNum))].sort((a, b) => a - b);
    steps.push(`Özel sayılar (Ana Kulvar): ${uniqueSpecialNums.join(", ")}`);
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
