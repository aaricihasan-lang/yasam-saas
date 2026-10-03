import { parseBirthDate, reduce1To9, reduceToDigit, sumDigits } from "./ortak";

export type Zirve = {
  index: number;
  /** Ham toplam (bileşenler toplandığı haliyle, sadeleştirmeden önce). */
  topicRaw: number;
  /** Zirve konusu = çakra (1–9). 11 → 2, 22 → 4 (kitap 1 PDF s.212). */
  topic: number;
  /** Kitaptaki zirve sayısı gösterimi: "11/2", "22/4" veya "1"…"9" (kitap 1 PDF s.210–216). */
  display?: string;
  /**
   * Geriye dönük uyumluluk alanı = `yasMetot2` (Hayat Yoluna göre). Eski kayıtlarda yalnız bu
   * alan vardır ve kaydedildiği dönemin yöntemini taşır (2026-08-29 öncesi: 36 − 1. zirve).
   */
  age: number;
  /** Metot 1 — İlk Zirve Sayısına Göre: 36 − 1. zirve sayısı, sonra +9, +9, +9 (kitap 1 s.211). */
  yasMetot1?: number;
  /** Metot 2 — Hayat Yoluna Göre: 36 − Hayat Yolu kökü, sonra +9, +9, +9 (kitap 1 s.212). */
  yasMetot2?: number;
};

/** 11 ve 22 korunarak tek haneye indirgeme (kitap 1 PDF s.210: "11,22 sayılarına ulaşmadıkça"). */
function reduceZirve(n: number): number {
  let cur = Math.abs(n);
  while (cur > 9) {
    if (cur === 11 || cur === 22) return cur;
    cur = sumDigits(cur);
  }
  return cur === 0 ? 9 : cur;
}
function zirveTopic(v: number): number {
  return v === 11 ? 2 : v === 22 ? 4 : v;
}
function zirveDisplay(v: number): string {
  return v === 11 ? "11/2" : v === 22 ? "22/4" : String(v);
}

export type ZirveResult = {
  gSade: number;
  aSade: number;
  ySade: number;
  /** Hayat Yolu kök sayısı (1–9). Zirve yaşları bu değerden türetilir. */
  hayatYoluRoot: number;
  /** Metot 1'in tabanı: 1. zirve sayısı (11/22 korunmuş haliyle; kitap örneği 36 − 11 = 25). */
  ilkZirveSayisi?: number;
  peaks: Zirve[];
};

/**
 * Zirve (Pinnacle) yılları.
 *
 * METODOLOJİ KAYNAĞI (kitap 1. seviye, PDF s.210–212 / basılı s.209–211):
 *   - Gün, ay ve yıl ayrı ayrı tek basamağa indirgenir; ancak 11 ya da 22 ise (Kasım ayı,
 *     ayın 11./22./29. günü, toplamı 11/22 olan yıl — ör. 1975) "11 ya da 22 olarak kalmalı".
 *   - 1. Zirve = gün + ay · 2. Zirve = gün + yıl · 3. Zirve = 1. + 2. · 4. Zirve = ay + yıl
 *     (her biri "11,22 sayılarına ulaşmadıkça tek basamağa indir").
 *   - Zirve sayısı anlamları 11/2 ve 22/4 olarak verilir (s.216); "11/2 ve 22/4 sayılarını
 *     2 ve 4 tek basamaklı sayılara düşürüyoruz" (s.212) → konu çakrası 2 / 4.
 *   - Kitap örneği (başlık "19/02/1987", rakamlar 18.02.1987'ye aittir): 11, 7, 9, 9.
 *
 * YAŞ FORMÜLÜ — NİHAİ KULLANICI KARARI (2026-10-03): İKİ METOT BİRLİKTE GÖSTERİLİR.
 *   - Metot 1 — İlk Zirve Sayısına Göre (PDF s.211 kural + örnek): 36 − 1. zirve sayısı
 *     (11/22 korunmuş haliyle; kitap: 36 − 11 = 25), sonra +9, +9, +9.
 *   - Metot 2 — Hayat Yoluna Göre (PDF s.212): 36 − Hayat Yolu kökü, sonra +9, +9, +9.
 *   Örnek HASAN 14.02.1987: Metot 1 → 29/38/47/56 · Metot 2 → 31/40/49/58.
 *   `age` alanı geriye dönük uyumluluk için Metot 2 değerini taşır.
 */
export function calcZirveYillari(birthDate: string): ZirveResult | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;

  // Bileşenler: 11/22 korunur (kitap 1 PDF s.210).
  // Ham sayı üzerinden indirgenir: 11. gün / Kasım (11) / 22. gün doğrudan 11/22 kalır;
  // 29. gün → 11, 1975 → 22 (kitap 1 PDF s.210 örnekleri).
  const gKept = reduceZirve(parts.day);
  const aKept = reduceZirve(parts.month);
  const yKept = reduceZirve(parts.year);

  // Geriye dönük uyumluluk: *Sade alanları tek haneli (1–9) kalır.
  const gSade = reduce1To9(gKept);
  const aSade = reduce1To9(aKept);
  const ySade = reduce1To9(yKept);

  // Hayat Yolu kök sayısı: doğum tarihindeki tüm rakamların tam sadeleşmesi (1–9).
  const hayatYoluTotal = sumDigits(parts.day) + sumDigits(parts.month) + sumDigits(parts.year);
  const hayatYoluRoot = reduceToDigit(hayatYoluTotal);

  const p1Raw = gKept + aKept;
  const p1 = reduceZirve(p1Raw);
  const p1Age = 36 - hayatYoluRoot;
  const m1Base = 36 - p1;

  const p2Raw = gKept + yKept;
  const p2 = reduceZirve(p2Raw);
  const p2Age = p1Age + 9;

  const p3Raw = p1 + p2;
  const p3 = reduceZirve(p3Raw);
  const p3Age = p2Age + 9;

  const p4Raw = aKept + yKept;
  const p4 = reduceZirve(p4Raw);
  const p4Age = p3Age + 9;

  const peak = (index: number, raw: number, v: number, age: number): Zirve => ({
    index,
    topicRaw: raw,
    topic: zirveTopic(v),
    display: zirveDisplay(v),
    age,
    yasMetot1: m1Base + (index - 1) * 9,
    yasMetot2: age,
  });

  return {
    gSade,
    aSade,
    ySade,
    hayatYoluRoot,
    ilkZirveSayisi: p1,
    peaks: [peak(1, p1Raw, p1, p1Age), peak(2, p2Raw, p2, p2Age), peak(3, p3Raw, p3, p3Age), peak(4, p4Raw, p4, p4Age)],
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
  lines.push(`  Gün + Ay: ${p1.topicRaw} → zirve sayısı ${p1.display ?? p1.topic}`);
  if (p1.display && p1.display.includes("/")) lines.push(`  Not: ${p1.display} zirvesi yorumda ${p1.topic}. çakra olarak değerlendirilir.`);
  lines.push(`  Konu sayısı (çakra): ${p1.topic}  → ${p1.topic}. çakra`);
  lines.push(`  Yaş — Metot 1 (İlk Zirve Sayısına Göre): 36 - ${info.ilkZirveSayisi} = ${p1.yasMetot1} yaş`);
  lines.push(`  Yaş — Metot 2 (Hayat Yoluna Göre): 36 - Hayat Yolu (${root}) = ${p1.yasMetot2} yaş`, "");

  lines.push("2. ZİRVE YILI");
  lines.push(`  Gün + Yıl: ${p2.topicRaw} → zirve sayısı ${p2.display ?? p2.topic}`);
  lines.push(`  Konu sayısı (çakra): ${p2.topic}  → ${p2.topic}. çakra`);
  lines.push(`  Yaş — Metot 1: ${p1.yasMetot1} + 9 = ${p2.yasMetot1} yaş · Metot 2: ${p1.yasMetot2} + 9 = ${p2.yasMetot2} yaş`, "");

  lines.push("3. ZİRVE YILI");
  lines.push(`  1. zirve + 2. zirve: ${p3.topicRaw} → zirve sayısı ${p3.display ?? p3.topic}`);
  lines.push(`  Konu sayısı (çakra): ${p3.topic}  → ${p3.topic}. çakra`);
  lines.push(`  Yaş — Metot 1: ${p2.yasMetot1} + 9 = ${p3.yasMetot1} yaş · Metot 2: ${p2.yasMetot2} + 9 = ${p3.yasMetot2} yaş`, "");

  lines.push("4. ZİRVE YILI");
  lines.push(`  Ay + Yıl: ${p4.topicRaw} → zirve sayısı ${p4.display ?? p4.topic}`);
  lines.push(`  Konu sayısı (çakra): ${p4.topic}  → ${p4.topic}. çakra`);
  lines.push(`  Yaş — Metot 1: ${p3.yasMetot1} + 9 = ${p4.yasMetot1} yaş · Metot 2: ${p3.yasMetot2} + 9 = ${p4.yasMetot2} yaş`, "");

  return lines.join("\n");
}
