// Hicri takvim yardımcıları — Umm al-Qura hesabı (Intl API)

const HIJRI_MONTHS_TR: ReadonlyArray<string> = [
  "Muharrem", "Safer", "Rebiülevvel", "Rebiülahir",
  "Cemaziyelevvel", "Cemaziyelahir", "Recep", "Şaban",
  "Ramazan", "Şevval", "Zilkade", "Zilhicce",
];

type HijriParts = { day: string; monthIndex: number; year: string };

function parseHijriParts(date: Date): HijriParts | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
    const parts = fmt.formatToParts(date);
    const day   = parts.find((p) => p.type === "day")?.value   ?? "";
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const year  = parts.find((p) => p.type === "year")?.value  ?? "";
    if (!day || !month || !year) return null;
    const monthIndex = parseInt(month, 10) - 1;
    if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
    return { day, monthIndex, year };
  } catch {
    return null;
  }
}

/** Tam hicri tarih: "20 Zilhicce 1447" */
export function getHijriDate(date: Date): string {
  const p = parseHijriParts(date);
  if (!p) return "—";
  const monthName = HIJRI_MONTHS_TR[p.monthIndex] ?? "?";
  return `${p.day} ${monthName} ${p.year}`;
}

/** Ay + yıl: "Zilhicce 1447"  (takvim başlığı için) */
export function getHijriMonthYear(date: Date): string {
  const p = parseHijriParts(date);
  if (!p) return "—";
  const monthName = HIJRI_MONTHS_TR[p.monthIndex] ?? "?";
  return `${monthName} ${p.year}`;
}
