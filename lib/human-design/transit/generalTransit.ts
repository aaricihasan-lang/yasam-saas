// Human Design — GENEL TRANSİT (tek an, doğum verisi YOK). SAF: ağ / DB / Roxy çağrısı yok.
//
// Kaynak: yerel motor —
//   • AstronomyEnginePlanetLongitudeProvider (apparent, of-date tropikal boylam; true node)
//   • longitudeToGateLine (mandala GATE_ORDER + ofset)
//   • CHANNELS / GATE_CENTER (36 kanal, 64 kapı, 9 merkez)
// Kurallar:
//   • Transit TEK ANDIR: 13 aktivasyon (Personality/Design yok, 88° tasarım anı yok).
//   • Doğum haritası DEĞİLDİR: tip / otorite / profil / tanım / haç ÜRETİLMEZ.
//   • Kanal yalnız iki kapısı da transitte aktifse "transitin tamamladığı kanal"dır; merkezler yalnız bu kanallardan.
//   • Tek kapısı aktif kanal yalnız görselde YARIM olarak işaretlenir (tamamlanmış sayılmaz).
//   • Doğrulanmamış sağlayıcı (ör. MockPlanetLongitudeProvider) REDDEDİLİR; tutarlılık denetimi geçmezse hata.
//
// KESİNLİK SINIRI (2026-10-19 ölçümü, scripts/hd-transit/error-sweep.ts): yerel motor Swiss Ephemeris'e göre cisme ve
// döneme bağlı yay-saniyesi düzeyinde sapar (100 000 an, 1900–2100; ör. Ay 2061+ 74″, Kuzey Düğüm 24″, Venüs 21″).
// Bu yüzden çizgi sınırına ölçülen en büyük hatanın 1,5 katından yakın aktivasyon için TEK kapı/çizgi İDDİA EDİLMEZ:
// "kesinleştirilemedi" + iki aday; bu adaylara bağlı kanal / merkez de kesin sunulmaz. Keyfî ofset / yuvarlama YOK.

import { AstronomyEnginePlanetLongitudeProvider } from "../engine/ae-provider";
import { CENTERS, CHANNELS, GATE_CENTER, type CenterName } from "../engine/channels";
import { dateToJulianDay } from "../engine/julian";
import { GATE_ORDER, longitudeToGateLine } from "../engine/mandala";
import type { PlanetLongitudeProvider, PlanetName } from "../engine/types";

/** HD'de alışılmış gösterim sırası (Roxy transit yanıtıyla aynı). */
export const TRANSIT_BODY_ORDER: ReadonlyArray<PlanetName> = [
  "Sun", "Earth", "Moon", "NorthNode", "SouthNode", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

/** Çizgi sınırına bu kadar yakın konum "sınıra yakın" işaretlenir (yay-saniye; bilgi amaçlı). */
export const TRANSIT_NEAR_BOUNDARY_ARCSEC = 30;

/**
 * Yerel motorun cisim + dönem başına BELİRSİZLİK PAYI (yay-saniye) = 100 000 anlık Swiss Ephemeris taramasında ölçülen
 * en büyük |yerel − SE| × 1,5 (yukarı yuvarlanmış). Dünya = Güneş, Güney Düğüm = Kuzey Düğüm. Ay ve Güneş için ΔT
 * tahmin farkı ileri yıllarda büyüdüğünden dönem bazlı.
 */
export function transitUncertaintyArcsec(body: PlanetName, year: number): number {
  switch (body) {
    case "Sun":
    case "Earth":
      return year <= 2060 ? 5 : 11;
    case "Moon":
      return year <= 2030 ? 10 : year <= 2060 ? 38 : 112;
    case "Mercury": return 27;
    case "Venus": return 31;
    case "Mars": return 20;
    case "Jupiter": return 16;
    case "Saturn": return 20;
    case "Uranus": return 19;
    case "Neptune": return 29;
    case "Pluto": return 14;
    case "NorthNode":
    case "SouthNode":
      return 36;
  }
}

export type TransitActivation = {
  body: PlanetName;
  /** Geosentrik tropikal ekliptik boylam (derece). */
  longitude: number;
  /** Yerel motorun hesapladığı kapı / çizgi. `certain` false ise TEK BAŞINA iddia edilmez. */
  gate: number;
  line: number;
  /** Kapı ve çizgi sınırına uzaklık (yay-saniye). */
  gateBoundaryArcsec: number;
  lineBoundaryArcsec: number;
  /** Çizgi sınırına TRANSIT_NEAR_BOUNDARY_ARCSEC içinde (bilgi). */
  nearBoundary: boolean;
  /** Sınıra uzaklık belirsizlik payından büyük → kapı/çizgi kesin. */
  certain: boolean;
  uncertaintyArcsec: number;
  /** certain=false: en yakın sınırın öbür yanındaki aday. */
  alternative: { gate: number; line: number } | null;
};

export type TransitChannel = {
  id: string;
  name: string;
  gateA: number;
  gateB: number;
  centerA: CenterName;
  centerB: CenterName;
  /** Kapıyı aktive eden transit cisimleri (yalnız kesin aktivasyonlar + kapısı her iki adayda aynı olanlar). */
  bodiesA: PlanetName[];
  bodiesB: PlanetName[];
};

export type TransitHalfChannel = { id: string; gateA: number; gateB: number; activeGate: number };

export type GeneralTransit = {
  kind: "general-transit";
  utcIso: string;
  activations: TransitActivation[];
  /** KESİN aktif kapılar (belirsiz aktivasyonun her iki adayında da aynı kalan kapı dahil). */
  activeGates: number[];
  /** Kapı → o kapıdaki transit cisimleri (yalnız kesin kapılar). */
  gateBodies: Record<number, PlanetName[]>;
  /** KESİN: transitin kendi başına tamamladığı kanallar (her aday birleşiminde tamamlanan). */
  channels: TransitChannel[];
  /** Sınırdaki aktivasyona bağlı OLASI kanallar (bazı adaylarda tamamlanıyor) — kesin değildir. */
  possibleChannels: Array<{ id: string; name: string; gateA: number; gateB: number }>;
  /** Yalnız görsel: tek kapısı (kesin) transitte olan kanallar (TAMAMLANMIŞ DEĞİL). */
  halfChannels: TransitHalfChannel[];
  /** KESİN tanımlı / KESİN açık / sınıra bağlı merkezler (CENTERS sırasında). */
  definedCenters: CenterName[];
  openCenters: CenterName[];
  uncertainCenters: CenterName[];
  /** En az bir aktivasyon kesinleştirilemedi. */
  hasUncertainty: boolean;
  engine: { provider: string; mode: string; nodeType: string };
};

export class TransitEngineError extends Error {}

const ARCSEC_EPS = 1e-6;
const angDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const LINE_DEG = 360 / 64 / 6;

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

  const year = utc.getUTCFullYear();
  const activations: TransitActivation[] = TRANSIT_BODY_ORDER.map((body) => {
    const gl = longitudeToGateLine(byBody.get(body)!);
    const u = transitUncertaintyArcsec(body, year);
    const certain = gl.lineBoundaryDistanceArcsec > u;
    let alternative: TransitActivation["alternative"] = null;
    if (!certain) {
      // En yakın sınırın öbür yanı (çizgi içindeki konuma göre yön).
      const towardNext = gl.positionInLineDeg > LINE_DEG / 2;
      const step = gl.lineBoundaryDistanceArcsec / 3600 + 1e-7;
      const o = longitudeToGateLine(gl.normalizedLongitude + (towardNext ? step : -step));
      alternative = { gate: o.gate, line: o.line };
    }
    return {
      body,
      longitude: gl.normalizedLongitude,
      gate: gl.gate,
      line: gl.line,
      gateBoundaryArcsec: gl.gateBoundaryDistanceArcsec,
      lineBoundaryArcsec: gl.lineBoundaryDistanceArcsec,
      nearBoundary: gl.lineBoundaryDistanceArcsec <= TRANSIT_NEAR_BOUNDARY_ARCSEC,
      certain,
      uncertaintyArcsec: u,
      alternative,
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

  // Kesin kapılar: kesin aktivasyonlar + belirsiz olup iki adayda da kapısı aynı kalanlar.
  const gateFixed = (a: TransitActivation) => a.certain || a.alternative!.gate === a.gate;
  const gateBodies: Record<number, PlanetName[]> = {};
  for (const a of activations) if (gateFixed(a)) (gateBodies[a.gate] ??= []).push(a.body);
  const fixed = new Set(Object.keys(gateBodies).map(Number));
  const activeGates = [...fixed].sort((x, y) => x - y);
  // Kapısı belirsiz aktivasyonlar → aday birleşimleri (her biri 2 aday; k ≤ 13).
  const open = activations.filter((a) => !gateFixed(a));
  const combos: Array<Set<number>> = [];
  for (let mask = 0; mask < 1 << open.length; mask++) {
    const s = new Set(fixed);
    open.forEach((a, i) => s.add(mask & (1 << i) ? a.alternative!.gate : a.gate));
    combos.push(s);
  }
  const completesIn = (gA: number, gB: number) => combos.map((s) => s.has(gA) && s.has(gB));

  const channels: TransitChannel[] = [];
  const possibleChannels: GeneralTransit["possibleChannels"] = [];
  const halfChannels: TransitHalfChannel[] = [];
  const centerIn = combos.map(() => new Set<CenterName>());
  for (const ch of CHANNELS) {
    const inCombo = completesIn(ch.gateA, ch.gateB);
    inCombo.forEach((on, i) => {
      if (on) {
        centerIn[i].add(ch.centerA);
        centerIn[i].add(ch.centerB);
      }
    });
    if (inCombo.every(Boolean)) {
      channels.push({ id: ch.id, name: ch.name, gateA: ch.gateA, gateB: ch.gateB, centerA: ch.centerA, centerB: ch.centerB, bodiesA: gateBodies[ch.gateA], bodiesB: gateBodies[ch.gateB] });
    } else if (inCombo.some(Boolean)) {
      possibleChannels.push({ id: ch.id, name: ch.name, gateA: ch.gateA, gateB: ch.gateB });
    } else {
      const hasA = fixed.has(ch.gateA);
      const hasB = fixed.has(ch.gateB);
      if (hasA || hasB) halfChannels.push({ id: ch.id, gateA: ch.gateA, gateB: ch.gateB, activeGate: hasA ? ch.gateA : ch.gateB });
    }
  }
  channels.sort((x, y) => x.gateA - y.gateA || x.gateB - y.gateB);
  // Kanal kapılarının merkez eşlemesi GATE_CENTER ile birebir olmalı.
  for (const c of channels) {
    if (GATE_CENTER[c.gateA] !== c.centerA || GATE_CENTER[c.gateB] !== c.centerB) throw new TransitEngineError("Kanal–merkez eşlemesi tutarsız.");
  }
  const definedCenters = CENTERS.filter((c) => centerIn.every((s) => s.has(c)));
  const openCenters = CENTERS.filter((c) => centerIn.every((s) => !s.has(c)));
  const uncertainCenters = CENTERS.filter((c) => !definedCenters.includes(c) && !openCenters.includes(c));

  return {
    kind: "general-transit",
    utcIso: utc.toISOString(),
    activations,
    activeGates,
    gateBodies,
    channels,
    possibleChannels,
    halfChannels,
    definedCenters,
    openCenters,
    uncertainCenters,
    hasUncertainty: activations.some((a) => !a.certain),
    engine: { provider: provider.name, mode: meta.mode, nodeType: meta.nodeType },
  };
}
