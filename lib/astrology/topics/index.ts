// Astroloji — BİRLEŞİK konu API'si (natal + bağlamlı; SAF, istemci güvenli).
// Natal anahtarları Aşama 2 ile birebir aynıdır (geriye dönük uyum); bağlamlılar Aşama 3 ekidir.

import type { NatalTechnical } from "../model/western";
import type {
  CompositeTechnical,
  ForecastTechnical,
  ProgressionTechnical,
  ReturnTechnical,
  SolarArcTechnical,
  SynastryTechnical,
  TransitTechnical,
} from "../model/westernTiming";
import { parseWesternTopicKey, topicLabel, topicsFromNatal, WESTERN_TOPIC_KIND_LABELS, WESTERN_TOPIC_KINDS } from "./western";
import {
  CONTEXT_KINDS,
  CONTEXT_SPECS,
  TOPIC_CONTEXT_LABELS,
  parseContextTopicKey,
  topicsFromComposite,
  topicsFromForecast,
  topicsFromProgression,
  topicsFromReturn,
  topicsFromSolarArc,
  topicsFromSynastry,
  topicsFromTransit,
  type TopicContext,
} from "./contextual";

export type AnyTopic = { key: string; kind: string; label: string; context: TopicContext };

export function parseAnyTopicKey(tradition: unknown, key: unknown): AnyTopic | null {
  if (tradition !== "western" || typeof key !== "string") return null;
  const n = parseWesternTopicKey(key);
  if (n) return { key, kind: n.kind, label: topicLabel(n), context: "natal" };
  const c = parseContextTopicKey(key);
  return c ? { key, kind: c.kind, label: c.label, context: c.context } : null;
}

export function topicLabelAny(key: string): string {
  return parseAnyTopicKey("western", key)?.label ?? key;
}

/** Filtre/seçici için tüm konu türleri (bağlama göre gruplu). */
export const ALL_TOPIC_KINDS: { kind: string; label: string; context: TopicContext }[] = [
  ...WESTERN_TOPIC_KINDS.map((k) => ({ kind: k, label: WESTERN_TOPIC_KIND_LABELS[k], context: "natal" as const })),
  ...CONTEXT_KINDS.map((k) => ({ kind: k, label: kindLabel(k), context: CONTEXT_SPECS[k].context })),
];

function kindLabel(kind: string): string {
  const ctx = TOPIC_CONTEXT_LABELS[CONTEXT_SPECS[kind].context];
  const tail = kind.endsWith("_in_sign")
    ? kind.includes("angle")
      ? "Yükselen/MC burçta"
      : "burçta"
    : kind.endsWith("_in_house")
      ? "evde"
      : kind.endsWith("_aspect")
        ? "açı"
        : kind.endsWith("_ingress")
          ? "burç girişi"
          : kind.endsWith("_station")
            ? "istasyon"
            : kind;
  return `${ctx} · ${tail}`;
}

export function isKnownTopicKind(kind: string): boolean {
  return ALL_TOPIC_KINDS.some((k) => k.kind === kind);
}

/** Bir tekniğin teknik sonucundan konu listesi. */
export function topicsForTechnique(technique: string, technical: unknown): { key: string; kind: string; label: string }[] {
  switch (technique) {
    case "western.natal":
      return topicsFromNatal(technical as NatalTechnical);
    case "western.transit":
      return topicsFromTransit(technical as TransitTechnical);
    case "western.forecast":
      return topicsFromForecast(technical as ForecastTechnical);
    case "western.progression":
      return topicsFromProgression(technical as ProgressionTechnical);
    case "western.solar_arc":
      return topicsFromSolarArc(technical as SolarArcTechnical);
    case "western.solar_return":
    case "western.lunar_return":
      return topicsFromReturn(technical as ReturnTechnical);
    case "western.synastry":
      return topicsFromSynastry(technical as SynastryTechnical);
    case "western.composite":
      return topicsFromComposite(technical as CompositeTechnical);
    default:
      return [];
  }
}

export { TOPIC_CONTEXT_LABELS, TOPIC_CONTEXTS } from "./contextual";
export type { TopicContext } from "./contextual";

/** Teknik → konu bağlamı (not bölümü + KB eşleşmesi natal ile KARIŞMAZ). */
export const TECHNIQUE_TOPIC_CONTEXT: Record<string, TopicContext> = {
  "western.natal": "natal",
  "western.transit": "transit",
  "western.forecast": "transit",
  "western.progression": "progression",
  "western.solar_arc": "solar_arc",
  "western.solar_return": "solar_return",
  "western.lunar_return": "lunar_return",
  "western.synastry": "synastry",
  "western.composite": "composite",
};

/** Not bölüm anahtarı bu teknik için geçerli mi ("overall" her teknikte geçerli). */
export function isSectionKeyForTechnique(technique: string, sectionKey: unknown): boolean {
  if (sectionKey === "overall") return true;
  const t = parseAnyTopicKey("western", sectionKey);
  return !!t && TECHNIQUE_TOPIC_CONTEXT[technique] === t.context;
}
