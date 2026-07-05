// Premium BodyGraph V2 — tek kanal primitifi. YALNIZ <path> üretir (polygon/circle YOK → invariant korunur).
//
// Tanımlı = gölge(tam) → casing(tam) → renkli gövde(yarım, glow) → sheen(yarım).
// Tanımsız = knockout(tam) → edge(tam) → core(tam), grup opacity düşük (arkada kalır).
// both = siyah gövde + kırmızı dashed üst kat; sheen both/null'da atlanır.

import type { ChannelPathV2 } from "@/lib/human-design/bodygraph-v2";
import type { ChannelHalf } from "@/lib/human-design/bodygraph-v2";
import { CHANNEL, COLORS, channelFullPath, channelHalfPaths } from "@/lib/human-design/bodygraph-v2";

const RED = COLORS.red;
const BLACK = COLORS.black;

function HalfBody({ d, color }: { d: string; color: ChannelHalf["color"] }) {
  if (!color) return null;
  const common = { d, strokeWidth: CHANNEL.bodyW, strokeLinecap: "round" as const, fill: "none" };
  if (color === "both") {
    return (
      <>
        <path {...common} stroke={BLACK} />
        <path {...common} stroke={RED} strokeDasharray="5 5" />
      </>
    );
  }
  return <path {...common} stroke={color === "red" ? RED : BLACK} />;
}

function Sheen({ d, color }: { d: string; color: ChannelHalf["color"] }) {
  if (!color || color === "both") return null; // both/null → sheen atla (composite temiz)
  return (
    <path
      d={d}
      stroke={CHANNEL.sheenColors[color]}
      strokeWidth={CHANNEL.sheenW}
      strokeOpacity={CHANNEL.sheenOpacity}
      strokeLinecap="round"
      fill="none"
    />
  );
}

export function ChannelPath({
  seg,
  defined,
  halfA,
  halfB,
}: {
  seg: ChannelPathV2;
  defined: boolean;
  halfA: ChannelHalf;
  halfB: ChannelHalf;
}) {
  const full = channelFullPath(seg);

  if (!defined) {
    // Tanımsız: tok beyaz tüp + knockout (kesişimde ayrım). Arkada kalır.
    return (
      <g strokeOpacity={CHANNEL.undefinedOpacity} fill="none" strokeLinecap="round">
        <path d={full} stroke={CHANNEL.knockoutColor} strokeWidth={CHANNEL.knockoutW} />
        <path d={full} stroke={CHANNEL.undefinedEdge} strokeWidth={CHANNEL.undefinedEdgeW} />
        <path d={full} stroke={CHANNEL.undefinedCore} strokeWidth={CHANNEL.undefinedCoreW} />
      </g>
    );
  }

  const { aPath, bPath } = channelHalfPaths(seg);
  return (
    <g fill="none" strokeLinecap="round">
      {/* 1) koyu hacim/gölge (tam, dikişsiz) */}
      <path d={full} stroke={CHANNEL.shadowColor} strokeWidth={CHANNEL.shadowW} strokeOpacity={CHANNEL.shadowOpacity} />
      {/* 2) açık ayrım halkası / casing (tam) */}
      <path d={full} stroke={CHANNEL.casingColor} strokeWidth={CHANNEL.casingW} />
      {/* 3) renkli ana gövde (yarım, ölçülü glow) */}
      <g filter="url(#hd-v2-channel-glow)">
        <HalfBody d={aPath} color={halfA.color} />
        <HalfBody d={bPath} color={halfB.color} />
      </g>
      {/* 4) sheen highlight (yarım, en üstte; both/null atlanır) */}
      <Sheen d={aPath} color={halfA.color} />
      <Sheen d={bPath} color={halfB.color} />
    </g>
  );
}
