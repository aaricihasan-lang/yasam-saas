// Premium BodyGraph V2 — 36 kanal path geometrisi (saf veri).
//
// Engine CHANNELS (36) DOKUNULMAZ; V2 yalnız çizim yolu üretir:
//   - a/b: gate anchor'ları (GATE_ANCHORS_V2)
//   - kind: "straight" (17 omurga) | "curved" (19 çevresel)
//   - bow: kavis şiddeti (düzde 0). Control noktası V2-3 render'da hesaplanır.
// Kanal id engine ile birebir; ters sıra riskine karşı normalizeChannelId helper.

import { CHANNELS } from "@/lib/human-design/engine/channels";
import type { PointV2 } from "./viewbox";
import { GATE_ANCHORS_V2 } from "./gates";

export type ChannelPathV2 = {
  id: string;
  gateA: number;
  gateB: number;
  a: PointV2;
  b: PointV2;
  kind: "straight" | "curved";
  bow: number;
};

/** Kanonik id: küçük-büyük gate. Engine ile aynı; "44-26" → "26-44". */
export function normalizeChannelId(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

// Kavisli 19 kanal + bow (dışa şişme). Anahtarlar normalize (küçük-büyük).
// Büyük yan yaylar ~38-40, çapraz orta ~22-30, kısa çapraz ~16-18.
const CHANNEL_CURVE: Record<string, number> = {
  "26-44": 40, "28-38": 40, "32-54": 38, "18-58": 38, // sol yan orbital
  "19-49": 40, "30-41": 38, "39-55": 38, // sağ yan orbital
  "6-59": 26, "27-50": 24, "34-57": 24, "10-57": 28, "20-57": 28, "16-48": 30, "20-34": 26, "37-40": 22, // çapraz orta
  "12-22": 16, "35-36": 16, "21-45": 18, "25-51": 16, // kısa çapraz
};

export const CHANNEL_PATHS_V2: ChannelPathV2[] = CHANNELS.flatMap((c) => {
  const a = GATE_ANCHORS_V2[c.gateA];
  const b = GATE_ANCHORS_V2[c.gateB];
  if (!a || !b) return []; // eksik anchor → geometry_selftest_v2 yakalar (uzunluk < 36)
  const id = normalizeChannelId(c.gateA, c.gateB);
  const bow = CHANNEL_CURVE[id] ?? 0;
  return [
    {
      id,
      gateA: c.gateA,
      gateB: c.gateB,
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      kind: bow > 0 ? "curved" : "straight",
      bow,
    },
  ];
});
