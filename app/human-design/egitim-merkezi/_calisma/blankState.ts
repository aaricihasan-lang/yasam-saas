// Owner incelemesi için BOŞ (aktivasyonsuz) premium BodyGraph durumu — kapı / merkez / kanal geometrisi ve ön katman ölçeği
// bireysel haritayla AYNI (rendererConfig); yalnız renk yok. Harita verisi olmadan katmanın konumlarını doğru gösterir.
import { CHANNELS } from "@/lib/human-design/engine/channels";
import type { CbgChannel, CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import { HD_PREMIUM_INDIVIDUAL_FRONT, HD_PREMIUM_INDIVIDUAL_HALF_CHANNEL, HD_PREMIUM_INDIVIDUAL_TYPE_SCALE } from "@/lib/human-design/bodygraph/rendererConfig";

export function blankPremiumState(): CbgState {
  const gates: CbgState["gates"] = {};
  for (let g = 1; g <= 64; g++) gates[g] = null;
  const channels: Record<string, CbgChannel> = {};
  for (const ch of CHANNELS) channels[ch.id] = { id: ch.id, state: "none" };
  return { gates, channels, definedCenters: new Set<string>(), full: true, palette: "individual", halfStyle: HD_PREMIUM_INDIVIDUAL_HALF_CHANNEL, typeScale: HD_PREMIUM_INDIVIDUAL_TYPE_SCALE, front: HD_PREMIUM_INDIVIDUAL_FRONT };
}
