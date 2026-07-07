// Premium BodyGraph V3 — aura katmanı. Path skeleton'dan türer (deriveAura); iki path:
// dolgu (mor gradyan + blur) + rim (ışıyan kenar). polygon/circle KULLANMAZ.

import { deriveAura, AURA_V3 } from "@/lib/human-design/bodygraph-v3";
import type { Skeleton } from "@/lib/human-design/bodygraph-v3";

export function AuraLayerV3({ skeleton }: { skeleton: Skeleton }) {
  const d = deriveAura(skeleton);
  return (
    <g aria-hidden="true">
      {/* dolgu — mor arka premium hacim */}
      <path d={d} fill="url(#hd-v3-aura-grad)" filter="url(#hd-v3-aura-soft)" stroke="none" />
      {/* rim/edge — ışıyan mor beden kenarı */}
      <path
        d={d}
        fill="none"
        stroke={AURA_V3.rimColor}
        strokeWidth={AURA_V3.rimW}
        strokeOpacity={AURA_V3.rimOpacity}
        filter="url(#hd-v3-aura-rim)"
      />
    </g>
  );
}
