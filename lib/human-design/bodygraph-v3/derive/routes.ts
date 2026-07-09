// Premium BodyGraph V3 — paylasilan RAY (rib) kaydi (V3-5 oncesi Channel Routing Refactor).
//
// Amac: kanal basina bagimsiz egri DEGIL; az sayida PAYLASILAN konsantrik yay (rib) + dikey omurga.
// Kanallar (channels.ts) bu raylarin SEGMENTLERINI kullanir; ayni rayi paylasanlar ayni path'i alir.
//
// Raylar TAMAMEN skeleton'dan turer: orbitalBands (konsantrik oval ailesi) + axisX + sabit rib araligi.
// Ham raylar AYRI cizilmez (yalniz kanallar gorunur); bu kayit rota kaynagi + ortak sampler'dir.

import { buildSkeleton, type Skeleton } from "../skeleton/skeleton";
import type { PointV3 } from "../skeleton/proportions";

export type RouteSide = -1 | 1; // -1 sol, +1 sag
export type RouteV3 = {
  id: string;
  kind: "spine" | "arc";
  side?: RouteSide;
  band?: number; // orbitalBands index (0 ic .. n-1 dis)
  d: string;
};

// Rib dikey araligi (SABIT tam-boy): Throat ~ Root. centerZones'a bagli DEGIL (kilit karar).
export const RIB_TOP_Y = 330;
export const RIB_BOTTOM_Y = 720;
const ARC_SAMPLES = 24;

const f = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(2));

/** Konsantrik oval band'in y yuksekligindeki eksenden yatay yaricapi (r, merkez ocY). */
export function bandEdgeX(r: number, y: number, ocY: number): number {
  const t = r * r - (y - ocY) * (y - ocY);
  return t > 0 ? Math.sqrt(t) : 0;
}

/** Kapali OLMAYAN Catmull-Rom -> cubic bezier (pürüzsüz acik yay). Kanallar da bunu paylasir. */
export function catmullRomOpen(pts: PointV3[]): string {
  const n = pts.length;
  if (n < 2) return "";
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** Bir band+taraf yayinin [yTop,yBot] arasindaki noktalarini ornekle (ortak sampler). */
export function sampleArc(
  r: number,
  side: RouteSide,
  ocY: number,
  axisX: number,
  yTop: number,
  yBot: number,
  samples = ARC_SAMPLES,
): PointV3[] {
  const pts: PointV3[] = [];
  for (let i = 0; i <= samples; i++) {
    const y = yTop + ((yBot - yTop) * i) / samples;
    pts.push({ x: axisX + side * bandEdgeX(r, y, ocY), y });
  }
  return pts;
}

export function deriveRoutes(sk: Skeleton = buildSkeleton()): RouteV3[] {
  const A = sk.axisX;
  const ocY = sk.orbitalBands.center.y;
  const radii = sk.orbitalBands.radii;

  const routes: RouteV3[] = [
    // dikey omurga rayi (merkezi kolon)
    { id: "spine", kind: "spine", d: `M ${f(A)} ${f(RIB_TOP_Y)} L ${f(A)} ${f(RIB_BOTTOM_Y)}` },
  ];
  // konsantrik yan yaylar: her taraf x her band = paylasilan rib
  for (const side of [-1, 1] as RouteSide[]) {
    radii.forEach((r, band) => {
      const pts = sampleArc(r, side, ocY, A, RIB_TOP_Y, RIB_BOTTOM_Y);
      routes.push({ id: `arc:${side < 0 ? "L" : "R"}:${band}`, kind: "arc", side, band, d: catmullRomOpen(pts) });
    });
  }
  return routes; // 1 spine + 2*radii arc (varsayilan 3 band -> 7 ray)
}
