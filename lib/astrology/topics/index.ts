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
  topicsFromAstrocartography,
  topicsFromLocalSpace,
  topicsFromFixedStars,
  topicsFromRelocation,
  type TopicContext,
} from "./contextual";
import type { AstrocartographyTechnical, LocalSpaceTechnical, RelocationTechnical } from "../model/westernLocation";
import type { FixedStarsTechnical } from "../model/westernFixedStars";
import type { VedicD1Technical, VedicDashaTechnical, VedicDrishtiTechnical, VedicPanchangaTechnical, VedicShadbalaTechnical, VedicTransitTechnical, VedicVargaTechnical } from "../model/vedic";
import { KP_CONTEXT_LABELS, KP_KINDS, topicsFromKpChart, topicsFromKpDasha, topicsFromKpHorary, topicsFromKpRuling, topicsFromKpTiming, topicsFromKpTransit, type KpContext } from "./vedic";
import { KP_TIMING_TECHNICAL_SCHEMA, type KpChartTechnical, type KpHoraryTechnical, type KpRulingTechnical, type KpTimingTechnical, type KpTransitTechnical } from "../model/kp";
import { topicsFromVedicGunMilan, topicsFromVedicSadeSati } from "./vedicMatch";
import type { VedicGunMilanTechnical, VedicSadeSatiTechnical } from "../model/vedicMatch";
import { parseVedicTopicKey, topicsFromVedicD1, topicsFromVedicDasha, topicsFromVedicDrishti, topicsFromVedicPanchanga, topicsFromVedicShadbala, topicsFromVedicTransit, topicsFromVedicVarga, VEDIC_CONTEXT_LABELS, VEDIC_KINDS, VEDIC_SPECS, type VedicContext } from "./vedic";

/** Konu bağlamı: Batı bağlamları + Vedik bağlamlar (gelenek ayrımı anahtar türünde ve KB sütununda). */
export type AnyContext = TopicContext | VedicContext | KpContext;
export type AnyTopic = { key: string; kind: string; label: string; context: AnyContext };
export type Tradition = "western" | "vedic" | "kp";

export function parseAnyTopicKey(tradition: unknown, key: unknown): AnyTopic | null {
  if (typeof key !== "string") return null;
  if (tradition === "vedic" || tradition === "kp") {
    const v = parseVedicTopicKey(key, tradition);
    return v ? { key, kind: v.kind, label: v.label, context: v.context } : null;
  }
  if (tradition !== "western") return null;
  const n = parseWesternTopicKey(key);
  if (n) return { key, kind: n.kind, label: topicLabel(n), context: "natal" };
  const c = parseContextTopicKey(key);
  return c ? { key, kind: c.kind, label: c.label, context: c.context } : null;
}

/** Bir anahtarın geleneği (Batı veya Vedik); hiçbiri değilse null. */
export function traditionOfKey(key: unknown): Tradition | null {
  if (parseAnyTopicKey("western", key)) return "western";
  if (parseAnyTopicKey("vedic", key)) return "vedic";
  if (parseAnyTopicKey("kp", key)) return "kp";
  return null;
}

export function topicLabelAny(key: string): string {
  return parseAnyTopicKey("western", key)?.label ?? parseAnyTopicKey("vedic", key)?.label ?? parseAnyTopicKey("kp", key)?.label ?? key;
}

/** Tekniğin geleneği: "vedic.*" → vedic, "kp.*" → kp, diğerleri western. KB eşleşmesi bu gelenekte yapılır. */
export function traditionOfTechnique(technique: string): Tradition {
  return technique.startsWith("vedic.") ? "vedic" : technique.startsWith("kp.") ? "kp" : "western";
}

/** Filtre/seçici için tüm konu türleri (bağlama göre gruplu). */
export const ALL_TOPIC_KINDS: { kind: string; label: string; context: AnyContext }[] = [
  ...WESTERN_TOPIC_KINDS.map((k) => ({ kind: k, label: WESTERN_TOPIC_KIND_LABELS[k], context: "natal" as const })),
  ...CONTEXT_KINDS.map((k) => ({ kind: k, label: kindLabel(k), context: CONTEXT_SPECS[k].context as AnyContext })),
  ...VEDIC_KINDS.map((k) => ({ kind: k, label: vedicKindLabel(k), context: VEDIC_SPECS[k].context as AnyContext })),
  ...KP_KINDS.map((k) => ({ kind: k, label: `${KP_CONTEXT_LABELS[VEDIC_SPECS[k].context as KpContext]} · ${k.replace(/^kp_/, "").replace(/_/g, " ")}`, context: VEDIC_SPECS[k].context as AnyContext })),
];

function vedicKindLabel(kind: string): string {
  const L: Record<string, string> = {
    graha_in_rashi: "graha rashide",
    graha_in_bhava: "graha bhavada",
    graha_in_nakshatra: "graha nakshatrada",
    graha_nakshatra_pada: "graha nakshatra padası",
    lagna_rashi: "Lagna rashisi",
    lagna_nakshatra: "Lagna nakshatrası",
    yoga: "yoga",
    navamsa_graha_in_rashi: "D9 graha rashide",
    navamsa_lagna_rashi: "D9 Lagna",
    navamsa_vargottama: "D9 vargottama",
    navamsa_graha_in_bhava: "D9 graha bhavada",
    varga_graha_in_rashi: "Dn graha rashide",
    varga_graha_in_bhava: "Dn graha bhavada",
    varga_lagna_rashi: "Dn Lagna",
    varga_vargottama: "Dn vargottama",
    dasha_mahadasha: "mahadasha",
    dasha_antardasha: "antardasha",
    dasha_pratyantardasha: "pratyantardasha",
    graha_drishti: "graha drishtisi",
    shadbala_above_min: "Shadbala asgari üstü",
    shadbala_below_min: "Shadbala asgari altı",
    panchanga_tithi: "tithi",
    panchanga_nitya_yoga: "nitya yoga",
    panchanga_karana: "karana",
    gochara_graha_in_rashi: "transit graha rashide",
    gochara_from_moon: "Janma Rashi'den ev",
    gochara_in_bhava: "Lagna'dan bhava",
    gochara_drishti: "transit → natal drishti",
    match_koota_score: "koota puan bandı",
    match_dosha: "dosha etkin",
    match_dosha_cancelled: "dosha iptal",
    manglik: "Manglik derecesi",
  };
  return `${VEDIC_CONTEXT_LABELS[VEDIC_SPECS[kind].context as VedicContext]} · ${L[kind] ?? kind}`;
}

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
            : kind.endsWith("_line")
              ? "gezegen hattı (MC/IC/AC/DC)"
              : kind.endsWith("_angular")
                ? "açısal gezegen"
                : kind.endsWith("_direction")
                  ? "yön hattı"
                  : kind === "fixed_star_contact"
                    ? "kavuşum"
                    : kind === "fixed_star"
                      ? "yıldız (genel)"
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
    case "western.astrocartography":
      return technical ? topicsFromAstrocartography(technical as AstrocartographyTechnical) : [];
    case "western.relocation":
      return technical ? topicsFromRelocation(technical as RelocationTechnical) : [];
    case "western.local_space":
      return technical ? topicsFromLocalSpace(technical as LocalSpaceTechnical) : [];
    case "western.fixed_stars":
      return technical ? topicsFromFixedStars(technical as FixedStarsTechnical) : [];
    case "vedic.d1":
      return technical ? topicsFromVedicD1(technical as VedicD1Technical) : [];
    case "vedic.varga":
      return technical ? topicsFromVedicVarga(technical as VedicVargaTechnical) : [];
    case "vedic.dasha":
      return technical ? topicsFromVedicDasha(technical as VedicDashaTechnical) : [];
    case "vedic.drishti":
      return technical ? topicsFromVedicDrishti(technical as VedicDrishtiTechnical) : [];
    case "vedic.shadbala":
      return technical ? topicsFromVedicShadbala(technical as VedicShadbalaTechnical) : [];
    case "vedic.panchanga":
      return technical ? topicsFromVedicPanchanga(technical as VedicPanchangaTechnical) : [];
    case "vedic.transit":
      return technical ? topicsFromVedicTransit(technical as VedicTransitTechnical) : [];
    case "kp.ruling":
      return technical ? topicsFromKpRuling(technical as KpRulingTechnical) : [];
    case "kp.transit":
      if (technical && (technical as { schema?: string }).schema === KP_TIMING_TECHNICAL_SCHEMA) return topicsFromKpTiming(technical as KpTimingTechnical);
      return technical ? topicsFromKpTransit(technical as KpTransitTechnical) : [];
    case "kp.horary":
      return technical ? topicsFromKpHorary(technical as KpHoraryTechnical) : [];
    case "kp.dasha":
      return technical ? topicsFromKpDasha(technical as VedicDashaTechnical) : [];
    case "kp.chart":
      return technical ? topicsFromKpChart(technical as KpChartTechnical) : [];
    case "vedic.ashtakavarga":
      return [];
    case "vedic.sade_sati":
      return technical ? topicsFromVedicSadeSati(technical as VedicSadeSatiTechnical) : [];
    case "vedic.gun_milan":
      return technical ? topicsFromVedicGunMilan(technical as VedicGunMilanTechnical) : [];
    default:
      return [];
  }
}

export { TOPIC_CONTEXT_LABELS, TOPIC_CONTEXTS } from "./contextual";
export type { TopicContext } from "./contextual";

/** Teknik → konu bağlamı (not bölümü + KB eşleşmesi natal ile KARIŞMAZ). */
/** Bir teknik birden fazla bağlam taşıyabilir (KP haritası: cusp + gezegen + significator). */
export const TECHNIQUE_TOPIC_CONTEXT: Record<string, AnyContext | AnyContext[]> = {
  "vedic.d1": "vedic_d1",
  "vedic.varga": "vedic_varga",
  "vedic.dasha": "vedic_dasha",
  "vedic.drishti": "vedic_drishti",
  "vedic.ashtakavarga": "vedic_strength",
  "vedic.shadbala": "vedic_strength",
  "vedic.panchanga": "vedic_panchanga",
  "vedic.transit": "vedic_gochara",
  // 2026-10-22 (yalnız ek): Sade Sati = Satürn'ün Janma Rashi'den gocharası → mevcut Gochara bağlamı.
  "vedic.sade_sati": "vedic_gochara",
  // 22.10.2026: Ashtakoot / Manglik konuları kendi bağlamında (D1 natal konularıyla karışmaz).
  "vedic.gun_milan": "vedic_match",
  "kp.chart": ["kp_cusp", "kp_planet", "kp_significator", "kp_principle"],
  "kp.dasha": ["kp_dasha", "kp_principle"],
  "kp.ruling": ["kp_ruling", "kp_principle"],
  "kp.transit": ["kp_transit", "kp_principle"],
  "kp.horary": ["kp_horary", "kp_principle"],
  "western.natal": "natal",
  "western.transit": "transit",
  "western.forecast": "transit",
  "western.progression": "progression",
  "western.solar_arc": "solar_arc",
  "western.solar_return": "solar_return",
  "western.lunar_return": "lunar_return",
  "western.synastry": "synastry",
  "western.composite": "composite",
  "western.astrocartography": "astrocartography",
  "western.relocation": "relocation",
  "western.local_space": "local_space",
  "western.fixed_stars": "fixed_stars",
};

/** Not bölüm anahtarı bu teknik için geçerli mi ("overall" her teknikte geçerli). */
export function isSectionKeyForTechnique(technique: string, sectionKey: unknown): boolean {
  if (sectionKey === "overall") return true;
  const t = parseAnyTopicKey(traditionOfTechnique(technique), sectionKey);
  const c = TECHNIQUE_TOPIC_CONTEXT[technique];
  return !!t && (Array.isArray(c) ? c.includes(t.context) : c === t.context);
}
