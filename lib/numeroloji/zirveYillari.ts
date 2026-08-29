import { parseBirthDate, reduce1To9, reduceToDigit, sumDigits } from "./ortak";

export type Zirve = {
  index: number;
  topicRaw: number;
  topic: number;
  age: number;
};

export type ZirveResult = {
  gSade: number;
  aSade: number;
  ySade: number;
  /** Hayat Yolu kök sayısı (1–9). Zirve yaşları bu değerden türetilir. */
  hayatYoluRoot: number;
  peaks: Zirve[];
};

/**
 * Zirve (Pinnacle) yılları.
 *
 * CANONICAL (Hasan Hoca eğitim notu):
 *   Konu (çakra) formülleri:
 *     P1 = ay(sade) + gün(sade)
 *     P2 = gün(sade) + yıl(sade)
 *     P3 = P1 konu + P2 konu
 *     P4 = ay(sade) + yıl(sade)
 *   Yaş formülleri:
 *     1. zirve yaşı = 36 − Hayat Yolu kök sayısı
 *     sonraki zirveler: +9, +9, +9
 *
 * NOT: Yaş çıpası Hayat Yolu köküdür (ay+gün DEĞİL). Bu, FAZ 1 forensic'te
 * tespit edilen kanıtlı hatanın (36 − (aySade+günSade)) düzeltmesidir.
 */
export function calcZirveYillari(birthDate: string): ZirveResult | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;

  const gSade = reduce1To9(sumDigits(parts.day));
  const aSade = reduce1To9(sumDigits(parts.month));
  const ySade = reduce1To9(sumDigits(parts.year));

  // Hayat Yolu kök sayısı: doğum tarihindeki tüm rakamların tam sadeleşmesi (1–9).
  const hayatYoluTotal = sumDigits(parts.day) + sumDigits(parts.month) + sumDigits(parts.year);
  const hayatYoluRoot = reduceToDigit(hayatYoluTotal);

  const p1Raw = aSade + gSade;
  const p1Topic = p1Raw === 11 ? 2 : reduce1To9(p1Raw);
  const p1Age = 36 - hayatYoluRoot;

  const p2Raw = gSade + ySade;
  const p2Topic = reduce1To9(p2Raw);
  const p2Age = p1Age + 9;

  const p3Raw = p1Topic + p2Topic;
  const p3Topic = reduce1To9(p3Raw);
  const p3Age = p2Age + 9;

  const p4Raw = aSade + ySade;
  const p4Topic = reduce1To9(p4Raw);
  const p4Age = p3Age + 9;

  return {
    gSade,
    aSade,
    ySade,
    hayatYoluRoot,
    peaks: [
      { index: 1, topicRaw: p1Raw, topic: p1Topic, age: p1Age },
      { index: 2, topicRaw: p2Raw, topic: p2Topic, age: p2Age },
      { index: 3, topicRaw: p3Raw, topic: p3Topic, age: p3Age },
      { index: 4, topicRaw: p4Raw, topic: p4Topic, age: p4Age },
    ],
  };
}

export function formatlaZirveYillari(birthDate: string): string {
  const info = calcZirveYillari(birthDate);
  if (!info) return ["=== ZİRVE YILLARI ===", `Doğum Tarihi: ${birthDate}`, "", "HATA: Doğum tarihi 'gg.aa.yyyy' formatında olmalıdır."].join("\n");

  const { gSade: g, aSade: a, ySade: y, hayatYoluRoot: root, peaks } = info;
  const [p1, p2, p3, p4] = peaks;
  const lines: string[] = [];

  lines.push("=== ZİRVE YILLARI ===", `Doğum Tarihi: ${birthDate}`, "", "Doğum tarihinin sadeleşmiş hali (gün / ay / yıl):", `  Gün : ${g}`, `  Ay  : ${a}`, `  Yıl : ${y}`, `  Hayat Yolu kök sayısı: ${root}`, "");

  lines.push("1. ZİRVE YILI");
  lines.push(`  Ay (sade) + Gün (sade): ${a} + ${g} = ${p1.topicRaw}`);
  if (p1.topicRaw === 11) lines.push("  Not: 11 çıktığı için yorumda 2. çakra olarak değerlendirilir.");
  lines.push(`  Konu sayısı (çakra): ${p1.topic}  → ${p1.topic}. çakra`);
  lines.push(`  Yaş: 36 - Hayat Yolu (${root}) = ${p1.age} yaş`, "");

  lines.push("2. ZİRVE YILI");
  lines.push(`  Gün (sade) + Yıl (sade): ${g} + ${y} = ${p2.topicRaw}`);
  lines.push(`  Konu sayısı (çakra): ${p2.topic}  → ${p2.topic}. çakra`);
  lines.push(`  Yaş: 1. zirve yaşı + 9 = ${p1.age} + 9 = ${p2.age} yaş`, "");

  lines.push("3. ZİRVE YILI");
  lines.push(`  1. zirve konusu + 2. zirve konusu: ${p1.topic} + ${p2.topic} = ${p3.topicRaw}`);
  lines.push(`  Konu sayısı (çakra): ${p3.topic}  → ${p3.topic}. çakra`);
  lines.push(`  Yaş: 2. zirve yaşı + 9 = ${p2.age} + 9 = ${p3.age} yaş`, "");

  lines.push("4. ZİRVE YILI");
  lines.push(`  Ay (sade) + Yıl (sade): ${a} + ${y} = ${p4.topicRaw}`);
  lines.push(`  Konu sayısı (çakra): ${p4.topic}  → ${p4.topic}. çakra`);
  lines.push(`  Yaş: 3. zirve yaşı + 9 = ${p3.age} + 9 = ${p4.age} yaş`, "");

  return lines.join("\n");
}
