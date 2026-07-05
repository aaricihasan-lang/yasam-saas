// Premium BodyGraph V3 — iskelet debug görselleştirmesi (yalnız GELİŞTİRME).
//
// Spine ekseni + merkez zonları + node çarpıları + orbital bantlar + yan slotlar + silüet.
// YALNIZ <line>/<rect>/<path> kullanır → polygon=0 / circle=0 korunur.
// V3-2'de kapatılır (PremiumBodyGraphV3 DEBUG_SKELETON=false); prod finalde kaldırılır.

import { CENTERS } from "@/lib/human-design/engine/channels";
import type { Skeleton } from "@/lib/human-design/bodygraph-v3";

const cross = (x: number, y: number, r = 4) =>
  `M ${x - r} ${y} L ${x + r} ${y} M ${x} ${y - r} L ${x} ${y + r}`;

export function SkeletonDebug({ s }: { s: Skeleton }) {
  const o = s.orbitalBands;
  return (
    <g aria-hidden="true" fill="none">
      {/* spine ekseni */}
      <line
        x1={s.axisX}
        y1={s.metrics.bodyTop}
        x2={s.axisX}
        y2={s.metrics.bodyBottom}
        stroke="#64748b"
        strokeOpacity={0.5}
        strokeDasharray="3 6"
      />

      {/* orbital kaburga bantları (üst yarım yay) */}
      {o.radii.map((r, i) => (
        <path
          key={`band-${i}`}
          d={`M ${o.center.x - r} ${o.center.y} A ${r} ${r} 0 0 1 ${o.center.x + r} ${o.center.y}`}
          stroke="#f59e0b"
          strokeOpacity={0.32}
        />
      ))}

      {/* merkez zonları (rect) + node çarpısı */}
      {CENTERS.map((c) => {
        const z = s.centerZones[c];
        return (
          <g key={c}>
            <rect
              x={z.cx - z.halfW}
              y={z.cy - z.halfH}
              width={z.halfW * 2}
              height={z.halfH * 2}
              rx={5}
              stroke="#38bdf8"
              strokeOpacity={0.6}
            />
            <path d={cross(z.cx, z.cy)} stroke="#38bdf8" strokeOpacity={0.9} />
          </g>
        );
      })}
    </g>
  );
}
