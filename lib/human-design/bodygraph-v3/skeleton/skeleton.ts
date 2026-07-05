// Premium BodyGraph V3 — buildSkeleton (BODY_PROPORTIONS → somut iskelet primitifleri).
//
// Saf fonksiyon; parametreleri spine node / center zone / side slot / orbital band / silüet /
// metrics'e çözer. V3-2..5 derive'ları (aura/merkez/anchor/kanal) bunu okuyacak.

import { CENTERS, type CenterName } from "@/lib/human-design/engine/channels";
import { BODY_PROPORTIONS, type PointV3 } from "./proportions";

export type CenterZone = { cx: number; cy: number; halfW: number; halfH: number };

export type Skeleton = {
  viewBox: { width: number; height: number };
  axisX: number;
  spineNodes: Record<CenterName, PointV3>;
  centerZones: Record<CenterName, CenterZone>;
  sideSlots: Record<"Spleen" | "SolarPlexus" | "Heart", PointV3>;
  orbitalBands: { center: PointV3; radii: number[] };
  silhouette: typeof BODY_PROPORTIONS.silhouette;
  metrics: { columnMaxWidth: number; bodyTop: number; bodyBottom: number };
};

export function buildSkeleton(p = BODY_PROPORTIONS): Skeleton {
  const spineNodes = {} as Record<CenterName, PointV3>;
  const centerZones = {} as Record<CenterName, CenterZone>;

  for (const c of CENTERS) {
    let cx: number;
    let cy: number;
    if (c === "Spleen" || c === "SolarPlexus" || c === "Heart") {
      cx = p.sideSlot[c].x;
      cy = p.sideSlot[c].y;
    } else {
      cx = p.axisX;
      cy = p.spineY[c];
    }
    const z = p.centerZone[c];
    spineNodes[c] = { x: cx, y: cy };
    centerZones[c] = { cx, cy, halfW: z.hw, halfH: z.hh };
  }

  return {
    viewBox: p.viewBox,
    axisX: p.axisX,
    spineNodes,
    centerZones,
    sideSlots: p.sideSlot,
    orbitalBands: p.orbital,
    silhouette: p.silhouette,
    metrics: {
      columnMaxWidth: p.centerZone.G.hw * 2,
      bodyTop: p.spineY.Head - p.centerZone.Head.hh,
      bodyBottom: p.spineY.Root + p.centerZone.Root.hh,
    },
  };
}
