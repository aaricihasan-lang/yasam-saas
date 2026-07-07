// Premium BodyGraph V3 — kanal geometrisi (TAMAMEN skeleton'dan türer; V2 koordinat tablosu YOK).
//
// deriveChannels(skeleton) → 36 kanal path'i. Engine CHANNELS topolojiyi verir; geometri
// centerZones (port) + orbitalBands (dışa bow) + axisX'ten türer. Kanal uçları merkez-zon
// kenarındaki portlara oturur → V3-4 gate anchor bu portlarla hizalanacak (çift sistem yok).
//
// V3-3: routing anatomisi. Renk/casing/yarım-renk YOK (VM id ile ileride join edilebilir).

import { CHANNELS, type CenterName } from "@/lib/human-design/engine/channels";
import { buildSkeleton, type Skeleton, type CenterZone } from "../skeleton/skeleton";
import type { PointV3 } from "../skeleton/proportions";

export type ChannelGeoV3 = { id: string; kind: "spine" | "orbital"; d: string };

// Komşu merkezî çiftler (dikey omurga). pairKey alfabetik sıralı.
const SPINE_ADJ = new Set(["Ajna|Head", "Ajna|Throat", "G|Throat", "G|Sacral", "Root|Sacral"]);
const pairKey = (a: CenterName, b: CenterName): string => [a, b].sort().join("|");

const f = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(2));

/** Zonun, hedefe bakan kenarındaki port + dik fan ofseti (kardeş kanalları ayırır). */
function zonePort(z: CenterZone, toward: PointV3, fan: number): PointV3 {
  const dx = toward.x - z.cx;
  const dy = toward.y - z.cy;
  const sx = dx !== 0 ? z.halfW / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? z.halfH / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len; // dik birim
  const ny = dx / len;
  return { x: z.cx + dx * s + nx * fan, y: z.cy + dy * s + ny * fan };
}

/** Konsantrik band'in verilen y'deki yatay kenarı (axisX'ten uzaklık). */
function bandEdgeX(r: number, y: number, cy: number): number {
  const t = r * r - (y - cy) * (y - cy);
  return t > 0 ? Math.sqrt(t) : 0;
}

export function deriveChannels(sk: Skeleton = buildSkeleton()): ChannelGeoV3[] {
  const zones = sk.centerZones;
  const oc = sk.orbitalBands.center;
  const radii = sk.orbitalBands.radii;
  const A = sk.axisX;

  // Çift bazlı toplam + fan sırası.
  const pairTotal = new Map<string, number>();
  for (const c of CHANNELS) {
    const k = pairKey(c.centerA, c.centerB);
    pairTotal.set(k, (pairTotal.get(k) ?? 0) + 1);
  }
  const seen = new Map<string, number>();

  return CHANNELS.map((c) => {
    const k = pairKey(c.centerA, c.centerB);
    const n = pairTotal.get(k) ?? 1;
    const idx = seen.get(k) ?? 0;
    seen.set(k, idx + 1);

    const zA = zones[c.centerA];
    const zB = zones[c.centerB];
    // De-tangle: fan yayılımını kıs (yıldız patlaması yok; kontrollü paralel akış).
    const spread = Math.min(zA.halfW, zB.halfW) * 0.55; // (1.2 → 0.55)
    const fan = n > 1 ? ((idx - (n - 1) / 2) / Math.max(1, n - 1)) * spread : 0;

    const nodeA: PointV3 = { x: zA.cx, y: zA.cy };
    const nodeB: PointV3 = { x: zB.cx, y: zB.cy };
    const pA = zonePort(zA, nodeB, fan);
    const pB = zonePort(zB, nodeA, fan);

    if (SPINE_ADJ.has(k)) {
      // Dikey omurga → düz (fan ile paralel kolon çizgileri).
      return { id: c.id, kind: "spine", d: `M ${f(pA.x)} ${f(pA.y)} L ${f(pB.x)} ${f(pB.y)}` };
    }

    // Orbital → band-türevli dışa bow (konsantrik kaburga). De-tangle: band = reach'ı saran EN DAR
    // band (kısa kanal iç band / uzun kanal dış band → doğal iç içe geçiş, kesişim azalır).
    // Kardeş cycling KALDIRILDI (band scramble yapıyordu); kardeşler port fan'ıyla ayrılır.
    const mid: PointV3 = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
    const outSign = Math.sign(mid.x - A) || 1;
    const reach = Math.max(Math.abs(pA.x - A), Math.abs(pB.x - A));
    let bi = radii.findIndex((r) => bandEdgeX(r, mid.y, oc.y) >= reach + 6);
    if (bi < 0) bi = radii.length - 1;
    const bx = bandEdgeX(radii[bi], mid.y, oc.y);
    const ctrl: PointV3 = { x: A + outSign * bx, y: mid.y };
    return { id: c.id, kind: "orbital", d: `M ${f(pA.x)} ${f(pA.y)} Q ${f(ctrl.x)} ${f(ctrl.y)} ${f(pB.x)} ${f(pB.y)}` };
  });
}
