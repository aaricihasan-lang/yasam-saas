// Astroloji — Roxy adaptörleri için ORTAK saf yardımcılar (eşleme, doğrulama, metin, bilinmeyen alan).
// Natal adaptörü (Aşama 1, golden-doğrulanmış) kendi kopyasını korur; Aşama 3 adaptörleri bunu kullanır.

import {
  ASPECT_NATURES,
  DIGNITIES,
  SIGN_IDS,
  type AspectNature,
  type AspectType,
  type BodyId,
  type Dignity,
  type EclipticPoint,
  type NatalAspect,
  type NatalHouse,
  type SignId,
} from "../../model/western";
import type { AnglePointId, PointId } from "../../model/westernTiming";

export const compact = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

const BODY_MAP: Record<string, BodyId> = {
  sun: "sun",
  moon: "moon",
  mercury: "mercury",
  venus: "venus",
  mars: "mars",
  jupiter: "jupiter",
  saturn: "saturn",
  uranus: "uranus",
  neptune: "neptune",
  pluto: "pluto",
  northnode: "north_node",
  truenode: "north_node",
  meannode: "north_node",
  southnode: "south_node",
  chiron: "chiron",
  blackmoonlilith: "lilith",
  lilith: "lilith",
};
const ANGLE_MAP: Record<string, AnglePointId> = { ascendant: "ascendant", asc: "ascendant", midheaven: "midheaven", mc: "midheaven" };

export const ASPECT_MAP: Record<string, AspectType> = {
  conjunction: "conjunction",
  opposition: "opposition",
  trine: "trine",
  square: "square",
  sextile: "sextile",
  semisextile: "semi_sextile",
  semisquare: "semi_square",
  sesquiquadrate: "sesquiquadrate",
  sesquisquare: "sesquiquadrate",
  quincunx: "quincunx",
  inconjunct: "quincunx",
};

export function mapBody(v: unknown): BodyId | null {
  return typeof v === "string" ? BODY_MAP[compact(v)] ?? null : null;
}
export function mapPoint(v: unknown): PointId | null {
  if (typeof v !== "string") return null;
  return BODY_MAP[compact(v)] ?? ANGLE_MAP[compact(v)] ?? null;
}
export function mapSign(v: unknown): SignId | null {
  if (typeof v !== "string") return null;
  const k = compact(v);
  return (SIGN_IDS as readonly string[]).includes(k) ? (k as SignId) : null;
}
export function mapAspect(v: unknown): AspectType | null {
  return typeof v === "string" ? ASPECT_MAP[compact(v)] ?? null : null;
}
export function mapEnum<T extends string>(v: unknown, values: readonly T[]): T | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (values as readonly string[]).includes(k) ? (k as T) : null;
}
/**
 * Açı niteliği. GOLDEN 2026-10-07: /astrology/transits `nature` alanı lang=tr ile YERELLEŞTİRİLMİŞ geliyor
 * ("uyumlu"/"zorlayıcı"/"nötr"; OpenAPI İngilizce enum gösteriyor). Her iki dil kanonik kimliğe çevrilir.
 */
const NATURE_TR: Record<string, AspectNature> = { uyumlu: "harmonious", "zorlayıcı": "challenging", zorlayici: "challenging", "nötr": "neutral", notr: "neutral" };
export function mapNature(v: unknown): AspectNature | null {
  const en = mapEnum<AspectNature>(v, ASPECT_NATURES);
  if (en) return en;
  return typeof v === "string" ? NATURE_TR[v.trim().toLocaleLowerCase("tr-TR")] ?? null : null;
}
export function mapDignity(v: unknown): Dignity | null {
  return mapEnum<Dignity>(v, DIGNITIES);
}
export function num(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}
export function int(v: unknown, min: number, max: number): number | null {
  const n = num(v, min, max);
  return n !== null && Number.isInteger(n) ? n : null;
}
export function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
export function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}
export const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** {longitude, sign, degree} → kanonik ekliptik nokta (sign eksikse boylamdan türetilir). */
export function eclipticPoint(o: Record<string, unknown> | null, lonKey = "longitude"): EclipticPoint | null {
  if (!o) return null;
  const longitude = num(o[lonKey], 0, 360);
  if (longitude === null) return null;
  const sign = mapSign(o.sign) ?? SIGN_IDS[Math.floor((longitude % 360) / 30)];
  const degreeInSign = num(o.degree, 0, 30) ?? longitude % 30;
  return { longitude, sign, degreeInSign };
}

// 2026-10-12 (UAT madde 11): sağlayıcı metni SESSİZCE kesilmez. Sınır 20 000 karakter (gerçek yanıtlarda en uzun metin
// ~1 350 karakter; DB yorum satırı ≤ 1 MB). Aşılırsa metnin sonuna AÇIK not eklenir; tam yanıt ham kayıtta durur.
const MAX_TEXT = 20000;
const TRUNCATED_NOTE = " […] (Sağlayıcı metni 20 000 karakterden uzun olduğu için burada kısaltıldı; tam yanıt ham kayıtta saklıdır.)";
const MAX_KEYWORDS = 30;
export function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}${TRUNCATED_NOTE}` : t;
}
export function texts(v: unknown): string[] {
  return (arr(v) ?? []).map(text).filter((x): x is string => x !== null).slice(0, MAX_KEYWORDS);
}
export function keywords(v: unknown): string[] {
  return (arr(v) ?? [])
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .slice(0, MAX_KEYWORDS)
    .map((k) => k.trim().slice(0, 60));
}

/** Natal-biçimli harita evleri. */
export function projectHouses(v: unknown, errors: string[], ctx: string): NatalHouse[] {
  const houses: NatalHouse[] = [];
  for (const h of arr(v) ?? []) {
    const o = obj(h);
    const n = int(o?.number, 1, 12);
    const pt = eclipticPoint(o);
    if (n === null || !pt || houses.some((x) => x.number === n)) {
      errors.push(`${ctx}.houses[]: geçersiz`);
      continue;
    }
    houses.push({ number: n, ...pt });
  }
  houses.sort((a, b) => a.number - b.number);
  if (houses.length !== 12) errors.push(`${ctx}.houses: 12 yerine ${houses.length}`);
  return houses;
}

/** Natal-biçimli (planet1/planet2/type/…/interpretation=nitelik) açılar. */
export function projectChartAspects(v: unknown, dropped: string[], errors: string[], ctx: string): NatalAspect[] {
  const out: NatalAspect[] = [];
  for (const a of arr(v) ?? []) {
    const o = obj(a);
    const p1 = mapBody(o?.planet1);
    const p2 = mapBody(o?.planet2);
    const type = mapAspect(o?.type);
    if (!o || !p1 || !p2 || !type) {
      dropped.push(`${ctx}.aspects[](planet/type)`);
      continue;
    }
    const exactAngle = num(o.angle, 0, 360);
    const orb = num(o.orb, 0, 30);
    const strength = num(o.strength, 0, 100);
    if (exactAngle === null || orb === null || strength === null || typeof o.isApplying !== "boolean") {
      errors.push(`${ctx}.aspects[]: sayısal alan`);
      continue;
    }
    out.push({ a: p1, b: p2, type, exactAngle, orb, applying: o.isApplying, strength, nature: mapNature(o.interpretation ?? o.nature) });
  }
  return out;
}

// ─── Bilinmeyen alan tespiti (yalnız YOL; değer asla) ────────────────────────

export function findUnmapped(raw: unknown, known: ReadonlySet<string>, opaque: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, path: string, depth: number) => {
    if (out.size >= 200 || depth > 9) return;
    if (path && opaque.has(path)) return;
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 60)) walk(item, `${path}[]`, depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const safeKey = k.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60);
        const p = path ? `${path}.${safeKey}` : safeKey;
        if (!known.has(p)) {
          out.add(p);
          continue;
        }
        walk(child, p, depth + 1);
      }
    }
  };
  walk(raw, "", 0);
  return [...out].sort();
}

/** "a.b", ["x","y"] → {"a.b", "a.b.x", "a.b.y"} */
export function paths(prefix: string, keys: string[]): string[] {
  return [prefix, ...keys.map((k) => `${prefix}.${k}`)];
}

/** Natal-biçimli harita (return/composite) bilinen yolları. */
export function chartKnownPaths(prefix: string, opts: { planetsKey: string; withDignity?: boolean; withInterpObj?: string }): string[] {
  const p = (k: string) => (prefix ? `${prefix}.${k}` : k);
  const planetKeys = ["name", "nameLocalized", "longitude", "latitude", "sign", "signLocalized", "degree", "house", "speed", "isRetrograde"];
  if (opts.withDignity) planetKeys.push("dignity");
  const out = [
    ...paths(p(`${opts.planetsKey}[]`), planetKeys),
    p(opts.planetsKey),
    ...paths(p("houses[]"), ["number", "longitude", "sign", "signLocalized", "degree"]),
    p("houses"),
    p("houseSystem"),
    p("aspects"),
    ...paths(p("aspects[]"), ["planet1", "planet1Localized", "planet2", "planet2Localized", "type", "typeLocalized", "angle", "orb", "isApplying", "strength", "interpretation"]),
    ...paths(p("partOfFortune"), ["sign", "signLocalized", "degree", "longitude", "house", "sect"]),
    ...paths(p("vertex"), ["sign", "signLocalized", "degree", "longitude", "house"]),
    ...paths(p("birthDetails"), ["date", "time", "latitude", "longitude", "timezone", "nodeType"]),
  ];
  if (opts.withInterpObj) out.push(...paths(p(`${opts.planetsKey}[].${opts.withInterpObj}`), ["summary", "relationshipMeaning", "keywords", "detailed"]));
  return out.filter((x) => x.length > 0);
}

/** Aspect türü için tam açı (derece). */
export const ASPECT_EXACT: Record<AspectType, number> = {
  conjunction: 0,
  opposition: 180,
  trine: 120,
  square: 90,
  sextile: 60,
  semi_sextile: 30,
  semi_square: 45,
  sesquiquadrate: 135,
  quincunx: 150,
};

export function angularDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}
