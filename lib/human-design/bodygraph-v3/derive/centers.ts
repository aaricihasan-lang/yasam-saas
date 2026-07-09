// Premium BodyGraph V3 — merkez sekilleri (V3-4). TAMAMEN skeleton.centerZones'tan turer;
// elle koordinat YOK. Her merkez = zone {cx,cy,halfW,halfH} + tekduze inset -> polygon noktalari.
//
// Sekil turu/orani kucuk bir SPEC map'te (koordinat degil). Yonler KLASIK HD:
//   Head/Ajna asagi ucgen · Throat/Sacral kare · G elmas · Root yukari-daralan trapez ·
//   Spleen (sol merkez) uc SAGA · SolarPlexus/Heart (sag merkez) uc SOLA (dik kenar dis tarafta).
// polygon KULLANIR (9 adet); circle YOK. Numara/renk/defined bu fazda YOK.

import { CENTERS, type CenterName } from "@/lib/human-design/engine/channels";
import { buildSkeleton, type Skeleton } from "../skeleton/skeleton";
import type { PointV3 } from "../skeleton/proportions";

export type CenterShapeV3 = { name: CenterName; points: PointV3[] };

type Kind = "triDown" | "square" | "diamond" | "triLeft" | "triRight" | "trapUp";

// Sekil spec'i (tur + Root icin trapez daralmasi). KOORDINAT icermez.
const SPEC: Record<CenterName, { kind: Kind; trap?: number }> = {
  Head: { kind: "triDown" },
  Ajna: { kind: "triDown" },
  Throat: { kind: "square" },
  G: { kind: "diamond" },
  Heart: { kind: "triLeft" }, // uc sola, kucuklugu zaten kucuk zone'undan gelir
  Spleen: { kind: "triRight" }, // uc saga (merkeze)
  SolarPlexus: { kind: "triLeft" }, // uc sola (merkeze)
  Sacral: { kind: "square" },
  Root: { kind: "trapUp", trap: 0.32 },
};

// Tum merkezlere tekduze inset: sekiller zone icinde kalir, birbirine degmez, kanal boslugunu kapatmaz.
const INSET = 0.12;

export function deriveCenters(sk: Skeleton = buildSkeleton()): CenterShapeV3[] {
  return CENTERS.map((name) => {
    const z = sk.centerZones[name];
    const s = SPEC[name];
    const ihw = z.halfW * (1 - INSET);
    const ihh = z.halfH * (1 - INSET);
    const L = z.cx - ihw;
    const R = z.cx + ihw;
    const T = z.cy - ihh;
    const B = z.cy + ihh;
    const cx = z.cx;
    const cy = z.cy;
    const P = (x: number, y: number): PointV3 => ({ x, y });

    let points: PointV3[];
    switch (s.kind) {
      case "triDown":
        points = [P(L, T), P(R, T), P(cx, B)];
        break;
      case "diamond":
        points = [P(cx, T), P(R, cy), P(cx, B), P(L, cy)];
        break;
      case "triLeft": // dik kenar sagda, uc solda
        points = [P(R, T), P(R, B), P(L, cy)];
        break;
      case "triRight": // dik kenar solda, uc sagda
        points = [P(L, T), P(L, B), P(R, cy)];
        break;
      case "trapUp": {
        const ti = ihw * (s.trap ?? 0.3);
        points = [P(L + ti, T), P(R - ti, T), P(R, B), P(L, B)];
        break;
      }
      case "square":
      default:
        points = [P(L, T), P(R, T), P(R, B), P(L, B)];
        break;
    }
    return { name, points };
  });
}
