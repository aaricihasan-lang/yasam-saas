// Astroloji — BAĞLAMLI konu taksonomisi (Aşama 3; SAF, istemci güvenli).
//
// Natal anahtarları (planet_in_sign, planet_in_house, aspect, pattern, angle_in_sign) DEĞİŞMEZ
// (topics/western.ts). Diğer teknikler AYNI biçimi, tür adına BAĞLAM ÖNEKİ ekleyerek kullanır →
// "Satürn 7. ev" natal notu ile "Solar return: Satürn 7. ev" notu ASLA karışmaz.
//
//   transit_aspect:<transit cisim>:<açı>:<natal nokta>        (yönlü: transit → natal)
//   transit_ingress:<cisim>:<burç>   · transit_station:<cisim>:<retrograde|direct>
//   progressed_in_sign:<cisim>:<burç> · progressed_in_house:<cisim>:<ev> · progressed_angle_in_sign:<asc|mc>:<burç>
//   solar_arc_in_sign:<nokta>:<burç>  · solar_arc_aspect:<directed nokta>:<açı>:<natal nokta>   (yönlü)
//   solar_return_in_sign|in_house|aspect|angle_in_sign … (return haritası içi; açı kanonik sırada)
//   lunar_return_in_sign|in_house|aspect|angle_in_sign …
//   synastry_aspect:<1. kişi cisim>:<açı>:<2. kişi cisim>       (yönlü: kişi 1 → kişi 2)
//   composite_in_sign|in_house|aspect|angle_in_sign …         (composite haritası içi)
//
// DB biçim kısıtı (astro_kb_entries.topic_key) ile uyumludur: ^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$

import { ASPECT_TYPES, BODY_IDS, SIGN_IDS, type AspectType, type BodyId } from "../model/western";
import { ANGLE_POINT_IDS, type CompositeTechnical, type ForecastTechnical, type PointId, type ProgressionTechnical, type ReturnTechnical, type SolarArcTechnical, type SynastryTechnical, type TransitTechnical } from "../model/westernTiming";
import { ASPECT_LABELS, BODY_LABELS, SIGN_LABELS } from "../labels/tr";
import type { AstrocartographyTechnical, LocalSpaceTechnical, RelocationTechnical } from "../model/westernLocation";

export type ArgType = "body" | "point" | "sign" | "house" | "aspect" | "angle" | "station" | "angle4" | "compass";
type Spec = { args: ArgType[]; ordered?: boolean; context: TopicContext; label: (p: string[]) => string };

export const TOPIC_CONTEXTS = [
  "natal",
  "transit",
  "progression",
  "solar_arc",
  "solar_return",
  "lunar_return",
  "synastry",
  "composite",
  "astrocartography",
  "relocation",
  "local_space",
] as const;
export type TopicContext = (typeof TOPIC_CONTEXTS)[number];
export const TOPIC_CONTEXT_LABELS: Record<TopicContext, string> = {
  natal: "Natal",
  transit: "Transit",
  progression: "Secondary progression",
  solar_arc: "Solar arc",
  solar_return: "Solar return",
  lunar_return: "Lunar return",
  synastry: "Sinastri",
  composite: "Composite",
  astrocartography: "Astrocartography",
  relocation: "Relocation",
  local_space: "Local Space",
};

/** Dört açı (ACG hattı / relocation açısal yerleşim). */
export const ANGLE4_IDS = ["asc", "dsc", "mc", "ic"] as const;
export const ANGLE4_LABEL: Record<string, string> = { asc: "Yükselen (AC)", dsc: "Alçalan (DC)", mc: "Tepe (MC)", ic: "Dip (IC)" };
export const COMPASS_LABEL: Record<string, string> = {
  n: "K", nne: "KKD", ne: "KD", ene: "DKD", e: "D", ese: "DGD", se: "GD", sse: "GGD",
  s: "G", ssw: "GGB", sw: "GB", wsw: "BGB", w: "B", wnw: "BKB", nw: "KB", nnw: "KKB",
};

const ANGLE_LABEL: Record<string, string> = { ascendant: "Yükselen", midheaven: "MC" };
const pointLabel = (p: string) => (BODY_LABELS as Record<string, string>)[p] ?? ANGLE_LABEL[p] ?? p;
const sign = (s: string) => (SIGN_LABELS as Record<string, string>)[s] ?? s;
const asp = (a: string) => (ASPECT_LABELS as Record<string, string>)[a] ?? a;

const chartKinds = (prefix: "solar_return" | "lunar_return" | "composite", title: string): Record<string, Spec> => ({
  [`${prefix}_in_sign`]: { args: ["body", "sign"], context: prefix, label: (p) => `${title}: ${pointLabel(p[0])} ${sign(p[1])} burcunda` },
  [`${prefix}_in_house`]: { args: ["body", "house"], context: prefix, label: (p) => `${title}: ${pointLabel(p[0])} ${p[1]}. evde` },
  [`${prefix}_aspect`]: { args: ["body", "aspect", "body"], ordered: true, context: prefix, label: (p) => `${title}: ${pointLabel(p[0])} ${asp(p[1])} ${pointLabel(p[2])}` },
  [`${prefix}_angle_in_sign`]: { args: ["angle", "sign"], context: prefix, label: (p) => `${title}: ${ANGLE_LABEL[p[0]]} ${sign(p[1])} burcunda` },
});

export const CONTEXT_SPECS: Record<string, Spec> = {
  transit_aspect: { args: ["body", "aspect", "point"], context: "transit", label: (p) => `Transit ${pointLabel(p[0])} ${asp(p[1])} natal ${pointLabel(p[2])}` },
  transit_ingress: { args: ["body", "sign"], context: "transit", label: (p) => `Transit ${pointLabel(p[0])} ${sign(p[1])} burcuna girişi` },
  transit_station: { args: ["body", "station"], context: "transit", label: (p) => `Transit ${pointLabel(p[0])} ${p[1] === "retrograde" ? "retro istasyonu" : "direkt istasyonu"}` },
  progressed_in_sign: { args: ["body", "sign"], context: "progression", label: (p) => `Progres ${pointLabel(p[0])} ${sign(p[1])} burcunda` },
  progressed_in_house: { args: ["body", "house"], context: "progression", label: (p) => `Progres ${pointLabel(p[0])} ${p[1]}. evde` },
  progressed_angle_in_sign: { args: ["angle", "sign"], context: "progression", label: (p) => `Progres ${ANGLE_LABEL[p[0]]} ${sign(p[1])} burcunda` },
  solar_arc_in_sign: { args: ["point", "sign"], context: "solar_arc", label: (p) => `Solar arc ${pointLabel(p[0])} ${sign(p[1])} burcunda` },
  solar_arc_aspect: { args: ["point", "aspect", "point"], context: "solar_arc", label: (p) => `Solar arc ${pointLabel(p[0])} ${asp(p[1])} natal ${pointLabel(p[2])}` },
  ...chartKinds("solar_return", "Solar return"),
  ...chartKinds("lunar_return", "Lunar return"),
  synastry_aspect: { args: ["body", "aspect", "body"], context: "synastry", label: (p) => `Sinastri: ${pointLabel(p[0])} (1. kişi) ${asp(p[1])} ${pointLabel(p[2])} (2. kişi)` },
  ...chartKinds("composite", "Composite"),
  // Aşama 4 — konum teknikleri (her biri KENDİ bağlamında; natal/transit anahtarlarıyla çakışmaz).
  astrocartography_line: { args: ["body", "angle4"], context: "astrocartography", label: (p) => `Astrocartography: ${pointLabel(p[0])} ${ANGLE4_LABEL[p[1]]} hattı` },
  relocated_in_house: { args: ["body", "house"], context: "relocation", label: (p) => `Relocation: ${pointLabel(p[0])} ${p[1]}. evde` },
  relocated_angle_in_sign: { args: ["angle", "sign"], context: "relocation", label: (p) => `Relocation: ${ANGLE_LABEL[p[0]]} ${sign(p[1])} burcunda` },
  relocated_angular: { args: ["body", "angle4"], context: "relocation", label: (p) => `Relocation: ${pointLabel(p[0])} açısal (${ANGLE4_LABEL[p[1]]})` },
  local_space_direction: { args: ["body", "compass"], context: "local_space", label: (p) => `Local Space: ${pointLabel(p[0])} hattı ${COMPASS_LABEL[p[1]]} (${p[1].toUpperCase()}) yönünde` },
};
export const CONTEXT_KINDS = Object.keys(CONTEXT_SPECS);

function valid(t: ArgType, v: string): boolean {
  switch (t) {
    case "body":
      return (BODY_IDS as readonly string[]).includes(v);
    case "point":
      return (BODY_IDS as readonly string[]).includes(v) || (ANGLE_POINT_IDS as readonly string[]).includes(v);
    case "sign":
      return (SIGN_IDS as readonly string[]).includes(v);
    case "house":
      return /^(?:[1-9]|1[0-2])$/.test(v);
    case "aspect":
      return (ASPECT_TYPES as readonly string[]).includes(v);
    case "angle":
      return (ANGLE_POINT_IDS as readonly string[]).includes(v);
    case "station":
      return v === "retrograde" || v === "direct";
    case "angle4":
      return (ANGLE4_IDS as readonly string[]).includes(v);
    case "compass":
      return Object.prototype.hasOwnProperty.call(COMPASS_LABEL, v);
  }
}

export type ParsedContextTopic = { kind: string; parts: string[]; context: TopicContext; label: string };

export function parseContextTopicKey(key: unknown): ParsedContextTopic | null {
  if (typeof key !== "string" || key.length > 160) return null;
  const [kind, ...parts] = key.split(":");
  const spec = CONTEXT_SPECS[kind];
  if (!spec || parts.length !== spec.args.length) return null;
  if (!spec.args.every((t, i) => valid(t, parts[i]))) return null;
  if (spec.ordered) {
    if (parts[0] === parts[2]) return null;
    if (BODY_IDS.indexOf(parts[0] as BodyId) > BODY_IDS.indexOf(parts[2] as BodyId)) return null; // kanonik sıra
  }
  return { kind, parts, context: spec.context, label: spec.label(parts) };
}

export function contextTopicKey(kind: string, parts: string[]): string {
  const spec = CONTEXT_SPECS[kind];
  let p = parts;
  if (spec?.ordered && BODY_IDS.indexOf(parts[0] as BodyId) > BODY_IDS.indexOf(parts[2] as BodyId)) p = [parts[2], parts[1], parts[0]];
  return [kind, ...p].join(":");
}

// ─── Teknik sonuç → konular ──────────────────────────────────────────────────

export type ContextTopic = { key: string; kind: string; label: string };

function collect(items: [string, string[]][]): ContextTopic[] {
  const out = new Map<string, ContextTopic>();
  for (const [kind, parts] of items) {
    const key = contextTopicKey(kind, parts);
    const parsed = parseContextTopicKey(key);
    if (parsed && !out.has(key)) out.set(key, { key, kind, label: parsed.label });
  }
  return [...out.values()];
}

const chartTopics = (prefix: "solar_return" | "lunar_return" | "composite", bodies: { id: BodyId; sign: string; house: number | null }[], aspects: { a: BodyId; b: BodyId; type: AspectType }[], angles: { ascendant: { sign: string } | null; midheaven: { sign: string } | null } | null) =>
  collect([
    ...bodies.map((b) => [`${prefix}_in_sign`, [b.id, b.sign]] as [string, string[]]),
    ...bodies.filter((b) => b.house !== null).map((b) => [`${prefix}_in_house`, [b.id, String(b.house)]] as [string, string[]]),
    ...aspects.map((a) => [`${prefix}_aspect`, [a.a, a.type, a.b]] as [string, string[]]),
    ...(angles?.ascendant ? [[`${prefix}_angle_in_sign`, ["ascendant", angles.ascendant.sign]] as [string, string[]]] : []),
    ...(angles?.midheaven ? [[`${prefix}_angle_in_sign`, ["midheaven", angles.midheaven.sign]] as [string, string[]]] : []),
  ]);

export function topicsFromTransit(t: TransitTechnical): ContextTopic[] {
  return collect(t.aspects.map((a) => ["transit_aspect", [a.transit, a.type, a.natal]]));
}
export function topicsFromForecast(t: ForecastTechnical): ContextTopic[] {
  const items: [string, string[]][] = [];
  for (const e of t.events) {
    if (e.type === "transit_aspect" && e.body && e.aspect && e.targetBody) items.push(["transit_aspect", [e.body, e.aspect, e.targetBody as PointId]]);
    if (e.type === "sign_ingress" && e.body && e.targetSign) items.push(["transit_ingress", [e.body, e.targetSign]]);
    if (e.type === "retrograde_station" && e.body && e.station) items.push(["transit_station", [e.body, e.station]]);
  }
  return collect(items);
}
export function topicsFromProgression(t: ProgressionTechnical): ContextTopic[] {
  return collect([
    ...t.bodies.map((b) => ["progressed_in_sign", [b.id, b.sign]] as [string, string[]]),
    ...t.bodies.filter((b) => b.house !== null).map((b) => ["progressed_in_house", [b.id, String(b.house)]] as [string, string[]]),
    ...(t.angles ? ([["progressed_angle_in_sign", ["ascendant", t.angles.ascendant.sign]], ["progressed_angle_in_sign", ["midheaven", t.angles.midheaven.sign]]] as [string, string[]][]) : []),
  ]);
}
export function topicsFromSolarArc(t: SolarArcTechnical): ContextTopic[] {
  return collect([
    ...t.directed.map((d) => ["solar_arc_in_sign", [d.id, d.sign]] as [string, string[]]),
    ...t.aspects.map((a) => ["solar_arc_aspect", [a.directed, a.type, a.natal]] as [string, string[]]),
  ]);
}
export function topicsFromReturn(t: ReturnTechnical): ContextTopic[] {
  return chartTopics(t.kind === "solar" ? "solar_return" : "lunar_return", t.chart.bodies, t.chart.aspects, t.chart.angles);
}
export function topicsFromSynastry(t: SynastryTechnical): ContextTopic[] {
  return collect(t.aspects.map((a) => ["synastry_aspect", [a.a, a.type, a.b]]));
}
export function topicsFromComposite(t: CompositeTechnical): ContextTopic[] {
  return chartTopics("composite", t.bodies, t.aspects, t.angles);
}

// ─── Aşama 4 konum teknikleri → konular ──────────────────────────────────────
export function topicsFromAstrocartography(t: AstrocartographyTechnical): ContextTopic[] {
  return collect(t.bodies.flatMap((b) => ANGLE4_IDS.map((a) => ["astrocartography_line", [b.id, a]] as [string, string[]])));
}

const angDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export function topicsFromRelocation(t: RelocationTechnical): ContextTopic[] {
  const asc = t.angles.ascendant.longitude;
  const mc = t.angles.midheaven.longitude;
  const angles: [string, number][] = [
    ["asc", asc],
    ["dsc", (asc + 180) % 360],
    ["mc", mc],
    ["ic", (mc + 180) % 360],
  ];
  const angular = t.changes.angularBodies.flatMap((id) => {
    const b = t.bodies.find((x) => x.id === id);
    if (!b) return [];
    const nearest = [...angles].sort((x, y) => angDist(b.longitude, x[1]) - angDist(b.longitude, y[1]))[0];
    return [["relocated_angular", [id, nearest[0]]] as [string, string[]]];
  });
  return collect([
    ...t.bodies.filter((b) => b.house !== null).map((b) => ["relocated_in_house", [b.id, String(b.house)]] as [string, string[]]),
    ["relocated_angle_in_sign", ["ascendant", t.angles.ascendant.sign]],
    ["relocated_angle_in_sign", ["midheaven", t.angles.midheaven.sign]],
    ...angular,
  ]);
}

export function topicsFromLocalSpace(t: LocalSpaceTechnical): ContextTopic[] {
  return collect(t.bodies.map((b) => ["local_space_direction", [b.id, b.compass]] as [string, string[]]));
}
