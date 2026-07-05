"use client";

// Premium BodyGraph V3 — skeleton-driven render (sıfırdan; V2'den bağımsız).
//
// V3-1: skeleton-driven iskelet + DEBUG görsel. Aura/kanal/merkez/gate V3-2+ skeleton'dan
// türeyecek. Eski BodyGraph / V2 ile AYNI imza ({ result }) → geçiş tek satır.
// Sayfaya yalnız BodyGraphSwitch üzerinden ?bg=v3 ile bağlanır (varsayılan V1).

import { useMemo } from "react";
import { buildViewModelV3, buildSkeleton, VIEWBOX_V3 } from "@/lib/human-design/bodygraph-v3";
import type { HdChartResult } from "@/lib/human-design/engine/contract";
import { SkeletonDebug } from "./debug/SkeletonDebug";

// V3-1: iskelet debug görünür. V3-2'de false (aura başlayınca). Prod finalde kaldırılır.
const DEBUG_SKELETON = true;

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

      {/* V3-1 iskelet debug (yalnız line/rect/path → polygon=0/circle=0 korunur).
          Gerçek aura/kanal/merkez/gate V3-2+ skeleton'dan türeyecek. */}
      {DEBUG_SKELETON && <SkeletonDebug s={skeleton} />}
    </svg>
  );
}
