// Astroloji — Aşama 3 Roxy ADAPTÖRLERİ (SAF): transit · forecast · progression · solar arc ·
// solar/lunar return · synastry · composite. Hepsi GOLDEN gerçek yanıtlarla (2026-10-07) doğrulandı.
//
// Her adaptör endpoint bazında BEYAZ LİSTE uygular:
//   TEKNİK  → kanonik kimlik + sayı (sağlayıcı serbest metni YOK)
//   YORUM   → ayrı projeksiyon (ayrı tablo, ayrı yetki)
//   YOK SAYILAN → *Localized, forecast `description` (yerelleştirilmiş olgusal cümle; etiketler Yaşam
//                 sözlüğünden üretilir), synastry `meaning.name/nature` (yerelleştirilmiş yorum tesisatı)
//   BİLİNMEYEN → hiçbir projeksiyona girmez (fail-closed); yalnız YOL `unmapped_fields`'a yazılır.

import { BODY_IDS, HOUSE_SYSTEMS, NODE_TYPES, type AspectType, type HouseSystem, type NodeType } from "../../model/western";
import {
  COMPOSITE_INTERP_SCHEMA,
  COMPOSITE_TECHNICAL_SCHEMA,
  FORECAST_TECHNICAL_SCHEMA,
  PROGRESSION_INTERP_SCHEMA,
  PROGRESSION_TECHNICAL_SCHEMA,
  RETURN_INTERP_SCHEMA,
  RETURN_TECHNICAL_SCHEMA,
  SOLAR_ARC_ASPECT_METHOD,
  SOLAR_ARC_INTERP_SCHEMA,
  SOLAR_ARC_TECHNICAL_SCHEMA,
  SYNASTRY_INTERP_SCHEMA,
  SYNASTRY_TECHNICAL_SCHEMA,
  TRANSIT_INTERP_SCHEMA,
  TRANSIT_TECHNICAL_SCHEMA,
  type CompositeInterpretation,
  type CompositeTechnical,
  type ForecastEvent,
  type ForecastTechnical,
  type PointId,
  type ProgressionInterpretation,
  type ProgressionTechnical,
  type ReturnChart,
  type ReturnInterpretation,
  type ReturnTechnical,
  type SolarArcAspect,
  type SolarArcInterpretation,
  type SolarArcTechnical,
  type SynastryAspect,
  type SynastryBody,
  type SynastryInterpretation,
  type SynastryPerson,
  type SynastryTechnical,
  type TransitAspect,
  type TransitBody,
  type TransitInterpretation,
  type TransitTechnical,
} from "../../model/westernTiming";
import {
  angularDistance,
  arr,
  ASPECT_EXACT,
  chartKnownPaths,
  eclipticPoint,
  findUnmapped,
  int,
  isoDate,
  keywords,
  mapAspect,
  mapBody,
  mapEnum,
  mapNature,
  mapPoint,
  mapSign,
  num,
  obj,
  paths,
  projectChartAspects,
  projectHouses,
  text,
  texts,
} from "./shared";

export type AdapterResult<T, I> =
  | { ok: true; technical: T; interpretation: I | null; unmappedFields: string[]; droppedValues: string[] }
  | { ok: false; errors: string[] };

const done = <T, I>(errors: string[], dropped: string[], technical: () => T, interpretation: () => I | null, raw: unknown, known: Set<string>, opaque: Set<string>): AdapterResult<T, I> => {
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, technical: technical(), interpretation: interpretation(), unmappedFields: findUnmapped(raw, known, opaque), droppedValues: [...new Set(dropped)] };
};

// ═══ TRANSIT (/astrology/transits) ═══════════════════════════════════════════
export const ROXY_TRANSIT = { endpoint: "/astrology/transits", adapter: "astro-roxy-transit-1", projection: "transit-proj-1" } as const;

const TRANSIT_KNOWN = new Set<string>([
  "transitDate",
  "transitTime",
  "timezone",
  "transitPlanets",
  ...paths("transitPlanets[]", ["name", "nameLocalized", "longitude", "latitude", "sign", "signLocalized", "degree", "speed", "isRetrograde"]),
  "transitAspects",
  ...paths("transitAspects[]", ["transitPlanet", "transitPlanetLocalized", "natalPlanet", "natalPlanetLocalized", "type", "typeLocalized", "angle", "orb", "isApplying", "strength", "nature", "interpretation"]),
  ...paths("transitAspects[].interpretation", ["summary", "timing", "impact", "guidance", "keywords"]),
  ...paths("summary", ["totalAspects", "harmonious", "challenging", "neutral"]),
]);
const TRANSIT_OPAQUE = new Set(["transitAspects[].interpretation.keywords"]);

export function projectRoxyTransit(raw: unknown, opts: { nodeType: NodeType; atUtc: string }): AdapterResult<TransitTechnical, TransitInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const bodies: TransitBody[] = [];
  for (const p of arr(r.transitPlanets) ?? []) {
    const o = obj(p);
    const id = mapBody(o?.name);
    const pt = eclipticPoint(o);
    if (!o || !id || !pt) {
      dropped.push("transitPlanets[].name");
      continue;
    }
    const latitude = num(o.latitude, -90, 90);
    const speed = num(o.speed, -50, 50);
    if (latitude === null || speed === null || typeof o.isRetrograde !== "boolean") {
      errors.push(`transitPlanets[${id}]: sayısal alan`);
      continue;
    }
    if (!bodies.some((b) => b.id === id)) bodies.push({ id, ...pt, latitude, speed, retrograde: o.isRetrograde });
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push("transitPlanets: 10 klasik gezegen yok");
  const aspects: TransitAspect[] = [];
  const iAspects: TransitInterpretation["aspects"] = [];
  for (const a of arr(r.transitAspects) ?? []) {
    const o = obj(a);
    const transit = mapBody(o?.transitPlanet);
    const natal = mapPoint(o?.natalPlanet);
    const type = mapAspect(o?.type);
    if (!o || !transit || !natal || !type) {
      dropped.push("transitAspects[](planet/type)");
      continue;
    }
    const exactAngle = num(o.angle, 0, 360);
    const orb = num(o.orb, 0, 30);
    const strength = num(o.strength, 0, 100);
    if (exactAngle === null || orb === null || strength === null || typeof o.isApplying !== "boolean") {
      errors.push("transitAspects[]: sayısal alan");
      continue;
    }
    aspects.push({ transit, natal, type, exactAngle, orb, applying: o.isApplying, strength, nature: mapNature(o.nature) });
    const i = obj(o.interpretation);
    if (i) iAspects.push({ transit, natal, type, summary: text(i.summary), timing: text(i.timing), impact: text(i.impact), guidance: text(i.guidance), keywords: keywords(i.keywords) });
  }
  const s = obj(r.summary);
  return done(
    errors,
    dropped,
    () => ({
      schema: TRANSIT_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      nodeType: opts.nodeType,
      atUtc: opts.atUtc,
      bodies,
      aspects,
      summary: { harmonious: int(s?.harmonious, 0, 1000), challenging: int(s?.challenging, 0, 1000), neutral: int(s?.neutral, 0, 1000) },
    }),
    () => ({ schema: TRANSIT_INTERP_SCHEMA, aspects: iAspects }),
    raw,
    TRANSIT_KNOWN,
    TRANSIT_OPAQUE,
  );
}

// ═══ FORECAST (/forecast/transits) ═══════════════════════════════════════════
export const ROXY_FORECAST = { endpoint: "/forecast/transits", adapter: "astro-roxy-forecast-1", projection: "forecast-proj-1" } as const;

const FORECAST_KNOWN = new Set<string>([
  ...paths("birthData", ["date", "time", "timezone", "latitude", "longitude"]),
  "startDate",
  "endDate",
  "count",
  "events",
  ...paths("events[]", ["date", "datetime", "domain", "type", "body", "target", "aspect", "orb", "station", "kind", "obscuration", "phase", "description", "significance"]),
]);
const EVENT_TYPE: Record<string, ForecastEvent["type"]> = {
  "transit-aspect": "transit_aspect",
  "sign-ingress": "sign_ingress",
  "retrograde-station": "retrograde_station",
  eclipse: "eclipse",
  "lunar-phase": "lunar_phase",
};

export function projectRoxyForecast(raw: unknown): AdapterResult<ForecastTechnical, never> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const start = isoDate(r.startDate);
  const end = isoDate(r.endDate);
  if (!start || !end) errors.push("startDate/endDate");
  const events: ForecastEvent[] = [];
  for (const e of arr(r.events) ?? []) {
    const o = obj(e);
    if (!o) continue;
    if (o.domain !== undefined && o.domain !== "western") {
      dropped.push(`events[].domain(${String(o.domain).replace(/[^a-z]/g, "")})`);
      continue;
    }
    const type = typeof o.type === "string" ? EVENT_TYPE[o.type] : undefined;
    const date = isoDate(o.date);
    const datetime = typeof o.datetime === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(o.datetime) ? o.datetime : null;
    if (!type || !date || !datetime) {
      dropped.push("events[](type/date)");
      continue;
    }
    const body = o.body === undefined ? null : mapBody(o.body);
    if (o.body !== undefined && body === null) {
      dropped.push("events[].body");
      continue;
    }
    const ev: ForecastEvent = {
      type,
      date,
      datetime,
      body,
      targetBody: null,
      targetSign: null,
      aspect: null,
      orb: num(o.orb, 0, 30),
      station: mapEnum<"retrograde" | "direct">(o.station, ["retrograde", "direct"] as const),
      eclipseKind: mapEnum<"penumbral" | "partial" | "annular" | "total">(o.kind, ["penumbral", "partial", "annular", "total"] as const),
      obscuration: num(o.obscuration, 0, 1),
      phase: o.phase === "new-moon" ? "new_moon" : o.phase === "full-moon" ? "full_moon" : null,
      significance: num(o.significance, 0, 100),
    };
    if (type === "transit_aspect") {
      ev.targetBody = mapPoint(o.target);
      ev.aspect = mapAspect(o.aspect);
      if (!ev.targetBody || !ev.aspect) {
        dropped.push("events[](transit_aspect target/aspect)");
        continue;
      }
    } else if (type === "sign_ingress" || type === "lunar_phase") {
      ev.targetSign = mapSign(o.target);
    }
    events.push(ev);
  }
  events.sort((a, b) => (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0));
  return done(errors, dropped, () => ({ schema: FORECAST_TECHNICAL_SCHEMA, window: { start: start!, end: end! }, events }), () => null, raw, FORECAST_KNOWN, new Set());
}

/** Parçalı forecast birleştirme (sıralı, tekrarsız). */
export function mergeForecast(parts: ForecastTechnical[], window: { start: string; end: string }): ForecastTechnical {
  const seen = new Set<string>();
  const events: ForecastEvent[] = [];
  for (const p of parts) {
    for (const e of p.events) {
      const k = `${e.type}|${e.datetime}|${e.body}|${e.targetBody}|${e.targetSign}|${e.aspect}|${e.station}|${e.phase}`;
      if (seen.has(k)) continue;
      seen.add(k);
      events.push(e);
    }
  }
  events.sort((a, b) => (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0));
  return { schema: FORECAST_TECHNICAL_SCHEMA, window, events };
}

// ═══ SECONDARY PROGRESSION (/astrology/progressions) ═════════════════════════
export const ROXY_PROGRESSION = { endpoint: "/astrology/progressions", adapter: "astro-roxy-progression-1", projection: "progression-proj-1" } as const;

const PROGRESSION_KNOWN = new Set<string>([
  ...paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone", "nodeType"]),
  "targetDate",
  "progressedDate",
  "elapsedYears",
  "planets",
  ...paths("planets[]", ["name", "nameLocalized", "longitude", "sign", "signLocalized", "degree", "house", "speed", "isRetrograde", "interpretation"]),
  ...paths("ascendant", ["longitude", "sign", "signLocalized", "degree"]),
  ...paths("midheaven", ["longitude", "sign", "signLocalized", "degree"]),
  "summary",
]);

export function projectRoxyProgression(raw: unknown, opts: { nodeType: NodeType; targetDate: string }): AdapterResult<ProgressionTechnical, ProgressionInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (isoDate(r.targetDate) !== opts.targetDate) errors.push("targetDate uyuşmuyor");
  const bodies: ProgressionTechnical["bodies"] = [];
  const iBodies: ProgressionInterpretation["bodies"] = [];
  for (const p of arr(r.planets) ?? []) {
    const o = obj(p);
    const id = mapBody(o?.name);
    const pt = eclipticPoint(o);
    if (!o || !id || !pt) {
      dropped.push("planets[].name");
      continue;
    }
    const speed = num(o.speed, -50, 50);
    if (speed === null || typeof o.isRetrograde !== "boolean") {
      errors.push(`planets[${id}]: sayısal alan`);
      continue;
    }
    bodies.push({ id, ...pt, house: int(o.house, 1, 12), speed, retrograde: o.isRetrograde });
    const t = text(o.interpretation);
    if (t) iBodies.push({ id, text: t });
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push("planets: 10 klasik gezegen yok");
  const asc = eclipticPoint(obj(r.ascendant));
  const mc = eclipticPoint(obj(r.midheaven));
  return done(
    errors,
    dropped,
    () => ({
      schema: PROGRESSION_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      nodeType: opts.nodeType,
      targetDate: opts.targetDate,
      progressedDate: isoDate(r.progressedDate),
      elapsedYears: num(r.elapsedYears, 0, 200),
      houseMethod: "whole_sign_from_progressed_ascendant",
      bodies,
      angles: asc && mc ? { ascendant: asc, midheaven: mc } : null,
    }),
    () => ({ schema: PROGRESSION_INTERP_SCHEMA, bodies: iBodies, overall: text(r.summary) }),
    raw,
    PROGRESSION_KNOWN,
    new Set(),
  );
}

// ═══ SOLAR ARC (/astrology/solar-arc) ════════════════════════════════════════
export const ROXY_SOLAR_ARC = { endpoint: "/astrology/solar-arc", adapter: "astro-roxy-solar-arc-1", projection: "solar-arc-proj-1" } as const;

const SOLAR_ARC_KNOWN = new Set<string>([
  ...paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone", "nodeType"]),
  "targetDate",
  "solarArc",
  "summary",
  "directed",
  ...paths("directed[]", ["name", "nameLocalized", "natalLongitude", "directedLongitude", "sign", "signLocalized", "degree", "interpretation"]),
]);
const SOLAR_ARC_MAJOR: AspectType[] = ["conjunction", "opposition", "square", "trine", "sextile"];
const SOLAR_ARC_ORB = 1;

export function projectRoxySolarArc(raw: unknown, opts: { nodeType: NodeType; targetDate: string }): AdapterResult<SolarArcTechnical, SolarArcInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (isoDate(r.targetDate) !== opts.targetDate) errors.push("targetDate uyuşmuyor");
  const arc = num(r.solarArc, 0, 360);
  if (arc === null) errors.push("solarArc");
  const directed: SolarArcTechnical["directed"] = [];
  const iDirected: SolarArcInterpretation["directed"] = [];
  for (const d of arr(r.directed) ?? []) {
    const o = obj(d);
    const id = mapPoint(o?.name);
    const natalLongitude = num(o?.natalLongitude, 0, 360);
    const pt = eclipticPoint(o, "directedLongitude");
    if (!o || !id || natalLongitude === null || !pt) {
      dropped.push("directed[].name");
      continue;
    }
    if (directed.some((x) => x.id === id)) continue;
    directed.push({ id, natalLongitude, directedLongitude: pt.longitude, sign: pt.sign, degreeInSign: pt.degreeInSign });
    const t = text(o.interpretation);
    if (t) iDirected.push({ id, text: t });
  }
  if (directed.length < 10) errors.push("directed: eksik");
  // Directed → natal açılar (Yaşam aritmetiği; sağlayıcı vermez): majör açılar, orb ≤ 1°.
  const aspects: SolarArcAspect[] = [];
  for (const dp of directed) {
    for (const np of directed) {
      // Bir noktanın KENDİ natal konumuna "açısı" anlamsızdır (tüm noktalar aynı yay kadar ilerler → yaşa göre
      // hepsi aynı anda 30/60/90° "açı" yapar); bu eşleşmeler listelenmez.
      if (np.id === dp.id) continue;
      for (const type of SOLAR_ARC_MAJOR) {
        const orb = Math.abs(angularDistance(dp.directedLongitude, np.natalLongitude) - ASPECT_EXACT[type]);
        if (orb <= SOLAR_ARC_ORB) aspects.push({ directed: dp.id, natal: np.id, type, orb: Math.round(orb * 1e4) / 1e4 });
      }
    }
  }
  aspects.sort((a, b) => a.orb - b.orb);
  return done(
    errors,
    dropped,
    () => ({ schema: SOLAR_ARC_TECHNICAL_SCHEMA, zodiac: "tropical", nodeType: opts.nodeType, targetDate: opts.targetDate, arc: arc!, directed, aspectMethod: SOLAR_ARC_ASPECT_METHOD, aspects }),
    () => ({ schema: SOLAR_ARC_INTERP_SCHEMA, directed: iDirected, overall: text(r.summary) }),
    raw,
    SOLAR_ARC_KNOWN,
    new Set(),
  );
}

// ═══ SOLAR / LUNAR RETURN ════════════════════════════════════════════════════
export const ROXY_SOLAR_RETURN = { endpoint: "/astrology/solar-return", adapter: "astro-roxy-solar-return-1", projection: "return-proj-1" } as const;
export const ROXY_LUNAR_RETURN = { endpoint: "/astrology/lunar-return", adapter: "astro-roxy-lunar-return-1", projection: "return-proj-1" } as const;

function returnKnown(kind: "solar" | "lunar"): Set<string> {
  const natalKey = kind === "solar" ? "natalSunPosition" : "natalMoonPosition";
  return new Set<string>([
    "birthDate",
    kind === "solar" ? "solarReturnDate" : "lunarReturnDate",
    ...(kind === "solar" ? ["solarReturnYear"] : []),
    ...paths("location", ["latitude", "longitude", "timezone"]),
    "chart",
    ...chartKnownPaths("chart", { planetsKey: "planets" }),
    // GOLDEN 2026-10-07: chart.ascendant / chart.midheaven gerçek yanıtta VAR (OpenAPI'de yok) → teknik.
    ...paths("chart.ascendant", ["longitude", "sign", "signLocalized", "degree"]),
    ...paths("chart.midheaven", ["longitude", "sign", "signLocalized", "degree"]),
    ...paths(natalKey, ["longitude", "sign", "signLocalized", "degree"]),
    ...paths("interpretation", ["summary", "purpose", "keyThemes"]),
  ]);
}

function projectChart(c: Record<string, unknown> | null, houseSystem: HouseSystem, errors: string[], dropped: string[], ctx: string): ReturnChart {
  const bodies: ReturnChart["bodies"] = [];
  for (const p of arr(c?.planets) ?? []) {
    const o = obj(p);
    const id = mapBody(o?.name);
    const pt = eclipticPoint(o);
    if (!o || !id || !pt) {
      dropped.push(`${ctx}.planets[].name`);
      continue;
    }
    const latitude = num(o.latitude, -90, 90) ?? 0;
    const speed = num(o.speed, -50, 50);
    if (speed === null || typeof o.isRetrograde !== "boolean") {
      errors.push(`${ctx}.planets[${id}]: sayısal alan`);
      continue;
    }
    if (!bodies.some((b) => b.id === id)) bodies.push({ id, ...pt, latitude, house: int(o.house, 1, 12), speed, retrograde: o.isRetrograde });
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push(`${ctx}.planets: 10 klasik gezegen yok`);
  const houses = projectHouses(c?.houses, errors, ctx);
  const asc = eclipticPoint(obj(c?.ascendant));
  const mc = eclipticPoint(obj(c?.midheaven));
  const pofO = obj(c?.partOfFortune);
  const pof = eclipticPoint(pofO);
  const vxO = obj(c?.vertex);
  const vx = eclipticPoint(vxO);
  return {
    houseSystem,
    bodies,
    houses,
    angles: asc || mc ? { ascendant: asc, midheaven: mc } : null,
    aspects: projectChartAspects(c?.aspects, dropped, errors, ctx),
    points: {
      partOfFortune: pof ? { ...pof, house: int(pofO?.house, 1, 12), sect: mapEnum<"day" | "night">(pofO?.sect, ["day", "night"] as const) } : null,
      vertex: vx ? { ...vx, house: int(vxO?.house, 1, 12) } : null,
    },
  };
}

export function projectRoxyReturn(
  raw: unknown,
  kind: "solar" | "lunar",
  opts: {
    houseSystem: HouseSystem;
    returnYear: number | null;
    returnDate: string | null;
    sequence?: number | null;
    expectedUtc?: string | null;
    /** Aşama 4.1: istenen gözlem konumu — sağlayıcı yankısı (location) bununla uyuşmalı. */
    expectedLocation?: { latitude: number; longitude: number } | null;
  },
): AdapterResult<ReturnTechnical, ReturnInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const dateKey = kind === "solar" ? "solarReturnDate" : "lunarReturnDate";
  const returnLocal = typeof r[dateKey] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(r[dateKey] as string) ? (r[dateKey] as string) : null;
  if (!returnLocal) errors.push(`${dateKey}`);
  if (kind === "solar" && opts.returnYear !== null && int(r.solarReturnYear, 1500, 2700) !== opts.returnYear) errors.push("solarReturnYear uyuşmuyor");
  const loc = obj(r.location);
  const lat = num(loc?.latitude, -90, 90);
  const lon = num(loc?.longitude, -180, 180);
  const off = num(loc?.timezone, -18, 18);
  if (lat === null || lon === null || off === null) errors.push("location");
  // Sağlayıcı istenen konumda hesaplamalı (relocated return); aksi hâlde sonuç KAYDEDİLMEZ.
  if (opts.expectedLocation && lat !== null && lon !== null && (Math.abs(lat - opts.expectedLocation.latitude) > 1e-3 || Math.abs(lon - opts.expectedLocation.longitude) > 1e-3)) {
    errors.push("location: istenen dönüş konumuyla uyuşmuyor");
  }
  // Lunar: sağlayıcının döndürdüğü dönüş, SEÇİLEN dönüş olmalı (en yakın dönüş kuralı). ±36 saat dışı →
  // başka dönüş hesaplanmış demektir → sonuç KAYDEDİLMEZ (sessizce yanlış dönüş gösterilmez).
  if (kind === "lunar" && opts.expectedUtc && returnLocal && off !== null) {
    const providerUtc = Date.parse(`${returnLocal.length === 16 ? `${returnLocal}:00` : returnLocal}Z`) - off * 3600_000;
    const expected = Date.parse(`${opts.expectedUtc}:00Z`);
    if (!Number.isFinite(providerUtc) || !Number.isFinite(expected) || Math.abs(providerUtc - expected) > 36 * 3600_000) errors.push("lunarReturnDate seçilen dönüşle uyuşmuyor");
  }
  const natalPoint = eclipticPoint(obj(r[kind === "solar" ? "natalSunPosition" : "natalMoonPosition"]));
  if (!natalPoint) errors.push("natal nokta");
  const c = obj(r.chart);
  const hs = mapEnum<HouseSystem>(c?.houseSystem, HOUSE_SYSTEMS);
  if (hs !== opts.houseSystem) errors.push("chart.houseSystem uyuşmuyor");
  const chart = projectChart(c, opts.houseSystem, errors, dropped, "chart");
  const i = obj(r.interpretation);
  return done(
    errors,
    dropped,
    () => ({
      schema: RETURN_TECHNICAL_SCHEMA,
      kind,
      zodiac: "tropical",
      requested:
        kind === "lunar"
          ? { returnYear: null, returnDate: opts.returnDate, sequence: opts.sequence ?? null, expectedUtc: opts.expectedUtc ?? null }
          : { returnYear: opts.returnYear, returnDate: opts.returnDate },
      returnLocal: returnLocal!,
      returnOffsetHours: off!,
      natalPoint: natalPoint!,
      location: { latitude: lat!, longitude: lon! },
      chart,
    }),
    () => ({ schema: RETURN_INTERP_SCHEMA, summary: text(i?.summary), purpose: text(i?.purpose), keyThemes: texts(i?.keyThemes) }),
    raw,
    returnKnown(kind),
    new Set(["interpretation.keyThemes"]),
  );
}

// ═══ SYNASTRY (/astrology/synastry) ══════════════════════════════════════════
export const ROXY_SYNASTRY = { endpoint: "/astrology/synastry", adapter: "astro-roxy-synastry-1", projection: "synastry-proj-1" } as const;

const SYNASTRY_KNOWN = new Set<string>([
  ...["person1", "person2"].flatMap((p) => [
    p,
    `${p}.name`,
    ...paths(`${p}.ascendant`, ["sign", "signLocalized", "degree"]),
    `${p}.sunSign`,
    `${p}.sunSignLocalized`,
    `${p}.moonSign`,
    `${p}.moonSignLocalized`,
    `${p}.planets`,
    ...paths(`${p}.planets[]`, ["name", "nameLocalized", "longitude", "sign", "signLocalized", "degree", "house", "houseInOtherChart", "isRetrograde"]),
  ]),
  "compatibilityScore",
  "interAspects",
  // GOLDEN 2026-10-07: interAspects[].isApplying gerçek yanıtta VAR (OpenAPI'de yok) → teknik (kullanılmıyor).
  ...paths("interAspects[]", ["planet1", "planet1Localized", "planet2", "planet2Localized", "type", "typeLocalized", "angle", "orb", "isApplying", "strength", "interpretation", "meaning"]),
  ...paths("interAspects[].meaning", ["name", "description", "keywords", "nature", "relationshipContext"]),
  ...paths("interAspects[].meaning.description", ["short", "long"]),
  ...paths("summary", ["total", "harmonious", "challenging", "neutral", "byType"]),
  ...paths("analysis", ["overall", "strengths", "challenges"]),
]);
const SYNASTRY_OPAQUE = new Set(["summary.byType", "interAspects[].meaning.keywords", "analysis.strengths", "analysis.challenges"]);

function synPerson(o: Record<string, unknown> | null, errors: string[], dropped: string[], ctx: string): SynastryPerson {
  const bodies: SynastryBody[] = [];
  for (const p of arr(o?.planets) ?? []) {
    const po = obj(p);
    const id = mapBody(po?.name);
    const pt = eclipticPoint(po);
    if (!po || !id || !pt) {
      dropped.push(`${ctx}.planets[].name`);
      continue;
    }
    if (!bodies.some((b) => b.id === id)) {
      bodies.push({ id, ...pt, house: int(po.house, 1, 12), houseInOther: int(po.houseInOtherChart, 1, 12), retrograde: po.isRetrograde === true });
    }
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push(`${ctx}.planets: eksik`);
  const asc = obj(o?.ascendant);
  const ascSign = mapSign(asc?.sign);
  const ascDeg = num(asc?.degree, 0, 30);
  return { ascendant: ascSign && ascDeg !== null ? { sign: ascSign, degreeInSign: ascDeg } : null, bodies };
}

export function projectRoxySynastry(raw: unknown, opts: { houseSystem: HouseSystem; nodeType: NodeType }): AdapterResult<SynastryTechnical, SynastryInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const person1 = synPerson(obj(r.person1), errors, dropped, "person1");
  const person2 = synPerson(obj(r.person2), errors, dropped, "person2");
  const aspects: SynastryAspect[] = [];
  const iAspects: SynastryInterpretation["aspects"] = [];
  for (const a of arr(r.interAspects) ?? []) {
    const o = obj(a);
    const p1 = mapBody(o?.planet1);
    const p2 = mapBody(o?.planet2);
    const type = mapAspect(o?.type);
    if (!o || !p1 || !p2 || !type) {
      dropped.push("interAspects[](planet/type)");
      continue;
    }
    const exactAngle = num(o.angle, 0, 360);
    const orb = num(o.orb, 0, 30);
    const strength = num(o.strength, 0, 100);
    if (exactAngle === null || orb === null || strength === null) {
      errors.push("interAspects[]: sayısal alan");
      continue;
    }
    aspects.push({ a: p1, b: p2, type, exactAngle, orb, strength, nature: mapNature(o.interpretation) });
    const m = obj(o.meaning);
    const d = obj(m?.description);
    if (m) iAspects.push({ a: p1, b: p2, type, short: text(d?.short), long: text(d?.long), relationshipContext: text(m.relationshipContext), keywords: keywords(m.keywords) });
  }
  const s = obj(r.summary);
  const byType: SynastryTechnical["summary"]["byType"] = {};
  for (const [k, v] of Object.entries(obj(s?.byType) ?? {})) {
    const t = mapAspect(k);
    const n = int(v, 0, 1000);
    if (t && n !== null) byType[t] = n;
  }
  const an = obj(r.analysis);
  return done(
    errors,
    dropped,
    () => ({
      schema: SYNASTRY_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      houseSystem: opts.houseSystem,
      nodeType: opts.nodeType,
      person1,
      person2,
      aspects,
      compatibilityScore: num(r.compatibilityScore, 0, 100),
      summary: { total: int(s?.total, 0, 1000), harmonious: int(s?.harmonious, 0, 1000), challenging: int(s?.challenging, 0, 1000), neutral: int(s?.neutral, 0, 1000), byType },
    }),
    () => ({ schema: SYNASTRY_INTERP_SCHEMA, aspects: iAspects, overall: { text: text(an?.overall), strengths: texts(an?.strengths), challenges: texts(an?.challenges) } }),
    raw,
    SYNASTRY_KNOWN,
    SYNASTRY_OPAQUE,
  );
}

// ═══ COMPOSITE (/astrology/composite-chart) ══════════════════════════════════
export const ROXY_COMPOSITE = { endpoint: "/astrology/composite-chart", adapter: "astro-roxy-composite-1", projection: "composite-proj-1" } as const;

const COMPOSITE_KNOWN = new Set<string>([
  ...["person1", "person2"].flatMap((p) => paths(p, ["date", "time", "latitude", "longitude", "timezone", "nodeType"])),
  "compositePlanets",
  ...paths("compositePlanets[]", ["name", "nameLocalized", "longitude", "latitude", "sign", "signLocalized", "degree", "house", "speed", "isRetrograde", "compositeInterpretation"]),
  ...paths("compositePlanets[].compositeInterpretation", ["summary", "relationshipMeaning", "keywords"]),
  "compositeHouses",
  ...paths("compositeHouses[]", ["number", "sign", "signLocalized", "degree", "longitude"]),
  ...paths("compositeAscendant", ["sign", "signLocalized", "degree", "longitude"]),
  ...paths("compositeMidheaven", ["sign", "signLocalized", "degree", "longitude"]),
  "aspects",
  ...paths("aspects[]", ["planet1", "planet1Localized", "planet2", "planet2Localized", "type", "typeLocalized", "angle", "orb", "isApplying", "strength", "interpretation"]),
  ...paths("interpretation", ["summary", "strengths", "challenges"]),
]);
const COMPOSITE_OPAQUE = new Set(["compositePlanets[].compositeInterpretation.keywords", "interpretation.strengths", "interpretation.challenges"]);

export function projectRoxyComposite(raw: unknown, opts: { houseSystem: HouseSystem; nodeType: NodeType }): AdapterResult<CompositeTechnical, CompositeInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const bodies: CompositeTechnical["bodies"] = [];
  const iBodies: CompositeInterpretation["bodies"] = [];
  for (const p of arr(r.compositePlanets) ?? []) {
    const o = obj(p);
    const id = mapBody(o?.name);
    const pt = eclipticPoint(o);
    if (!o || !id || !pt) {
      dropped.push("compositePlanets[].name");
      continue;
    }
    const speed = num(o.speed, -50, 50) ?? 0;
    if (!bodies.some((b) => b.id === id)) bodies.push({ id, ...pt, latitude: num(o.latitude, -90, 90) ?? 0, house: int(o.house, 1, 12), speed, retrograde: o.isRetrograde === true });
    const ci = obj(o.compositeInterpretation);
    if (ci) iBodies.push({ id, summary: text(ci.summary), relationshipMeaning: text(ci.relationshipMeaning), keywords: keywords(ci.keywords) });
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push("compositePlanets: eksik");
  const houses = projectHouses(r.compositeHouses, errors, "composite");
  const asc = eclipticPoint(obj(r.compositeAscendant));
  const mc = eclipticPoint(obj(r.compositeMidheaven));
  const i = obj(r.interpretation);
  return done(
    errors,
    dropped,
    () => ({
      schema: COMPOSITE_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      method: "midpoint",
      houseSystem: opts.houseSystem,
      nodeType: opts.nodeType,
      bodies,
      houses,
      angles: asc && mc ? { ascendant: asc, midheaven: mc } : null,
      aspects: projectChartAspects(r.aspects, dropped, errors, "composite"),
    }),
    () => ({ schema: COMPOSITE_INTERP_SCHEMA, bodies: iBodies, overall: { summary: text(i?.summary), strengths: texts(i?.strengths), challenges: texts(i?.challenges) } }),
    raw,
    COMPOSITE_KNOWN,
    COMPOSITE_OPAQUE,
  );
}

export const VALID_NODE_TYPES = NODE_TYPES;
export type { PointId };
