// Gökyüzü Atlası — Klasik Batı Horary: Lilly ARIZİ asalet kalemleri (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Kaynak: CA s. 115 tablosu + tanımlar s. 113–114 (doğulu/batılı, kuşatılma, yanma), s. 106 (partile). Her kalem ayrı satır
// olarak döner; toplam yalnız bilgi amaçlıdır (Lilly tabloyu "examine" için verir, hüküm kuralı değildir). Kaynakta eşiği
// OLMAYAN kalemler (sabit yıldız orbu, partile tanımının dakika hassasiyeti) eğitmen parametresidir.

import { solarPhase, type HoraryProfile } from "./calc";
import { LILLY_ACCIDENTAL as L, MEAN_MOTION, degInSign, signOf, type ClassicalPlanet } from "./tables";

const n360 = (x: number) => ((x % 360) + 360) % 360;

export type AccidentalItem = { key: string; points: number; note?: string };
export type AccidentalInput = {
  planet: ClassicalPlanet;
  lon: number;
  speed: number;
  house: number;
  positions: Readonly<Record<ClassicalPlanet, number>>;
  /** Kuzey ay düğümü boylamı (ortalama/gerçek seçimi eğitmen kararı); yoksa düğüm kalemleri atlanır. */
  northNode: number | null;
  /** Sabit yıldızlar: "lilly1647" = CA s. 115'teki dereceler; "none" = hesaplanmaz. Güncel (presesyonlu) konum için yıldız
   *  kataloğu bu katmanda yoktur → eğitmen kararıyla `western.fixed_stars` verisi bağlanabilir. */
  stars: { mode: "lilly1647" | "none"; orb: number | null };
};

/** CA s. 106: "Partill aspect is when two Planets are exactly so many degrees from each other as make a perfect aspect" — örnekler
 *  aynı TAM derece (9° ↔ 9°). Burç farkı açıya karşılık gelmeli. */
export function partile(aLon: number, bLon: number, angle: number): boolean {
  if (Math.floor(degInSign(aLon)) !== Math.floor(degInSign(bLon))) return false;
  const d = (((Math.floor(n360(aLon) / 30) - Math.floor(n360(bLon) / 30)) % 12) + 12) % 12;
  return angle === 0 ? d === 0 : angle === 180 ? d === 6 : d === angle / 30 || d === 12 - angle / 30;
}

/** CA s. 114. Üst gezegenler (Satürn/Jüpiter/Mars) Güneş'le kavuşumdan karşıtlığa doğulu; Venüs/Merkür Güneş'ten az derecede
 *  (ya da önceki burçta) iken doğulu; Ay karşıtlıktan kavuşuma doğulu, kavuşumdan karşıtlığa batılı. Hepsi = Güneş'ten önce
 *  doğmak: n360(Güneş − gezegen) ∈ (0°, 180°). */
export function oriental(planet: ClassicalPlanet, lon: number, sunLon: number): boolean | null {
  if (planet === "sun") return null;
  const d = n360(sunLon - lon);
  return d > 0 && d < 180;
}

export function accidentalDignity(x: AccidentalInput, p: HoraryProfile): { items: AccidentalItem[]; total: number } {
  const items: AccidentalItem[] = [];
  const add = (key: string, points: number, note?: string) => items.push({ key, points, ...(note ? { note } : {}) });
  const housePts = L.house[x.house];
  if (housePts) add(`house_${x.house}`, housePts, x.house === 3 ? "OCR'de okunamadı (tablo sırası)" : undefined);
  if (x.planet !== "sun" && x.planet !== "moon") {
    if (x.speed < 0) add("retrograde", L.retrograde);
    else add("direct", L.direct, "OCR'de okunamadı (tablo sırası)");
  }
  const mean = MEAN_MOTION[x.planet];
  if (Math.abs(x.speed) > mean) add("swift", L.swift);
  else if (Math.abs(x.speed) < mean) add("slow", L.slow, x.planet === "mars" ? "Mars ortalama hızı OCR'de bulunamadı" : undefined);
  const sun = x.positions.sun;
  if (x.planet === "moon") {
    const waxing = n360(x.lon - sun) < 180;
    add(waxing ? "moon_increasing" : "moon_decreasing", waxing ? L.orientalOccidental : -L.orientalOccidental);
  } else if (x.planet !== "sun") {
    const ori = oriental(x.planet, x.lon, sun);
    const superior = x.planet === "saturn" || x.planet === "jupiter" || x.planet === "mars";
    const good = superior ? ori : !ori;
    add(ori ? "oriental" : "occidental", good ? L.orientalOccidental : -L.orientalOccidental);
  }
  if (x.planet !== "sun") {
    const ph = solarPhase(x.lon, sun, p);
    if (ph.phase === "cazimi") add("cazimi", L.cazimi, ph.crossSign ? "Güneş ile farklı burç — kaynak sessiz" : undefined);
    else if (ph.phase === "combust") add("combust", L.combust);
    else if (ph.phase === "under_beams") add("under_beams", L.underBeams);
    else add("free_from_combustion", L.freeFromCombustion);
  }
  for (const [o, angle, key, pts] of [
    ["jupiter", 0, "partile_conj_jupiter", L.partileConjBenefic], ["venus", 0, "partile_conj_venus", L.partileConjBenefic],
    ["jupiter", 120, "partile_trine_jupiter", L.partileTrineBenefic], ["venus", 120, "partile_trine_venus", L.partileTrineBenefic],
    ["jupiter", 60, "partile_sextile_jupiter", L.partileSextileBenefic], ["venus", 60, "partile_sextile_venus", L.partileSextileBenefic],
    ["saturn", 0, "partile_conj_saturn", L.partileConjMalefic], ["mars", 0, "partile_conj_mars", L.partileConjMalefic],
    ["saturn", 180, "partile_opposition_saturn", L.partileOppositionMalefic], ["mars", 180, "partile_opposition_mars", L.partileOppositionMalefic],
    ["saturn", 90, "partile_square_saturn", L.partileSquareMalefic], ["mars", 90, "partile_square_mars", L.partileSquareMalefic],
  ] as const) {
    if (o !== x.planet && partile(x.lon, x.positions[o], angle)) add(key, pts);
  }
  if (x.northNode !== null) {
    if (partile(x.lon, x.northNode, 0)) add("partile_conj_north_node", L.partileConjNorthNode);
    if (partile(x.lon, n360(x.northNode + 180), 0)) add("partile_conj_south_node", L.partileConjSouthNode);
  }
  // Kuşatılma (CA s. 114 örneği aynı burçta): gezegen Satürn ile Mars'ın BEDENLERİ arasında (kısa yay), üçü aynı burçta.
  if (x.planet !== "saturn" && x.planet !== "mars") {
    const s = x.positions.saturn;
    const m = x.positions.mars;
    const sameSign = signOf(s) === signOf(m) && signOf(m) === signOf(x.lon);
    const arc = n360(m - s) <= 180 ? [s, n360(m - s)] : [m, n360(s - m)];
    const inside = n360(x.lon - arc[0]) < arc[1];
    if (sameSign && inside) add("besieged_saturn_mars", L.besieged, "aynı burç şartı CA s. 114 örneğinden; genelleme eğitmen kararı");
  }
  if (x.stars.mode === "lilly1647" && x.stars.orb !== null) {
    const near = (deg: number) => Math.abs(((n360(x.lon - deg) + 180) % 360) - 180) <= x.stars.orb!;
    if (near(144)) add("regulus_1647", L.regulus, "Aslan 24° (1647 konumu)");
    if (near(198)) add("spica_1647", L.spica, "Terazi 18° (1647 konumu)");
    if (Math.abs(((n360(x.lon - 50) + 180) % 360) - 180) <= 5) add("algol_1647", L.algol, "Boğa 20° ± 5° (CA s. 115)");
  }
  return { items, total: items.reduce((t, i) => t + i.points, 0) };
}
