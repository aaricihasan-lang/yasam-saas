// Astroloji — GEZEGEN DÖNÜŞÜ (POST /astrology/planetary-returns) Roxy adaptörü (SAF). Solar/Lunar return deseninin aynısı:
//   • Gövde: doğum tarihi + saati (DOĞUM ofsetiyle; hedefin saat dilimi doğum anını kaydırırdı → her zaman doğum ofseti), gezegen,
//     approximateDate (seçilen kavuşumun UTC günü), gözlem konumu (doğum yeri veya seçilen dönüş konumu), ev sistemi.
//   • Projeksiyon: beyaz liste; beklenmedik yapı → hata (fail-closed, sonuç kaydedilmez). Ek denetimler:
//       - yankılar (birthDate, planet, konum, ev sistemi),
//       - sağlayıcının dönüş anı SEÇİLEN kavuşuma ait (tolerans: komşu kavuşuma uzaklığın yarısı, en çok 36 saat),
//       - TUTARLILIK: dönüş anındaki gezegen boylamı ↔ sağlayıcının natal gezegen boylamı |fark| ≤ 0,05°,
//       - Yaşam'ın bağımsız natal boylamı ↔ sağlayıcının natal boylamı |fark| ≤ 0,05° (yanlış doğum anı / saat dilimi yakalanır).
//   • YORUM: interpretation.summary + keyThemes AYRI katmanda (yorum yetki kapısının arkasında); teknik katmana sağlayıcı metni GİRMEZ.
//   • YOK SAYILAN: approximateCycle (sağlayıcının "~88 days" gibi güneş merkezli yörünge süresi metni; geosantrik dönüş aralığı
//     değildir — ekranda Yaşam'ın açık notu gösterilir), *Localized alanlar.

import { HOUSE_SYSTEMS, type HouseSystem } from "../../model/western";
import {
  PLANETARY_RETURN_INTERP_SCHEMA,
  PLANETARY_RETURN_TECHNICAL_SCHEMA,
  type PlanetaryReturnInterpretation,
  type PlanetaryReturnTechnical,
} from "../../model/westernPlanetaryReturn";
import { PLANETARY_RETURN_PROVIDER_NAME, type PlanetaryReturnPlanet } from "../../model/westernPlanetaryReturn";
import { birthBody, type BirthPoint, type GeoPoint } from "./requests";
import { angularDistance, chartKnownPaths, eclipticPoint, findUnmapped, isoDate, mapEnum, num, obj, paths, text, texts } from "./shared";
import { projectReturnChart, type AdapterResult } from "./timing";
import { wholeSignSectPof } from "./sect";

export const ROXY_PLANETARY_RETURN = { endpoint: "/astrology/planetary-returns", adapter: "astro-roxy-planetary-return-1", projection: "planetary-return-proj-1" } as const;

/** Fail-closed tutarlılık eşiği (derece). */
export const PLANETARY_RETURN_LON_TOLERANCE = 0.05;

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function planetaryReturnBody(b: BirthPoint, planet: PlanetaryReturnPlanet, approximateDate: string, houseSystem: HouseSystem, at?: GeoPoint | null) {
  const bb = birthBody(b);
  const lat = at ? r6(at.latitude) : bb.latitude;
  const lon = at ? r6(at.longitude) : bb.longitude;
  return { birthDate: bb.date, birthTime: bb.time, planet: PLANETARY_RETURN_PROVIDER_NAME[planet], approximateDate, latitude: lat, longitude: lon, timezone: bb.timezone, houseSystem };
}

export const PLANETARY_RETURN_KNOWN = new Set<string>([
  "birthDate",
  "planet",
  "returnDate",
  "approximateCycle",
  ...paths("location", ["latitude", "longitude", "timezone"]),
  "chart",
  ...chartKnownPaths("chart", { planetsKey: "planets" }),
  ...paths("chart.ascendant", ["longitude", "sign", "signLocalized", "degree"]),
  ...paths("chart.midheaven", ["longitude", "sign", "signLocalized", "degree"]),
  ...paths("natalPlanetPosition", ["longitude", "sign", "signLocalized", "degree"]),
  "interpretation",
  ...paths("interpretation", ["summary", "keyThemes", "purpose"]),
]);
const OPAQUE = new Set(["interpretation.keyThemes"]);

export type PlanetaryReturnExpect = {
  planet: PlanetaryReturnPlanet;
  houseSystem: HouseSystem;
  birthDate: string;
  approximateDate: string;
  /** Seçilen kavuşum (Yaşam tarih seçimi). */
  crossing: number;
  of: number;
  motion: "direct" | "retrograde";
  expectedUtc: string;
  toleranceMinutes: number;
  /** Gövdedeki gözlem konumu (yankı bununla uyuşmalı). */
  location: { latitude: number; longitude: number };
  /** Yaşam'ın bağımsız natal boylamı (yalnız denetim). */
  natalLongitude: number;
};

export function projectRoxyPlanetaryReturn(raw: unknown, ex: PlanetaryReturnExpect): AdapterResult<PlanetaryReturnTechnical, PlanetaryReturnInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (isoDate(r.birthDate) !== ex.birthDate) errors.push("birthDate yankısı uyuşmuyor");
  if (r.planet !== PLANETARY_RETURN_PROVIDER_NAME[ex.planet]) errors.push("planet yankısı uyuşmuyor");
  const returnLocal = typeof r.returnDate === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(r.returnDate) ? r.returnDate : null;
  if (!returnLocal) errors.push("returnDate");
  const loc = obj(r.location);
  const lat = num(loc?.latitude, -90, 90);
  const lon = num(loc?.longitude, -180, 180);
  const off = num(loc?.timezone, -18, 18);
  if (lat === null || lon === null || off === null) errors.push("location");
  else if (Math.abs(lat - ex.location.latitude) > 1e-3 || Math.abs(lon - ex.location.longitude) > 1e-3) errors.push("location: istenen dönüş konumuyla uyuşmuyor");
  let returnUtc: string | null = null;
  if (returnLocal && off !== null) {
    const ms = Date.parse(`${returnLocal.length === 16 ? `${returnLocal}:00` : returnLocal}Z`) - off * 3600_000;
    if (Number.isFinite(ms)) returnUtc = new Date(ms).toISOString().slice(0, 19) + "Z";
    const expected = Date.parse(`${ex.expectedUtc}:00Z`);
    if (!Number.isFinite(ms) || !Number.isFinite(expected) || Math.abs(ms - expected) > ex.toleranceMinutes * 60_000) errors.push("returnDate seçilen kavuşumla uyuşmuyor");
  }
  const natalPoint = eclipticPoint(obj(r.natalPlanetPosition));
  if (!natalPoint) errors.push("natalPlanetPosition");
  const c = obj(r.chart);
  const hs = mapEnum<HouseSystem>(c?.houseSystem, HOUSE_SYSTEMS);
  if (hs !== ex.houseSystem) errors.push("chart.houseSystem uyuşmuyor");
  const chart = projectReturnChart(c, ex.houseSystem, errors, dropped, "chart");
  const body = chart.bodies.find((x) => x.id === ex.planet) ?? null;
  if (!body) errors.push("chart.planets: dönüş gezegeni yok");
  const returnDelta = body && natalPoint ? angularDistance(body.longitude, natalPoint.longitude) : null;
  if (returnDelta !== null && returnDelta > PLANETARY_RETURN_LON_TOLERANCE) errors.push("tutarlılık: dönüş anındaki gezegen boylamı natal boylama eşit değil");
  const natalDelta = natalPoint ? angularDistance(natalPoint.longitude, ex.natalLongitude) : null;
  if (natalDelta !== null && natalDelta > PLANETARY_RETURN_LON_TOLERANCE) errors.push("tutarlılık: natal gezegen boylamı doğum anıyla uyuşmuyor");
  // Kavuşum yönü: sağlayıcının dönüş anı hızı seçilen kavuşumun yönüyle aynı olmalı (retro döngüsünde başka kavuşum = başka yön).
  if (body && ex.of > 1 && (body.speed < 0) !== (ex.motion === "retrograde")) errors.push("returnDate: kavuşum yönü seçilen kavuşumla uyuşmuyor");
  // ATL-P2-05 (Solar/Lunar Return ile aynı): whole-sign'da sect/Şans Noktası geometrik Güneş irtifasından.
  const sunB = chart.bodies.find((x) => x.id === "sun");
  const moonB = chart.bodies.find((x) => x.id === "moon");
  const asc = chart.angles?.ascendant;
  const mc = chart.angles?.midheaven;
  if (ex.houseSystem === "whole-sign" && chart.points.partOfFortune && asc && mc && sunB && moonB && lat !== null) {
    chart.points.partOfFortune = wholeSignSectPof({ ascLon: asc.longitude, mcLon: mc.longitude, sunLon: sunB.longitude, moonLon: moonB.longitude, latitude: lat });
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  const i = obj(r.interpretation);
  const summary = text(i?.summary);
  const keyThemes = texts(i?.keyThemes);
  return {
    ok: true,
    technical: {
      schema: PLANETARY_RETURN_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      planet: ex.planet,
      requested: { approximateDate: ex.approximateDate, crossing: ex.crossing, of: ex.of, motion: ex.motion, expectedUtc: ex.expectedUtc },
      returnLocal: returnLocal!,
      returnOffsetHours: off!,
      returnUtc: returnUtc!,
      natalPoint: natalPoint!,
      returnPoint: { longitude: body!.longitude, sign: body!.sign, degreeInSign: body!.degreeInSign, speed: body!.speed, retrograde: body!.retrograde },
      longitudeDelta: Math.round(returnDelta! * 1e6) / 1e6,
      location: { latitude: lat!, longitude: lon! },
      chart,
    },
    interpretation: summary || keyThemes.length ? { schema: PLANETARY_RETURN_INTERP_SCHEMA, summary, keyThemes } : null,
    unmappedFields: findUnmapped(raw, PLANETARY_RETURN_KNOWN, OPAQUE),
    droppedValues: [...new Set(dropped)],
  };
}
