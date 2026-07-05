"use client";

// Premium BodyGraph V2 — sıfırdan render katmanı.
//
// V2-2: PremiumDefs + CenterLayer (9 polygon) + GateLayer (pasif text + aktif circle).
// Kanal render V2-3, gerçek aura V2-4. Eski BodyGraph ile AYNI imza ({ result }) →
// geçiş tek satır import. Motor/compute/API'ye yalnız VM üzerinden bağlı.

import { useMemo } from "react";
import { buildViewModel, VIEWBOX_V2 } from "@/lib/human-design/bodygraph-v2";
import type { HdChartResult } from "@/lib/human-design/engine/contract";
import { PremiumDefs } from "./defs/PremiumDefs";
import { CenterLayer } from "./layers/CenterLayer";
import { GateLayer } from "./layers/GateLayer";

export function PremiumBodyGraph({ result }: { result: HdChartResult }) {
  const vm = useMemo(() => buildViewModel(result), [result]);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_V2.width} ${VIEWBOX_V2.height}`}
      className="mx-auto block h-auto w-full max-w-[420px] xl:h-full xl:w-auto xl:max-w-none"
      role="img"
      aria-labelledby="hd-v2-title hd-v2-desc"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id="hd-v2-title">Human Design BodyGraph (Premium V2)</title>
      <desc id="hd-v2-desc">
        {`${vm.meta.definedCenters} tanımlı merkez, ${vm.meta.definedChannels} tanımlı kanal, ${vm.meta.activeGates} aktif kapı.`}
      </desc>

      {/* Katman sırası (arka→ön): defs → aura(placeholder) → [kanal V2-3] → merkez → gate */}
      <PremiumDefs />

      {/* Aura placeholder — V2-4'te gerçek silüet path'i ile değişecek.
          <rect>: polygon/circle DEĞİL → invariant'ı etkilemez. */}
      <rect
        x={1}
        y={1}
        width={VIEWBOX_V2.width - 2}
        height={VIEWBOX_V2.height - 2}
        rx={18}
        fill="none"
        stroke="#334155"
        strokeOpacity={0.35}
        strokeDasharray="4 6"
        aria-hidden="true"
      />

      <CenterLayer centers={vm.centers} />
      <GateLayer vm={vm} />
    </svg>
  );
}
