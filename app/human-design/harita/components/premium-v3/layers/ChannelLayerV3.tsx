// Premium BodyGraph V3 — kanal katmanı. Path'ler skeleton'dan türer (deriveChannels).
// V3-3: TÜM 36 kanal aynı SADE track (renk/casing/yarım-renk YOK). polygon/circle KULLANMAZ.
// VM join id üzerinden ileride yapılabilir (yapı bozulmaz).

import { deriveChannels, CHANNEL_V3 } from "@/lib/human-design/bodygraph-v3";
import type { Skeleton } from "@/lib/human-design/bodygraph-v3";

export function ChannelLayerV3({ skeleton }: { skeleton: Skeleton }) {
  const geo = deriveChannels(skeleton);
  return (
    <g fill="none" strokeLinecap="round" stroke={CHANNEL_V3.track} strokeOpacity={CHANNEL_V3.trackOpacity}>
      {geo.map((g) => (
        <path key={g.id} d={g.d} strokeWidth={CHANNEL_V3.trackW} />
      ))}
    </g>
  );
}
