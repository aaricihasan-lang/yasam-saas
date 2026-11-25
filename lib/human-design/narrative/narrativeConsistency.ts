// HD ANLATI — kanonik özet ve anahtar (SAF; ağ / DB / i18n YOK).
//
// Anlatı yalnız METİNDİR: harita kimliğini, hesap sonucunu veya kodları belirleyemez. Başka dilde alınan sağlayıcı yanıtı,
// kayıtlı haritanın kanonik özetiyle (26 aktivasyon + uygulama kodları + haç kapıları) BİREBİR aynı değilse kullanılmaz.

import { createHash } from "node:crypto";
import { computedChartAppCodes, type HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { ROXY_ADAPTER_VERSION, ROXY_BODYGRAPH_ENDPOINT, ROXY_PROVIDER_ID } from "@/lib/human-design/providers/roxy/config";
import { HD_NARRATIVE_VERSION } from "./narrativeConfig";

const sorted = (xs: ReadonlyArray<string | number>): string => [...xs].map(String).sort().join(",");

/**
 * Dil-bağımsız kanonik özet metni. Sağlayıcının serbest metin alanları (ad, açıklama, haç adı) GİRMEZ — onlar dile göre
 * değişir; yalnız sayısal / kod alanları girer.
 */
export function hdCanonicalSummary(chart: HdComputedChart): string {
  const c = computedChartAppCodes(chart);
  const acts = chart.activations.map((a) => `${a.side}:${a.body}:${a.gate}.${a.line}`);
  return [
    `acts=${sorted(acts)}`,
    `type=${c.type_code ?? ""}`,
    `auth=${c.authority_code ?? ""}`,
    `prof=${c.profile_code ?? ""}`,
    `def=${c.definition_code ?? ""}`,
    `centers=${sorted(c.active_centers ?? [])}`,
    `open=${sorted(c.open_centers ?? [])}`,
    `channels=${sorted(c.channels ?? [])}`,
    `gates=${sorted(c.gates ?? [])}`,
    `cross=${(chart.incarnationCross?.gates ?? []).join("/")}`,
  ].join("|");
}

export function hdCanonicalSha(chart: HdComputedChart): string {
  return createHash("sha256").update(hdCanonicalSummary(chart), "utf8").digest("hex");
}

/** Aday (yeni dil yanıtı) kanonik olarak kayıtlı haritayla aynı mı; değilse farklı alan adları (değer YOK — log güvenli). */
export function compareCanonical(stored: HdComputedChart, candidate: HdComputedChart): { ok: true } | { ok: false; fields: string[] } {
  const a = hdCanonicalSummary(stored).split("|");
  const b = hdCanonicalSummary(candidate).split("|");
  const fields: string[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) fields.push(a[i].split("=")[0]);
  return fields.length ? { ok: false, fields } : { ok: true };
}

export type HdNarrativeKeyInput = {
  tenantId: string;
  chartId: string;
  chartInputHash: string | null;
  nodeType: string;
  lang: string;
  /** Kayıtlı haritanın UTC doğum anı (computed_result.timing.birthUtcIso). */
  birthUtcIso: string;
};

/**
 * Anlatı önbellek anahtarı = sha256(sürüm | sağlayıcı | uç | adaptör | düğüm | DİL | tenant | harita | input_hash | UTC an).
 * Dil, sağlayıcı ve sürüm anahtardadır → farklı dil asla aynı kaydı okumaz; sürüm/adaptör değişirse eski kayıt eşleşmez.
 */
export function hdNarrativeCacheKey(k: HdNarrativeKeyInput): string {
  return createHash("sha256")
    .update(
      [
        HD_NARRATIVE_VERSION,
        ROXY_PROVIDER_ID,
        ROXY_BODYGRAPH_ENDPOINT,
        ROXY_ADAPTER_VERSION,
        k.nodeType,
        k.lang,
        k.tenantId,
        k.chartId.toLowerCase(),
        k.chartInputHash ?? "",
        k.birthUtcIso,
      ].join("|"),
      "utf8",
    )
    .digest("hex");
}
