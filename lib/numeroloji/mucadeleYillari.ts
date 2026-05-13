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
  method1: MucadeleItem[];
  method2: MucadeleItem[];
};

export function calcMucadeleYillari(birthDate: string): MucadeleResult | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;

  const gSade = reduce1To9(sumDigits(parts.day));
  const aSade = reduce1To9(sumDigits(parts.month));
  const ySade = reduce1To9(sumDigits(parts.year));

  const c1 = Math.abs(aSade - gSade);
  const age1 = 36 - c1;
  const c2 = Math.abs(gSade - ySade);
  const age2 = age1 + 36;
  const c3 = Math.abs(c1 - c2);
  const age3 = age2 + 36;

  const c1b = Math.abs(aSade - gSade);
  const age1b = 27 - c1b;
  const c2b = Math.abs(gSade - ySade);
  const age2b = age1b + 9;
  const c3b = Math.abs(c1b - c2b);
  const age3b = age2b + 9;

  return {
    gSade,
    aSade,
    ySade,
    method1: [
      { index: 1, topic: c1, age: age1 },
      { index: 2, topic: c2, age: age2 },
      { index: 3, topic: c3, age: age3 },
    ],
    method2: [
      { index: 1, topic: c1b, age: age1b },
      { index: 2, topic: c2b, age: age2b },
      { index: 3, topic: c3b, age: age3b },
    ],
  };
}

function topicLine(topic: number): string {
  return topic === 0 ? "Konu sayısı: 0  → '0 mücadelesi' (yön bulma, kararsızlık teması)" : `Konu sayısı: ${topic}  → ${topic}. çakra`;
}

export function formatlaMucadeleYili(birthDate: string): string {
  const info = calcMucadeleYillari(birthDate);
  if (!info) return ["=== MÜCADELE YILI / MÜCADELE YILLARI ===", `Doğum Tarihi: ${birthDate}`, "", "HATA: Doğum tarihi 'gg.aa.yyyy' formatında olmalıdır."].join("\n");

  const { gSade: g, aSade: a, ySade: y, method1: m1, method2: m2 } = info;
  const [p1, p2, p3] = m1;
  const [q1, q2, q3] = m2;
  const lines: string[] = [];

  lines.push("=== MÜCADELE YILI / MÜCADELE YILLARI ===", `Doğum Tarihi: ${birthDate}`, "", "Doğum tarihinin sadeleşmiş hali (gün / ay / yıl):", `  Gün : ${g}`, `  Ay  : ${a}`, `  Yıl : ${y}`, "", "Notlar:", "  • Numerolojide 36 sayısı sabit alınır.", "  • Mücadele yılları 3 kez ortaya çıkar.", "  • Konu 0 çıkarsa, kişi yönsüzlük ve kararsızlık temalı bir mücadele yaşar.", "");

  lines.push("1. HESAPLAMA ŞEKLİ (36 sabiti, 36'şar yıl arayla)", "");
  lines.push("1. Mücadele Yılı (1. yöntem)");
  lines.push("  İlk mücadele konusu için: Ay (sade) - Gün (sade)");
  lines.push(`    ${a} - ${g} = ${Math.abs(a - g)}  (eksi işaret yok, mutlak değer alınır)`);
  lines.push(`  ${topicLine(p1.topic)}`);
  lines.push(`  Yaş: 36 - ${p1.topic} = ${p1.age} yaş`, "");

  lines.push("2. Mücadele Yılı (1. yöntem)");
  lines.push("  Konu için: Gün (sade) - Yıl (sade)");
  lines.push(`    ${g} - ${y} = ${Math.abs(g - y)}  (eksi işaret yok, mutlak değer alınır)`);
  lines.push(`  ${topicLine(p2.topic)}`);
  lines.push(`  Yaş: 1. mücadele yaşı + 36 = ${p1.age} + 36 = ${p2.age} yaş`, "");

  lines.push("3. Mücadele Yılı (1. yöntem)");
  lines.push("  Konu için: 1. mücadele konusu - 2. mücadele konusu");
  lines.push(`    ${p1.topic} - ${p2.topic} = ${Math.abs(p1.topic - p2.topic)}`);
  lines.push(`  ${topicLine(p3.topic)}`);
  lines.push(`  Yaş: 2. mücadele yaşı + 36 = ${p2.age} + 36 = ${p3.age} yaş`, "");

  lines.push("", "2. HESAPLAMA ŞEKLİ (27 sabiti, 9'ar yıl arayla)", "");
  lines.push("1. Mücadele Yılı (2. yöntem)");
  lines.push("  İlk mücadele konusu yine: Ay (sade) - Gün (sade)");
  lines.push(`    ${a} - ${g} = ${Math.abs(a - g)}  (eksi işaret yok, mutlak değer alınır)`);
  lines.push(`  ${topicLine(q1.topic)}`);
  lines.push(`  Yaş: 27 - ${q1.topic} = ${q1.age} yaş`, "");

  lines.push("2. Mücadele Yılı (2. yöntem)");
  lines.push("  Konu için yine: Gün (sade) - Yıl (sade)");
  lines.push(`    ${g} - ${y} = ${Math.abs(g - y)}  (eksi işaret yok, mutlak değer alınır)`);
  lines.push(`  ${topicLine(q2.topic)}`);
  lines.push(`  Yaş: 1. mücadele yaşı + 9 = ${q1.age} + 9 = ${q2.age} yaş`, "");

  lines.push("3. Mücadele Yılı (2. yöntem)");
  lines.push("  Konu için: 1. mücadele konusu - 2. mücadele konusu");
  lines.push(`    ${q1.topic} - ${q2.topic} = ${Math.abs(q1.topic - q2.topic)}`);
  lines.push(`  ${topicLine(q3.topic)}`);
  lines.push(`  Yaş: 2. mücadele yaşı + 9 = ${q2.age} + 9 = ${q3.age} yaş`, "");

  return lines.join("\n");
}
