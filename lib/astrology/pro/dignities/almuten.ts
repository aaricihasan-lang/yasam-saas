// Gökyüzü Atlası — PROFESYONEL klasik asalet: ALMUTEN (derece / ev cusp'ı / harita) (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Tanım (CA s. 48): "Almuten of any house is that Planet who hath most dignities in the Signe ascending or descending upon the
// Cusp of any house". Derece almuten'i: o derecede burç yöneticisi +5, yücelme +4, üçlü +3, terim +2, yüz +1 (CA s. 115
// ağırlıkları) toplamı en yüksek gezegen. EŞİTLİK: tek kazanan UYDURULMAZ — `winners` birden fazlaysa `tie: true` döner;
// eşitlik bozma kuralı (Lilly s. 531: hyleg'e bakan tercih edilir; gündüz doğulu gezegen vb.) bu katmanda UYGULANMAZ (açık karar).
// Yalnız yedi klasik gezegen aday olabilir.

import { CLASSICAL_PLANETS, DOMICILE, EXALTATION, TRIPLICITY, elementOf, faceRuler, signOf, termRuler, type ClassicalPlanet } from "../../horary/western/tables";
import { ALMUTEN_POLICIES, DIGNITY_SCHOOLS, FIGURE_PRESETS, type AlmutenPolicyId, type DignitySchoolId, type FigurePointId, type FigurePresetId } from "./schools";

export type AlmutenPart = { key: "domicile" | "exaltation" | "triplicity_day" | "triplicity_night" | "triplicity_participating" | "term" | "face"; points: number };
export type AlmutenScore = { planet: ClassicalPlanet; total: number; parts: AlmutenPart[] };
export type DegreeAlmuten = {
  lon: number;
  sign: string;
  isDay: boolean;
  school: DignitySchoolId;
  policy: AlmutenPolicyId;
  policyVerified: boolean;
  /** Puanı > 0 olan gezegenler, puana göre azalan (eşitlerde CLASSICAL_PLANETS sırası — yalnız görüntü sırası, kazanan DEĞİL). */
  scores: AlmutenScore[];
  max: number;
  winners: ClassicalPlanet[];
  tie: boolean;
};

const n360 = (x: number) => ((x % 360) + 360) % 360;

export function almutenOfDegree(lon: number, isDay: boolean, schoolId: DignitySchoolId, policyId: AlmutenPolicyId = "lilly_ca115_sect"): DegreeAlmuten {
  const school = DIGNITY_SCHOOLS[schoolId];
  const policy = ALMUTEN_POLICIES[policyId];
  const p = school.profile;
  const s = signOf(lon);
  const parts = new Map<ClassicalPlanet, AlmutenPart[]>(CLASSICAL_PLANETS.map((x) => [x, []]));
  const add = (pl: ClassicalPlanet | null, part: AlmutenPart) => {
    if (pl) parts.get(pl)!.push(part);
  };
  add(DOMICILE[s], { key: "domicile", points: policy.points.domicile });
  add((CLASSICAL_PLANETS as readonly ClassicalPlanet[]).find((x) => EXALTATION[x].sign === s) ?? null, { key: "exaltation", points: policy.points.exaltation });
  const [day, night, part] = TRIPLICITY[p.triplicity][elementOf(s)];
  if (policy.triplicity === "all_three") {
    add(day, { key: "triplicity_day", points: policy.points.triplicity });
    add(night, { key: "triplicity_night", points: policy.points.triplicity });
    add(part, { key: "triplicity_participating", points: policy.points.triplicity });
  } else {
    add(isDay ? day : night, { key: isDay ? "triplicity_day" : "triplicity_night", points: policy.points.triplicity });
    if (policy.triplicity === "sect_plus_participating") add(part, { key: "triplicity_participating", points: policy.points.triplicity });
  }
  add(termRuler(lon, p.terms), { key: "term", points: policy.points.term });
  add(faceRuler(lon), { key: "face", points: policy.points.face });
  // Aynı gezegen hem gündüz hem gece yöneticisiyse (Lilly su üçlüsü: Mars/Mars) "all_three" iki kez sayar — bilinçli: politika
  // "her yönetici rolü +3" der. sect politikalarında tek rol sayılır.
  const scores: AlmutenScore[] = CLASSICAL_PLANETS.map((pl) => ({ planet: pl, parts: parts.get(pl)!, total: parts.get(pl)!.reduce((t, x) => t + x.points, 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
  const max = scores.length ? scores[0].total : 0;
  const winners = scores.filter((x) => x.total === max).map((x) => x.planet);
  return { lon: n360(lon), sign: s, isDay, school: schoolId, policy: policyId, policyVerified: policy.verified, scores, max, winners, tie: winners.length > 1 };
}

/** Ev cusp almuten'leri (CA s. 48). `cusps[0]` = 1. ev. Ev sistemi çağıranın seçimidir (sonuç sisteme bağlıdır). */
export function houseCuspAlmutens(cusps: readonly number[], isDay: boolean, schoolId: DignitySchoolId, policyId: AlmutenPolicyId = "lilly_ca115_sect") {
  if (cusps.length !== 12 || !cusps.every(Number.isFinite)) throw new Error("12 sonlu cusp gerekli");
  return cusps.map((c, i) => ({ house: i + 1, ...almutenOfDegree(c, isDay, schoolId, policyId) }));
}

export type FigureAlmuten = {
  preset: FigurePresetId;
  /** Ön ayar birincil kaynakta teyitli değilse false → ürün varsayılanı olamaz. */
  standard: boolean;
  points: { id: FigurePointId; lon: number; almuten: DegreeAlmuten }[];
  /** Eksik nokta (ör. doğum öncesi kavuşum verilmedi) → toplam HESAPLANMAZ. */
  missing: FigurePointId[];
  totals: { planet: ClassicalPlanet; total: number; byPoint: Partial<Record<FigurePointId, number>> }[] | null;
  max: number | null;
  winners: ClassicalPlanet[] | null;
  tie: boolean | null;
  note: string;
};

/** Harita almuten'i: seçilen noktaların derece almuten puanlarının toplamı. Arızi ek puan EKLENMEZ (bkz. schools.ts). */
export function figureAlmuten(places: Partial<Record<FigurePointId, number | null>>, isDay: boolean, schoolId: DignitySchoolId, presetId: FigurePresetId, policyId: AlmutenPolicyId = "lilly_ca115_sect"): FigureAlmuten {
  const preset = FIGURE_PRESETS[presetId];
  const missing = preset.points.filter((id) => typeof places[id] !== "number" || !Number.isFinite(places[id] as number));
  const pts = preset.points.filter((id) => !missing.includes(id)).map((id) => ({ id, lon: n360(places[id] as number), almuten: almutenOfDegree(places[id] as number, isDay, schoolId, policyId) }));
  const standard = preset.verified && ALMUTEN_POLICIES[policyId].verified;
  if (missing.length) return { preset: presetId, standard, points: pts, missing, totals: null, max: null, winners: null, tie: null, note: `eksik nokta: ${missing.join(", ")} → toplam hesaplanmadı` };
  const totals = CLASSICAL_PLANETS.map((pl) => {
    const byPoint: Partial<Record<FigurePointId, number>> = {};
    let total = 0;
    for (const x of pts) {
      const v = x.almuten.scores.find((s) => s.planet === pl)?.total ?? 0;
      if (v) byPoint[x.id] = v;
      total += v;
    }
    return { planet: pl, total, byPoint };
  }).sort((a, b) => b.total - a.total);
  const max = totals[0].total;
  const winners = totals.filter((t) => t.total === max).map((t) => t.planet);
  return { preset: presetId, standard, points: pts, missing: [], totals, max, winners, tie: winners.length > 1, note: preset.note };
}
