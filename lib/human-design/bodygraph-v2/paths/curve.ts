// Premium BodyGraph V2 — eğri matematiği (saf fonksiyonlar).
//
// Kavisli kanal kontrol noktası (gövde ekseninden DIŞA bow ofseti) + kuadratik
// bézier'in t=0.5'te De Casteljau ile iki yarıya bölünmesi (yarım-renk için).

import type { PointV2 } from "../geometry/viewbox";

/** BodyGraph dikey gövde ekseni (viewBox 460 → orta 230). Bow dışa buradan referanslı. */
export const AXIS_X = 230;

const mid = (p: PointV2, q: PointV2): PointV2 => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/**
 * Kuadratik kontrol noktası: orta noktadan segmente DİK, gövde ekseninden DIŞA `bow` kadar.
 * Sol grup (mid.x<230) sola, sağ grup sağa bükülür → konsantrik orbital his.
 */
export function controlPoint(a: PointV2, b: PointV2, bow: number): PointV2 {
  const m = mid(a, b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Segmente dik birim vektör (+90° döndürülmüş).
  let px = -dy / len;
  let py = dx / len;
  // Dışa garanti: perp.x, (mid.x - eksen) ile aynı işarette olsun.
  const sign = Math.sign(m.x - AXIS_X) || 1;
  if (px * sign < 0) {
    px = -px;
    py = -py;
  }
  return { x: m.x + px * bow, y: m.y + py * bow };
}

/**
 * Kuadratik (a, c, b) bézier'i t=0.5'te iki kuadratiğe böler (De Casteljau):
 *   yarım A: (a, cA, mid)   ·   yarım B: (b, cB, mid)
 * mid = t=0.5 noktası (her iki yarımın ortak ucu).
 */
export function splitQuadratic(
  a: PointV2,
  c: PointV2,
  b: PointV2,
): { mid: PointV2; cA: PointV2; cB: PointV2 } {
  const cA = mid(a, c);
  const cB = mid(c, b);
  return { mid: mid(cA, cB), cA, cB };
}
