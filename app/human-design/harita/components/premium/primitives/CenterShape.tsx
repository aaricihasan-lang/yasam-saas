// Premium BodyGraph V2 — tek merkez primitifi. TAM 1 <polygon> üretir (invariant: 9 merkez → polygon=9).

import type { CenterName } from "@/lib/human-design/engine/channels";
import { CENTER_GEOMETRY, GATE } from "@/lib/human-design/bodygraph-v2";

export function CenterShape({ name, defined }: { name: CenterName; defined: boolean }) {
  const pts = CENTER_GEOMETRY[name].points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <polygon
      points={pts}
      fill={defined ? `url(#hd-v2-center-${name})` : "url(#hd-v2-center-open)"}
      fillOpacity={1}
      stroke={defined ? GATE.centerStrokeOn : GATE.centerStrokeOff}
      strokeWidth={defined ? 1.7 : 1.3}
      strokeOpacity={defined ? 0.9 : 1}
      strokeLinejoin="round"
      filter={defined ? "url(#hd-v2-center-shadow)" : undefined}
    />
  );
}
