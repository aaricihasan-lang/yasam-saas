// FAZ 0 — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// İskelet motorun giriş noktası. Zinciri bağlar:
//   yerel zaman -> UTC -> Julian Day -> (mock) gezegen boylamları
//
// Gate / line / type / authority / profile / center / channel HESAPLANMAZ.
// Bu fazın amacı yalnızca izole mimari + veri akışı + test harness kurmaktır.

import { localDateTimeToUtc } from "./time";
import { dateToJulianDay } from "./julian";
import { MockPlanetLongitudeProvider } from "./planets";
import type {
  HdBirthInput,
  HdEngineRawOutput,
  PlanetLongitudeProvider,
} from "./types";

const DISCLAIMER =
  "FAZ 0 iskelet çıktısı. Gerçek efemeris bağlı değildir; boylamlar mock'tur. " +
  "Production HD hesap iddiası taşımaz.";

/**
 * İskelet motoru çalıştırır ve ham (hesaplanmamış) çıktı döndürür.
 *
 * @param input  Ham doğum girdisi (yerel zaman + timezone + konum).
 * @param provider  Gezegen boylamı sağlayıcı; varsayılan mock.
 */
export function runHdEngineSkeleton(
  input: HdBirthInput,
  provider: PlanetLongitudeProvider = new MockPlanetLongitudeProvider(),
): HdEngineRawOutput {
  const utc = localDateTimeToUtc(input);
  const personalityJulianDay = dateToJulianDay(utc);
  const personalityPositions = provider.getLongitudes(personalityJulianDay);

  // Mock sağlayıcı (meta veri yok) → FAZ 0 disclaimer'ı KORUNUR (eski smoke çıktısı
  // birebir aynı kalsın). Meta veri taşıyan gerçek sağlayıcılar için durumu yansıt.
  const meta = provider.metadata;
  const disclaimer = meta
    ? `FAZ 2A çıktısı. Sağlayıcı="${meta.provider}", mod="${meta.mode}", ` +
      `nodeType="${meta.nodeType}". Yalnız ham boylam; gate/line/type/authority/` +
      `profile/center/channel HESAPLANMADI. Production HD hesap iddiası taşımaz.`
    : DISCLAIMER;

  return {
    phase: "faz-0-skeleton",
    disclaimer,
    input,
    utcIso: utc.toISOString(),
    personalityJulianDay,
    provider: provider.name,
    personalityPositions,
  };
}

export type {
  HdBirthInput,
  HdEngineRawOutput,
  PlanetLongitudeProvider,
  ProviderMetadata,
  PlanetPosition,
  PlanetName,
  GeoLocation,
  JulianDay,
  EclipticLongitude,
} from "./types";

export { MockPlanetLongitudeProvider } from "./planets";
export { AstronomyEnginePlanetLongitudeProvider } from "./ae-provider";
export { localDateTimeToUtc } from "./time";
export { dateToJulianDay, julianDayToDate } from "./julian";
export { solveDesignTimeUtc } from "./design-solver";
export type { DesignSolverParams, DesignSolveResult } from "./design-solver";
export {
  longitudeToGateLine,
  gateLineToRange,
  normalizeLongitude,
  GATE_ORDER,
  GATE_SIZE_DEG,
  LINE_SIZE_DEG,
  DEFAULT_MANDALA_OFFSET_DEG,
} from "./mandala";
export type {
  GateLineOptions,
  GateLineResult,
  GateLineRange,
} from "./mandala";
export { buildChartActivations } from "./chart-activations";
export type {
  ChartActivation,
  ChartActivations,
  ActivationSide,
  BuildChartActivationsParams,
} from "./chart-activations";
