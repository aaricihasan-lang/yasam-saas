// Test-only: RoxyAPI Connection / Penta yanıtlarını OpenAPI v2.0.0 şemasında, istekteki doğum
// anlarından BAĞIMSIZ olarak üretir (sunucunun doğrulayıcısı lib/human-design/relations/* KULLANILMAZ).
// Kişi kapıları dahili motorla (computeHumanDesignChart) hesaplanır; harness'te katılımcıların kayıtlı
// haritaları da aynı motorla tohumlanır → gerçek Roxy'nin "kendi tutarlı" davranışını taklit eder.
// Gerçek (ücretli) Roxy'ye HİÇBİR çağrı yapılmaz.

import { computeHumanDesignChart } from "../../lib/human-design/engine";
import { CHANNELS } from "../../lib/human-design/engine/channels";

export type Moment = { date: string; time: string; timezone: string; latitude: number; longitude: number; nodeType?: string };

export function engineChart(m: Moment) {
  return computeHumanDesignChart({ date: m.date, time: m.time.slice(0, 5), timezone: m.timezone, location: { lat: m.latitude, lon: m.longitude } });
}

const ROXY_ID: Record<string, string> = {
  Head: "head", Ajna: "ajna", Throat: "throat", G: "g", Heart: "heart", Spleen: "spleen", SolarPlexus: "solar-plexus", Sacral: "sacral", Root: "root",
};
const ROXY_NAME: Record<string, string> = {
  Head: "Head", Ajna: "Ajna", Throat: "Throat", G: "G Center", Heart: "Heart", Spleen: "Spleen", SolarPlexus: "Solar Plexus", Sacral: "Sacral", Root: "Root",
};
const CIRCUIT = (a: number, b: number) => ([2, 14, 1, 8, 3, 60, 61, 24, 43, 23, 38, 28, 57, 20, 34, 10, 39, 55, 12, 22, 25, 51].includes(a) && [2, 14, 1, 8, 3, 60, 61, 24, 43, 23, 38, 28, 57, 20, 34, 10, 39, 55, 12, 22, 25, 51].includes(b) ? "Individual" : [21, 45, 26, 44, 40, 37, 19, 49, 6, 59, 27, 50, 54, 32].includes(a) ? "Tribal" : "Collective");

function gatesOf(m: Moment): Set<number> {
  return new Set(engineChart(m).activations.map((a) => a.gate));
}
function definedOf(m: Moment): Set<string> {
  return new Set(engineChart(m).centers.defined as string[]);
}

export function fakeConnectionResponse(personA: Moment, personB: Moment, opts: { lang?: string } = {}) {
  const A = gatesOf(personA);
  const B = gatesOf(personB);
  const dA = definedOf(personA);
  const dB = definedOf(personB);
  const channels: Record<string, unknown>[] = [];
  const defined = new Set<string>();
  const adj: Array<[string, string]> = [];
  const counts = { electromagnetic: 0, dominance: 0, compromise: 0, companionship: 0 };
  for (const ch of CHANNELS) {
    const a = [ch.gateA, ch.gateB].filter((g) => A.has(g));
    const b = [ch.gateA, ch.gateB].filter((g) => B.has(g));
    if (new Set([...a, ...b]).size < 2) continue;
    let dynamic: string;
    if (a.length === 2 && b.length === 2) dynamic = "Companionship";
    else if (a.length === 2 || b.length === 2) dynamic = a.length === 0 || b.length === 0 ? "Dominance" : "Compromise";
    else dynamic = "Electromagnetic";
    counts[dynamic.toLowerCase() as keyof typeof counts]++;
    defined.add(ch.centerA);
    defined.add(ch.centerB);
    adj.push([ch.centerA, ch.centerB]);
    // Roxy kanal yönü: gateB önce (ör. 34/20 örneği) — sunucu yönden bağımsız olmalı.
    channels.push({
      gateA: ch.gateB,
      gateB: ch.gateA,
      name: ch.name,
      ...(opts.lang === "tr" ? { nameLocalized: `${ch.name} (tr)`, circuitLocalized: "Devre", dynamicLocalized: `${dynamic} (tr)` } : {}),
      circuit: CIRCUIT(ch.gateA, ch.gateB),
      centers: [ROXY_ID[ch.centerB], ROXY_ID[ch.centerA]],
      dynamic,
      personAGates: a.slice().reverse(),
      personBGates: b,
    });
  }
  // Birleşik tanım: bağlı bileşen sayısı.
  const parent = new Map<string, string>([...defined].map((c) => [c, c]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const [x, y] of adj) parent.set(find(x), find(y));
  const comps = new Set([...defined].map(find)).size;
  const combinedDefinition = ["None", "Single", "Split", "Triple Split", "Quadruple Split"][Math.min(comps, 4)];
  const centers = Object.keys(ROXY_ID).map((eng) => ({
    id: ROXY_ID[eng],
    name: ROXY_NAME[eng],
    ...(opts.lang === "tr" ? { nameLocalized: `${ROXY_NAME[eng]} (tr)` } : {}),
    defined: defined.has(eng),
    definedBy: dA.has(eng) && dB.has(eng) ? ["both"] : dA.has(eng) ? ["A"] : dB.has(eng) ? ["B"] : [],
  }));
  return { totalChannels: channels.length, channels, centers, combinedDefinition, ...(opts.lang === "tr" ? { combinedDefinitionLocalized: `${combinedDefinition} (tr)` } : {}), summary: counts };
}

const PENTA = [
  { a: 7, b: 31, name: "The Alpha", position: "upper" },
  { a: 1, b: 8, name: "Inspiration", position: "upper" },
  { a: 13, b: 33, name: "The Prodigal", position: "upper" },
  { a: 5, b: 15, name: "Rhythm", position: "lower" },
  { a: 2, b: 14, name: "The Beat", position: "lower" },
  { a: 29, b: 46, name: "Discovery", position: "lower" },
];
const PENTA_GATE_NAME: Record<number, string> = { 1: "Self-Expression", 2: "Direction of the Self", 5: "Fixed Rhythms", 7: "The Role of the Self", 8: "Contribution", 13: "The Listener", 14: "Power Skills", 15: "Extremes", 29: "Perseverance", 31: "Influence", 33: "Privacy", 46: "Determination of the Self" };

export function fakePentaResponse(members: Moment[]) {
  const sets = members.map(gatesOf);
  const held = (g: number) => sets.flatMap((s, i) => (s.has(g) ? [i] : []));
  const gates = Object.keys(PENTA_GATE_NAME).map(Number).map((g) => ({ gate: g, gateName: PENTA_GATE_NAME[g], filled: held(g).length > 0, heldBy: held(g) }));
  const channels = PENTA.map((p) => ({
    gateA: p.a,
    gateB: p.b,
    name: p.name,
    circuit: "Tribal",
    position: p.position,
    isCore: p.a === 2,
    defined: held(p.a).length > 0 && held(p.b).length > 0,
    gateAHeldBy: held(p.a),
    gateBHeldBy: held(p.b),
  }));
  return {
    memberCount: members.length,
    channels,
    gates,
    summary: {
      definedChannels: channels.filter((c) => c.defined).length,
      filledGates: gates.filter((g) => g.filled).length,
      gapGates: gates.filter((g) => !g.filled).map((g) => g.gate),
      coreDefined: channels.find((c) => c.isCore)!.defined,
    },
  };
}

/** Çeşitli test kişileri (engine ile farklı kapılar). */
export const PEOPLE: Moment[] = [
  { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 },
  { date: "1985-03-12", time: "06:45:00", timezone: "Europe/Istanbul", latitude: 39.9334, longitude: 32.8597 },
  { date: "1992-11-03", time: "23:10:00", timezone: "Europe/Istanbul", latitude: 38.4237, longitude: 27.1428 },
  { date: "1970-01-29", time: "12:00:00", timezone: "Europe/Berlin", latitude: 52.52, longitude: 13.405 },
  { date: "2001-09-09", time: "04:30:00", timezone: "America/New_York", latitude: 40.7128, longitude: -74.006 },
  { date: "1964-06-18", time: "15:20:00", timezone: "Europe/Istanbul", latitude: 37.0, longitude: 35.3213 },
];
