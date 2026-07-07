// Premium BodyGraph V3 — paylaşılan <defs>. V3-2: yalnız aura gradyan + yumuşak kenar.
// "hd-v3-" namespace (V1/V2 ile çakışmaz). circle/polygon YOK.

import { AURA_V3 } from "@/lib/human-design/bodygraph-v3";

export function PremiumDefsV3() {
  return (
    <defs>
      {/* Aura yüzey gradyanı (mor/lavanta, düşük opacity) */}
      <radialGradient id="hd-v3-aura-grad" cx="50%" cy="38%" r="72%">
        <stop offset="0%" stopColor={AURA_V3.fill} stopOpacity={AURA_V3.peak} />
        <stop offset="55%" stopColor={AURA_V3.fill} stopOpacity={AURA_V3.mid} />
        <stop offset="100%" stopColor={AURA_V3.fill} stopOpacity={AURA_V3.edge} />
      </radialGradient>
      {/* Aura dolgu kenar yumuşatma */}
      <filter id="hd-v3-aura-soft" x="-14%" y="-14%" width="128%" height="128%">
        <feGaussianBlur stdDeviation={AURA_V3.blur} />
      </filter>
      {/* Aura rim ışığı (ölçülü) */}
      <filter id="hd-v3-aura-rim" x="-16%" y="-16%" width="132%" height="132%">
        <feGaussianBlur stdDeviation="1.2" />
      </filter>
    </defs>
  );
}
