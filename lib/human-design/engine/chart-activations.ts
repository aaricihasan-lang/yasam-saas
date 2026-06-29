// FAZ 2C — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// CHART AKTİVASYONLARI — 13 cisim × 2 taraf = 26 aktivasyon.
//
// Personality (doğum anı) + Design (88° solar-arc anı) için her cismin
// boylamını gate/line'a çevirir. BU FAZDA YALNIZCA gate/line.
//   type / authority / center / channel / profile / incarnation cross YOK.
// calibrationStatus "validated" — mandala (GATE_ORDER + ofset) 3 gerçek golden
// case ile 78/78 doğrulandı (FAZ 2D). Sabitler değişmedi.

import { dateToJulianDay } from "./julian";
import { longitudeToGateLine, type GateLineOptions } from "./mandala";
import type { PlanetLongitudeProvider, PlanetName } from "./types";

export type ActivationSide = "personality" | "design";

export type ChartActivation = {
  body: PlanetName;
  side: ActivationSide;
  longitude: number;
  gate: number;
  line: number;
  boundaryFlag: boolean;
};

export type BuildChartActivationsParams = {
  /** Doğum anı (UTC) — personality. */
  birthUtc: Date;
  /** 88° design anı (UTC) — design (FAZ 2B solver çıktısı). */
  designUtc: Date;
  /** Boylam sağlayıcı (mock veya AE). */
  provider: PlanetLongitudeProvider;
  /** Mandala eşleme opsiyonları (ofset/eşik). */
  options?: GateLineOptions;
};

export type ChartActivations = {
  personality: ChartActivation[];
  design: ChartActivation[];
  /** personality + design birleşik. */
  activations: ChartActivation[];
  /** boundaryFlag=true aktivasyon sayısı. */
  boundaryCount: number;
  /** Toplam aktivasyon sayısı (AE sağlayıcıyla 26). */
  total: number;
  calibrationStatus: "validated";
  disclaimer: string;
};

function toActivations(
  provider: PlanetLongitudeProvider,
  utc: Date,
  side: ActivationSide,
  options?: GateLineOptions,
): ChartActivation[] {
  return provider.getLongitudes(dateToJulianDay(utc)).map((p) => {
    const gl = longitudeToGateLine(p.longitude, options);
    return {
      body: p.planet,
      side,
      longitude: p.longitude,
      gate: gl.gate,
      line: gl.line,
      boundaryFlag: gl.boundaryFlag,
    };
  });
}

/**
 * Personality + Design aktivasyonlarını üretir (gate/line yalnız).
 * Sağlayıcı 13 cisim döndürürse toplam 26 aktivasyon olur.
 */
export function buildChartActivations(
  params: BuildChartActivationsParams,
): ChartActivations {
  const { birthUtc, designUtc, provider, options } = params;

  const personality = toActivations(provider, birthUtc, "personality", options);
  const design = toActivations(provider, designUtc, "design", options);
  const activations = [...personality, ...design];

  return {
    personality,
    design,
    activations,
    boundaryCount: activations.filter((a) => a.boundaryFlag).length,
    total: activations.length,
    calibrationStatus: "validated",
    disclaimer:
      "FAZ 2D: gate/line mandala 3 gerçek golden case ile 78/78 doğrulandı. " +
      "type/authority/center/channel/profile/cross henüz hesaplanmıyor (sonraki katman). " +
      "Bu çıktı yalnız doğrulanmış gate/line taşır.",
  };
}
