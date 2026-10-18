// Human Design — GENEL TRANSİT (tek an, doğum verisi YOK). SAF: ağ / DB / Roxy çağrısı yok.
//
// Kaynak: doğrulanmış yerel motor —
//   • AstronomyEnginePlanetLongitudeProvider (apparent, of-date tropikal boylam; true node) — "production-validated"
//   • longitudeToGateLine (mandala GATE_ORDER + ofset — doğrulanmış)
//   • CHANNELS / GATE_CENTER (36 kanal, 64 kapı, 9 merkez)
// Kurallar:
//   • Transit TEK ANDIR: 13 aktivasyon (Personality/Design yok, 88° tasarım anı yok).
//   • Doğum haritası DEĞİLDİR: tip / otorite / profil / tanım / haç ÜRETİLMEZ.
//   • Kanal yalnız iki kapısı da transitte aktifse "transitin tamamladığı kanal"dır; merkezler yalnız bu kanallardan.
//   • Tek kapısı aktif kanal yalnız görselde YARIM olarak işaretlenir (tamamlanmış sayılmaz).
//   • Doğrulanmamış sağlayıcı (ör. MockPlanetLongitudeProvider) REDDEDİLİR; tutarlılık denetimi geçmezse hata.

import { AstronomyEnginePlanetLongitudeProvider } from "../engine/ae-provider";
import { CENTERS, CHANNELS, GATE_CENTER, type CenterName } from "../engine/channels";
import { dateToJulianDay } from "../engine/julian";
import { GATE_ORDER, longitudeToGateLine } from "../engine/mandala";
import type { PlanetLongitudeProvider, PlanetName } from "../engine/types";

/** HD'de alışılmış gösterim sırası (Roxy transit yanıtıyla aynı). */
export const TRANSIT_BODY_ORDER: ReadonlyArray<PlanetName> = [
  "Sun", "Earth", "Moon", "NorthNode", "SouthNode", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

/** Çizgi sınırına bu kadar yakın konum "sınıra yakın" işaretlenir (yay-saniye). Ay ~1 dakikada ~30″ ilerler. */
export const TRANSIT_NEAR_BOUNDARY_ARCSEC = 30;

export type TransitActivation = {
  body: PlanetName;
  /** Geosentrik tropikal ekliptik boylam (derece). */
  longitude: number;
  gate: number;
  line: number;
  /** Kapı ve çizgi sınırına uzaklık (yay-saniye). */
  gateBoundaryArcsec: number;
  lineBoundaryArcsec: number;
  /** Çizgi (dolayısıyla belki kapı) sınırına TRANSIT_NEAR_BOUNDARY_ARCSEC içinde. */
  nearBoundary: boolean;
};

export type TransitChannel = {
  id: string;
  name: string;
  gateA: number;
  gateB: number;
  centerA: CenterName;
  centerB: CenterName;
  /** Kapıyı aktive eden transit cisimleri. */
  bodiesA: PlanetName[];
  bodiesB: PlanetName[];
};

export type TransitHalfChannel = { id: string; gateA: number; gateB: number; activeGate: number };

export type GeneralTransit = {
  kind: "general-transit";
  utcIso: string;
  activations: TransitActivation[];
  activeGates: number[];
  /** Kapı → o kapıdaki transit cisimleri. */
  gateBodies: Record<number, PlanetName[]>;
  /** Yalnız transitin kendi başına tamamladığı kanallar (iki kapı da transitte). */
  channels: TransitChannel[];
  /** Yalnız görsel: tek kapısı transitte olan kanallar (TAMAMLANMIŞ DEĞİL). */
  halfChannels: TransitHalfChannel[];
  /** Transit kanallarının bağladığı merkezler (CENTERS sırasında). */
  definedCenters: CenterName[];
  openCenters: CenterName[];
  engine: { provider: string; mode: string; nodeType: string };
};

export class TransitEngineError extends Error {}

const ARCSEC_EPS = 1e-6;
const angDiff = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
};

/** Seçilen UTC anının genel Human Design transiti. Saf ve deterministik (aynı an → aynı sonuç). */
export function computeGeneralTransit(utc: Date, provider: PlanetLongitudeProvider = new AstronomyEnginePlanetLongitudeProvider()): GeneralTransit {
  if (!(utc instanceof Date) || Number.isNaN(utc.getTime())) throw new TransitEngineError("Geçersiz an.");
  const meta = provider.metadata;
  if (!meta || meta.mode !== "production-validated" || meta.nodeType !== "true") {
    throw new TransitEngineError("Doğrulanmamış boylam sağlayıcısı transit için kullanılamaz.");
  }
  const positions = provider.getLongitudes(dateToJulianDay(utc));
  const byBody = new Map<PlanetName, number>();
  for (const p of positions) {
    if (byBody.has(p.planet) || !Number.isFinite(p.longitude)) throw new TransitEngineError("Sağlayıcı çıktısı tutarsız.");
    byBody.set(p.planet, p.longitude);
  }
  if (byBody.size !== 13 || TRANSIT_BODY_ORDER.some((b) => !byBody.has(b))) throw new TransitEngineError("13 cisim beklenirken eksik/fazla cisim.");
  // Türetilmiş konumlar: Dünya = Güneş + 180°, Güney Düğüm = Kuzey Düğüm + 180°.
  if (Math.abs(angDiff(byBody.get("Earth")!, byBody.get("Sun")!) - 180) > ARCSEC_EPS) throw new TransitEngineError("Dünya–Güneş karşıtlığı tutarsız.");
  if (Math.abs(angDiff(byBody.get("SouthNode")!, byBody.get("NorthNode")!) - 180) > ARCSEC_EPS) throw new TransitEngineError("Düğüm karşıtlığı tutarsız.");

  const activations: TransitActivation[] = TRANSIT_BODY_ORDER.map((body) => {
    const gl = longitudeToGateLine(byBody.get(body)!);
    return {
      body,
      longitude: gl.normalizedLongitude,
      gate: gl.gate,
      line: gl.line,
      gateBoundaryArcsec: gl.gateBoundaryDistanceArcsec,
      lineBoundaryArcsec: gl.lineBoundaryDistanceArcsec,
      nearBoundary: gl.lineBoundaryDistanceArcsec <= TRANSIT_NEAR_BOUNDARY_ARCSEC,
    };
  });
  // Karşıt cisimler mandalada tam karşı kapı + aynı çizgi olmalı (sınırda değilse).
  for (const [a, b] of [["Sun", "Earth"], ["NorthNode", "SouthNode"]] as const) {
    const x = activations.find((v) => v.body === a)!;
    const y = activations.find((v) => v.body === b)!;
    if (x.nearBoundary || y.nearBoundary) continue;
    const opposite = GATE_ORDER[(GATE_ORDER.indexOf(x.gate) + 32) % 64];
    if (y.gate !== opposite || y.line !== x.line) throw new TransitEngineError(`${a}–${b} mandala karşıtlığı tutarsız.`);
  }

  const gateBodies: Record<number, PlanetName[]> = {};
  for (const a of activations) (gateBodies[a.gate] ??= []).push(a.body);
  const active = new Set(activations.map((a) => a.gate));
  const activeGates = [...active].sort((x, y) => x - y);

  const channels: TransitChannel[] = [];
  const halfChannels: TransitHalfChannel[] = [];
  for (const ch of CHANNELS) {
    const hasA = active.has(ch.gateA);
    const hasB = active.has(ch.gateB);
    if (hasA && hasB) {
      channels.push({ id: ch.id, name: ch.name, gateA: ch.gateA, gateB: ch.gateB, centerA: ch.centerA, centerB: ch.centerB, bodiesA: gateBodies[ch.gateA], bodiesB: gateBodies[ch.gateB] });
    } else if (hasA || hasB) {
      halfChannels.push({ id: ch.id, gateA: ch.gateA, gateB: ch.gateB, activeGate: hasA ? ch.gateA : ch.gateB });
    }
  }
  channels.sort((x, y) => x.gateA - y.gateA || x.gateB - y.gateB);
  const centerSet = new Set<CenterName>();
  for (const c of channels) {
    centerSet.add(c.centerA);
    centerSet.add(c.centerB);
  }
  // Kanal kapılarının merkez eşlemesi GATE_CENTER ile birebir olmalı.
  for (const c of channels) {
    if (GATE_CENTER[c.gateA] !== c.centerA || GATE_CENTER[c.gateB] !== c.centerB) throw new TransitEngineError("Kanal–merkez eşlemesi tutarsız.");
  }
  const definedCenters = CENTERS.filter((c) => centerSet.has(c));
  const openCenters = CENTERS.filter((c) => !centerSet.has(c));

  return {
    kind: "general-transit",
    utcIso: utc.toISOString(),
    activations,
    activeGates,
    gateBodies,
    channels,
    halfChannels,
    definedCenters,
    openCenters,
    engine: { provider: provider.name, mode: meta.mode, nodeType: meta.nodeType },
  };
}
