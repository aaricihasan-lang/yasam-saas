// Premium BodyGraph V2 — paylaşılan <defs> (gradient/filter).
//
// "hd-v2-" namespace → eski BodyGraph defs'i ile A/B karşılaştırmada çakışma YOK.
// V2-2: merkez yüzey gradyanları + gate badge gradyan/halo. (Kanal/aura defs'i V2-3/V2-4.)

import { CENTERS } from "@/lib/human-design/engine/channels";
import { COLORS } from "@/lib/human-design/bodygraph-v2";

const RED = COLORS.red;
const BLACK = COLORS.black;

export function PremiumDefs() {
  return (
    <defs>
      {/* Merkez derinlik gölgesi (tanımlı merkeze uygulanır) */}
      <filter id="hd-v2-center-shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0.7" stdDeviation="1.1" floodColor="#0f172a" floodOpacity="0.30" />
      </filter>

      {/* Tanımlı merkez: hue-korumalı üst-sol iç parlaklık (küresel cam) */}
      {CENTERS.map((c) => (
        <radialGradient key={c} id={`hd-v2-center-${c}`} cx="34%" cy="26%" r="86%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="30%" stopColor={COLORS.centerFill[c]} stopOpacity={1} />
          <stop offset="100%" stopColor={COLORS.centerFill[c]} stopOpacity={1} />
        </radialGradient>
      ))}

      {/* Açık (tanımsız) merkez: hafif beyaz gradyan (düz görünmesin) */}
      <radialGradient id="hd-v2-center-open" cx="34%" cy="26%" r="86%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
        <stop offset="100%" stopColor="#eef2f8" stopOpacity={1} />
      </radialGradient>

      {/* Gate badge — Personality(black) küresel highlight */}
      <radialGradient id="hd-v2-gate-black" cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#4b5563" />
        <stop offset="60%" stopColor={BLACK} />
        <stop offset="100%" stopColor="#0b1220" />
      </radialGradient>
      {/* Gate badge — Design(red) küresel highlight */}
      <radialGradient id="hd-v2-gate-red" cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#f87171" />
        <stop offset="60%" stopColor={RED} />
        <stop offset="100%" stopColor="#991b1b" />
      </radialGradient>
      {/* Gate badge — both (P+D): üst yarı siyah / alt yarı kırmızı */}
      <linearGradient id="hd-v2-gate-both" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4b5563" />
        <stop offset="50%" stopColor={BLACK} />
        <stop offset="50%" stopColor={RED} />
        <stop offset="100%" stopColor="#991b1b" />
      </linearGradient>
      {/* Aktif badge premium halo */}
      <filter id="hd-v2-gate-badge" x="-70%" y="-70%" width="240%" height="240%">
        <feDropShadow dx="0" dy="0.6" stdDeviation="1.3" floodColor="#0b1220" floodOpacity="0.5" />
      </filter>
    </defs>
  );
}
