"use client";

// Bireysel harita — Yaşam Sistemi PREMIUM BodyGraph (owner PASS 2026-10-18; aktif çizici, bkz. rendererConfig).
// Connection ile AYNI çizim (mühürlü V9 geometri, premium borular, referanstan ölçülen silüet, logo).
// Veri yalnız kayıtlı computed_result (premiumStateFromChart; kayıtlı listelerle birebir doğrulanır).
// Renk: Kişilik (bilinçli) mavi · Tasarım (bilinçsiz) turuncu · ikisi çizgili / iki renkli kapı.
// Salt görüntü (kanal seçimi yok); Design / Personality sütunları ve kartlar aynen kalır. Ekranda grafiğe logo çizilmez
// (owner kararı: bireysel haritada logo bilgi panelinin altında, sahnede değil); Word görselinde logo vardır.

import { useMemo } from "react";
import type { CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import { buildConnectionBodygraphScene, CBG_PERSON_COLOR, CBG_VIEW } from "@/lib/human-design/relations/connectionBodygraphScene";
import { HD_PREMIUM_INDIVIDUAL_TONE } from "@/lib/human-design/bodygraph/rendererConfig";
import { ConnectionBodygraph } from "@/app/human-design/iliski-grup/components/ConnectionBodygraph";

export const HD_PREMIUM_BODYGRAPH_ASPECT = `${CBG_VIEW.width} / ${CBG_VIEW.height}`;

export function HdPremiumBodygraph({ state }: { state: CbgState }) {
  const prims = useMemo(() => buildConnectionBodygraphScene(state), [state]);
  const pColor = CBG_PERSON_COLOR[HD_PREMIUM_INDIVIDUAL_TONE.personality];
  const dColor = CBG_PERSON_COLOR[HD_PREMIUM_INDIVIDUAL_TONE.design];
  return (
    <div className="flex h-full w-full flex-col" data-hd-premium-bodygraph="ready">
      <div className="min-h-0 flex-1">
        <ConnectionBodygraph prims={prims} label="Human Design BodyGraph" logoSrc={null} sizeClass="h-full w-full" />
      </div>
      <p className="m-0 mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-600" data-hd-premium-legend>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: pColor }} />Kişilik (bilinçli)</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: dColor }} />Tasarım (bilinçsiz)</span>
        <span>Çizgili / iki renkli: ikisi birden</span>
      </p>
    </div>
  );
}
