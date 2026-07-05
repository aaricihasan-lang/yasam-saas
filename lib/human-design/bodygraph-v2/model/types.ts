// Premium BodyGraph V2 — view model tipleri (motor semantiği; GEOMETRİ İÇERMEZ).
//
// Tasarım kararı: VM yalnız "ne tanımlı / aktif / hangi renk" bilgisini taşır.
// Koordinatlar (V2-1+) ayrı geometry/ modüllerinde yaşar; primitifler
// VM[id] + GEOMETRY[id] birleştirir → temiz, uzun-ömürlü seam.

import type { CenterName } from "@/lib/human-design/engine/channels";

/** Bir kapının render rengi: personality(black) / design(red) / both / pasif(null). */
export type GateColor = "red" | "black" | "both" | null;

export type GateVM = {
  gate: number;
  center: CenterName;
  active: boolean;
  color: GateColor;
};

export type CenterVM = {
  name: CenterName;
  defined: boolean;
  gates: number[];
};

export type ChannelHalf = {
  gate: number;
  color: GateColor;
};

export type ChannelVM = {
  id: string; // "minGate-maxGate" — engine ile aynı
  defined: boolean;
  centerA: CenterName;
  centerB: CenterName;
  halfA: ChannelHalf;
  halfB: ChannelHalf;
};

export type BodyGraphViewModel = {
  centers: CenterVM[]; // 9
  channels: ChannelVM[]; // 36
  gates: GateVM[]; // 64
  meta: {
    definedCenters: number;
    definedChannels: number;
    activeGates: number;
  };
};
