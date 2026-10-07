// Astroloji Hesap Motoru — TEKNİK KAYIT DEFTERİ (SAF).
//
// Her teknik, bir doğum revizyonu + yöntem seçeneklerinden 1..n "hesap birimi" (sağlayıcı
// endpoint'i + normalize gövde) üretir. Planlayıcı birimleri tekilleştirir, kapsananları budar ve
// önbellekle karşılaştırır → "X hesap seçildi → Y yeni istek → Z kayıtlı sonuç".
//
// AŞAMA 1: yalnız `western.natal`. Yeni teknikler (transit, progression, Vedik, KP…) buraya
// eklenir; planlayıcı/servis/görünüm sözleşmesi değişmez.

import { ASTRO_PROVIDER_LANG, ROXY_API_VERSION, ROXY_PROVIDER } from "../config";
import {
  buildNatalRequestBody,
  parseNatalOptions,
  projectRoxyNatal,
  ROXY_NATAL_ADAPTER_VERSION,
  ROXY_NATAL_ENDPOINT,
  ROXY_NATAL_PROJECTION_VERSION,
  type NatalBirthInput,
  type NatalMethodOptions,
} from "../providers/roxy/natal";
import { NATAL_INTERP_SCHEMA, NATAL_TECHNICAL_SCHEMA } from "../model/western";
import { calcInputHash } from "./inputHash";

export type TechniqueProjection =
  | {
      ok: true;
      technical: unknown;
      technicalSchema: string;
      interpretation: unknown;
      interpretationSchema: string;
      projectionVersion: string;
      unmappedFields: string[];
      droppedValues: string[];
    }
  | { ok: false; errors: string[] };

export type TechniqueId = "western.natal";

export type CalcUnit = {
  technique: TechniqueId;
  provider: string;
  providerApiVersion: string;
  adapterVersion: string;
  endpoint: string;
  lang: string;
  body: Record<string, unknown>;
  inputHash: string;
  /** Bu birimin yanıtının KAPSADIĞI diğer endpoint'ler (planlayıcı budaması için). */
  covers: string[];
  /** Zamana bağlı mı (hedef tarih anahtarın parçası)? */
  timeDependent: boolean;
};

export type TechniqueDefinition = {
  id: TechniqueId;
  label: string;
  family: "western" | "vedic" | "kp";
  parseOptions: (raw: unknown) => Record<string, unknown> | null;
  units: (birth: NatalBirthInput, options: Record<string, unknown>) => CalcUnit[];
  /** Ham sağlayıcı yanıtı → teknik + yorum projeksiyonu (beyaz liste). */
  project: (unit: CalcUnit, raw: unknown, options: Record<string, unknown>) => TechniqueProjection;
};

const westernNatal: TechniqueDefinition = {
  id: "western.natal",
  label: "Batı · Natal Harita",
  family: "western",
  parseOptions: (raw) => parseNatalOptions(raw),
  units: (birth, options) => {
    const body = buildNatalRequestBody(birth, options as NatalMethodOptions);
    const identity = {
      provider: ROXY_PROVIDER,
      providerApiVersion: ROXY_API_VERSION,
      adapterVersion: ROXY_NATAL_ADAPTER_VERSION,
      endpoint: ROXY_NATAL_ENDPOINT,
      lang: ASTRO_PROVIDER_LANG,
      body,
    };
    return [
      {
        technique: "western.natal",
        ...identity,
        inputHash: calcInputHash(identity),
        // natal-chart yanıtı gezegen/ev/açı/kalıp endpoint'lerinin içeriğini kapsar.
        covers: ["/astrology/planets", "/astrology/houses", "/astrology/aspects", "/astrology/aspect-patterns"],
        timeDependent: false,
      },
    ];
  },
  project: (_unit, raw, options) => {
    const p = projectRoxyNatal(raw, options as NatalMethodOptions);
    if (!p.ok) return p;
    return {
      ok: true,
      technical: p.value.technical,
      technicalSchema: NATAL_TECHNICAL_SCHEMA,
      interpretation: p.value.interpretation,
      interpretationSchema: NATAL_INTERP_SCHEMA,
      projectionVersion: ROXY_NATAL_PROJECTION_VERSION,
      unmappedFields: p.value.unmappedFields,
      droppedValues: p.value.droppedValues,
    };
  },
};

export const TECHNIQUES: Readonly<Record<TechniqueId, TechniqueDefinition>> = Object.freeze({
  "western.natal": westernNatal,
});

export function getTechnique(id: unknown): TechniqueDefinition | null {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TECHNIQUES, id) ? TECHNIQUES[id as TechniqueId] : null;
}
