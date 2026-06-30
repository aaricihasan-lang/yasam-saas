// FAZ 3B — Human Design Engine. Deterministik Type + Authority.
//
// Tanımlı merkezler + bağlı bileşenlerden (FAZ 3A) HD Type ve Inner Authority
// türetir. SAF, deterministik; astronomi/gate-line içermez.

import type { CenterName } from "./channels";

export type HdType =
  | "Generator"
  | "Manifesting Generator"
  | "Manifestor"
  | "Projector"
  | "Reflector";

export type HdAuthority =
  | "Emotional"      // Solar Plexus
  | "Sacral"
  | "Splenic"        // Spleen
  | "Ego"            // Heart/Will
  | "Self-Projected" // G
  | "Mental"         // Environmental / None (Projector, yalnız Head/Ajna/Throat)
  | "Lunar";         // Reflector

export type TypeAuthorityResult = {
  type: HdType;
  authority: HdAuthority;
  /** Bir motor merkez Throat'a bağlı mı (tanımlı channel zinciriyle). */
  motorToThroat: boolean;
  definedCenters: CenterName[];
};

// 4 motor merkez.
const MOTORS: ReadonlyArray<CenterName> = ["Sacral", "Heart", "SolarPlexus", "Root"];

/**
 * Type + Authority hesaplar.
 *
 * @param definedCenters Tanımlı merkezler.
 * @param components     Bağlı bileşenler (definition.components) — motor↔Throat için.
 */
export function computeTypeAndAuthority(
  definedCenters: ReadonlyArray<CenterName>,
  components: ReadonlyArray<ReadonlyArray<CenterName>>,
): TypeAuthorityResult {
  const def = new Set(definedCenters);

  // ── Motor → Throat bağlantısı ──
  // Throat tanımlı VE Throat'ın bulunduğu bileşende en az bir motor varsa.
  let motorToThroat = false;
  if (def.has("Throat")) {
    const throatComp = components.find((c) => c.includes("Throat"));
    if (throatComp) {
      motorToThroat = throatComp.some((c) => MOTORS.includes(c));
    }
  }

  // ── Type ──
  let type: HdType;
  if (definedCenters.length === 0) {
    type = "Reflector";
  } else if (def.has("Sacral")) {
    type = motorToThroat ? "Manifesting Generator" : "Generator";
  } else {
    type = motorToThroat ? "Manifestor" : "Projector";
  }

  // ── Authority (katı hiyerarşi) ──
  // Not: G dalına ulaşıldığında (SP/Sacral/Spleen/Heart tanımsız) G yalnız bir
  // G–Throat channel'ı ile tanımlı olabilir → Self-Projected zaten Throat'a bağlıdır.
  let authority: HdAuthority;
  if (def.has("SolarPlexus")) {
    authority = "Emotional";
  } else if (def.has("Sacral")) {
    authority = "Sacral";
  } else if (def.has("Spleen")) {
    authority = "Splenic";
  } else if (def.has("Heart")) {
    authority = "Ego";
  } else if (def.has("G")) {
    authority = "Self-Projected";
  } else if (definedCenters.length > 0) {
    authority = "Mental";
  } else {
    authority = "Lunar";
  }

  return { type, authority, motorToThroat, definedCenters: [...definedCenters] };
}
