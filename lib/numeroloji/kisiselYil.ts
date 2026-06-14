import { NumerolojiResult, SPECIAL_NUMBERS } from "./ortak";

/**
 * Kişisel Yıl hesabı.
 * ISO (YYYY-MM-DD) ve TR (DD.MM.YYYY) formatlarını kabul eder.
 * Formül: doğum günü + doğum ayı + güncel yıl rakamları → özel sayı korumalı sadeleştirme.
 */
export function calcKisiselYil(birthDate: string): NumerolojiResult {
  try {
    if (!birthDate) return { display: "-", key: "", steps: [] };

    const parts = birthDate.includes("-") ? birthDate.split("-") : birthDate.split(".");
    if (parts.length !== 3) return { display: "-", key: "", steps: [] };

    // ISO: [YYYY, MM, DD] → day=parts[2], month=parts[1]
    // TR:  [DD, MM, YYYY] → day=parts[0], month=parts[1]
    const isISO = parts[0].length === 4;
    const day   = isISO ? parts[2] : parts[0];
    const month = parts[1];

    const currentYear = new Date().getFullYear();
    const digits = Array.from(`${day}${month}${currentYear}`)
      .filter((c) => /\d/.test(c))
      .map(Number);

    let total = digits.reduce((a, b) => a + b, 0);
    while (total > 9 && !SPECIAL_NUMBERS.has(total)) {
      total = Array.from(String(total)).reduce((a, c) => a + Number(c), 0);
    }

    return {
      display: String(total),
      key: String(total),
      steps: [`Kişisel Yıl (${currentYear}): ${total}`],
    };
  } catch {
    return { display: "-", key: "", steps: [] };
  }
}
