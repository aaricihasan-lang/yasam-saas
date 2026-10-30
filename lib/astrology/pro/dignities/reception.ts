// Gökyüzü Atlası — PROFESYONEL klasik asalet: KABUL (reception) sınıflandırması (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Temel ilişki mevcut `receptionsOf` (calc.ts): "A'nın bulunduğu yerde B'nin sahip olduğu asaletler" = B, A'yı kabul eder.
// Bu dosya çift bazında sınıflandırır:
//   • none        — iki yönde de asalet yok.
//   • one_sided   — yalnız bir yön (B, A'yı kabul eder; A, B'yi etmez).
//   • mutual      — iki yönde de, AYNI asalet türünden en az biri (ör. ev ↔ ev).
//   • mixed       — iki yönde de var ama ortak tür yok (ör. A B'nin evinde, B A'nın yücelmesinde).
// Lilly puanı (CA s. 115) yalnız ev↔ev (+5) ve yücelme↔yücelme (+4) karşılıklı kabulüne verilir ve gezegen o asalete zaten
// sahipse verilmez (chart.ts ile aynı kural). Karışık kabulün puanı kaynakta bu çalışmada bulunamadı → null.
// Açı ilişkisi ayrıca raporlanır (Lilly'de kabul çoğunlukla açıyla birlikte değerlendirilir); kabul, açı OLMADAN da listelenir.

import { receptionsOf, type EssentialDignity } from "../../horary/western/calc";
import { CLASSICAL_PLANETS, LILLY_ORB, LILLY_POINTS, moietyLimit, type ClassicalPlanet } from "../../horary/western/tables";
import { DIGNITY_SCHOOLS, type DignitySchoolId } from "./schools";

export type ReceptionDignity = keyof EssentialDignity["rulers"];
export type ReceptionType = "none" | "one_sided" | "mutual" | "mixed";
export type PairReception = {
  a: ClassicalPlanet;
  b: ClassicalPlanet;
  /** B'nin A'yı kabul ettiği asaletler (A, B'nin bu asaletlerinde). */
  bReceivesA: ReceptionDignity[];
  /** A'nın B'yi kabul ettiği asaletler. */
  aReceivesB: ReceptionDignity[];
  type: ReceptionType;
  /** one_sided ise kabul eden taraf. */
  receiver: ClassicalPlanet | null;
  sharedKinds: ReceptionDignity[];
  /** CA s. 115 karşılıklı kabul puanı (ev +5 / yücelme +4); yoksa null. Puan, A ve B için ayrı ayrı uygulanır. */
  lillyMutual: { by: "domicile" | "exaltation"; points: number } | null;
  aspect: { signAngle: 0 | 60 | 90 | 120 | 180 | null; aversion: boolean; orbDeg: number | null; withinMoieties: boolean | null };
};

const n360 = (x: number) => ((x % 360) + 360) % 360;
const SIGN_ANGLE: Record<number, 0 | 60 | 90 | 120 | 180> = { 0: 0, 2: 60, 10: 60, 3: 90, 9: 90, 4: 120, 8: 120, 6: 180 };

export function pairReception(a: { id: ClassicalPlanet; lon: number }, b: { id: ClassicalPlanet; lon: number }, isDay: boolean, schoolId: DignitySchoolId): PairReception {
  if (a.id === b.id) throw new Error("aynı gezegen");
  const p = DIGNITY_SCHOOLS[schoolId].profile;
  const bReceivesA = receptionsOf(a.lon, b.id, isDay, p);
  const aReceivesB = receptionsOf(b.lon, a.id, isDay, p);
  const sharedKinds = bReceivesA.filter((k) => aReceivesB.includes(k));
  const type: ReceptionType = !bReceivesA.length && !aReceivesB.length ? "none" : bReceivesA.length && aReceivesB.length ? (sharedKinds.length ? "mutual" : "mixed") : "one_sided";
  const receiver = type === "one_sided" ? (bReceivesA.length ? b.id : a.id) : null;
  // CA s. 115: gezegen o asalete zaten sahip değilse (ev↔ev iki gezegen kendi evinde olamaz; yücelmede de aynı) — burada iki
  // taraf da karşının asaletindedir, dolayısıyla kendi aynı asaletinde olamaz; koşul pratikte hep sağlanır.
  const scored = p.methodology.scoring === "lilly_ca115";
  const lillyMutual = scored && sharedKinds.includes("domicile") ? { by: "domicile" as const, points: LILLY_POINTS.domicile } : scored && sharedKinds.includes("exaltation") ? { by: "exaltation" as const, points: LILLY_POINTS.exaltation } : null;
  const sd = ((Math.floor(n360(b.lon) / 30) - Math.floor(n360(a.lon) / 30)) % 12 + 12) % 12;
  const signAngle = SIGN_ANGLE[sd] ?? null;
  let orbDeg: number | null = null;
  let within: boolean | null = null;
  if (signAngle !== null) {
    const sep = Math.abs(((n360(b.lon - a.lon) + 180) % 360) - 180);
    orbDeg = Math.abs(sep - signAngle);
    within = orbDeg <= moietyLimit(a.id, b.id, LILLY_ORB);
  }
  return { a: a.id, b: b.id, bReceivesA, aReceivesB, type, receiver, sharedKinds, lillyMutual, aspect: { signAngle, aversion: signAngle === null, orbDeg, withinMoieties: within } };
}

/** 21 çiftin tamamı (yalnız `none` olmayanlar `listed`; tam liste `all`). */
export function receptionMatrix(positions: Readonly<Record<ClassicalPlanet, number>>, isDay: boolean, schoolId: DignitySchoolId) {
  const all: PairReception[] = [];
  for (let i = 0; i < CLASSICAL_PLANETS.length; i++)
    for (let j = i + 1; j < CLASSICAL_PLANETS.length; j++) {
      const a = CLASSICAL_PLANETS[i];
      const b = CLASSICAL_PLANETS[j];
      all.push(pairReception({ id: a, lon: positions[a] }, { id: b, lon: positions[b] }, isDay, schoolId));
    }
  return { all, listed: all.filter((x) => x.type !== "none") };
}
