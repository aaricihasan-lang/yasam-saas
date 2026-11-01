// Gökyüzü Atlası — PROFESYONEL klasik asalet: ARIZİ asalet, sect ve doğum öncesi kavuşum (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Arızi kalemler mevcut `accidentalDignity` (accidental.ts, CA s. 115) ile hesaplanır ve DEĞİŞMEZ. Natal kullanımda farklar:
//   • Ev, ÇAĞIRANIN ev sistemindeki geometrik evdir (Lilly'nin "cusp'a 5° kala sonraki ev" etki kuralı — horary profilinde
//     `houseVirtue` — burada UYGULANMAZ; natalde kullanılıp kullanılmayacağı eğitmen kararı).
//   • Sabit yıldız kalemleri (Regulus/Spica/Algol 1647 dereceleri) natalde KAPALI: presesyonlu konum ve orb kaynakta yok.
//   • Her kaleme kategori ve "ev sistemine bağlı mı" işareti eklenir.

import * as Astronomy from "astronomy-engine";
import { accidentalDignity, type AccidentalItem } from "../../horary/western/accidental";
import { isDayChart, sunAltitude } from "../../horary/western/calc";
import { skyFrameAt } from "../../horary/western/houses";
import type { ClassicalPlanet } from "../../horary/western/tables";
import { DIGNITY_SCHOOLS, type DignitySchoolId } from "./schools";

export type AccidentalCategory = "house" | "motion" | "speed" | "orientation" | "solar" | "partile" | "node" | "besieged" | "star";
export type NatalAccidentalItem = AccidentalItem & { category: AccidentalCategory; houseSystemDependent: boolean };

const categoryOf = (key: string): AccidentalCategory =>
  key.startsWith("house_") ? "house"
  : key === "direct" || key === "retrograde" ? "motion"
  : key === "swift" || key === "slow" ? "speed"
  : key === "oriental" || key === "occidental" || key.startsWith("moon_") ? "orientation"
  : key === "cazimi" || key === "combust" || key === "under_beams" || key === "free_from_combustion" ? "solar"
  : key.includes("node") ? "node"
  : key.startsWith("partile_") ? "partile"
  : key.startsWith("besieged") ? "besieged"
  : "star";

export function natalAccidental(x: { planet: ClassicalPlanet; lon: number; speed: number; house: number; positions: Readonly<Record<ClassicalPlanet, number>>; northNode: number | null }, schoolId: DignitySchoolId) {
  if (!Number.isInteger(x.house) || x.house < 1 || x.house > 12) throw new Error("ev 1–12 olmalı");
  const r = accidentalDignity({ ...x, stars: { mode: "none", orb: null } }, DIGNITY_SCHOOLS[schoolId].profile);
  const items: NatalAccidentalItem[] = r.items.map((i) => ({ ...i, category: categoryOf(i.key), houseSystemDependent: i.key.startsWith("house_") }));
  return { ...r, items, houseBasis: "geometric" as const, starsMode: "none" as const };
}

/**
 * Sect: Güneş'in geometrik irtifası > 0 (calc.ts `sunAltitude`; kutup enleminde ekliptik kuralı yanlış verebildiği için).
 * `nearHorizon`: |irtifa| < 0°50′ (kırılma ~34′ + disk yarıçapı ~16′) → görünür doğuş/batış tanımı seçilirse sonuç değişebilir.
 */
export const SECT_NEAR_HORIZON_DEG = 50 / 60;
export function natalSect(input: { utcMs: number; latitude: number; longitude: number; sunLon: number; asc?: number }) {
  const f = skyFrameAt(input.utcMs, input.latitude, input.longitude);
  if ("error" in f) return f;
  const alt = sunAltitude(input.sunLon, f.ramc, f.latitude, f.obliquity);
  const eclipticRule = isDayChart(input.sunLon, input.asc ?? f.asc);
  return { day: alt > 0, sunAltitude: alt, method: "geometric_altitude" as const, eclipticRuleDay: eclipticRule, disagreesWithEclipticRule: eclipticRule !== alt > 0, nearHorizon: Math.abs(alt) < SECT_NEAR_HORIZON_DEG, ramc: f.ramc, obliquity: f.obliquity };
}

/**
 * Doğum öncesi kavuşum / dolunay (İbn Ezra harita almuten'i için). astronomy-engine `SearchMoonPhase` (geriye arama; MIT).
 * Dolunayda hangi derecenin alınacağı (Ay mı, o an ufuk üstündeki ışık mı — Ptolemaik "animodar" geleneği) KAYNAKTA BU ÇALIŞMADA
 * TEYİT EDİLMEDİ → parametre; varsayılan YOK (çağıran seçer).
 */
export function prenatalSyzygy(utcMs: number, fullMoonPoint: "moon" | "sun" | "luminary_above_horizon", place?: { latitude: number; longitude: number }) {
  const t = Astronomy.MakeTime(new Date(utcMs));
  const nm = Astronomy.SearchMoonPhase(0, t, -35);
  const fm = Astronomy.SearchMoonPhase(180, t, -35);
  if (!nm || !fm) return { error: "not_found" as const };
  const isNew = nm.ut > fm.ut;
  const at = isNew ? nm : fm;
  const ms = at.date.getTime();
  const lon = (b: Astronomy.Body) => Astronomy.Ecliptic(Astronomy.GeoVector(b, at, true)).elon;
  const sunLon = lon(Astronomy.Body.Sun);
  const moonLon = lon(Astronomy.Body.Moon);
  let point: number;
  let chosen: "moon" | "sun";
  if (isNew) {
    point = moonLon;
    chosen = "moon";
  } else if (fullMoonPoint === "luminary_above_horizon") {
    if (!place) return { error: "place_required" as const };
    const f = skyFrameAt(ms, place.latitude, place.longitude);
    if ("error" in f) return f;
    chosen = sunAltitude(sunLon, f.ramc, f.latitude, f.obliquity) > 0 ? "sun" : "moon";
    point = chosen === "sun" ? sunLon : moonLon;
  } else {
    chosen = fullMoonPoint;
    point = chosen === "sun" ? sunLon : moonLon;
  }
  return { kind: isNew ? ("new" as const) : ("full" as const), atUtc: new Date(Math.round(ms / 1000) * 1000).toISOString(), sunLon, moonLon, point, chosen, rule: fullMoonPoint, verified: false as const };
}
