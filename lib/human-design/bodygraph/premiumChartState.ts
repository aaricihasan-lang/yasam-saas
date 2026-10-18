// Bireysel Human Design haritası → premium BodyGraph durumu (SAF; ağ / DB / yeni hesap yok).
//
// Kaynak YALNIZ kayıtlı `computed_result` (activations + kanallar + tanımlı merkezler). Klasik kural:
// aktif kapı kanalın kendi yarısını boyar (Kişilik SİYAH / Tasarım KIRMIZI — palet "individual"; ton eşlemesi
// rendererConfig.HD_PREMIUM_INDIVIDUAL_TONE; yarım kanal çizimi ve yazı ölçeği de rendererConfig'ten);
// iki kapısı aktif kanal TANIMLI, tek kapısı aktif kanal YARIM.
// Doğrulama: kapılardan türetilen tanımlı kanallar ve merkezler kayıtlı listelerle BİREBİR örtüşmezse null döner
// → görünüm pasif (eski) çiziciye düşer; uydurma çizim yok.

import { CHANNELS, getDefinedCenters, type CenterName } from "../engine/channels";
import type { HdComputedChart } from "../chart/computedChart";
import type { Holder } from "../relations/compositeModel";
import type { CbgChannel, CbgState } from "../relations/connectionBodygraphScene";
import { HD_PREMIUM_INDIVIDUAL_HALF_CHANNEL, HD_PREMIUM_INDIVIDUAL_TONE, HD_PREMIUM_INDIVIDUAL_TYPE_SCALE } from "./rendererConfig";

export function premiumStateFromChart(c: HdComputedChart): CbgState | null {
  if (!Array.isArray(c.activations) || c.activations.length === 0) return null;
  const P = new Set<number>();
  const D = new Set<number>();
  for (const a of c.activations) {
    if (!Number.isInteger(a.gate) || a.gate < 1 || a.gate > 64) return null;
    (a.side === "design" ? D : P).add(a.gate);
  }
  const tone = (side: "personality" | "design") => HD_PREMIUM_INDIVIDUAL_TONE[side];
  const holder = (g: number): Holder | null => (P.has(g) && D.has(g) ? "both" : P.has(g) ? tone("personality") : D.has(g) ? tone("design") : null);
  const gates: Record<number, Holder | null> = {};
  for (let g = 1; g <= 64; g++) gates[g] = holder(g);

  const channels: Record<string, CbgChannel> = {};
  const defined: string[] = [];
  for (const ch of CHANNELS) {
    const lo = Math.min(ch.gateA, ch.gateB);
    const hi = Math.max(ch.gateA, ch.gateB);
    const hA = holder(lo);
    const hB = holder(hi);
    if (hA && hB) {
      channels[ch.id] = { id: ch.id, state: "defined", holderA: hA, holderB: hB };
      defined.push(ch.id);
    } else if (hA || hB) channels[ch.id] = { id: ch.id, state: "half", holderA: hA, holderB: hB };
    else channels[ch.id] = { id: ch.id, state: "none" };
  }

  // Kayıtlı sonuçla birebir doğrulama
  const stored = (c.channels ?? []).map((x) => x.id).sort().join();
  if (defined.slice().sort().join() !== stored) return null;
  const derivedCenters = getDefinedCenters(CHANNELS.filter((ch) => defined.includes(ch.id))).slice().sort();
  const storedCenters = [...(c.centers?.defined ?? [])].sort();
  if (derivedCenters.join() !== storedCenters.join()) return null;

  return {
    gates,
    channels,
    definedCenters: new Set<string>(storedCenters as CenterName[]),
    full: true,
    palette: "individual",
    halfStyle: HD_PREMIUM_INDIVIDUAL_HALF_CHANNEL,
    typeScale: HD_PREMIUM_INDIVIDUAL_TYPE_SCALE,
  };
}
