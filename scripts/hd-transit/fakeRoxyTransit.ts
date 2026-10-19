/**
 * Sahte Roxy /human-design/transit yanıtı (OpenAPI v2.0.0 biçimi) — testler ÜCRETLİ ÇAĞRI YAPMAZ.
 * Natal kapılar yerel motorla (engineChart — kayıtlı analizlerin üretildiği fixture ile aynı), transit aktivasyonları
 * yerel genel transit motoruyla, tamamlanan kanallar / geçici merkezler Roxy tanımlarıyla üretilir.
 */
import { computeGeneralTransit, TRANSIT_BODY_ORDER } from "../../lib/human-design/transit/generalTransit";
import { longitudeToGateLine } from "../../lib/human-design/engine/mandala";
import { AstronomyEnginePlanetLongitudeProvider } from "../../lib/human-design/engine/ae-provider";
import { dateToJulianDay } from "../../lib/human-design/engine/julian";
import type { PlanetName } from "../../lib/human-design/engine/types";
import { CHANNELS, getDefinedCenters } from "../../lib/human-design/engine/channels";
import { engineChart, type Moment } from "../hd-relations/fakeRelationRoxy";

const ROXY_BODY: Record<string, string> = { NorthNode: "North Node", SouthNode: "South Node" };
const ROXY_CENTER: Record<string, string> = { Head: "head", Ajna: "ajna", Throat: "throat", G: "g", Heart: "heart", Spleen: "spleen", SolarPlexus: "solar-plexus", Sacral: "sacral", Root: "root" };

/** Yerel motor boylamları (+ isteğe bağlı cisim bazında üzerine yazma) — sahte "gerçek gök". */
export function fakeSkyLongitudes(utcIso: string, override: Partial<Record<PlanetName, number>> = {}): Record<PlanetName, number> {
  const pos = new AstronomyEnginePlanetLongitudeProvider().getLongitudes(dateToJulianDay(new Date(utcIso)));
  const lon = Object.fromEntries(pos.map((p) => [p.planet, p.longitude])) as Record<PlanetName, number>;
  Object.assign(lon, override);
  lon.Earth = (lon.Sun + 180) % 360;
  lon.SouthNode = (lon.NorthNode + 180) % 360;
  return lon;
}

/** Sahte Roxy /astrology/planets yanıtı (14 cisim; Chiron / Lilith dahil — ayrıştırıcı dışarıda bırakmalı). */
export function fakePlanetsResponse(utcIso: string, override: Partial<Record<PlanetName, number>> = {}) {
  const lon = fakeSkyLongitudes(utcIso, override);
  const name: Partial<Record<PlanetName, string>> = { NorthNode: "North Node", SouthNode: "South Node" };
  const bodies = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "NorthNode", "SouthNode"] as const;
  return { planets: [...bodies.map((b) => ({ name: name[b] ?? b, longitude: lon[b], latitude: 0, speed: 1, sign: "x", degree: 0, isRetrograde: false })), { name: "Chiron", longitude: 12.3, latitude: 0, speed: 0.01, sign: "x", degree: 0, isRetrograde: false }, { name: "Black Moon Lilith", longitude: 200.1, latitude: 0, speed: 0.1, sign: "x", degree: 0, isRetrograde: false }] };
}

export function fakeTransitResponse(birth: Moment, date: string, time: string, opts: { tamper?: "gate" | "channel" | "center" | "boundary"; sky?: Record<PlanetName, number> } = {}) {
  const natal = new Set<number>(engineChart(birth).activations.map((a: { gate: number }) => a.gate));
  const t = computeGeneralTransit(new Date(`${date}T${time}Z`));
  // Gerçek gök verilmişse kapı/çizgi ondan (Roxy = hassas efemeris davranışı); yoksa yerel motordan.
  const gl = (b: PlanetName) => (opts.sky ? longitudeToGateLine(opts.sky[b]) : t.activations.find((a) => a.body === b)!);
  const activations = TRANSIT_BODY_ORDER.map((b) => { const g = gl(b); return { body: ROXY_BODY[b] ?? b, gate: g.gate, line: g.line, gateName: `Gate ${g.gate}`, ichingHexagram: { number: g.gate, english: `Hexagram ${g.gate}` } }; });
  if (opts.tamper === "gate") {
    // Sınıra yakın OLMAYAN bir cismin kapısını değiştir (yerel motorla uyuşmazlık).
    const i = t.activations.findIndex((a) => !a.nearBoundary && a.body !== "Earth" && a.body !== "SouthNode");
    activations[i] = { ...activations[i], gate: activations[i].gate === 1 ? 2 : 1 };
  }
  if (opts.tamper === "boundary") {
    // Sınıra YAKIN bir cismi komşu çizgiye kaydır (eski kod bunu "sınır farkı" diye kabul ediyordu).
    const i = t.activations.findIndex((a) => a.nearBoundary);
    if (i < 0) throw new Error("fake: sınıra yakın cisim yok");
    const a = t.activations[i];
    activations[i] = { ...activations[i], line: a.line === 6 ? 5 : a.line + 1 };
  }
  const tg = new Set(activations.map((a) => a.gate));
  const natalChannels = CHANNELS.filter((c) => natal.has(c.gateA) && natal.has(c.gateB));
  const natalCenters = new Set(getDefinedCenters(natalChannels));
  const completed: Record<string, unknown>[] = [];
  const temp = new Set<string>();
  for (const c of CHANNELS) {
    if (natal.has(c.gateA) && natal.has(c.gateB)) continue;
    if (!(natal.has(c.gateA) || tg.has(c.gateA)) || !(natal.has(c.gateB) || tg.has(c.gateB))) continue;
    const natalGates = [c.gateA, c.gateB].filter((g) => natal.has(g));
    const transitGates = [c.gateA, c.gateB].filter((g) => !natal.has(g));
    completed.push({ gateA: c.gateA, gateB: c.gateB, name: c.name, circuit: "Individual", centers: [ROXY_CENTER[c.centerA], ROXY_CENTER[c.centerB]], kind: natalGates.length ? "personal" : "educational", natalGates, transitGates });
    for (const x of [c.centerA, c.centerB]) if (!natalCenters.has(x)) temp.add(x);
  }
  if (opts.tamper === "channel") completed.pop();
  const temporaryCenters = [...temp].map((id) => ({ id: ROXY_CENTER[id], name: id, temporarilyDefined: true }));
  if (opts.tamper === "center") {
    // Geçici merkez listesini boz: varsa birini çıkar, yoksa natalde zaten tanımlı (geçici olamayacak) bir merkez ekle.
    const natalOne = [...natalCenters][0] ?? "Head";
    if (temporaryCenters.length) temporaryCenters.shift();
    else temporaryCenters.push({ id: ROXY_CENTER[natalOne], name: natalOne, temporarilyDefined: true });
  }
  return {
    date,
    time,
    timezone: 0,
    activations,
    completedChannels: completed,
    temporaryCenters,
    summary: `This transit completes ${completed.length} channels.`,
  };
}
