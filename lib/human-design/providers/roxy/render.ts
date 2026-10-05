// RoxyAPI resmi BodyGraph renderer'ı (<roxy-bodygraph>, @roxyapi/ui 0.48.0, MIT) için
// KAYITLI yanıttan render yükü (SAF, server).
//
//   • Yeni Roxy çağrısı YOK: kaynak, ilk hesapta saklanan provider_raw'dır.
//   • Yalnız grafiğin ihtiyaç duyduğu YAPISAL alanlar istemciye gider (merkez/kanal/aktivasyon,
//     kısa etiketler). Roxy'nin yorum metinleri (…Description, lineMeaning, theme, biology …)
//     ÇIKARILIR → istemciye gönderilmez, uzman içeriğiyle karışmaz. (Renderer'da ayrıca
//     hide-readings açıktır.) Gerçek bileşenle doğrulandı: bu yük tam yanıtla aynı çizimi üretir.
//   • Geçersiz/bozuk ham yanıt → null (renderer çizmez; sessiz tahmin yok).

import { validateRoxyBodygraph } from "./schema";

export type RoxyRenderPayload = Record<string, unknown>;

export function buildRoxyRenderPayload(raw: unknown): RoxyRenderPayload | null {
  if (!validateRoxyBodygraph(raw).ok) return null;
  const r = raw as Record<string, unknown>;
  const xc = r.incarnationCross as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    type: r.type,
    authority: r.authority,
    profile: r.profile,
    definition: r.definition,
    strategy: r.strategy,
    signature: r.signature,
    notSelf: r.notSelf,
    designInstantUtc: r.designInstantUtc,
    incarnationCross: { gates: xc.gates, angle: xc.angle, angleCode: str(xc.angleCode), name: xc.name },
    centers: (r.centers as Record<string, unknown>[]).map((c) => ({
      id: c.id,
      name: c.name,
      defined: c.defined,
      motor: c.motor,
      awareness: c.awareness,
      gates: c.gates,
    })),
    channels: (r.channels as Record<string, unknown>[]).map((c) => ({
      gateA: c.gateA,
      gateB: c.gateB,
      name: c.name,
      circuit: c.circuit,
      centers: c.centers,
    })),
    gates: (r.gates as Record<string, unknown>[]).map((g) => ({
      planet: g.planet,
      side: g.side,
      gate: g.gate,
      line: g.line,
      gateName: g.gateName,
    })),
  };
}
