// Premium BodyGraph V3 — view model tipleri (motor semantiği; GEOMETRİ İÇERMEZ).
// V2'den bağımsız; aynı sözleşme. Koordinatlar V3 skeleton/derive katmanında yaşar.

import type { CenterName } from "@/lib/human-design/engine/channels";

export type GateColorV3 = "red" | "black" | "both" | null;

export type GateVM3 = {
  gate: number;
  center: CenterName;
  active: boolean;
  color: GateColorV3;
};

export type CenterVM3 = {
  name: CenterName;
  defined: boolean;
  gates: number[];
};

export type ChannelHalfV3 = {
  gate: number;
  color: GateColorV3;
};

export type ChannelVM3 = {
  id: string;
  defined: boolean;
  centerA: CenterName;
  centerB: CenterName;
  halfA: ChannelHalfV3;
  halfB: ChannelHalfV3;
};

export type BodyGraphViewModelV3 = {
  centers: CenterVM3[]; // 9
  channels: ChannelVM3[]; // 36
  gates: GateVM3[]; // 64
  meta: {
    definedCenters: number;
    definedChannels: number;
    activeGates: number;
  };
};
