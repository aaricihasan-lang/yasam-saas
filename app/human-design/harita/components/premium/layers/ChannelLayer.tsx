// Premium BodyGraph V2 — kanal katmanı.
//   İki geçiş: önce TANIMSIZ (arkada), sonra TANIMLI (önde) → renkli kanallar beyazların üstünde.
// VM (renk/tanımlılık) + geometri (path/kind/bow) id üzerinden birleştirilir. Yalnız <path>.

import type { ChannelVM } from "@/lib/human-design/bodygraph-v2";
import { CHANNEL_PATHS_V2 } from "@/lib/human-design/bodygraph-v2";
import { ChannelPath } from "../primitives/ChannelPath";

const GEO_BY_ID = new Map(CHANNEL_PATHS_V2.map((s) => [s.id, s]));

export function ChannelLayer({ channels }: { channels: ChannelVM[] }) {
  const draw = (defined: boolean) =>
    channels
      .filter((c) => c.defined === defined)
      .map((c) => {
        const seg = GEO_BY_ID.get(c.id);
        if (!seg) return null;
        return (
          <ChannelPath key={c.id} seg={seg} defined={c.defined} halfA={c.halfA} halfB={c.halfB} />
        );
      });

  return (
    <g strokeLinejoin="round">
      {draw(false)}
      {draw(true)}
    </g>
  );
}
