"use client";

// FAZ 6 / ADIM 6b — Human Design BodyGraph (SVG, salt sunum).
// 6a doğrulanmış statik layout + deriveActivation. Yorum YOK, hesaplama YOK.
// Henüz sayfaya bağlı DEĞİL (6c'de bağlanacak).

import {
  deriveActivation,
  gateColor,
  type GateSide,
} from "@/lib/human-design/bodygraph/deriveActivation";
import {
  VIEWBOX,
  CENTER_SHAPES,
  GATE_ANCHORS,
  CHANNEL_SEGMENTS,
  CENTERS,
  type Point,
} from "@/lib/human-design/bodygraph/layout";
import type { CenterName } from "@/lib/human-design/engine/channels";
import type { HdChartResult } from "@/lib/human-design/engine/contract";

// Premium palet (Genetic Matrix kopyası DEĞİL; Yaşam Sistemi tonları).
const CENTER_FILL: Record<CenterName, string> = {
  Head: "#34d399",
  Ajna: "#10b981",
  Throat: "#6366f1",
  G: "#f59e0b",
  Heart: "#f43f5e",
  Spleen: "#14b8a6",
  SolarPlexus: "#fb923c",
  Sacral: "#ef4444",
  Root: "#78716c",
};

const RED = "#dc2626";
const BLACK = "#111827";

function ChannelHalf({ from, to, color }: { from: Point; to: Point; color: "black" | "red" | "both" | null }) {
  if (!color) return null;
  if (color === "both") {
    return (
      <>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={BLACK} strokeWidth={3} strokeLinecap="round" />
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={RED} strokeWidth={3} strokeDasharray="3 3" strokeLinecap="round" />
      </>
    );
  }
  return (
    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color === "red" ? RED : BLACK} strokeWidth={3} strokeLinecap="round" />
  );
}

export function BodyGraph({ result }: { result: HdChartResult }) {
  const { gateMap, definedChannels, definedCenters } = deriveActivation(result.activations);
  const definedCenterSet = new Set<CenterName>(definedCenters);
  const definedChannelIds = new Set(definedChannels.map((c) => c.id));
  const activeGates = Object.keys(gateMap).map(Number);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      className="mx-auto block h-auto w-full max-w-[360px]"
      role="img"
      aria-label="Human Design BodyGraph"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>Human Design BodyGraph</title>

      {/* Kanallar (arka planda) */}
      <g>
        {CHANNEL_SEGMENTS.map((seg) => {
          if (!definedChannelIds.has(seg.id)) {
            return (
              <line key={seg.id} x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke="#e2e8f0" strokeWidth={1.5} />
            );
          }
          const mid: Point = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
          return (
            <g key={seg.id}>
              <ChannelHalf from={seg.a} to={mid} color={gateColor(seg.gateA, gateMap)} />
              <ChannelHalf from={seg.b} to={mid} color={gateColor(seg.gateB, gateMap)} />
            </g>
          );
        })}
      </g>

      {/* Merkezler */}
      <g>
        {CENTERS.map((c) => {
          const shape = CENTER_SHAPES[c];
          const on = definedCenterSet.has(c);
          const pts = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <polygon
              key={c}
              points={pts}
              fill={on ? CENTER_FILL[c] : "#ffffff"}
              fillOpacity={on ? 0.92 : 1}
              stroke={on ? "#334155" : "#cbd5e1"}
              strokeWidth={1.5}
            />
          );
        })}
      </g>

      {/* Aktif kapı numaraları */}
      <g>
        {activeGates.map((g) => {
          const a = GATE_ANCHORS[g];
          if (!a) return null;
          const col = gateColor(g, gateMap);
          const fill = col === "red" ? RED : BLACK;
          const both = col === "both";
          return (
            <g key={g}>
              <circle cx={a.x} cy={a.y} r={5.6} fill={fill} stroke={both ? RED : fill} strokeWidth={both ? 2 : 0} />
              <text x={a.x} y={a.y + 2.3} textAnchor="middle" fontSize={6} fontWeight={700} fill="#ffffff">
                {g}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export type { GateSide };
