import { parseBirthDate, reduce1To9, sumDigits } from "./ortak";

export type MucadeleItem = {
  index: number;
  topic: number;
  /**
   * Geriye dönük uyumluluk alanı. Kitap 2 kayıtlarında = `cutoffAge` (DÖNEM GEÇİŞ SINIRI,
   * dönemin BAŞLANGIÇ yaşı DEĞİLDİR). 2026-08-29 öncesi kayıtlarda nokta yaştır (önceki metodoloji).
   */
  age: number;
  /** Dönemin başladığı yaş (1. dönem 0; sonrakiler bir önceki geçiş sınırı). */
  startAge?: number;
  /** Dönemin geçiş sınırı: "X yaşına kadar" (kitap 2 s.181–182). */
  cutoffAge?: number;
};

export type MucadeleResult = {
  gSade: number;
  aSade: number;
  ySade: number;
  /** Yöntem damgası: yeni hesaplar yalnız "kitap2". Alan eski kayıtlarda yoktur. */
  yontem?: "kitap2";
  /**
   * Kitap 2 mücadele dönemleri (M1, M2, M3). Alan adı geriye dönük uyumluluk için `method1`.
   * Yeni motorda ikinci bir yöntem (`method2`) YOKTUR; eski kayıtlarda bulunabilir.
   */
  method1: MucadeleItem[];
  /** ANA MÜCADELE = |M1 − M2| (M3 DEĞİL). 3. geçiş sınırından sonra geçerlidir. */
  anaMucadele: number;
  /** Ana mücadelenin başladığı yaş (= 3. dönemin geçiş sınırı). */
  anaMucadeleBaslangicYasi: number;
};

/**
 * Mücadele yılları — NİHAİ KULLANICI KARARI (2026-10-03): TEK ANA METOT = KİTAP 2.
 *
 * KAYNAK: kitap 2. seviye PDF s.181–183 (+ s.184–197 sayı anlamları 0–8).
 *   g, a, y = doğum günü, ayı, yılı "kendi içlerinde topla ve sadeleştirip TEK SAYIYA indirge"
 *   (11/19/22/33 KORUNMAZ; kitap örneği 29 → 11 → 2).
 *   M1 = |g − a|   → 36 − M1 yaşına KADAR
 *   M2 = |g − y|   → sonraki 27 yıllık dönem (geçiş sınırı +27)
 *   M3 = |a − y|   → sonraki 27 yıllık dönem (geçiş sınırı +27)
 *   ANA = |M1 − M2| → 3. geçiş sınırından sonra
 *   Kitap örneği 29/03/1986: 1/35, 4/62, 3/89, ana 3 (89+). HASAN 14.02.1987: 3/33, 2/60, 5/87, ana 1.
 *
 * YAŞ SEMANTİĞİ: üretilen yaşlar dönem GEÇİŞ SINIRIDIR ("X yaşına kadar"), BAŞLANGIÇ DEĞİLDİR.
 *   Dönem i, bir önceki geçiş sınırında başlar (1. dönem doğumda). Kaynak sınır yaşının
 *   dahil/hariç olduğunu belirtmez; SİSTEM KONVANSİYONU: geçiş sınırı yaşına ulaşıldığında
 *   (o doğum gününde) sonraki döneme geçilir — bkz. `mucadeleDonemiAt`.
 *
 * KALDIRILANLAR (yeni hesapta YOK; eski kayıtlarda snapshot olarak okunabilir):
 *   +36 / +36 nokta yaşlar ve "27 − M1, +9, +9" (kullanıcı notu), M3 = |M1 − M2|.
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

  const cut1 = 36 - m1;
  const cut2 = cut1 + 27;
  const cut3 = cut2 + 27;

  // ANA MÜCADELE: 1. ve 2. mücadele konularının farkı (M3 DEĞİL).
  const anaMucadele = Math.abs(m1 - m2);

  return {
    gSade,
    aSade,
    ySade,
    yontem: "kitap2",
    method1: [
      { index: 1, topic: m1, age: cut1, startAge: 0, cutoffAge: cut1 },
      { index: 2, topic: m2, age: cut2, startAge: cut1, cutoffAge: cut2 },
      { index: 3, topic: m3, age: cut3, startAge: cut2, cutoffAge: cut3 },
    ],
    anaMucadele,
    anaMucadeleBaslangicYasi: cut3,
  };
}

// ─── Dönem çözümleme (UI / Word / infografik / düz metin TEK KAYNAK) ─────────────

export type MucadeleDonem = {
  index: number;
  topic: number;
  startAge: number;
  cutoffAge: number;
  /** "1. Mücadele — 33 yaşına kadar" gibi kaynakla uyumlu dönem etiketi. */
  label: string;
};

export type MucadeleAna = { topic: number; startAge: number; label: string };

/** Önceki metodoloji (2026-08-29 öncesi kayıtlar): nokta yaşlar, ana mücadele alanı yok. */
export type MucadeleOncekiNokta = { index: number; topic: number; age: number; label: string };

export type MucadeleDonemleri =
  | { format: "kitap2"; periods: MucadeleDonem[]; ana: MucadeleAna | null }
  | { format: "onceki"; points: MucadeleOncekiNokta[] };

export const MUCADELE_ONCEKI_METOD_NOTU =
  "Bu mücadele bölümü önceki hesaplama metodolojisiyle kaydedilmiştir; yaşlar kaydedildiği haliyle gösterilir.";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function mucadeleDonemLabel(index: number, cutoffAge: number): string {
  return index === 1
    ? `${index}. Mücadele — ${cutoffAge} yaşına kadar`
    : `${index}. Mücadele — sonraki 27 yıllık dönem; geçiş sınırı ${cutoffAge}`;
}

export function mucadeleAnaLabel(startAge: number): string {
  return `Ana Mücadele — ${startAge} sonrası`;
}

/**
 * Kayıtlı ya da yeni motor çıktısındaki mücadele alanını güvenle yorumlar (crash/NaN yok).
 *   - Kitap 2 (2026-08-29 sonrası; `anaMucadele` var, `method2` yok): dönemler + ana.
 *     `startAge` alanı olmayan kayıtlarda başlangıç = bir önceki geçiş sınırı.
 *   - Önceki metodoloji (`method2` var ya da `anaMucadele` yok): `method1` nokta yaşları
 *     kaydedildiği haliyle; `method2` GÖSTERİLMEZ (yeni motora alınmaz).
 * Okunamayan veri → null.
 */
export function mucadeleDonemleri(raw: unknown): MucadeleDonemleri | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.method1) ? (o.method1 as unknown[]) : [];
  const rows: { index: number; topic: number; age: number; startAge: number | null; cutoffAge: number | null }[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const index = num(r.index);
    const topic = num(r.topic);
    const age = num(r.cutoffAge) ?? num(r.age);
    if (index === null || topic === null || age === null) continue;
    rows.push({ index, topic, age, startAge: num(r.startAge), cutoffAge: num(r.cutoffAge) });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.index - b.index);

  const anaTopic = num(o.anaMucadele);
  const isOnceki = "method2" in o || anaTopic === null;
  if (isOnceki) {
    return {
      format: "onceki",
      points: rows.map((r) => ({
        index: r.index,
        topic: r.topic,
        age: r.age,
        label: `${r.index}. Mücadele — ${r.age} yaş (önceki metodoloji)`,
      })),
    };
  }

  const periods: MucadeleDonem[] = rows.map((r, i) => {
    const cutoffAge = r.cutoffAge ?? r.age;
    const startAge = r.startAge ?? (i === 0 ? 0 : rows[i - 1].cutoffAge ?? rows[i - 1].age);
    return { index: r.index, topic: r.topic, startAge, cutoffAge, label: mucadeleDonemLabel(r.index, cutoffAge) };
  });
  const anaStart = num(o.anaMucadeleBaslangicYasi) ?? periods[periods.length - 1].cutoffAge;
  return {
    format: "kitap2",
    periods,
    ana: anaTopic === null ? null : { topic: anaTopic, startAge: anaStart, label: mucadeleAnaLabel(anaStart) },
  };
}

/**
 * Verilen tam yaşta hangi Kitap 2 mücadele döneminde olunduğu.
 * SİSTEM KONVANSİYONU (kaynak dahil/hariç belirtmez): yaş < geçiş sınırı → o dönem;
 * geçiş sınırı yaşına ulaşıldığında sonraki döneme geçilir; 3. sınırdan sonra "ana".
 */
export function mucadeleDonemiAt(d: MucadeleDonemleri | null, ageYears: number): number | "ana" | null {
  if (!d || d.format !== "kitap2" || !Number.isFinite(ageYears) || ageYears < 0) return null;
  for (const p of d.periods) if (ageYears < p.cutoffAge) return p.index;
  return d.ana ? "ana" : null;
}

/** Konu satırı: 0 için çakra numarası verilmez. */
export function mucadeleKonuText(topic: number): string {
  return topic === 0 ? "0 (yön bulma / kararsızlık teması)" : `${topic}. çakra`;
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
    "  • 1. mücadele 36 − M1 yaşına kadar sürer; sonraki iki dönem 27'şer yıldır.",
    "  • Yaşlar dönem geçiş sınırıdır; 3. sınırdan sonra Ana Mücadele geçerlidir.",
    "  • Konu 0 çıkarsa, kişi yönsüzlük ve kararsızlık temalı bir mücadele yaşar.",
    "",
  );

  lines.push("1. Mücadele");
  lines.push("  Konu için: |Gün (sade) - Ay (sade)|");
  lines.push(`    |${g} - ${a}| = ${p1.topic}`);
  lines.push(`  ${topicLine(p1.topic)}`);
  lines.push(`  Dönem: 36 - ${p1.topic} = ${p1.age} yaşına kadar`, "");

  lines.push("2. Mücadele");
  lines.push("  Konu için: |Gün (sade) - Yıl (sade)|");
  lines.push(`    |${g} - ${y}| = ${p2.topic}`);
  lines.push(`  ${topicLine(p2.topic)}`);
  lines.push(`  Dönem: sonraki 27 yıl; geçiş sınırı ${p1.age} + 27 = ${p2.age}`, "");

  lines.push("3. Mücadele");
  lines.push("  Konu için: |Ay (sade) - Yıl (sade)|");
  lines.push(`    |${a} - ${y}| = ${p3.topic}`);
  lines.push(`  ${topicLine(p3.topic)}`);
  lines.push(`  Dönem: sonraki 27 yıl; geçiş sınırı ${p2.age} + 27 = ${p3.age}`, "");

  lines.push("ANA MÜCADELE");
  lines.push("  Konu için: |1. mücadele konusu - 2. mücadele konusu|");
  lines.push(`    |${p1.topic} - ${p2.topic}| = ${anaMucadele}`);
  lines.push(`  ${topicLine(anaMucadele)}`);
  lines.push(`  Dönem: ${anaMucadeleBaslangicYasi} sonrası.`, "");

  return lines.join("\n");
}
