// HD — Hesaplanmış harita SUNUM/KAYIT sözleşmesi (yalnız TİP; algoritma yok).
//
// `HdComputedChart`, dahili motorun `HdChartResult`'ının GERİYE UYUMLU ÜST KÜMESİDİR:
//   • Eski computed kayıtlar (dahili motor, schemaVersion "1.0") bu tipe olduğu gibi uyar
//     → okunmaları BOZULMAZ.
//   • RoxyAPI kayıtları ek (opsiyonel) alanlar taşır: strategy / signature / notSelf /
//     provider metadata / uygulama kodları. Motorda olmayan alanlar (longitude, boundaryFlag,
//     componentCount) opsiyoneldir.
// Motor dosyaları (lib/human-design/engine/*) DEĞİŞTİRİLMEZ; bu dosya yalnız onları genişletir.

import type { HdChartResult } from "../engine/contract";
import type { ActivationSide } from "../engine/chart-activations";
import type { PlanetName } from "../engine/types";
import type { CenterName } from "../engine/channels";
import { toAppChartCodes, type HdAppChartCodes } from "../normalize/hdAppCodes";

export type HdComputedActivation = {
  body: PlanetName;
  side: ActivationSide;
  gate: number;
  line: number;
  /** Yalnız dahili motor kayıtlarında. */
  longitude?: number;
  /** Yalnız dahili motor kayıtlarında. */
  boundaryFlag?: boolean;
};

export type HdComputedDefinition = {
  /**
   * Dahili motor: "none"|"single"|"split-small"|"split-large"|"triple-split"|"quad-split".
   * RoxyAPI: sağlayıcının HAM değeri ("Split" vb.) — small/large TAHMİN EDİLMEZ.
   */
  kind: string;
  componentCount?: number;
  definedCenters: CenterName[];
};

export type HdComputedCross = {
  gates: [number, number, number, number];
  angle?: string;
  /** Sağlayıcı kodu (ör. "RAX"). */
  angleCode?: string;
  /** Tam ad (ör. "Right Angle Cross of Laws 2"). Dahili motorda yok. */
  name?: string;
  /** "gates-only"/"validated" = dahili motor; "provider" = ad sağlayıcıdan geldi. */
  status: "gates-only" | "validated" | "provider";
};

export type HdProviderMeta = {
  id: "roxyapi";
  endpoint: string;
  nodeType: string;
  lang: string;
  /** Yaşam Sistemi ↔ Roxy adaptör sözleşme sürümü. */
  adapterVersion: string;
  designInstantUtc: string;
};

export type HdComputedChart = Omit<
  HdChartResult,
  "meta" | "activations" | "definition" | "incarnationCross" | "type" | "authority" | "channels"
> & {
  meta: {
    engine: string;
    nodeType: string;
    calibrationStatus: "validated" | "provider";
    disclaimer: string;
  };
  activations: HdComputedActivation[];
  type: string;
  authority: string;
  definition: HdComputedDefinition;
  channels: { id: string; name: string; gates: [number, number]; centers: [CenterName, CenterName] }[];
  incarnationCross: HdComputedCross;
  // ── RoxyAPI ek alanları (opsiyonel; eski kayıtlarda yok) ──
  strategy?: string;
  signature?: string;
  notSelf?: string;
  provider?: HdProviderMeta;
  /** Merkezi normalizasyon (hdAppCodes) çıktısı — uzman Bilgi Bankası eşleştirmesi bununla yapılır. */
  appCodes?: HdAppChartCodes;
};

/** Derleme zamanı garantisi: eski motor çıktısı yeni sözleşmeye atanabilir (geriye uyum). */
export function asComputedChart(r: HdChartResult): HdComputedChart {
  return r;
}

/**
 * Hesaplanmış haritanın uygulama kodları. Roxy kayıtları kendi `appCodes`'unu taşır; eski
 * dahili motor kayıtları RAW değerlerinden MERKEZİ normalizasyonla türetilir (tek yol).
 */
export function computedChartAppCodes(c: HdComputedChart): HdAppChartCodes {
  if (c.appCodes) return c.appCodes;
  return toAppChartCodes({
    type_code: c.type,
    authority_code: c.authority,
    profile_code: c.profile,
    definition_code: c.definition.kind,
    active_centers: c.centers.defined,
    open_centers: c.centers.open,
    gates: c.activations.map((a) => a.gate),
    channels: c.channels.map((ch) => ch.id),
  });
}
