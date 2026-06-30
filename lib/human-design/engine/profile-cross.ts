// FAZ 3C — Human Design Engine. Profile + Incarnation Cross.
//
// Doğrulanmış personality/design aktivasyonlarından:
//   • Profile = Personality Sun line / Design Sun line
//   • Incarnation Cross gates = [P-Sun, P-Earth, D-Sun, D-Earth]
//   • Cross angle (Right/Left/Juxtaposition) — profilden DETERMİNİSTİK
// SAF, deterministik. Cross TEMA ADI (Contagion/Laws/...) 192-cross referans
// tablosu gerektirir; bu repoda yok → ad UYDURULMAZ (status "gates-only").

import type { ActivationSide, ChartActivation } from "./chart-activations";
import type { PlanetName } from "./types";

export type ProfileResult = {
  personalityLine: number; // 1..6
  designLine: number; // 1..6
  profile: string; // "2/4"
};

export type CrossAngle = "Right Angle" | "Left Angle" | "Juxtaposition";

export type IncarnationCross = {
  /** [Personality-Sun, Personality-Earth, Design-Sun, Design-Earth] gate'leri. */
  gates: [number, number, number, number];
  /** Profilden türetilen açı (deterministik). Profil tanınmazsa atlanır. */
  angle?: CrossAngle;
  /** Tema adı (Contagion/Laws/...) — referans tablo gerektirir; şimdilik yok. */
  name?: string;
  /** "gates-only" = ad doğrulanmadı (tablo yok); "validated" = ad referansla doğrulandı. */
  status: "gates-only" | "validated";
};

// 12 geçerli profilin açı sınıflandırması.
const RIGHT_ANGLE = new Set(["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6"]);
const JUXTAPOSITION = new Set(["4/1"]);
const LEFT_ANGLE = new Set(["5/1", "5/2", "6/2", "6/3"]);

function crossAngle(profile: string): CrossAngle | undefined {
  if (RIGHT_ANGLE.has(profile)) return "Right Angle";
  if (JUXTAPOSITION.has(profile)) return "Juxtaposition";
  if (LEFT_ANGLE.has(profile)) return "Left Angle";
  return undefined; // tanınmayan profil → açı uydurulmaz
}

function find(
  activations: ReadonlyArray<ChartActivation>,
  side: ActivationSide,
  body: PlanetName,
): ChartActivation {
  const a = activations.find((x) => x.side === side && x.body === body);
  if (!a) throw new Error(`Aktivasyon bulunamadı: ${side} ${body}`);
  return a;
}

/** Profile = P-Sun line / D-Sun line. */
export function computeProfile(
  activations: ReadonlyArray<ChartActivation>,
): ProfileResult {
  const pSun = find(activations, "personality", "Sun");
  const dSun = find(activations, "design", "Sun");
  return {
    personalityLine: pSun.line,
    designLine: dSun.line,
    profile: `${pSun.line}/${dSun.line}`,
  };
}

/** Incarnation Cross gates + açı (ad UYDURULMAZ). */
export function computeIncarnationCross(
  activations: ReadonlyArray<ChartActivation>,
): IncarnationCross {
  const pSun = find(activations, "personality", "Sun");
  const pEarth = find(activations, "personality", "Earth");
  const dSun = find(activations, "design", "Sun");
  const dEarth = find(activations, "design", "Earth");

  const profile = `${pSun.line}/${dSun.line}`;
  return {
    gates: [pSun.gate, pEarth.gate, dSun.gate, dEarth.gate],
    angle: crossAngle(profile),
    status: "gates-only",
  };
}
