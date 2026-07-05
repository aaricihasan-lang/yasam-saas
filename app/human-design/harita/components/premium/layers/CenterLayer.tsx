// Premium BodyGraph V2 — merkez katmanı. 9 merkez → 9 <polygon> (invariant).

import type { CenterVM } from "@/lib/human-design/bodygraph-v2";
import { CenterShape } from "../primitives/CenterShape";

export function CenterLayer({ centers }: { centers: CenterVM[] }) {
  return (
    <g strokeLinejoin="round">
      {centers.map((c) => (
        <CenterShape key={c.name} name={c.name} defined={c.defined} />
      ))}
    </g>
  );
}
