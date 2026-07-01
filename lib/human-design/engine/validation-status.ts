// FAZ 5 / ADIM 1 — Human Design Engine. Doğrulama durumu annotatörü.
//
// SAF/deterministik, VERİ-tabanlı. Algoritma değiştirmez; yalnızca üretilen
// chart'ın hangi kapsam dalına düştüğünü golden-doğrulanmış kümelere karşı
// işaretler. Bu kümeler COVERAGE.md'nin (7 gerçek golden case) aynasıdır ve
// yeni golden case eklendikçe elle güncellenir.

import type { HdType, HdAuthority } from "./type-authority";
import type { DefinitionKind } from "./definition";
import type { CrossAngle } from "./profile-cross";

export type ValidationStatus = {
  /** "validated" = tüm dallar golden-doğrulanmış kapsamda; aksi "not-yet-validated". */
  overall: "validated" | "not-yet-validated";
  /** NOT_YET_VALIDATED dalların insan-okur gerekçeleri. */
  reasons: string[];
};

// ── Golden-doğrulanmış kümeler (7 gerçek golden case ile) ──
const VALIDATED_TYPES: ReadonlySet<HdType> = new Set([
  "Generator",
  "Manifesting Generator",
  "Manifestor",
]);
const VALIDATED_AUTHORITIES: ReadonlySet<HdAuthority> = new Set([
  "Emotional",
  "Sacral",
  "Splenic",
]);
const VALIDATED_DEFINITIONS: ReadonlySet<DefinitionKind> = new Set([
  "single",
  "split-small",
  "split-large",
  "triple-split",
]);
const VALIDATED_ANGLES: ReadonlySet<CrossAngle> = new Set([
  "Right Angle",
  "Left Angle",
]);

/**
 * Chart'ın kapsam dallarını golden-doğrulanmış kümelere karşı işaretler.
 * (Sınır aktivasyonları ayrı — contract.warnings'te ele alınır.)
 */
export function annotateValidationStatus(params: {
  type: HdType;
  authority: HdAuthority;
  definitionKind: DefinitionKind;
  crossAngle?: CrossAngle;
}): ValidationStatus {
  const reasons: string[] = [];

  if (!VALIDATED_TYPES.has(params.type)) {
    reasons.push(`type "${params.type}" henüz gerçek referansla doğrulanmadı (NOT_YET_VALIDATED)`);
  }
  if (!VALIDATED_AUTHORITIES.has(params.authority)) {
    reasons.push(`authority "${params.authority}" henüz doğrulanmadı (NOT_YET_VALIDATED)`);
  }
  if (!VALIDATED_DEFINITIONS.has(params.definitionKind)) {
    reasons.push(`definition "${params.definitionKind}" henüz doğrulanmadı (NOT_YET_VALIDATED)`);
  }
  if (params.crossAngle && !VALIDATED_ANGLES.has(params.crossAngle)) {
    reasons.push(`cross angle "${params.crossAngle}" henüz doğrulanmadı (NOT_YET_VALIDATED)`);
  }

  return {
    overall: reasons.length === 0 ? "validated" : "not-yet-validated",
    reasons,
  };
}
