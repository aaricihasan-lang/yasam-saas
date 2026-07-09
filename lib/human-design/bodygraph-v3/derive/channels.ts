// Premium BodyGraph V3 — kanal geometrisi (Channel Routing Refactor · iterasyon-2). Kanallar BAGIMSIZ
// bezier URETMEZ; paylasilan RAY (routes.ts) sistemine oturur. Ayni merkez-cifti -> AYNI path.
//
// Orbital kanal = atanan band yaricapinda GERCEK dairesel yay (merkez-tabanli), oc'den DISA bombeli.
//   · Yatay kordlarda bile dik kavis uretir (stray/duz cizgi yok, minimum kavis garanti).
//   · Ayni band -> ayni yaricap -> ayni egrilik (paralel rib akisi).
//   · Band secimi KORD UZUNLUGUNA gore: kisa->ic, orta->orta, uzun->dis (dis banda yigilma yok).
// Spine kanal = dikey omurga segmenti. Fan YOK. Topoloji engine CHANNELS'ten (36, birebir).

import { CHANNELS, type CenterName } from "@/lib/human-design/engine/channels";
import { buildSkeleton, type Skeleton, type CenterZone } from "../skeleton/skeleton";
import type { PointV3 } from "../skeleton/proportions";
import { catmullRomOpen } from "./routes";

export type ChannelGeoV3 = { id: string; kind: "spine" | "orbital"; routeId: string; d: string };

// Komsu merkezî ciftler (dikey omurga). pairKey alfabetik sirali.
const SPINE_ADJ = new Set(["Ajna|Head", "Ajna|Throat", "G|Throat", "G|Sacral", "Root|Sacral"]);
const pairKey = (a: CenterName, b: CenterName): string => [a, b].sort().join("|");

const f = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(2));

// Band secim esikleri (port-tabanli kord uzunlugu). Kisa->band0(ic), orta->band1, uzun->band2(dis).
const LEN_INNER = 135;
const LEN_MID = 210;
const ARC_SAMPLES = 16;

/** Zonun, hedefe bakan kenarindaki port (fan YOK -> cift bazli deterministik, paylasim icin). */
function zonePort(z: CenterZone, toward: PointV3): PointV3 {
  const dx = toward.x - z.cx;
  const dy = toward.y - z.cy;
  const sx = dx !== 0 ? z.halfW / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? z.halfH / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: z.cx + dx * s, y: z.cy + dy * s };
}

/**
 * pA->pB arasi, yaricapi R (band) olan dairesel yay; oc'den DISA bombeli (minor arc).
 * Merkez-tabanli: yatay kord dahil her durumda pürüzsüz yay (t-parametrizasyon, y-lerp DEGIL).
 */
function orbitalArc(R: number, pA: PointV3, pB: PointV3, oc: PointV3): string {
  const mx = (pA.x + pB.x) / 2;
  const my = (pA.y + pB.y) / 2;
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const chord = Math.hypot(dx, dy) || 1;
  const r = Math.max(R, chord / 2 + 1); // gecerli yay (R >= yarim kord)
  const half = chord / 2;
  const apo = Math.sqrt(Math.max(0, r * r - half * half)); // merkez-kord uzakligi
  // birim dik
  let nx = -dy / chord;
  let ny = dx / chord;
  // DISA yon = oc'den uzaklasan taraf
  const ox = mx - oc.x;
  const oy = my - oc.y;
  if (nx * ox + ny * oy < 0) {
    nx = -nx;
    ny = -ny;
  }
  // cember merkezi bombenin KARSI tarafinda -> yay disa (oc'den uzaga) bomber
  const cx = mx - nx * apo;
  const cy = my - ny * apo;
  const aA = Math.atan2(pA.y - cy, pA.x - cx);
  const aB = Math.atan2(pB.y - cy, pB.x - cx);
  let da = aB - aA;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI; // minor arc (kisa yon)
  const pts: PointV3[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const a = aA + (da * i) / ARC_SAMPLES;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return catmullRomOpen(pts);
}

export function deriveChannels(sk: Skeleton = buildSkeleton()): ChannelGeoV3[] {
  const zones = sk.centerZones;
  const oc = sk.orbitalBands.center;
  const radii = sk.orbitalBands.radii;
  const A = sk.axisX;

  return CHANNELS.map((c) => {
    const k = pairKey(c.centerA, c.centerB);
    // Kanonik (alfabetik) yon: gate sirasindan bagimsiz -> ayni cift kanallari AYNI path (paylasim).
    const [c1, c2] = [c.centerA, c.centerB].sort() as CenterName[];
    const zA = zones[c1];
    const zB = zones[c2];
    const nodeA: PointV3 = { x: zA.cx, y: zA.cy };
    const nodeB: PointV3 = { x: zB.cx, y: zB.cy };
    const pA = zonePort(zA, nodeB);
    const pB = zonePort(zB, nodeA);

    if (SPINE_ADJ.has(k)) {
      // Dikey omurga rayi → duz segment (ayni cift kanallari ayni kolon path'ini paylasir).
      return { id: c.id, kind: "spine", routeId: "spine", d: `M ${f(pA.x)} ${f(pA.y)} L ${f(pB.x)} ${f(pB.y)}` };
    }

    // Orbital → kord uzunluguna gore band; band yaricapinda dairesel yay (oc'den disa bombeli).
    const len = Math.hypot(pB.x - pA.x, pB.y - pA.y);
    let bi = len < LEN_INNER ? 0 : len < LEN_MID ? 1 : 2;
    bi = Math.min(bi, radii.length - 1);
    const side = Math.sign((pA.x + pB.x) / 2 - A) || 1;
    const routeId = `arc:${side < 0 ? "L" : "R"}:${bi}`;
    const d = orbitalArc(radii[bi], pA, pB, oc);
    return { id: c.id, kind: "orbital", routeId, d };
  });
}
