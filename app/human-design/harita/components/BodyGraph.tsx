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

// FAZ 7B — kanal görsel katmanı (yalnız çizim kalitesi; koordinat/topoloji sabit).
const TRACK = "#e5e7eb";   // tanımsız kanal + tanımlı kanal casing (groove) tonu
const CH_DEFINED = 3.2;    // tanımlı kanal renkli stroke
const CH_CASING = 5.4;     // tanımlı kanalın altındaki açık casing (arka plandan ayırır)
const CH_UNDEFINED = 2;    // tanımsız kanal

function ChannelHalf({ from, to, color }: { from: Point; to: Point; color: "black" | "red" | "both" | null }) {
  if (!color) return null;
  const common = {
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    strokeWidth: CH_DEFINED,
    strokeLinecap: "round" as const,
  };
  if (color === "both") {
    // Personality (siyah) taban + Design (kırmızı) kesikli üst kat → yuvarlak dash ile premium.
    return (
      <>
        <line {...common} stroke={BLACK} />
        <line {...common} stroke={RED} strokeDasharray="5 5" />
      </>
    );
  }
  return <line {...common} stroke={color === "red" ? RED : BLACK} />;
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

      {/* FAZ 7C — aktif gate premium katmanı (ek <circle> YOK; sadece filter/gradient) */}
      <defs>
        {/* Yumuşak derinlik gölgesi — tek circle'a uygulanır, eleman eklemez */}
        <filter id="hd-gate-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.7" floodColor="#0f172a" floodOpacity="0.38" />
        </filter>
        {/* Personality (siyah) küresel highlight */}
        <radialGradient id="hd-gate-black" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="60%" stopColor={BLACK} />
          <stop offset="100%" stopColor="#0b1220" />
        </radialGradient>
        {/* Design (kırmızı) küresel highlight */}
        <radialGradient id="hd-gate-red" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="60%" stopColor={RED} />
          <stop offset="100%" stopColor="#991b1b" />
        </radialGradient>
        {/* both (P+D): üst yarı siyah / alt yarı kırmızı — tek circle içinde net ayrım */}
        <linearGradient id="hd-gate-both" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="50%" stopColor={BLACK} />
          <stop offset="50%" stopColor={RED} />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>

      {/* Kanallar (arka planda) — round cap/join tüm çizgilere miras kalır */}
      <g strokeLinecap="round" strokeLinejoin="round">
        {CHANNEL_SEGMENTS.map((seg) => {
          if (!definedChannelIds.has(seg.id)) {
            // Tanımsız: zarif, yumuşak track — round cap + hafif opaklık.
            return (
              <line
                key={seg.id}
                x1={seg.a.x}
                y1={seg.a.y}
                x2={seg.b.x}
                y2={seg.b.y}
                stroke={TRACK}
                strokeWidth={CH_UNDEFINED}
                strokeOpacity={0.9}
              />
            );
          }
          const mid: Point = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
          return (
            <g key={seg.id}>
              {/* Açık casing (groove): renkli kanalı arka plandan/merkezlerden ayırır */}
              <line x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke={TRACK} strokeWidth={CH_CASING} />
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

      {/* Aktif kapı numaraları — her aktif gate için TAM 1 <circle> (pasif render YOK) */}
      <g fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif">
        {activeGates.map((g) => {
          const a = GATE_ANCHORS[g];
          if (!a) return null;
          const col = gateColor(g, gateMap);
          const fillUrl =
            col === "both" ? "url(#hd-gate-both)" : col === "red" ? "url(#hd-gate-red)" : "url(#hd-gate-black)";
          return (
            <g key={g}>
              <circle
                cx={a.x}
                cy={a.y}
                r={5.8}
                fill={fillUrl}
                stroke="#ffffff"
                strokeWidth={0.9}
                strokeOpacity={0.92}
                filter="url(#hd-gate-shadow)"
              />
              <text
                x={a.x}
                y={a.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={6.2}
                fontWeight={700}
                letterSpacing={-0.2}
                fill="#ffffff"
              >
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
