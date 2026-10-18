"use client";

// Transit BodyGraph — mevcut premium sahne + etkileşimli bileşen AYNEN kullanılır (geometri / renk / çizim değişmez).
// Yalnız girdi durumu transit verisinden gelir (lib/human-design/transit/transitScene). Seçilen kanalın ayrıntısı
// çağıranın verdiği describe() ile grafiğin altındaki panelde.

import { useMemo, useState, type ReactNode } from "react";
import { ConnectionBodygraph } from "@/app/human-design/iliski-grup/components/ConnectionBodygraph";
import { HD_CHART_LOGO_SRC } from "@/app/human-design/kayitli-haritalar/components/HdChartInfoPanel";
import { buildConnectionBodygraphScene, type CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import { transitChannelLabel } from "@/lib/human-design/transit/transitLabels";
import { CHANNELS } from "@/lib/human-design/engine/channels";

const CHANNEL_NAME = new Map(CHANNELS.map((c) => [c.id, c.name]));

export function TransitBodygraphPanel({
  state,
  label,
  describe,
  hint,
  legend,
  testId,
}: {
  state: CbgState;
  label: string;
  describe: (channelId: string) => ReactNode;
  hint: string;
  legend: ReactNode;
  testId: string;
}) {
  const prims = useMemo(() => buildConnectionBodygraphScene(state), [state]);
  const [sel, setSel] = useState<string | null>(null);
  const definedIds = Object.values(state.channels).filter((c) => c.state === "defined").map((c) => c.id).sort().join(",");
  const halfIds = Object.values(state.channels).filter((c) => c.state === "half").map((c) => c.id).sort().join(",");
  return (
    <div data-hd-transit-graph={testId} data-hd-transit-defined={definedIds} data-hd-transit-half={halfIds}>
      <ConnectionBodygraph
        prims={prims}
        logoSrc={HD_CHART_LOGO_SRC}
        label={label}
        selected={sel}
        onSelect={setSel}
        channelLabel={(id) => transitChannelLabel(id, CHANNEL_NAME.get(id) ?? "")}
      />
      <div className="mt-2 min-h-[64px] rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs" aria-live="polite" data-hd-transit-info={sel ?? ""}>
        {sel ? describe(sel) : <p className="text-slate-500">{hint}</p>}
      </div>
      <ul className="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2" data-hd-transit-legend>
        {legend}
      </ul>
    </div>
  );
}
