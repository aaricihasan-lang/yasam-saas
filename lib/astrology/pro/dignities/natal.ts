// Gökyüzü Atlası — PROFESYONEL klasik asalet: NATAL birleşik rapor (SAF; ÜRÜNE BAĞLI DEĞİL, VARSAYILAN KAPALI — hiçbir yerden
// çağrılmaz). Girdi sağlayıcıdan (Roxy natal-chart) ya da yerel hesaptan gelebilir; bu katman konum ÜRETMEZ.
// Eksik veri: hız verilmeyen gezegende arızi hız/yön kalemleri hesaplanmaz (uydurulmaz); cusp verilmezse ev ve ev almuten'i yok.

import { CLASSICAL_PLANETS, LILLY_POINTS, type ClassicalPlanet } from "../../horary/western/tables";
import { partOfFortune } from "../../horary/western/calc";
import { houseOf } from "../../horary/western/houses";
import { figureAlmuten, houseCuspAlmutens, type FigureAlmuten } from "./almuten";
import { natalAccidental } from "./accidentalNatal";
import { natalEssential, type NatalEssential } from "./essential";
import { receptionMatrix } from "./reception";
import { DIGNITY_SCHOOLS, FIGURE_PRESETS, SOURCES, type AlmutenPolicyId, type DignitySchoolId, type FigurePresetId, type ScorePolicyId } from "./schools";

export type NatalDignityInput = {
  positions: Readonly<Record<ClassicalPlanet, { lon: number; speed: number | null }>>;
  asc: number;
  mc: number;
  /** 12 cusp (indeks 0 = 1. ev) ve sistem adı; yoksa ev kalemleri hesaplanmaz. */
  houses: { system: string; cusps: number[] } | null;
  isDay: boolean;
  northNode: number | null;
  prenatalSyzygy: number | null;
  school: DignitySchoolId;
  scorePolicy?: ScorePolicyId;
  almutenPolicy?: AlmutenPolicyId;
  figurePresets?: FigurePresetId[];
  boundaryArcmin?: number;
};

export function buildNatalDignities(input: NatalDignityInput) {
  const school = DIGNITY_SCHOOLS[input.school];
  const p = school.profile;
  const warnings: string[] = [];
  for (const pl of CLASSICAL_PLANETS) if (!Number.isFinite(input.positions[pl]?.lon)) throw new Error(`konum eksik: ${pl}`);
  if (![input.asc, input.mc].every(Number.isFinite)) throw new Error("ASC/MC eksik");
  const lons = Object.fromEntries(CLASSICAL_PLANETS.map((x) => [x, input.positions[x].lon])) as Record<ClassicalPlanet, number>;
  const cusps = input.houses?.cusps ?? null;
  if (cusps && (cusps.length !== 12 || !cusps.every(Number.isFinite))) throw new Error("12 sonlu cusp gerekli");

  const planets = CLASSICAL_PLANETS.map((pl) => {
    const ess: NatalEssential = natalEssential(pl, lons[pl], input.isDay, input.school, input.scorePolicy ?? "school", input.boundaryArcmin ?? 1);
    const speed = input.positions[pl].speed;
    const house = cusps ? houseOf(lons[pl], cusps) : null;
    const acc = speed !== null && Number.isFinite(speed) && house !== null ? natalAccidental({ planet: pl, lon: lons[pl], speed, house, positions: lons, northNode: input.northNode }, input.school) : null;
    if (!acc) warnings.push(`${pl}: ${speed === null ? "hız yok" : "ev yok"} → arızi asalet hesaplanmadı`);
    // Lilly CA s. 532 "Lord of the Geniture": asal + arızi en güçlü gezegen. Lilly sayısal birleştirme vermez → toplam YORUMDUR.
    const fortitude = ess.score !== null && acc && acc.total !== null ? ess.score + acc.total : null;
    return { planet: pl, essential: ess, house, accidental: acc, fortitude };
  });

  const fortune = partOfFortune(input.asc, lons.sun, lons.moon, input.isDay, p.fortune);
  const places = { sun: lons.sun, moon: lons.moon, asc: input.asc, mc: input.mc, fortune, prenatal_syzygy: input.prenatalSyzygy };
  const presets = input.figurePresets ?? (Object.keys(FIGURE_PRESETS) as FigurePresetId[]);
  const figures: FigureAlmuten[] = presets.map((id) => figureAlmuten(places, input.isDay, input.school, id, input.almutenPolicy));

  const ranked = planets.filter((x) => x.fortitude !== null).sort((a, b) => (b.fortitude as number) - (a.fortitude as number));
  const top = ranked.length === CLASSICAL_PLANETS.length ? ranked[0].fortitude : null;
  const lordOfGenitureLilly = top === null ? null : {
    winners: ranked.filter((x) => x.fortitude === top).map((x) => x.planet),
    max: top,
    ranking: ranked.map((x) => ({ planet: x.planet, essential: x.essential.score, accidental: x.accidental?.total ?? null, total: x.fortitude })),
    standard: false,
    note: `${SOURCES.ca532.id}: Lilly 'en çok asal ve arızi asalet' der; CA s. 115 puanlarının basit toplamı bu çalışmanın YORUMUDUR. 'Elevated most' (en yüksekte) ve eşitlik kuralları uygulanmadı.`,
  };
  if (!lordOfGenitureLilly) warnings.push("Lilly 'Lord of the Geniture' sıralaması: puan yöntemi yok ya da arızi veri eksik → hesaplanmadı");

  const anyMixed = planets.some((x) => x.essential.mixedPolicy);
  if (anyMixed) warnings.push("EKOL KARIŞIMI: Lilly puanları Lilly dışı tablo setine uygulandı (eğitmen kararı)");

  return {
    schema: "astro.pro.dignities.natal.v1" as const,
    school: { id: school.id, label: school.label, sources: school.sources, unverified: [...p.unverified] },
    scorePolicy: input.scorePolicy ?? "school",
    almutenPolicy: input.almutenPolicy ?? "lilly_ca115_sect",
    sect: { day: input.isDay },
    planets,
    receptions: receptionMatrix(lons, input.isDay, input.school),
    cuspAlmutens: cusps ? { system: input.houses!.system, items: houseCuspAlmutens(cusps, input.isDay, input.school, input.almutenPolicy) } : null,
    partOfFortune: { lon: fortune, formula: p.fortune },
    figureAlmutens: figures,
    lordOfGenitureLilly,
    nearBoundary: planets.filter((x) => x.essential.boundary.near).map((x) => ({ planet: x.planet, boundary: x.essential.boundary })),
    points: LILLY_POINTS,
    warnings,
  };
}
