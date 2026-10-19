// Human Design KİŞİSEL TRANSİT — saf katman (ağ / DB yok).
//
//   • validateRoxyTransit: OpenAPI v2.0.0 transit yanıt şeması (13 aktivasyon, completedChannels, temporaryCenters).
//   • expectedOverlay: natal kapılar + transit kapılarından BAĞIMSIZ beklenen sonuç (kişisel / eğitici kanal, geçici merkez).
//   • checkTransitConsistency: Roxy yanıtı ↔ (a) yerel doğrulanmış motorun aynı andaki 13 aktivasyonu
//     (yalnız "sınıra yakın" konumlarda fark kabul), (b) bağımsız beklenen kanal / merkez kümesi. Uyuşmazlık → gösterilmez.
//   • buildPersonalTransitView: ekrana giden olgular (natal kanallar korunur; transit kaynaklı kanallar ayrı sınıflanır).

import { CENTERS, CHANNELS, GATE_CENTER, getDefinedCenters, type CenterName, type Channel } from "../engine/channels";
import type { PlanetName } from "../engine/types";
import type { GeneralTransit } from "./generalTransit";
import { TRANSIT_BODY_ORDER } from "./generalTransit";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const ROXY_BODY: Record<string, PlanetName> = {
  Sun: "Sun", Earth: "Earth", Moon: "Moon", "North Node": "NorthNode", "South Node": "SouthNode", Mercury: "Mercury", Venus: "Venus",
  Mars: "Mars", Jupiter: "Jupiter", Saturn: "Saturn", Uranus: "Uranus", Neptune: "Neptune", Pluto: "Pluto",
};
const ROXY_CENTER: Record<string, CenterName> = {
  head: "Head", ajna: "Ajna", throat: "Throat", g: "G", heart: "Heart", sacral: "Sacral", "solar-plexus": "SolarPlexus", spleen: "Spleen", root: "Root",
};

export type RoxyTransitActivation = { body: PlanetName; gate: number; line: number };
export type RoxyCompletedChannel = { id: string; gateA: number; gateB: number; kind: "personal" | "educational"; natalGates: number[]; transitGates: number[] };
export type RoxyTransitResult = {
  date: string;
  time: string;
  activations: RoxyTransitActivation[];
  completedChannels: RoxyCompletedChannel[];
  temporaryCenters: CenterName[];
  summary: string;
};

const CH_BY_ID = new Map(CHANNELS.map((c) => [c.id, c]));
const chId = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

export function validateRoxyTransit(raw: unknown, sent: { date: string; time: string }): { ok: true; value: RoxyTransitResult } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["yanıt nesne değil"] };
  if (raw.date !== sent.date) errors.push("date ≠ istenen");
  if (typeof raw.time !== "string" || raw.time.slice(0, 5) !== sent.time.slice(0, 5)) errors.push("time ≠ istenen");
  if (raw.timezone !== 0) errors.push("timezone ≠ 0");
  const acts: RoxyTransitActivation[] = [];
  if (!Array.isArray(raw.activations) || raw.activations.length !== 13) errors.push("activations 13 değil");
  else {
    for (const a of raw.activations) {
      const body = isObj(a) && typeof a.body === "string" ? ROXY_BODY[a.body] : undefined;
      if (!body || !isObj(a) || !isInt(a.gate, 1, 64) || !isInt(a.line, 1, 6)) { errors.push("geçersiz aktivasyon"); continue; }
      acts.push({ body, gate: a.gate, line: a.line });
    }
    if (new Set(acts.map((a) => a.body)).size !== 13) errors.push("13 farklı cisim değil");
  }
  const chans: RoxyCompletedChannel[] = [];
  if (!Array.isArray(raw.completedChannels)) errors.push("completedChannels dizi değil");
  else {
    for (const c of raw.completedChannels) {
      if (!isObj(c) || !isInt(c.gateA, 1, 64) || !isInt(c.gateB, 1, 64) || (c.kind !== "personal" && c.kind !== "educational") || !Array.isArray(c.natalGates) || !Array.isArray(c.transitGates)) {
        errors.push("geçersiz kanal");
        continue;
      }
      const id = chId(c.gateA, c.gateB);
      if (!CH_BY_ID.has(id)) { errors.push(`bilinmeyen kanal ${id}`); continue; }
      const ng = (c.natalGates as unknown[]).filter((g): g is number => isInt(g, 1, 64));
      const tg = (c.transitGates as unknown[]).filter((g): g is number => isInt(g, 1, 64));
      if (ng.length !== c.natalGates.length || tg.length !== c.transitGates.length) { errors.push(`kanal ${id} kapı listesi`); continue; }
      chans.push({ id, gateA: c.gateA, gateB: c.gateB, kind: c.kind, natalGates: ng.sort((x, y) => x - y), transitGates: tg.sort((x, y) => x - y) });
    }
  }
  const centers: CenterName[] = [];
  if (!Array.isArray(raw.temporaryCenters)) errors.push("temporaryCenters dizi değil");
  else {
    for (const c of raw.temporaryCenters) {
      const id = isObj(c) && typeof c.id === "string" ? ROXY_CENTER[c.id] : undefined;
      if (!id || !isObj(c) || c.temporarilyDefined !== true) { errors.push("geçersiz geçici merkez"); continue; }
      centers.push(id);
    }
  }
  if (typeof raw.summary !== "string") errors.push("summary yok");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      date: raw.date as string,
      time: raw.time as string,
      activations: TRANSIT_BODY_ORDER.map((b) => acts.find((a) => a.body === b)!),
      completedChannels: chans.sort((x, y) => x.id.localeCompare(y.id, "en", { numeric: true })),
      temporaryCenters: CENTERS.filter((c) => centers.includes(c)),
      summary: (raw.summary as string).slice(0, 2000),
    },
  };
}

export type OverlayChannel = { id: string; name: string; gateA: number; gateB: number; centerA: CenterName; centerB: CenterName; natalGates: number[]; transitGates: number[] };
export type Overlay = {
  natalChannels: Channel[];
  natalCenters: CenterName[];
  /** Natalde bir kapı var, transit diğerini sağlıyor. */
  personal: OverlayChannel[];
  /** İki kapı da natalde açık, transit ikisini birden sağlıyor. */
  educational: OverlayChannel[];
  /** Natalde açık, transit kanallarıyla geçici tanımlanan merkezler. */
  temporaryCenters: CenterName[];
};

/** Natal + transit kapılarından bağımsız beklenen sonuç (Roxy tanımlarıyla aynı kurallar). */
export function expectedOverlay(natalGates: Iterable<number>, transitGates: Iterable<number>): Overlay {
  const n = new Set(natalGates);
  const t = new Set(transitGates);
  const natalChannels = CHANNELS.filter((c) => n.has(c.gateA) && n.has(c.gateB));
  const natalCenters = getDefinedCenters(natalChannels);
  const personal: OverlayChannel[] = [];
  const educational: OverlayChannel[] = [];
  for (const c of CHANNELS) {
    if (n.has(c.gateA) && n.has(c.gateB)) continue;
    const covered = (g: number) => n.has(g) || t.has(g);
    if (!covered(c.gateA) || !covered(c.gateB)) continue;
    const natal = [c.gateA, c.gateB].filter((g) => n.has(g)).sort((x, y) => x - y);
    const transit = [c.gateA, c.gateB].filter((g) => !n.has(g)).sort((x, y) => x - y);
    const row: OverlayChannel = { id: c.id, name: c.name, gateA: c.gateA, gateB: c.gateB, centerA: c.centerA, centerB: c.centerB, natalGates: natal, transitGates: transit };
    (natal.length ? personal : educational).push(row);
  }
  const natalSet = new Set(natalCenters);
  const temp = new Set<CenterName>();
  for (const c of [...personal, ...educational]) for (const x of [c.centerA, c.centerB]) if (!natalSet.has(x)) temp.add(x);
  return { natalChannels, natalCenters, personal, educational, temporaryCenters: CENTERS.filter((c) => temp.has(c)) };
}

/** Sağlayıcı ↔ yerel motor kapı/çizgi farkı (teşhis kaydı). Owner kuralı 2026-10-19: HİÇBİR fark kabul edilmez — sınıra yakınlık gerekçe değildir. */
export type ActivationMismatch = { body: PlanetName; roxy: string; local: string; localLongitude: number; lineBoundaryArcsec: number; gateBoundaryArcsec: number };
export type ConsistencyReport = { errors: string[]; mismatches: ActivationMismatch[] };

export function checkTransitConsistency(r: RoxyTransitResult, local: GeneralTransit, natalGates: Iterable<number>): ConsistencyReport {
  const errors: string[] = [];
  const mismatches: ActivationMismatch[] = [];
  for (const a of r.activations) {
    const l = local.activations.find((x) => x.body === a.body)!;
    if (l.gate === a.gate && l.line === a.line) continue;
    mismatches.push({ body: a.body, roxy: `${a.gate}.${a.line}`, local: `${l.gate}.${l.line}`, localLongitude: l.longitude, lineBoundaryArcsec: l.lineBoundaryArcsec, gateBoundaryArcsec: l.gateBoundaryArcsec });
    errors.push(`${a.body}: sağlayıcı ${a.gate}.${a.line} ≠ yerel ${l.gate}.${l.line}`);
  }
  const exp = expectedOverlay(natalGates, r.activations.map((a) => a.gate));
  const expById = new Map<string, { kind: "personal" | "educational"; c: OverlayChannel }>();
  for (const c of exp.personal) expById.set(c.id, { kind: "personal", c });
  for (const c of exp.educational) expById.set(c.id, { kind: "educational", c });
  const got = new Set(r.completedChannels.map((c) => c.id));
  for (const id of expById.keys()) if (!got.has(id)) errors.push(`eksik kanal ${id}`);
  for (const c of r.completedChannels) {
    const e = expById.get(c.id);
    if (!e) { errors.push(`beklenmeyen kanal ${c.id}`); continue; }
    if (e.kind !== c.kind) errors.push(`kanal ${c.id} türü ${c.kind} ≠ ${e.kind}`);
    if (c.natalGates.join() !== e.c.natalGates.join()) errors.push(`kanal ${c.id} natal kapıları`);
    if (c.transitGates.join() !== e.c.transitGates.join()) errors.push(`kanal ${c.id} transit kapıları`);
  }
  if (r.temporaryCenters.join() !== exp.temporaryCenters.join()) errors.push("geçici merkezler ≠ beklenen");
  return { errors, mismatches };
}

export type PersonalTransitView = {
  /** Natal (kayıtlı bireysel analiz) — DEĞİŞMEZ. */
  natal: { gates: number[]; channels: string[]; centers: CenterName[] };
  transit: { activations: RoxyTransitActivation[]; gates: number[]; gateBodies: Record<number, PlanetName[]> };
  /** Hem natalde hem transitte olan kapılar. */
  sharedGates: number[];
  personal: OverlayChannel[];
  educational: OverlayChannel[];
  temporaryCenters: CenterName[];
  /** Sağlayıcının kısa teknik özeti (kaynak etiketiyle gösterilir; yorum değildir). */
  providerSummary: string;
  /** Sağlayıcı ve yerel motorun BİREBİR aynı bulduğu ama çizgi sınırına yakın aktivasyonlar (bilgi; kabul gerekçesi değil). */
  nearBoundaryBodies: PlanetName[];
};

export function buildPersonalTransitView(r: RoxyTransitResult, natalGates: number[], local: GeneralTransit): PersonalTransitView {
  const transitGates = [...new Set(r.activations.map((a) => a.gate))].sort((x, y) => x - y);
  const exp = expectedOverlay(natalGates, transitGates);
  const gateBodies: Record<number, PlanetName[]> = {};
  for (const a of r.activations) (gateBodies[a.gate] ??= []).push(a.body);
  const n = new Set(natalGates);
  // Ekrana giden kanal satırları beklenen (bağımsız) modelden; tutarlılık denetimi Roxy ile birebir olduğunu doğruladı.
  return {
    natal: { gates: [...n].sort((x, y) => x - y), channels: exp.natalChannels.map((c) => c.id), centers: exp.natalCenters },
    transit: { activations: r.activations, gates: transitGates, gateBodies },
    sharedGates: transitGates.filter((g) => n.has(g)),
    personal: exp.personal,
    educational: exp.educational,
    temporaryCenters: exp.temporaryCenters,
    providerSummary: r.summary,
    nearBoundaryBodies: local.activations.filter((a) => a.nearBoundary).map((a) => a.body),
  };
}

/** Kapının merkezi (ekran yardımcıları için). */
export const gateCenter = (g: number): CenterName | undefined => GATE_CENTER[g];
