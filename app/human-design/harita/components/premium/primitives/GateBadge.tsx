// Premium BodyGraph V2 — aktif gate rozeti. TAM 1 <circle> üretir (invariant: circle=N).

import { GATE, TYPO } from "@/lib/human-design/bodygraph-v2";

export function GateBadge({
  gate,
  x,
  y,
  color,
}: {
  gate: number;
  x: number;
  y: number;
  color: "red" | "black" | "both";
}) {
  const fill =
    color === "both"
      ? "url(#hd-v2-gate-both)"
      : color === "red"
        ? "url(#hd-v2-gate-red)"
        : "url(#hd-v2-gate-black)";
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={GATE.badgeR}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={GATE.badgeStrokeW}
        strokeOpacity={0.95}
        filter="url(#hd-v2-gate-badge)"
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={GATE.activeFont}
        fontWeight={800}
        letterSpacing={-0.2}
        fill="#ffffff"
        fontFamily={TYPO.family}
      >
        {gate}
      </text>
    </g>
  );
}
