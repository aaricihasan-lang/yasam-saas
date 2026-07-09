// Premium BodyGraph V3 — kanal katmani (Channel Routing Refactor). Kanallar paylasilan RAY (routes.ts)
// segmentlerini kullanir (deriveChannels); ayni path'i paylasan kanallar TEK cizilir (d bazli tekillestirme).
// Ham raylar AYRI cizilmez — yalniz kanallar gorunur. polygon/circle KULLANMAZ.

import { deriveChannels, CHANNEL_V3 } from "@/lib/human-design/bodygraph-v3";
import type { Skeleton } from "@/lib/human-design/bodygraph-v3";

export function ChannelLayerV3({ skeleton }: { skeleton: Skeleton }) {
  const geo = deriveChannels(skeleton);
  // Ayni rota segmentini paylasan kanallar ayni d -> tek <path> (paylasilan rib).
  const seen = new Set<string>();
  const paths = geo.filter((g) => (seen.has(g.d) ? false : (seen.add(g.d), true)));
  return (
    <g fill="none" strokeLinecap="round" stroke={CHANNEL_V3.track} strokeOpacity={CHANNEL_V3.trackOpacity}>
      {paths.map((g) => (
        <path key={g.id} d={g.d} strokeWidth={CHANNEL_V3.trackW} />
      ))}
    </g>
  );
}
