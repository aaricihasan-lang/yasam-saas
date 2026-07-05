// Premium BodyGraph V2 — kanal path string üreticileri (saf fonksiyonlar).
//
//   channelFullPath  → tam path (casing/gölge/knockout; dikişsiz tek stroke)
//   channelHalfPaths → iki yarım path (renkli gövde + sheen; iki-ton, De Casteljau split)
// Düz (bow=0) → L; kavisli (bow>0) → Q (kontrol noktası curve.ts'ten).

import type { ChannelPathV2 } from "../geometry/channels";
import { controlPoint, splitQuadratic } from "./curve";

const f = (n: number): string => Number.isInteger(n) ? `${n}` : n.toFixed(2);

/** Tam kanal path'i (a→b). Dikişsiz → casing/gölge/knockout katmanları için. */
export function channelFullPath(seg: ChannelPathV2): string {
  if (seg.bow > 0) {
    const c = controlPoint(seg.a, seg.b, seg.bow);
    return `M ${f(seg.a.x)} ${f(seg.a.y)} Q ${f(c.x)} ${f(c.y)} ${f(seg.b.x)} ${f(seg.b.y)}`;
  }
  return `M ${f(seg.a.x)} ${f(seg.a.y)} L ${f(seg.b.x)} ${f(seg.b.y)}`;
}

/**
 * İki yarım path (A gate'inden ortaya, B gate'inden ortaya). İki-ton renk için.
 * Düz → orta noktaya düz çizgi; kavisli → De Casteljau ile bölünmüş kuadratikler.
 */
export function channelHalfPaths(seg: ChannelPathV2): { aPath: string; bPath: string } {
  if (seg.bow > 0) {
    const c = controlPoint(seg.a, seg.b, seg.bow);
    const { mid, cA, cB } = splitQuadratic(seg.a, c, seg.b);
    return {
      aPath: `M ${f(seg.a.x)} ${f(seg.a.y)} Q ${f(cA.x)} ${f(cA.y)} ${f(mid.x)} ${f(mid.y)}`,
      bPath: `M ${f(seg.b.x)} ${f(seg.b.y)} Q ${f(cB.x)} ${f(cB.y)} ${f(mid.x)} ${f(mid.y)}`,
    };
  }
  const mx = (seg.a.x + seg.b.x) / 2;
  const my = (seg.a.y + seg.b.y) / 2;
  return {
    aPath: `M ${f(seg.a.x)} ${f(seg.a.y)} L ${f(mx)} ${f(my)}`,
    bPath: `M ${f(seg.b.x)} ${f(seg.b.y)} L ${f(mx)} ${f(my)}`,
  };
}
