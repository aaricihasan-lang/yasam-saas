// Premium BodyGraph V2 — aura katmanı (en arka premium hacim; ışıyan insan silüeti).
// İki path: dolgu (radial + blur) + rim (parlak kenar). polygon/circle KULLANMAZ.
// AURA_PATH doğrudan geometry/aura'dan (barrel'a dokunmadan).

import { AURA } from "@/lib/human-design/bodygraph-v2";
import { AURA_PATH } from "@/lib/human-design/bodygraph-v2/geometry/aura";

export function AuraLayer() {
  return (
    <g aria-hidden="true">
      {/* dolgu — arka premium hacim (destekleyici) */}
      <path d={AURA_PATH} fill="url(#hd-v2-aura-grad)" filter="url(#hd-v2-aura-soft)" stroke="none" />
      {/* rim/edge ışığı — ışıyan beden kenarı */}
      <path
        d={AURA_PATH}
        fill="none"
        stroke={AURA.rimColor}
        strokeWidth={AURA.rimW}
        strokeOpacity={AURA.rimOpacity}
        filter="url(#hd-v2-aura-rim)"
      />
    </g>
  );
}
