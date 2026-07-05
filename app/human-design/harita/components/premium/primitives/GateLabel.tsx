// Premium BodyGraph V2 — pasif gate numarası. YALNIZ <text> (circle ÜRETMEZ → invariant korunur).
// İki-ton kontrast: tanımlı merkez → açık numara/koyu outline; tanımsız → koyu numara/açık outline.

import { GATE, TYPO } from "@/lib/human-design/bodygraph-v2";

export function GateLabel({
  gate,
  x,
  y,
  coloredBg,
}: {
  gate: number;
  x: number;
  y: number;
  coloredBg: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={GATE.passiveFont}
      fontWeight={700}
      letterSpacing={-0.2}
      fill={coloredBg ? GATE.passiveFillLight : GATE.passiveFillDark}
      stroke={coloredBg ? GATE.passiveStrokeDark : GATE.passiveStrokeLight}
      strokeWidth={0.45}
      strokeLinejoin="round"
      paintOrder="stroke"
      fontFamily={TYPO.family}
    >
      {gate}
    </text>
  );
}
