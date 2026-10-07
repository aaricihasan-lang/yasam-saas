// Astroloji — KANONİK KONU TAKSONOMİSİ (Western natal; SAF, istemci güvenli).
//
// Konu anahtarı provider alan adlarından BAĞIMSIZDIR: kanonik teknik modelin kimlikleriyle kurulur
// (lib/astrology/model/western). Sağlayıcı değişse (Roxy → Yaşam Engine) aynı harita aynı anahtarları
// üretir; Bilgi Bankası ve kayıtlı analizler etkilenmez.
//
// Gelenek (tradition) ayrı kolondadır: "western" | "vedic" | "kp". Aynı anahtar biçimi Vedik/KP'de
// kendi kimlik kümeleriyle kullanılacaktır (bu aşamada YALNIZ western uygulanır).
//
// Biçim:  <tür>:<parça>[:<parça>…]
//   planet_in_sign:<body>:<sign>        ör. planet_in_sign:saturn:libra
//   planet_in_house:<body>:<1-12>       ör. planet_in_house:saturn:7      (saat biliniyorsa)
//   aspect:<body>:<aspect_type>:<body>  ör. aspect:sun:square:saturn      (cisimler kanonik sırada)
//   pattern:<kind>                      ör. pattern:grand_trine
//   angle_in_sign:<ascendant|midheaven>:<sign>                             (saat biliniyorsa)

import {
  ASPECT_TYPES,
  BODY_IDS,
  PATTERN_KINDS,
  SIGN_IDS,
  type AspectType,
  type BodyId,
  type NatalTechnical,
  type PatternKind,
  type SignId,
} from "../model/western";
import { ASPECT_LABELS, BODY_LABELS, PATTERN_LABELS, SIGN_LABELS } from "../labels/tr";

export const TRADITIONS = ["western", "vedic", "kp"] as const;
export type Tradition = (typeof TRADITIONS)[number];

export const WESTERN_TOPIC_KINDS = ["planet_in_sign", "planet_in_house", "aspect", "pattern", "angle_in_sign"] as const;
export type WesternTopicKind = (typeof WESTERN_TOPIC_KINDS)[number];

export const WESTERN_TOPIC_KIND_LABELS: Record<WesternTopicKind, string> = {
  planet_in_sign: "Gezegen burçta",
  planet_in_house: "Gezegen evde",
  aspect: "Açı",
  pattern: "Açı kalıbı",
  angle_in_sign: "Yükselen / MC burçta",
};

export const ANGLE_IDS = ["ascendant", "midheaven"] as const;
export type AngleId = (typeof ANGLE_IDS)[number];
const ANGLE_LABELS: Record<AngleId, string> = { ascendant: "Yükselen", midheaven: "MC" };

export type ParsedTopic =
  | { kind: "planet_in_sign"; body: BodyId; sign: SignId }
  | { kind: "planet_in_house"; body: BodyId; house: number }
  | { kind: "aspect"; a: BodyId; type: AspectType; b: BodyId }
  | { kind: "pattern"; pattern: PatternKind }
  | { kind: "angle_in_sign"; angle: AngleId; sign: SignId };

const isBody = (v: string): v is BodyId => (BODY_IDS as readonly string[]).includes(v);
const isSign = (v: string): v is SignId => (SIGN_IDS as readonly string[]).includes(v);
const isAspect = (v: string): v is AspectType => (ASPECT_TYPES as readonly string[]).includes(v);
const isPattern = (v: string): v is PatternKind => (PATTERN_KINDS as readonly string[]).includes(v);
const isAngle = (v: string): v is AngleId => (ANGLE_IDS as readonly string[]).includes(v);

/** Açıdaki cisimler kanonik sırada (BODY_IDS sırası) → "sun-saturn" ile "saturn-sun" aynı anahtar. */
export function orderBodies(a: BodyId, b: BodyId): [BodyId, BodyId] {
  return BODY_IDS.indexOf(a) <= BODY_IDS.indexOf(b) ? [a, b] : [b, a];
}

export function topicKey(t: ParsedTopic): string {
  switch (t.kind) {
    case "planet_in_sign":
      return `planet_in_sign:${t.body}:${t.sign}`;
    case "planet_in_house":
      return `planet_in_house:${t.body}:${t.house}`;
    case "aspect": {
      const [a, b] = orderBodies(t.a, t.b);
      return `aspect:${a}:${t.type}:${b}`;
    }
    case "pattern":
      return `pattern:${t.pattern}`;
    case "angle_in_sign":
      return `angle_in_sign:${t.angle}:${t.sign}`;
  }
}

/** Western konu anahtarını doğrular (her parça bilinen kanonik kimlik olmalı; kanonik sıra zorunlu). */
export function parseWesternTopicKey(key: unknown): ParsedTopic | null {
  if (typeof key !== "string" || key.length > 120) return null;
  const p = key.split(":");
  switch (p[0]) {
    case "planet_in_sign":
      return p.length === 3 && isBody(p[1]) && isSign(p[2]) ? { kind: "planet_in_sign", body: p[1], sign: p[2] } : null;
    case "planet_in_house": {
      if (p.length !== 3 || !isBody(p[1]) || !/^(?:[1-9]|1[0-2])$/.test(p[2])) return null;
      return { kind: "planet_in_house", body: p[1], house: Number(p[2]) };
    }
    case "aspect": {
      if (p.length !== 4 || !isBody(p[1]) || !isAspect(p[2]) || !isBody(p[3]) || p[1] === p[3]) return null;
      const [a, b] = orderBodies(p[1], p[3]);
      if (a !== p[1]) return null; // kanonik olmayan sıra reddedilir (tek anahtar = tek konu)
      return { kind: "aspect", a, type: p[2], b };
    }
    case "pattern":
      return p.length === 2 && isPattern(p[1]) ? { kind: "pattern", pattern: p[1] } : null;
    case "angle_in_sign":
      return p.length === 3 && isAngle(p[1]) && isSign(p[2]) ? { kind: "angle_in_sign", angle: p[1], sign: p[2] } : null;
    default:
      return null;
  }
}

export function parseTopicKey(tradition: unknown, key: unknown): ParsedTopic | null {
  if (tradition !== "western") return null; // Vedik/KP taksonomisi sonraki aşamalarda
  return parseWesternTopicKey(key);
}

export function topicLabel(t: ParsedTopic): string {
  switch (t.kind) {
    case "planet_in_sign":
      return `${BODY_LABELS[t.body]} ${SIGN_LABELS[t.sign]} burcunda`;
    case "planet_in_house":
      return `${BODY_LABELS[t.body]} ${t.house}. evde`;
    case "aspect":
      return `${BODY_LABELS[t.a]} ${ASPECT_LABELS[t.type]} ${BODY_LABELS[t.b]}`;
    case "pattern":
      return PATTERN_LABELS[t.pattern];
    case "angle_in_sign":
      return `${ANGLE_LABELS[t.angle]} ${SIGN_LABELS[t.sign]} burcunda`;
  }
}

export function topicLabelForKey(key: string): string {
  const t = parseWesternTopicKey(key);
  return t ? topicLabel(t) : key;
}

export type NatalTopic = { key: string; kind: WesternTopicKind; label: string };

/**
 * Natal teknik sonuçtan konu anahtarları. Saat-bağımlı konular (ev, Yükselen/MC) yalnız teknik
 * katmanda mevcutsa üretilir → saat bilinmeyen (maskelenmiş) haritada ev konusu ÜRETİLMEZ.
 */
export function topicsFromNatal(t: NatalTechnical): NatalTopic[] {
  const out = new Map<string, NatalTopic>();
  const add = (p: ParsedTopic) => {
    const key = topicKey(p);
    if (!out.has(key)) out.set(key, { key, kind: p.kind, label: topicLabel(p) });
  };
  for (const b of t.bodies) {
    add({ kind: "planet_in_sign", body: b.id, sign: b.sign });
    if (b.house !== null) add({ kind: "planet_in_house", body: b.id, house: b.house });
  }
  if (t.angles) {
    add({ kind: "angle_in_sign", angle: "ascendant", sign: t.angles.ascendant.sign });
    add({ kind: "angle_in_sign", angle: "midheaven", sign: t.angles.midheaven.sign });
  }
  for (const a of t.aspects) add({ kind: "aspect", a: a.a, type: a.type, b: a.b });
  for (const p of t.patterns) add({ kind: "pattern", pattern: p.kind });
  return [...out.values()];
}
