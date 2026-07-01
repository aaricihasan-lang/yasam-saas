// FAZ 5 / ADIM 1 — Human Design Engine. Üretim çıktı sözleşmesi (JSON contract).
//
// SAF tip tanımı. Algoritma yok. computeHumanDesignChart bu sözleşmeyi döndürür.
// Versiyonlu; cross tema adı gates-only (name null/undefined).

import type { HdBirthInput } from "./types";
import type { ChartActivation } from "./chart-activations";
import type { HdType, HdAuthority } from "./type-authority";
import type { DefinitionKind } from "./definition";
import type { CenterName } from "./channels";
import type { IncarnationCross } from "./profile-cross";
import type { ValidationStatus } from "./validation-status";

export type ChartMeta = {
  engine: string;
  nodeType: string;
  /** gate/line mandala 7 golden case ile doğrulandı. */
  calibrationStatus: "validated";
  disclaimer: string;
};

export type ChannelSummary = {
  id: string;
  name: string;
  gates: [number, number];
  centers: [CenterName, CenterName];
};

export type DefinitionSummary = {
  kind: DefinitionKind;
  componentCount: number;
  definedCenters: CenterName[];
};

export type CentersState = {
  defined: CenterName[];
  open: CenterName[];
};

/** computeHumanDesignChart üretim çıktısı — versiyonlu, stabil sözleşme. */
export type HdChartResult = {
  schemaVersion: "1.0";
  meta: ChartMeta;
  input: HdBirthInput;
  timing: {
    birthUtcIso: string;
    designUtcIso: string;
    daysBeforeBirth: number;
  };
  /** 26 aktivasyon (13 personality + 13 design). */
  activations: ChartActivation[];
  type: HdType;
  authority: HdAuthority;
  profile: string;
  definition: DefinitionSummary;
  centers: CentersState;
  channels: ChannelSummary[];
  /** Cross gates + angle; tema adı gates-only (name yok). */
  incarnationCross: IncarnationCross;
  /** Kapsam doğrulama durumu (validated / not-yet-validated + gerekçeler). */
  validation: ValidationStatus;
  /** Per-chart uyarılar (ör. sınıra yakın aktivasyon). */
  warnings: string[];
};
