// Premium BodyGraph V3 — ambient katmani. Insan silueti YOK (tasarim karari).
// Yalniz cok hafif radial glow -> BodyGraph'in arkasinda derinlik. polygon/circle KULLANMAZ.
// (deriveAura/silhouette lib'de durur ama render artik onlari cizmez; skeleton prop'una gerek yok.)

import { VIEWBOX_V3 } from "@/lib/human-design/bodygraph-v3";

export function AuraLayerV3() {
  return (
    <g aria-hidden="true">
      {/* ambient derinlik — sahneyi kaplayan cok hafif radial glow (dikkat cekmez, edge seffaf) */}
      <rect x={0} y={0} width={VIEWBOX_V3.width} height={VIEWBOX_V3.height} fill="url(#hd-v3-ambient-grad)" />
    </g>
  );
}
