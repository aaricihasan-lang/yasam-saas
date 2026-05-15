import { parseBirthDate, turkishUpper } from "./ortak";

export const CHAKRA_LETTER_GROUPS: Record<number, string[]> = {
  1: Array.from("AJSŞ"),
  2: Array.from("BKT"),
  3: Array.from("CÇLUÜ"),
  4: Array.from("DMV"),
  5: Array.from("ENW"),
  6: Array.from("FOÖX"),
  7: Array.from("GĞPY"),
  8: Array.from("HQZ"),
  9: Array.from("IİR"),
};

export const LETTER_TO_CHAKRA: Record<string, number> = Object.entries(CHAKRA_LETTER_GROUPS).reduce<Record<string, number>>((acc, [chakra, letters]) => {
  for (const letter of letters) acc[letter] = Number(chakra);
  return acc;
}, {});

export type HarfYankilanisiSegment = {
  letter: string;
  chakra: number;
  ageStart: number;
  ageEnd: number;
  yearStart?: number;
  yearEnd?: number;
};

function normalizeName(firstName: string, lastName: string): string {
  return Array.from(turkishUpper(`${firstName} ${lastName}`.trim()))
    .filter((ch) => /[A-ZÇĞİÖŞÜ]/.test(ch))
    .join("");
}

function segmentKapsarYili(seg: HarfYankilanisiSegment, yil: number): boolean {
  return seg.yearStart !== undefined && seg.yearEnd !== undefined && seg.yearStart <= yil && yil <= seg.yearEnd;
}

export function calcHarflerinYankilanisi(firstName: string, lastName: string, birthDate?: string, maxAge = 80): HarfYankilanisiSegment[] {
  const normalized = normalizeName(firstName, lastName);
  const letters = Array.from(normalized).filter((ch) => LETTER_TO_CHAKRA[ch]);
  if (letters.length === 0) return [];

  const parts = birthDate ? parseBirthDate(birthDate) : null;
  const birthYear = parts?.year;
  const mevcutYil = new Date().getFullYear();
  const hedefYas = birthYear != null ? Math.max(0, mevcutYil - birthYear) : maxAge;

  const segments: HarfYankilanisiSegment[] = [];
  let currentAge = 0;
  let harfIdx = 0;
  let guard = 0;
  const maxGuard = Math.max(letters.length * 400, 64);

  while (guard < maxGuard) {
    guard += 1;
    const ch = letters[harfIdx % letters.length];
    const chakra = LETTER_TO_CHAKRA[ch];
    if (!chakra) {
      harfIdx += 1;
      continue;
    }

    const ageStart = currentAge;
    let ageEnd = currentAge + chakra - 1;
    if (ageEnd > hedefYas) ageEnd = hedefYas;
    if (!birthYear && ageEnd > maxAge) ageEnd = maxAge;
    if (ageStart > (birthYear ? hedefYas : maxAge)) break;

    const seg: HarfYankilanisiSegment = {
      letter: ch,
      chakra,
      ageStart,
      ageEnd,
      ...(birthYear != null ? { yearStart: birthYear + ageStart, yearEnd: birthYear + ageEnd } : {}),
    };
    segments.push(seg);

    currentAge = ageEnd + 1;
    harfIdx += 1;

    if (birthYear != null && segmentKapsarYili(seg, mevcutYil)) break;
    if (!birthYear && currentAge > maxAge) break;
  }

  return segments;
}

export function formatlaHarflerinYankilanisi(firstName: string, lastName: string, birthDate?: string, maxAge = 80): string {
  const lines: string[] = ["=== HARFLERİN YANKILANIŞI ===", `İsim Soyisim: ${firstName} ${lastName}`];
  if (birthDate) lines.push(`Doğum Tarihi: ${birthDate}`);
  lines.push("");

  const normalized = normalizeName(firstName, lastName);
  if (!normalized) {
    lines.push("Geçerli harf içeren bir isim/soyisim bulunamadı.");
    return lines.join("\n");
  }

  lines.push(`Kullanılan harf dizisi (${normalized.length} harf):`);
  lines.push(`  ${Array.from(normalized).join(" ")}`);
  lines.push("", "Harflerin yaşlara göre dağılımı:", "");

  const segments = calcHarflerinYankilanisi(firstName, lastName, birthDate, maxAge);
  if (segments.length === 0) {
    lines.push("İsimde çakra tablosuna uyan bir harf bulunamadı.");
    return lines.join("\n");
  }

  for (const seg of segments) {
    const ageText = seg.ageStart === seg.ageEnd ? `${seg.ageStart}. yaş` : `${seg.ageStart}–${seg.ageEnd}. yaşlar arası`;
    let yearText = "";
    if (seg.yearStart !== undefined && seg.yearEnd !== undefined) {
      yearText = seg.yearStart === seg.yearEnd ? `  (yaklaşık yıl: ${seg.yearStart})` : `  (yaklaşık yıllar: ${seg.yearStart}–${seg.yearEnd})`;
    }
    lines.push(`- ${seg.letter} harfi → ${seg.chakra}. Çakra etkisi: ${ageText}${yearText}`);
  }

  lines.push("", "Not: Harfler sırayla değerlendirilir ve her harf ait olduğu çakra numarası kadar yıl etkili kabul edilir. ");
  return lines.join("\n");
}
