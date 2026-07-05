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

// FAZ 10H — Aura foundation kütlesi. Özgün insan formu (referanstan alınmadı). Soğuk/doygunsuz;
// circle/polygon KULLANMAZ. 10H-2: opacity gradient stop'larında (hd-aura-grad), düz artırma YOK.
const AURA_FILL = "#aeb8d8";   // soğuk slate-lavanta (neon değil)

// FAZ 10F-2 — pasif gate: iki-ton fill + zıt-ton outline (paint-order) → her zeminde okunur. circle/bg YOK.
const GATE_PASSIVE_FILL_LIGHT = "#f8fafc";   // renkli(tanımlı) merkez → açık numara
const GATE_PASSIVE_FILL_DARK = "#334155";    // beyaz(tanımsız) merkez → koyu numara
const GATE_PASSIVE_STROKE_LIGHT = "#ffffff"; // koyu numara outline (beyaz merkez)
const GATE_PASSIVE_STROKE_DARK = "#0f172a";  // açık numara outline (renkli merkez)

// FAZ 7B — kanal görsel katmanı (yalnız çizim kalitesi; koordinat/topoloji sabit).
const TRACK = "#e5e7eb";   // tanımsız kanal + tanımlı kanal casing (groove) tonu
const TRACK_EDGE = "#cbd5e1"; // FAZ 10C-3 casing oluk KENARI (TRACK'ten koyu) — derinlik
const CH_DEFINED = 3.2;    // tanımlı kanal renkli stroke
const CH_CASING_EDGE = 5.4; // FAZ 10C-3 casing OLUK KENARI (koyu, geniş) — derinlik alt
const CH_CASING_CORE = 4.0; // FAZ 10C-3 casing OLUK ÇEKİRDEĞİ (açık, dar) — oluk tabanı
const CH_UNDEFINED = 2;    // tanımsız kanal
const CH_UNDEFINED_OPACITY = 0.5; // FAZ 10C-4 tanımsız kanal opaklık (hiyerarşi: geri çekilir)

// FAZ 10C-1 — ölçülü premium glow (yalnız tanımlı kanal renkli yarımları; casing hariç).
// Kanalın kendi renginde yumuşak halo; neon değil. Koordinat/topoloji sabit.
const CH_GLOW_STD = 0.9;      // feGaussianBlur yarıçapı (küçük = kontrollü)
const CH_GLOW_OPACITY = 0.55; // halo alfa çarpanı (ölçülü)

// FAZ 10C-2 — sheen highlight (glow DIŞINDA, keskin; camsı tüp hissi). both atlanır.
const CH_SHEEN_WIDTH = 1.1;    // ince parlak çekirdek
const CH_SHEEN_OPACITY = 0.45; // ölçülü — yıkamaz
const SHEEN: Record<"red" | "black", string> = { red: "#fecaca", black: "#9ca3af" };

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

// FAZ 10C-2 — tek yarım için keskin sheen highlight. both/null → çizmez (composite temiz).
function ChannelSheen({ from, to, color }: { from: Point; to: Point; color: "black" | "red" | "both" | null }) {
  if (!color || color === "both") return null; // both'ta sheen ATLA
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={SHEEN[color]}
      strokeWidth={CH_SHEEN_WIDTH}
      strokeOpacity={CH_SHEEN_OPACITY}
      strokeLinecap="round"
    />
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
      className="mx-auto block h-auto w-full max-w-[380px] sm:max-w-[420px] xl:h-full xl:w-auto xl:max-w-none"
      role="img"
      aria-labelledby="hd-bodygraph-title hd-bodygraph-desc"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* FAZ 7F — non-interaktif görsel; SR için olgusal başlık + yapısal özet (yorum YOK) */}
      <title id="hd-bodygraph-title">Human Design BodyGraph</title>
      <desc id="hd-bodygraph-desc">
        {`${definedCenters.length} tanımlı merkez, ${definedChannels.length} tanımlı kanal, ${activeGates.length} aktif kapı.`}
      </desc>

      {/* FAZ 7C — aktif gate premium katmanı (ek <circle> YOK; sadece filter/gradient) */}
      <defs>
        {/* Yumuşak derinlik gölgesi — tek circle'a uygulanır, eleman eklemez */}
        <filter id="hd-gate-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.7" floodColor="#0f172a" floodOpacity="0.38" />
        </filter>
        {/* FAZ 10F-2 — aktif badge premium halo (tek circle'a uygulanır; ikinci circle YOK) */}
        <filter id="hd-gate-badge" x="-70%" y="-70%" width="240%" height="240%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="1.3" floodColor="#0b1220" floodOpacity="0.5" />
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

        {/* FAZ 7D — tanımlı merkez premium katmanı (ek <polygon> YOK; sadece filter/gradient) */}
        {/* Yumuşak, ölçülü derinlik gölgesi — tanımlı polygon'a uygulanır, eleman eklemez */}
        <filter id="hd-center-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.9" floodColor="#0f172a" floodOpacity="0.22" />
        </filter>
        {/* Her tanımlı merkez için hue-korumalı üst-sol highlight (küresel cam hissi) */}
        {CENTERS.map((c) => (
          <radialGradient key={c} id={`hd-center-${c}`} cx="34%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.5} />
            <stop offset="36%" stopColor={CENTER_FILL[c]} stopOpacity={1} />
            <stop offset="100%" stopColor={CENTER_FILL[c]} stopOpacity={1} />
          </radialGradient>
        ))}

        {/* FAZ 10C-1 — kanal glow: renkli yarımın kendi rengini bulanıklaştırıp altına serer;
            keskin kanal üstte kalır. Ek polygon/circle YOK; yalnız filter. */}
        <filter id="hd-channel-glow" x="-75%" y="-75%" width="250%" height="250%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={CH_GLOW_STD} result="blur" />
          <feComponentTransfer in="blur" result="softGlow">
            <feFuncA type="linear" slope={CH_GLOW_OPACITY} />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="softGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* FAZ 10H-2 — Aura yüzey: çok hafif derinlik gradyanı (opacity ARTIRMAZ, yeniden dağıtır) */}
        <radialGradient id="hd-aura-grad" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor={AURA_FILL} stopOpacity="0.085" />
          <stop offset="55%" stopColor={AURA_FILL} stopOpacity="0.055" />
          <stop offset="100%" stopColor={AURA_FILL} stopOpacity="0.025" />
        </radialGradient>
        {/* FAZ 10H-2 — yalnız kenar yumuşatma (glow DEĞİL; ayrı ışık katmanı/merge yok) */}
        <filter id="hd-aura-soft" x="-12%" y="-12%" width="124%" height="124%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* FAZ 10H-1 — AURA (en arka foundation kütlesi). Özgün insan formu; TEK renk, düşük opacity.
          Baş/boyun küçük → omuz genişliğini abartır; omuzlar kanal yapısını aşar (yatay kütle);
          gövde merkezleri kapsar (containment). Gradient/blur/glow YOK. circle/polygon KULLANMAZ. */}
      <path
        d="M170 26 C186 26 195 42 196 64 C197 82 192 92 190 104
           C210 106 240 110 286 140 C306 152 312 168 300 184
           C280 196 262 214 254 250 C248 300 244 356 238 402
           C233 460 226 512 206 548 C194 566 182 568 170 568
           C158 568 146 566 134 548 C114 512 107 460 102 402
           C96 356 92 300 86 250 C78 214 60 196 40 184
           C28 168 34 152 54 140 C100 110 130 106 150 104
           C148 92 143 82 144 64 C145 42 154 26 170 26 Z"
        fill="url(#hd-aura-grad)"
        filter="url(#hd-aura-soft)"
        stroke="none"
        aria-hidden="true"
      />

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
                strokeOpacity={CH_UNDEFINED_OPACITY}
              />
            );
          }
          const mid: Point = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
          const colA = gateColor(seg.gateA, gateMap);
          const colB = gateColor(seg.gateB, gateMap);
          return (
            <g key={seg.id}>
              {/* FAZ 10C-3 — iki-katmanlı casing: koyu geniş KENAR + açık dar ÇEKİRDEK = oluk derinliği. glow ALMAZ */}
              <line x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke={TRACK_EDGE} strokeWidth={CH_CASING_EDGE} />
              <line x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke={TRACK} strokeWidth={CH_CASING_CORE} />
              {/* FAZ 10C-1 — yalnız renkli yarımlar ölçülü glow alır */}
              <g filter="url(#hd-channel-glow)">
                <ChannelHalf from={seg.a} to={mid} color={colA} />
                <ChannelHalf from={seg.b} to={mid} color={colB} />
              </g>
              {/* FAZ 10C-2 — sheen: glow DIŞINDA keskin highlight, en üstte; both atlanır */}
              <ChannelSheen from={seg.a} to={mid} color={colA} />
              <ChannelSheen from={seg.b} to={mid} color={colB} />
            </g>
          );
        })}
      </g>

      {/* Merkezler — her merkez TAM 1 <polygon> (toplam 9; round join premium köşe) */}
      <g strokeLinejoin="round">
        {CENTERS.map((c) => {
          const shape = CENTER_SHAPES[c];
          const on = definedCenterSet.has(c);
          const pts = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <polygon
              key={c}
              points={pts}
              fill={on ? `url(#hd-center-${c})` : "#fbfcfe"}
              fillOpacity={1}
              stroke={on ? "#1e293b" : "#d5dce6"}
              strokeWidth={on ? 1.6 : 1.3}
              strokeOpacity={on ? 0.9 : 1}
              filter={on ? "url(#hd-center-shadow)" : undefined}
            />
          );
        })}
      </g>

      {/* FAZ 10F-1 — pasif gate numaraları: TÜM 64'ten aktif olmayanlar; yalnız text (circle/bg YOK).
          Renk merkez durumuna göre: tanımlı→açık, tanımsız→koyu. Aktifler alttaki katmanda. */}
      <g fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif">
        {Object.values(GATE_ANCHORS).map((a) => {
          if (gateMap[a.gate]) return null; // aktif → aktif katmanda çizilir
          const coloredBg = definedCenterSet.has(a.center); // tanımlı merkez = renkli zemin
          return (
            <text
              key={a.gate}
              x={a.x}
              y={a.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={5.6}
              fontWeight={700}
              letterSpacing={-0.2}
              fill={coloredBg ? GATE_PASSIVE_FILL_LIGHT : GATE_PASSIVE_FILL_DARK}
              stroke={coloredBg ? GATE_PASSIVE_STROKE_DARK : GATE_PASSIVE_STROKE_LIGHT}
              strokeWidth={0.45}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {a.gate}
            </text>
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
                r={7.2}
                fill={fillUrl}
                stroke="#ffffff"
                strokeWidth={1.0}
                strokeOpacity={0.95}
                filter="url(#hd-gate-badge)"
              />
              <text
                x={a.x}
                y={a.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={7}
                fontWeight={800}
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
