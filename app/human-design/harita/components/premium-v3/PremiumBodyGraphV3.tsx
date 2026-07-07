"use client";

// Premium BodyGraph V3 — skeleton-driven render (sıfırdan; V2'den bağımsız).
//
// V3-2: skeleton'dan türeyen mor tall aura silüeti. Kanal/merkez/gate V3-3+ (yine skeleton'dan).
// Eski BodyGraph / V2 ile AYNI imza ({ result }) → geçiş tek satır.
// Sayfaya yalnız BodyGraphSwitch üzerinden ?bg=v3 ile bağlanır (varsayılan V1).

import { useMemo } from "react";
import { buildViewModelV3, buildSkeleton, VIEWBOX_V3 } from "@/lib/human-design/bodygraph-v3";
import type { HdChartResult } from "@/lib/human-design/engine/contract";
import { PremiumDefsV3 } from "./defs/PremiumDefsV3";
import { AuraLayerV3 } from "./layers/AuraLayerV3";
import { ChannelLayerV3 } from "./layers/ChannelLayerV3";
import { SkeletonDebug } from "./debug/SkeletonDebug";

// Geliştirme flag'i: iskelet debug (V3-1). V3-2'de kapalı. Prod finalde kaldırılır.
const DEBUG_SKELETON = false;

export function PremiumBodyGraphV3({ result }: { result: HdChartResult }) {
  const vm = useMemo(() => buildViewModelV3(result), [result]);
  const skeleton = useMemo(() => buildSkeleton(), []);

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

      {/* Katman sırası: aura → kanal → [merkez V3-4] → [gate]. Hepsi skeleton'dan türer. */}
      <PremiumDefsV3 />
      <AuraLayerV3 skeleton={skeleton} />
      <ChannelLayerV3 skeleton={skeleton} />

      {/* Geliştirme: iskelet debug (line/rect/path → polygon=0/circle=0). Prod'da yok. */}
      {DEBUG_SKELETON && <SkeletonDebug s={skeleton} />}
    </svg>
  );
}
