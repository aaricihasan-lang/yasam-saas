// Premium BodyGraph V3 — merkez katmani (V3-4). Sekiller skeleton.centerZones'tan turer (deriveCenters).
// 9 merkez = 9 <polygon> (SADE gri, ici bos). circle/numara/renk/defined YOK. Ambient > channel > CENTER > (gate).

import { deriveCenters, CENTER_V3 } from "@/lib/human-design/bodygraph-v3";
import type { Skeleton } from "@/lib/human-design/bodygraph-v3";

export function CenterLayerV3({ skeleton }: { skeleton: Skeleton }) {
  const shapes = deriveCenters(skeleton);
  return (
    <g fill={CENTER_V3.fill} stroke={CENTER_V3.stroke} strokeWidth={CENTER_V3.strokeW} strokeLinejoin="round" aria-hidden="true">
      {shapes.map((s) => (
        <polygon key={s.name} points={s.points.map((p) => `${p.x},${p.y}`).join(" ")} />
      ))}
    </g>
  );
}
