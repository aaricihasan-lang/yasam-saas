// Astroloji — Aşama 4 Roxy adaptörleri: Astrocartography · Relocation · Local Space (SAF).
//
// Beyaz liste projeksiyon (Aşama 3 ile aynı ilkeler):
//   • TEKNİK: kanonik kimlik + sayı (RA/Dec, hat boylamları, eğri noktaları, ev/açı, azimut/yükseklik…).
//   • YORUM (ayrı katman, yetkiyle): lines[].{mc,ic,ascendant,descendant}.interpretation, summary,
//     planets[].interpretation.*, interpretation.summary, bodies[].interpretation.
//   • YOK SAYILAN (bilinen, kullanılmayan): *Localized, symbol (sunum), birthDetails yankısı.
//   • Bilinmeyen alan → teknik SAYILMAZ; yalnız yolu raporlanır (fail-closed).
// GOLDEN 2026-10-07 (sentetik A; New York hedefi): ACG yanıtında birthDetails.nodeType VAR (OpenAPI'de yok)
// → teknik yankı. Relocation düğümü = natal GERÇEK düğüm (istekte nodeType yok; sağlayıcı varsayılanı).

import { BODY_IDS, HOUSE_SYSTEMS, type BodyId, type HouseSystem } from "../../model/western";
import {
  ACG_INTERP_SCHEMA,
  ACG_TECHNICAL_SCHEMA,
  COMPASS_16,
  LOCAL_SPACE_INTERP_SCHEMA,
  LOCAL_SPACE_TECHNICAL_SCHEMA,
  RELOCATION_INTERP_SCHEMA,
  RELOCATION_TECHNICAL_SCHEMA,
  type AcgAngle,
  type AcgCurve,
  type AstrocartographyInterpretation,
  type AstrocartographyTechnical,
  type Compass16,
  type LatLon,
  type LocalSpaceInterpretation,
  type LocalSpaceTechnical,
  type RelocationInterpretation,
  type RelocationTechnical,
} from "../../model/westernLocation";
import { arr, eclipticPoint, findUnmapped, int, keywords, mapBody, mapEnum, num, obj, paths, projectHouses, text } from "./shared";
import type { AdapterResult } from "./timing";

const done = <T, I>(errors: string[], dropped: string[], technical: () => T, interpretation: () => I | null, raw: unknown, known: Set<string>, opaque: Set<string>): AdapterResult<T, I> => {
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, technical: technical(), interpretation: interpretation(), unmappedFields: findUnmapped(raw, known, opaque), droppedValues: [...new Set(dropped)] };
};

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const lon180 = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;

function latLonPoints(v: unknown, ctx: string, errors: string[], max = 400): LatLon[] {
  const out: LatLon[] = [];
  for (const p of (arr(v) ?? []).slice(0, max + 1)) {
    const o = obj(p);
    const la = num(o?.latitude, -90, 90);
    const lo = num(o?.longitude, -540, 540);
    if (la === null || lo === null) {
      errors.push(`${ctx}: nokta`);
      return [];
    }
    out.push([r4(la), r4(lon180(lo))]);
  }
  if (out.length > max) errors.push(`${ctx}: çok fazla nokta`);
  return out;
}

export function mapCompass(v: unknown): Compass16 | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  if ((COMPASS_16 as readonly string[]).includes(k)) return k as Compass16;
  const words: Record<string, Compass16> = {
    north: "n",
    northnortheast: "nne",
    northeast: "ne",
    eastnortheast: "ene",
    east: "e",
    eastsoutheast: "ese",
    southeast: "se",
    southsoutheast: "sse",
    south: "s",
    southsouthwest: "ssw",
    southwest: "sw",
    westsouthwest: "wsw",
    west: "w",
    westnorthwest: "wnw",
    northwest: "nw",
    northnorthwest: "nnw",
  };
  return words[k.replace(/[^a-z]/g, "")] ?? null;
}

// ═══ ASTROCARTOGRAPHY (/astrology/astrocartography) ══════════════════════════
export const ROXY_ACG = { endpoint: "/astrology/astrocartography", adapter: "astro-roxy-acg-1", projection: "acg-proj-1" } as const;

const ACG_KNOWN = new Set<string>([
  ...paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone", "nodeType"]),
  "lines",
  ...paths("lines[]", ["planet", "planetLocalized", "symbol", "rightAscension", "declination", "mc", "ic", "ascendant", "descendant"]),
  ...paths("lines[].mc", ["longitude", "interpretation"]),
  ...paths("lines[].ic", ["longitude", "interpretation"]),
  ...paths("lines[].ascendant", ["points", "circumpolarBeyond", "interpretation"]),
  ...paths("lines[].ascendant.points[]", ["latitude", "longitude"]),
  ...paths("lines[].descendant", ["points", "circumpolarBeyond", "interpretation"]),
  ...paths("lines[].descendant.points[]", ["latitude", "longitude"]),
  "summary",
]);

export function projectRoxyAstrocartography(raw: unknown): AdapterResult<AstrocartographyTechnical, AstrocartographyInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const bodies: AstrocartographyTechnical["bodies"] = [];
  const lines: AstrocartographyInterpretation["lines"] = [];
  let latMin = 90;
  let latMax = -90;
  for (const l of arr(r.lines) ?? []) {
    const o = obj(l);
    const id = mapBody(o?.planet);
    if (!o || !id) {
      dropped.push("lines[].planet");
      continue;
    }
    const ra = num(o.rightAscension, 0, 360);
    const dec = num(o.declination, -90, 90);
    const mc = num(obj(o.mc)?.longitude, -540, 540);
    const ic = num(obj(o.ic)?.longitude, -540, 540);
    if (ra === null || dec === null || mc === null || ic === null) {
      errors.push(`lines[${id}]: sayısal alan`);
      continue;
    }
    const curve = (k: "ascendant" | "descendant"): AcgCurve => {
      const c = obj(o[k]);
      const pts = latLonPoints(c?.points, `lines[${id}].${k}`, errors);
      for (const [la] of pts) {
        latMin = Math.min(latMin, la);
        latMax = Math.max(latMax, la);
      }
      const cb = c?.circumpolarBeyond;
      if (cb !== null && cb !== undefined && num(cb, 0, 90) === null) errors.push(`lines[${id}].${k}.circumpolarBeyond`);
      return { points: pts, circumpolarBeyond: cb === null || cb === undefined ? null : r4(cb as number) };
    };
    if (bodies.some((b) => b.id === id)) continue;
    bodies.push({ id, rightAscension: ra, declination: dec, mcLongitude: r4(lon180(mc)), icLongitude: r4(lon180(ic)), asc: curve("ascendant"), dsc: curve("descendant") });
    const add = (angle: AcgAngle, v: unknown) => {
      const t = text(v);
      if (t) lines.push({ id, angle, text: t });
    };
    add("mc", obj(o.mc)?.interpretation);
    add("ic", obj(o.ic)?.interpretation);
    add("asc", obj(o.ascendant)?.interpretation);
    add("dsc", obj(o.descendant)?.interpretation);
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push("lines: 10 klasik gezegen yok");
  const nodeEcho = typeof obj(r.birthDetails)?.nodeType === "string" ? String(obj(r.birthDetails)!.nodeType).slice(0, 10) : null;
  return done(
    errors,
    dropped,
    () => ({ schema: ACG_TECHNICAL_SCHEMA, nodeEcho, sampling: { latitudeMin: latMin <= latMax ? latMin : -70, latitudeMax: latMin <= latMax ? latMax : 70 }, bodies }),
    () => ({ schema: ACG_INTERP_SCHEMA, lines, summary: text(r.summary) }),
    raw,
    ACG_KNOWN,
    new Set(),
  );
}

// ═══ RELOCATION (/astrology/relocation-chart) ═══════════════════════════════
export const ROXY_RELOCATION = { endpoint: "/astrology/relocation-chart", adapter: "astro-roxy-relocation-1", projection: "relocation-proj-1" } as const;

const RELOCATION_KNOWN = new Set<string>([
  ...paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone"]),
  ...paths("relocation", ["latitude", "longitude"]),
  "planets",
  ...paths("planets[]", ["name", "nameLocalized", "longitude", "latitude", "sign", "signLocalized", "degree", "house", "speed", "isRetrograde", "interpretation"]),
  ...paths("planets[].interpretation", ["summary", "detailed", "keywords"]),
  "houses",
  ...paths("houses[]", ["number", "longitude", "sign", "signLocalized", "degree"]),
  "houseSystem",
  ...paths("ascendant", ["sign", "signLocalized", "degree", "longitude"]),
  ...paths("midheaven", ["sign", "signLocalized", "degree", "longitude"]),
  ...paths("vertex", ["sign", "signLocalized", "degree", "longitude", "house"]),
  ...paths("changes", ["ascendantSignChanged", "planetsChangedHouse", "angularPlanets", "angularPlanetsLocalized", "distanceKm", "direction"]),
  ...paths("changes.planetsChangedHouse[]", ["planet", "planetLocalized", "natalHouse", "relocatedHouse"]),
  ...paths("interpretation", ["summary"]),
]);
const RELOCATION_OPAQUE = new Set(["planets[].interpretation.keywords", "changes.angularPlanets", "changes.angularPlanetsLocalized"]);

export function projectRoxyRelocation(
  raw: unknown,
  opts: { houseSystem: HouseSystem; target: { latitude: number; longitude: number } },
): AdapterResult<RelocationTechnical, RelocationInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const rel = obj(r.relocation);
  const tLat = num(rel?.latitude, -90, 90);
  const tLon = num(rel?.longitude, -180, 180);
  // Sağlayıcı istenen hedefi hesaplamalı (yanlış konumla sessiz sonuç YOK).
  if (tLat === null || tLon === null || Math.abs(tLat - opts.target.latitude) > 1e-3 || Math.abs(tLon - opts.target.longitude) > 1e-3) errors.push("relocation hedefi uyuşmuyor");
  const bd = obj(r.birthDetails);
  const bLat = num(bd?.latitude, -90, 90);
  const bLon = num(bd?.longitude, -180, 180);
  if (bLat === null || bLon === null) errors.push("birthDetails");
  const hs = mapEnum<HouseSystem>(r.houseSystem, HOUSE_SYSTEMS);
  // Kutup çevresinde quadrant → whole-sign düşüşü sağlayıcı tarafından bildirilir; uyuşmazlık açıkça hata.
  if (hs !== opts.houseSystem) errors.push(`houseSystem uyuşmuyor (${String(r.houseSystem).slice(0, 20)})`);
  const bodies: RelocationTechnical["bodies"] = [];
  const iBodies: RelocationInterpretation["bodies"] = [];
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
    if (bodies.some((b) => b.id === id)) continue;
    bodies.push({ id, ...pt, latitude: num(o.latitude, -90, 90) ?? 0, house: int(o.house, 1, 12), speed, retrograde: o.isRetrograde });
    const i = obj(o.interpretation);
    if (i) iBodies.push({ id, summary: text(i.summary), detailed: text(i.detailed), keywords: keywords(i.keywords) });
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push("planets: 10 klasik gezegen yok");
  const houses = projectHouses(r.houses, errors, "houses");
  const asc = eclipticPoint(obj(r.ascendant));
  const mc = eclipticPoint(obj(r.midheaven));
  if (!asc || !mc) errors.push("ascendant/midheaven");
  const vxO = obj(r.vertex);
  const vx = eclipticPoint(vxO);
  const ch = obj(r.changes);
  const changed: RelocationTechnical["changes"]["planetsChangedHouse"] = [];
  for (const c of arr(ch?.planetsChangedHouse) ?? []) {
    const o = obj(c);
    const id = mapBody(o?.planet);
    const nh = int(o?.natalHouse, 1, 12);
    const rh = int(o?.relocatedHouse, 1, 12);
    if (!id || nh === null || rh === null) {
      dropped.push("changes.planetsChangedHouse[]");
      continue;
    }
    changed.push({ id, natalHouse: nh, relocatedHouse: rh });
  }
  const angular: BodyId[] = [];
  for (const a of arr(ch?.angularPlanets) ?? []) {
    const id = mapBody(a);
    if (id) angular.push(id);
    else dropped.push("changes.angularPlanets[]");
  }
  const distanceKm = num(ch?.distanceKm, 0, 20100);
  if (distanceKm === null || typeof ch?.ascendantSignChanged !== "boolean") errors.push("changes");
  const direction = ch?.direction === undefined || ch?.direction === null ? null : mapCompass(ch.direction);
  if (ch?.direction !== undefined && ch?.direction !== null && direction === null) dropped.push("changes.direction");
  return done(
    errors,
    dropped,
    () => ({
      schema: RELOCATION_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      houseSystem: opts.houseSystem,
      birthPlace: { latitude: bLat!, longitude: bLon! },
      target: { latitude: tLat!, longitude: tLon! },
      bodies,
      houses,
      angles: { ascendant: asc!, midheaven: mc! },
      vertex: vx ? { ...vx, house: int(vxO?.house, 1, 12) } : null,
      changes: { ascendantSignChanged: ch!.ascendantSignChanged as boolean, planetsChangedHouse: changed, angularBodies: angular, distanceKm: distanceKm!, direction },
      natal: null,
    }),
    () => ({ schema: RELOCATION_INTERP_SCHEMA, bodies: iBodies, summary: text(obj(r.interpretation)?.summary) }),
    raw,
    RELOCATION_KNOWN,
    RELOCATION_OPAQUE,
  );
}

// ═══ LOCAL SPACE (/astrology/local-space) ═══════════════════════════════════
export const ROXY_LOCAL_SPACE = { endpoint: "/astrology/local-space", adapter: "astro-roxy-local-space-1", projection: "local-space-proj-1" } as const;

const LOCAL_SPACE_KNOWN = new Set<string>([
  ...paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone"]),
  "bodies",
  ...paths("bodies[]", ["planet", "planetLocalized", "symbol", "azimuth", "altitude", "compassDirection", "aboveHorizon", "line", "interpretation"]),
  ...paths("bodies[].line", ["points"]),
  ...paths("bodies[].line.points[]", ["latitude", "longitude"]),
  "summary",
]);

export function projectRoxyLocalSpace(raw: unknown, opts: { reference: { latitude: number; longitude: number } }): AdapterResult<LocalSpaceTechnical, LocalSpaceInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const bd = obj(r.birthDetails);
  const la = num(bd?.latitude, -90, 90);
  const lo = num(bd?.longitude, -180, 180);
  // Sağlayıcı istenen referans noktasından hesaplamalı.
  if (la === null || lo === null || Math.abs(la - opts.reference.latitude) > 1e-3 || Math.abs(lo - opts.reference.longitude) > 1e-3) errors.push("referans konum uyuşmuyor");
  const bodies: LocalSpaceTechnical["bodies"] = [];
  const iBodies: LocalSpaceInterpretation["bodies"] = [];
  for (const b of arr(r.bodies) ?? []) {
    const o = obj(b);
    const id = mapBody(o?.planet);
    if (!o || !id) {
      dropped.push("bodies[].planet");
      continue;
    }
    const az = num(o.azimuth, 0, 360);
    const alt = num(o.altitude, -90, 90);
    const compass = mapCompass(o.compassDirection);
    if (az === null || alt === null || typeof o.aboveHorizon !== "boolean" || !compass) {
      errors.push(`bodies[${id}]: alan`);
      continue;
    }
    if (bodies.some((x) => x.id === id)) continue;
    bodies.push({ id, azimuth: az, altitude: alt, compass, aboveHorizon: o.aboveHorizon, line: latLonPoints(obj(o.line)?.points, `bodies[${id}].line`, errors) });
    const t = text(o.interpretation);
    if (t) iBodies.push({ id, text: t });
  }
  if (bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length < 10) errors.push("bodies: 10 klasik gezegen yok");
  return done(
    errors,
    dropped,
    () => ({ schema: LOCAL_SPACE_TECHNICAL_SCHEMA, reference: { latitude: la!, longitude: lo! }, bodies }),
    () => ({ schema: LOCAL_SPACE_INTERP_SCHEMA, bodies: iBodies, summary: text(r.summary) }),
    raw,
    LOCAL_SPACE_KNOWN,
    new Set(),
  );
}
