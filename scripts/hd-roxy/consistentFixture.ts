// Harness yardımcısı — sahte Roxy yanıtını GERÇEK Roxy gibi isteğe TUTARLI yapar (test-only).
//
// HD-15: sunucu artık Roxy'nin Design anını, kendi çözdüğü doğum anıyla karşılaştırır. Gerçek Roxy
// her istekte o doğum anına ait Design anını döndürür; sabit fixture ise (2018-07-20 19:00 İstanbul)
// başka saatler için TUTARSIZ olur ve haklı olarak reddedilir. Bu yardımcı fixture'ın yalnız
// `designInstantUtc` alanını istekteki tarih/saat/saat dilimine göre (bağımsız efemerisle) yeniden
// hesaplar; kapı/kanal/merkez verisi DEĞİŞMEZ (testlerin beklentileri aynı kalır).
//
// HD-25: tarayıcı BodyGraph PNG'sini analize bağlar; entegrasyon harness'leri aynı etiketi üretir.

import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { expectedDesignInstantUtc } from "../../lib/human-design/providers/roxy/timeConsistency";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import {
  HD_BODYGRAPH_BIND_KEYWORD,
  bodygraphBindingText,
  fingerprintFromRoxyRender,
  insertPngTextChunk,
} from "../../lib/human-design/reporting/bodygraphBinding";

export function consistentRoxyResponse(fixtureJson: string, requestBody: unknown): string {
  const fx = JSON.parse(fixtureJson) as Record<string, unknown>;
  let body: Record<string, unknown> | null = null;
  try {
    body = typeof requestBody === "string" ? (JSON.parse(requestBody) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  if (!body || typeof body.date !== "string" || typeof body.time !== "string" || typeof body.timezone !== "string") return fixtureJson;
  const t = resolveBirthLocalTime(body.date, body.time, body.timezone);
  if (t.kind !== "ok") return fixtureJson;
  const design = expectedDesignInstantUtc(t.utcIso);
  if (design) fx.designInstantUtc = design;
  return JSON.stringify(fx);
}

/** `data:image/png;base64,…` PNG'yi verilen analize bağlar (fixture kapı/merkez parmak iziyle). */
export function boundBodygraphDataUrl(pngDataUrl: string, chartId: string, fixtureJson: string): string {
  const png = Buffer.from(pngDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  const render = buildRoxyRenderPayload(JSON.parse(fixtureJson)) as Record<string, unknown> | null;
  if (!render) throw new Error("fixture render yükü üretilemedi");
  const bound = insertPngTextChunk(png, HD_BODYGRAPH_BIND_KEYWORD, bodygraphBindingText(chartId, fingerprintFromRoxyRender(render)));
  return `data:image/png;base64,${Buffer.from(bound).toString("base64")}`;
}
