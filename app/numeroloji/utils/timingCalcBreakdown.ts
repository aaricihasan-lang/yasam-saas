// FAZ 6 / UAT PATCH 1 — Aktif Kişisel Yıl "Nasıl hesaplandı?" SUNUM dökümü.
//
// Engine (timing/personal.ts) Aktif Kişisel Yıl DEĞERİNİ, aktif takvim yılının
// nominalPersonalYear'ı olarak üretir; fakat active.steps yalnız provenance ("doğum günü
// geçildi → aktif takvim yılı X") içerir, ARİTMETİĞİ göstermez. Bu saf yardımcı, AYNI
// canonical formülle (sumDigits(gün)+sumDigits(ay)+sumDigits(aktifYıl) → tek hane) kullanıcıya
// gerçek hesabı gösterir. Yeni formül/motor YOK; developer trace ("primitive/fallback") YOK.

import { parseBirthDate } from "@/lib/numeroloji";

export type TimingBreakdown = { steps: string[]; value: number };

function reduceToSingle(total: number): { steps: string[]; value: number } {
  const steps: string[] = [];
  let cur = total;
  while (cur > 9) {
    const next = String(cur)
      .split("")
      .reduce((a, c) => a + Number(c), 0);
    steps.push(`${String(cur).split("").join(" + ")} = ${next}`);
    cur = next;
  }
  return { steps, value: cur === 0 ? 9 : cur };
}

/**
 * Aktif Kişisel Yıl dökümü. activeCalendarYear = aktif dönemin başladığı doğum gününün
 * takvim yılı (UI'da periodStart.year). Formül nominalPersonalYear ile birebir.
 */
export function activePersonalYearBreakdown(
  birthDate: string,
  activeCalendarYear: number,
): TimingBreakdown | null {
  const p = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!p) return null;
  const dayDigits = p.dayText.split("").map(Number);
  const monthDigits = p.monthText.split("").map(Number);
  const yearDigits = String(activeCalendarYear).split("").map(Number);
  const total = [...dayDigits, ...monthDigits, ...yearDigits].reduce((a, b) => a + b, 0);
  const steps = [
    `Doğum günü + doğum ayı + aktif takvim yılı (${activeCalendarYear})`,
    `${dayDigits.join(" + ")}  +  ${monthDigits.join(" + ")}  +  ${yearDigits.join(" + ")} = ${total}`,
  ];
  const red = reduceToSingle(total);
  return { steps: [...steps, ...red.steps], value: red.value };
}
