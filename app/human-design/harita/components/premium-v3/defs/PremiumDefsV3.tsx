// Premium BodyGraph V3 — paylasilan <defs>. V3-2 yeniden: insan silueti YOK; yalniz ambient glow.
// "hd-v3-" namespace (V1/V2 ile cakismaz). circle/polygon YOK.

import { AURA_V3 } from "@/lib/human-design/bodygraph-v3";

export function PremiumDefsV3() {
  return (
    <defs>
      {/* Ambient derinlik glow — silüet DEĞİL; nötr-soğuk indigo, çok düşük opacity, edge tam şeffaf */}
      <radialGradient id="hd-v3-ambient-grad" cx="50%" cy="42%" r="70%">
        <stop offset="0%" stopColor={AURA_V3.glow} stopOpacity={AURA_V3.peak} />
        <stop offset="55%" stopColor={AURA_V3.glow} stopOpacity={AURA_V3.mid} />
        <stop offset="100%" stopColor={AURA_V3.glow} stopOpacity={AURA_V3.edge} />
      </radialGradient>
    </defs>
  );
}
