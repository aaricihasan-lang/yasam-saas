import { parseBirthDate, reduce1To9, sumDigits } from "./ortak";

export type MucadeleItem = {
  index: number;
  topic: number;
  age: number;
};

export type MucadeleResult = {
  gSade: number;
  aSade: number;
  ySade: number;
  /**
   * Tek canonical mücadele yöntemi (Hasan Hoca eğitim notu).
   * Alan adı geriye dönük uyumluluk için `method1` olarak korunur;
   * ARTIK ikinci bir yöntem (`method2`) YOKTUR.
   */
  method1: MucadeleItem[];
  /**
   * ANA MÜCADELE = |M1 − M2| (1. mücadele konusu − 2. mücadele konusu farkı).
   * M3 (=|a−y|) DEĞİLDİR. 3. dönem yaşından (age3) yaşam sonuna kadar geçerlidir.
   */
  anaMucadele: number;
  /** Ana mücadelenin başladığı yaş (3. dönem sonu). */
  anaMucadeleBaslangicYasi: number;
};

/**
 * Mücadele (Challenge) yılları — TEK canonical yöntem.
 *
 * CANONICAL (Hasan Hoca eğitim notu):
 *   g = gün sade, a = ay sade, y = yıl sade
 *   Konular:
 *     M1 = |g − a|
 *     M2 = |g − y|
 *     M3 = |a − y|
 *   Dönem yaşları:
 *     age1 = 36 − M1
 *     age2 = age1 + 27
 *     age3 = age2 + 27
 *
 * FAZ 1 forensic'te tespit edilen kanıtlı hataların düzeltmesi:
 *   - KALDIRILDI: +36 / +36 dönem artışı (yanlış)
 *   - KALDIRILDI: "2. yöntem" (27 taban, +9 / +9)
 *   - KALDIRILDI: M3 = |M1 − M2| (yerine canonical M3 = |a − y|)
 */
export function calcMucadeleYillari(birthDate: string): MucadeleResult | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;

  const gSade = reduce1To9(sumDigits(parts.day));
  const aSade = reduce1To9(sumDigits(parts.month));
  const ySade = reduce1To9(sumDigits(parts.year));

  const m1 = Math.abs(gSade - aSade);
  const m2 = Math.abs(gSade - ySade);
  const m3 = Math.abs(aSade - ySade);

  const age1 = 36 - m1;
  const age2 = age1 + 27;
  const age3 = age2 + 27;

  // ANA MÜCADELE: 1. ve 2. mücadele konularının farkı (M3 DEĞİL).
  const anaMucadele = Math.abs(m1 - m2);

  return {
    gSade,
    aSade,
    ySade,
    method1: [
      { index: 1, topic: m1, age: age1 },
      { index: 2, topic: m2, age: age2 },
      { index: 3, topic: m3, age: age3 },
    ],
    anaMucadele,
    anaMucadeleBaslangicYasi: age3,
  };
}

function topicLine(topic: number): string {
  return topic === 0 ? "Konu sayısı: 0  → '0 mücadelesi' (yön bulma, kararsızlık teması)" : `Konu sayısı: ${topic}  → ${topic}. çakra`;
}

export function formatlaMucadeleYili(birthDate: string): string {
  const info = calcMucadeleYillari(birthDate);
  if (!info) return ["=== MÜCADELE YILLARI ===", `Doğum Tarihi: ${birthDate}`, "", "HATA: Doğum tarihi 'gg.aa.yyyy' formatında olmalıdır."].join("\n");

  const { gSade: g, aSade: a, ySade: y, method1: m, anaMucadele, anaMucadeleBaslangicYasi } = info;
  const [p1, p2, p3] = m;
  const lines: string[] = [];

  lines.push(
    "=== MÜCADELE YILLARI ===",
    `Doğum Tarihi: ${birthDate}`,
    "",
    "Doğum tarihinin sadeleşmiş hali (gün / ay / yıl):",
    `  Gün : ${g}`,
    `  Ay  : ${a}`,
    `  Yıl : ${y}`,
    "",
    "Notlar:",
    "  • 36 sayısı sabit alınır; dönemler 27 yıl arayla ilerler.",
    "  • Mücadele 3 kez ortaya çıkar.",
    "  • Konu 0 çıkarsa, kişi yönsüzlük ve kararsızlık temalı bir mücadele yaşar.",
    "",
  );

  lines.push("1. Mücadele Yılı");
  lines.push("  Konu için: |Gün (sade) - Ay (sade)|");
  lines.push(`    |${g} - ${a}| = ${p1.topic}`);
  lines.push(`  ${topicLine(p1.topic)}`);
  lines.push(`  Yaş: 36 - ${p1.topic} = ${p1.age} yaş`, "");

  lines.push("2. Mücadele Yılı");
  lines.push("  Konu için: |Gün (sade) - Yıl (sade)|");
  lines.push(`    |${g} - ${y}| = ${p2.topic}`);
  lines.push(`  ${topicLine(p2.topic)}`);
  lines.push(`  Yaş: 1. mücadele yaşı + 27 = ${p1.age} + 27 = ${p2.age} yaş`, "");

  lines.push("3. Mücadele Yılı");
  lines.push("  Konu için: |Ay (sade) - Yıl (sade)|");
  lines.push(`    |${a} - ${y}| = ${p3.topic}`);
  lines.push(`  ${topicLine(p3.topic)}`);
  lines.push(`  Yaş: 2. mücadele yaşı + 27 = ${p2.age} + 27 = ${p3.age} yaş`, "");

  lines.push("ANA MÜCADELE");
  lines.push("  Konu için: |1. mücadele konusu - 2. mücadele konusu|");
  lines.push(`    |${p1.topic} - ${p2.topic}| = ${anaMucadele}`);
  lines.push(`  ${topicLine(anaMucadele)}`);
  lines.push(`  Geçerlilik: ${anaMucadeleBaslangicYasi} yaşından yaşam sonuna kadar.`, "");

  return lines.join("\n");
}
