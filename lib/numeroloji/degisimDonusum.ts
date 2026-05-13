import { parseBirthDate, reduce1To9, sumDigits } from "./ortak";

export type DegisimYearOnly = {
  index: number;
  changeYear: number;
  chakra: number;
  effectStartYear: number;
  effectEndYear: number;
  effectMonth: number;
};

export type DegisimFullDate = DegisimYearOnly & {
  effectDay: number;
};

export function calcDegisimByYearOnly(year: number, month: number, steps = 5): DegisimYearOnly[] {
  const results: DegisimYearOnly[] = [];
  let baseYear = year;
  let changeYear = baseYear + sumDigits(baseYear);

  for (let index = 1; index <= steps; index += 1) {
    const chakraRaw = sumDigits(changeYear);
    const chakra = reduce1To9(chakraRaw);
    results.push({
      index,
      changeYear,
      chakra,
      effectStartYear: changeYear - 1,
      effectEndYear: changeYear,
      effectMonth: month,
    });

    baseYear = changeYear;
    changeYear = baseYear + sumDigits(baseYear);
  }

  return results;
}

export function calcDegisimByFullDate(day: number, month: number, year: number, steps = 5): DegisimFullDate[] {
  const results: DegisimFullDate[] = [];
  let baseYear = year;
  let changeYear = baseYear + sumDigits(baseYear);

  for (let index = 1; index <= steps; index += 1) {
    const digitsStr = `${String(changeYear).padStart(4, "0")}${String(day).padStart(2, "0")}${String(month).padStart(2, "0")}`;
    const chakraRaw = Array.from(digitsStr).reduce((acc, ch) => acc + Number(ch), 0);
    const chakra = reduce1To9(chakraRaw);

    results.push({
      index,
      changeYear,
      chakra,
      effectStartYear: changeYear - 1,
      effectEndYear: changeYear,
      effectMonth: month,
      effectDay: day,
    });

    baseYear = changeYear;
    changeYear = baseYear + sumDigits(baseYear);
  }

  return results;
}

export function formatlaDegisimYillari(birthDate: string, steps = 5): string {
  const lines: string[] = ["=== DEĞİŞİM-DÖNÜŞÜM YILLARI ===", `Doğum Tarihi: ${birthDate}`, ""];
  const parts = parseBirthDate(birthDate);

  if (!parts) {
    lines.push("HATA: Doğum tarihi 'gg.aa.yyyy' formatında olmalıdır.");
    return lines.join("\n");
  }

  const { day, month, year } = parts;

  lines.push("1) DOĞUM YILINA GÖRE DEĞİŞİM-DÖNÜŞÜM YILLARI", "");
  for (const r of calcDegisimByYearOnly(year, month, steps)) {
    lines.push(`${r.index}. Değişim: ${r.changeYear}  → Çakra: ${r.chakra}. Çakra`);
    lines.push(`   Etki Dönemi (yaklaşık): ${r.effectStartYear} yılının ${r.effectMonth}. ayından ${r.effectEndYear} yılının ${r.effectMonth}. ayına kadar.`);
    lines.push("");
  }

  lines.push("=".repeat(60), "", "2) GÜN VE AY DAHİL DEĞİŞİM-DÖNÜŞÜM YILLARI", "");
  for (const r of calcDegisimByFullDate(day, month, year, steps)) {
    lines.push(`${r.index}. Değişim: ${r.changeYear}  → Çakra: ${r.chakra}. Çakra`);
    lines.push(`   Etki Dönemi: ${r.effectStartYear} yılının ${String(r.effectMonth).padStart(2, "0")}.${String(r.effectDay).padStart(2, "0")} tarihinden ${r.effectEndYear} yılının ${String(r.effectMonth).padStart(2, "0")}.${String(r.effectDay).padStart(2, "0")} tarihine kadar.`);
    lines.push("");
  }

  return lines.join("\n");
}
