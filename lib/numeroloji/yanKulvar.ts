import { CHAKRA_LETTER_MAP, NumerolojiResult, SPECIAL_NUMBERS, VOWELS, buildSpecialPathDisplay, combinedReadingDisplay, reduceNumber, splitNameParts, turkishUpper } from "./ortak";

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

  for (const part of parts) {
    const result = sumPartConsonants(part);
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
  steps.push(`Yan Kulvar yolu (büyükten küçüğe): ${valuesSorted.join("-")}`);

  if (specialCandidates.length > 0) {
    // Kural: per-part özel sayı korunur, kalan (özel olmayan) bileşenler toplanır ve indirgenir.
    const perPartSpecials = nonZeroValues.filter((v) => SPECIAL_NUMBERS.has(v));
    const nonSpecialValues = nonZeroValues.filter((v) => !SPECIAL_NUMBERS.has(v));

    if (perPartSpecials.length > 0 && nonSpecialValues.length > 0) {
      const nonSpecialSum = nonSpecialValues.reduce((a, b) => a + b, 0);
      const reducedNonSpecial = reduceNumber(nonSpecialSum, true);
      const mainSpecialStr = [...perPartSpecials].sort((a, b) => b - a).join("/");
      const mainDisplay = `${mainSpecialStr}/${reducedNonSpecial}`;

      steps.push(
        `Özel sayı korundu: ${perPartSpecials.join(", ")} | Kalan: ${nonSpecialValues.join(" + ")} = ${nonSpecialSum} → ${reducedNonSpecial}`
      );

      // Tüm ikili kombinasyonlarda özel/karmik toplam ara
      let bracketStr = "";
      let bestPairSum = 0;
      for (let i = 0; i < nonZeroValues.length; i++) {
        for (let j = i + 1; j < nonZeroValues.length; j++) {
          const pairSum = nonZeroValues[i] + nonZeroValues[j];
          if (SPECIAL_NUMBERS.has(pairSum) && pairSum > bestPairSum) {
            const remaining = nonZeroValues.filter((_, k) => k !== i && k !== j);
            const remainingNum =
              remaining.length === 1
                ? remaining[0]
                : reduceNumber(remaining.reduce((a, b) => a + b, 0), true);
            bestPairSum = pairSum;
            bracketStr = `(${pairSum}/${remainingNum})`;
            steps.push(
              `Ara kontrol: ${nonZeroValues[i]} + ${nonZeroValues[j]} = ${pairSum} → özel/karmik | Kalan: ${remainingNum}`
            );
          }
        }
      }

      // Parantez, ana display'in alternatif bileşen okumasıdır; ana ile BİREBİR aynı
      // render ediliyorsa (örn. "11/11 (11/11)") anlamsız tekrardır ve gösterilmez.
      // (buildSpecialPathDisplay'deki mainPath===origPath susturma kuralıyla tutarlı.)
      const bracketInner = bracketStr.replace(/^\(|\)$/g, "");
      const showBracket = Boolean(bracketStr) && bracketInner !== mainDisplay;
      const display = showBracket ? `${mainDisplay} ${bracketStr}` : mainDisplay;
      steps.push(`SONUÇ → Yan Kulvar: ${display}`);
      return { display, key: String(reducedNonSpecial), steps };
    }

    // Mevcut mantık: tüm değerler özel veya yalnızca çift özel oluşumu var
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

    // OWNER combined-reading display (presentation-only; key/lookup DEĞİŞMEZ):
    // TÜM component'ler özel (≥2) ise ana display parça sırasında "/" ile component'leri,
    // parantezde ise BİRLEŞİK OKUMAYI gösterir (ör. 11/11 (22), 11/22 (33)).
    // Aksi halde mevcut path display korunur. combinedReading canonical DEĞİLDİR.
    const nonZeroInOrder = values.filter((v) => v > 0);
    const allSpecialMulti =
      nonZeroInOrder.length >= 2 && nonZeroInOrder.every((v) => SPECIAL_NUMBERS.has(v));
    let display: string;
    let combinedReading: string | undefined;
    if (allSpecialMulti) {
      const mainComponents = nonZeroInOrder.join("/");
      const cr = combinedReadingDisplay(nonZeroInOrder);
      if (cr && cr !== mainComponents) {
        combinedReading = cr;
        display = `${mainComponents} (${cr})`;
        steps.push(
          `Birleşik okuma (alternatif, canonical değil): ${nonZeroInOrder.join(" + ")} = ${nonZeroInOrder.reduce((a, b) => a + b, 0)} → ${cr}`
        );
      } else {
        display = mainComponents;
      }
    } else {
      const pathDisplay = buildSpecialPathDisplay(values);
      display = pathDisplay !== "" ? pathDisplay : `${specialNum}/${mainDigit}`;
    }
    const uniqueSpecialNums = [...new Set(specialCandidates.map((c) => c.specialNum))].sort((a, b) => a - b);
    steps.push(`Özel sayılar (Yan Kulvar): ${uniqueSpecialNums.join(", ")}`);
    steps.push(`SONUÇ → Yan Kulvar: ${display}`);
    return { display, key: String(mainDigit), steps, ...(combinedReading ? { combinedReading } : {}) };
  }

  const total = nonZeroValues.reduce((a, b) => a + b, 0);
  const finalValue = reduceNumber(total, true);
  const display = String(finalValue);
  steps.push(`Yan Kulvar toplamı: ${nonZeroValues.join(" + ")} = ${total} → ${finalValue}`);
  steps.push(`SONUÇ → Yan Kulvar: ${display}`);
  return { display, key: display, steps };
}
