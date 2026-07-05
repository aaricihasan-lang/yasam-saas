// Premium BodyGraph V2 — gate katmanı.
//   aktif gate → GateBadge (1 <circle>)  ·  pasif gate → GateLabel (yalnız <text>)
// → circle sayısı = aktif gate = N (invariant). coloredBg = gate'in merkezi tanımlı mı.

import type { CenterName } from "@/lib/human-design/engine/channels";
import type { BodyGraphViewModel } from "@/lib/human-design/bodygraph-v2";
import { GATE_ANCHORS_V2 } from "@/lib/human-design/bodygraph-v2";
import { GateBadge } from "../primitives/GateBadge";
import { GateLabel } from "../primitives/GateLabel";

export function GateLayer({ vm }: { vm: BodyGraphViewModel }) {
  const definedCenters = new Set<CenterName>(
    vm.centers.filter((c) => c.defined).map((c) => c.name),
  );

  return (
    <g>
      {vm.gates.map((g) => {
        const a = GATE_ANCHORS_V2[g.gate];
        if (!a) return null;
        if (g.active && g.color) {
          return <GateBadge key={g.gate} gate={g.gate} x={a.x} y={a.y} color={g.color} />;
        }
        return (
          <GateLabel
            key={g.gate}
            gate={g.gate}
            x={a.x}
            y={a.y}
            coloredBg={definedCenters.has(g.center)}
          />
        );
      })}
    </g>
  );
}
