"use client";

// Premium BodyGraph V3 — skeleton-driven render (sıfırdan; V2'den bağımsız).
//
// V3-0 (iskele): yalnız <svg 480×800> + a11y + placeholder. Skeleton/aura/kanal/merkez
// V3-1+ eklenecek. Eski BodyGraph / V2 ile AYNI imza ({ result }) → geçiş tek satır.
// Sayfaya yalnız BodyGraphSwitch üzerinden ?bg=v3 ile bağlanır (varsayılan V1).

import { useMemo } from "react";
import { buildViewModelV3, VIEWBOX_V3 } from "@/lib/human-design/bodygraph-v3";
import type { HdChartResult } from "@/lib/human-design/engine/contract";

export function PremiumBodyGraphV3({ result }: { result: HdChartResult }) {
  const vm = useMemo(() => buildViewModelV3(result), [result]);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_V3.width} ${VIEWBOX_V3.height}`}
      className="mx-auto block h-auto w-full max-w-[380px] xl:h-full xl:w-auto xl:max-w-none"
      role="img"
      aria-labelledby="hd-v3-title hd-v3-desc"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id="hd-v3-title">Human Design BodyGraph (Premium V3)</title>
      <desc id="hd-v3-desc">
        {`${vm.meta.definedCenters} tanımlı merkez, ${vm.meta.definedChannels} tanımlı kanal, ${vm.meta.activeGates} aktif kapı.`}
      </desc>

      {/* V3-0 TEMP placeholder — tuval sınırı (480×800). V3-2'de gerçek aura silüeti ile değişecek.
          <rect>: polygon/circle DEĞİL → invariant'ı etkilemez. */}
      <rect
        x={1}
        y={1}
        width={VIEWBOX_V3.width - 2}
        height={VIEWBOX_V3.height - 2}
        rx={18}
        fill="none"
        stroke="#334155"
        strokeOpacity={0.35}
        strokeDasharray="4 6"
        aria-hidden="true"
      />
    </svg>
  );
}
