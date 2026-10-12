// Astroloji — Roxy `POST /astrology/natal-chart` ADAPTÖRÜ (SAF; ağ/DB/env YOK → test edilebilir).
//
// KAYNAK: resmi OpenAPI (roxyapi.com/openapi.json v2.0.0, 2026-10-07) — alan alan sınıflandırma:
//
//   TEKNİK (beyaz liste → NatalTechnical):
//     birthDetails.{date,time,latitude,longitude,timezone}
//     planets[].{name,longitude,latitude,sign,degree,house,speed,isRetrograde,dignity}
//     houses[].{number,longitude,sign,degree} · houseSystem
//     aspects[].{planet1,planet2,type,angle,orb,isApplying,strength,interpretation*}
//         *aspects[].interpretation = "harmonious|challenging|neutral" NİTELİK KİMLİĞİDİR (anlatı değil)
//     patterns[].{kind,planets,apex,element,modality,dissociate,tightness}
//     aspectsInterpretation.{dominant,harmonious,challenging,neutral} (sayımlar)
//     ascendant / midheaven / partOfFortune / vertex .{sign,degree,longitude,house,sect}
//     summary.{dominantElement,dominantModality,retrogradePlanets,elementDistribution,modalityDistribution}
//
//   SAĞLAYICI YORUMU (→ NatalInterpretation; ayrı tablo, ayrı yetki):
//     planets[].interpretation.{summary,detailed,keywords}
//     aspects[].aspectInterpretation.{summary,keywords}
//     patterns[].interpretation
//     aspectsInterpretation.summary
//
//   BİLİNÇLİ YOK SAYILAN (hiçbir projeksiyona girmez; yalnız ham yanıtta kalır):
//     *Localized alanlar (etiketler Yaşam sözlüğünden), patterns[].name (serbest metin),
//     patterns[].interpretationKey / interpretationVars (yorum şablon tesisatı)
//
//   BİLİNMEYEN alanlar: hiçbir projeksiyona GİRMEZ (fail-closed); yalnız yol adı
//   `unmapped_fields` listesine yazılır (değer DEĞİL) → sonraki adaptör sürümünde sınıflandırılır.

import {
  ASPECT_NATURES,
  BODY_IDS,
  DIGNITIES,
  ELEMENTS,
  HOUSE_SYSTEMS,
  MODALITIES,
  NATAL_INTERP_SCHEMA,
  NATAL_TECHNICAL_SCHEMA,
  NODE_TYPES,
  SIGN_IDS,
  type AspectNature,
  type AspectType,
  type BodyId,
  type Dignity,
  type EclipticPoint,
  type Element,
  type HouseSystem,
  type Modality,
  type NatalAspect,
  type NatalBody,
  type NatalHouse,
  type NatalInterpretation,
  type NatalPattern,
  type NatalTechnical,
  type NodeType,
  type PatternKind,
  type SignId,
} from "../../model/western";

export const ROXY_NATAL_ENDPOINT = "/astrology/natal-chart";
/** Adaptör sürümü — önbellek anahtarının parçası (istek biçimi değişirse yeni hesap). */
export const ROXY_NATAL_ADAPTER_VERSION = "astro-roxy-natal-1";
/** Projeksiyon sürümü — beyaz liste değişirse ham yanıttan yeniden üretilebilir (yeni istek YOK). */
export const ROXY_NATAL_PROJECTION_VERSION = "natal-proj-2";

// ─── İstek ───────────────────────────────────────────────────────────────────

export type NatalMethodOptions = { houseSystem: HouseSystem; nodeType: NodeType };

export const DEFAULT_NATAL_OPTIONS: Readonly<NatalMethodOptions> = Object.freeze({ houseSystem: "placidus", nodeType: "true" });

export function parseNatalOptions(raw: unknown): NatalMethodOptions | null {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const houseSystem = o.houseSystem ?? DEFAULT_NATAL_OPTIONS.houseSystem;
  const nodeType = o.nodeType ?? DEFAULT_NATAL_OPTIONS.nodeType;
  if (!(HOUSE_SYSTEMS as readonly unknown[]).includes(houseSystem)) return null;
  if (!(NODE_TYPES as readonly unknown[]).includes(nodeType)) return null;
  return { houseSystem: houseSystem as HouseSystem, nodeType: nodeType as NodeType };
}

export type NatalBirthInput = {
  birthDate: string; // YYYY-MM-DD
  birthTime: string | null; // HH:mm:ss; null → saat bilinmiyor
  utcOffsetSeconds: number;
  latitude: number;
  longitude: number;
};

/** Sağlayıcıya giden NORMALİZE gövde (önbellek anahtarı da bundan türetilir). */
export function buildNatalRequestBody(b: NatalBirthInput, opts: NatalMethodOptions): Record<string, unknown> {
  return {
    date: b.birthDate,
    time: b.birthTime ?? "12:00:00",
    latitude: Math.round(b.latitude * 1e6) / 1e6,
    longitude: Math.round(b.longitude * 1e6) / 1e6,
    // IANA yerine ondalık saat: DST belirsizliği bizim tarafımızda (dst_choice) çözüldü;
    // sağlayıcının kendi IANA çözümüne (sessiz seçim) bırakılmaz. LMT kesirleri korunur.
    timezone: Math.round((b.utcOffsetSeconds / 3600) * 1e6) / 1e6,
    nodeType: opts.nodeType,
    houseSystem: opts.houseSystem,
  };
}

// ─── Kanonik eşlemeler (yalnız bunlar teknik katmana girer) ──────────────────

const compact = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

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

const ASPECT_MAP: Record<string, AspectType> = {
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

const PATTERN_MAP: Record<string, PatternKind> = {
  grandtrine: "grand_trine",
  kite: "kite",
  tsquare: "t_square",
  grandcross: "grand_cross",
  yod: "yod",
  mysticrectangle: "mystic_rectangle",
  stellium: "stellium",
};

function mapBody(v: unknown): BodyId | null {
  return typeof v === "string" ? BODY_MAP[compact(v)] ?? null : null;
}
function mapSign(v: unknown): SignId | null {
  if (typeof v !== "string") return null;
  const k = compact(v);
  return (SIGN_IDS as readonly string[]).includes(k) ? (k as SignId) : null;
}
function mapEnum<T extends string>(v: unknown, values: readonly T[]): T | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (values as readonly string[]).includes(k) ? (k as T) : null;
}
function num(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}
function int(v: unknown, min: number, max: number): number | null {
  const n = num(v, min, max);
  return n !== null && Number.isInteger(n) ? n : null;
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function eclipticPoint(o: Record<string, unknown> | null): EclipticPoint | null {
  if (!o) return null;
  const longitude = num(o.longitude, 0, 360);
  const sign = mapSign(o.sign);
  const degreeInSign = num(o.degree, 0, 30);
  if (longitude === null || sign === null || degreeInSign === null) return null;
  return { longitude, sign, degreeInSign };
}

// ─── Projeksiyon ─────────────────────────────────────────────────────────────

export type NatalProjection = {
  technical: NatalTechnical;
  interpretation: NatalInterpretation;
  unmappedFields: string[];
  /** Eşlenemeyen DEĞERLER (ör. bilinmeyen gezegen adı/açı türü) — yol + sayaç, değer değil. */
  droppedValues: string[];
};

export type NatalProjectionResult = { ok: true; value: NatalProjection } | { ok: false; errors: string[] };

// 2026-10-12 (UAT madde 11): sağlayıcı metni SESSİZCE kesilmez. Sınır 20 000 karakter (gerçek yanıtlarda en uzun metin
// ~1 350 karakter; DB yorum satırı ≤ 1 MB). Aşılırsa metnin sonuna AÇIK not eklenir; tam yanıt ham kayıtta durur.
const MAX_TEXT = 20000;
const TRUNCATED_NOTE = " […] (Sağlayıcı metni 20 000 karakterden uzun olduğu için burada kısaltıldı; tam yanıt ham kayıtta saklıdır.)";
const MAX_KEYWORDS = 30; // golden 2026-10-07: açı başına 12 anahtar kelime görüldü → pay bırakıldı
const MAX_KEYWORD_LEN = 60;

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}${TRUNCATED_NOTE}` : t;
}
function keywords(v: unknown): string[] {
  const a = arr(v);
  if (!a) return [];
  return a
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .slice(0, MAX_KEYWORDS)
    .map((k) => k.trim().slice(0, MAX_KEYWORD_LEN));
}

export function projectRoxyNatal(raw: unknown, opts: NatalMethodOptions): NatalProjectionResult {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root: nesne değil"] };

  // echo
  const bd = obj(r.birthDetails);
  const echoDate = typeof bd?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bd.date) ? bd.date : null;
  const echoTime = typeof bd?.time === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(bd.time) ? bd.time : null;
  const echoTz = num(bd?.timezone, -18, 18);
  const echoLat = num(bd?.latitude, -90, 90);
  const echoLon = num(bd?.longitude, -180, 180);
  if (!echoDate || !echoTime || echoTz === null || echoLat === null || echoLon === null) errors.push("birthDetails: eksik/geçersiz");
  // Golden 2026-10-07: gerçek yanıt birthDetails.nodeType yankısı içeriyor (OpenAPI'de yok) → teknik yankı.
  const echoNode = bd?.nodeType === undefined ? null : mapEnum<NodeType>(bd.nodeType, NODE_TYPES);
  if (bd?.nodeType !== undefined && echoNode !== opts.nodeType) errors.push("birthDetails.nodeType: istenenle uyuşmuyor");

  const hsRaw = mapEnum(r.houseSystem, HOUSE_SYSTEMS);
  if (hsRaw === null) errors.push("houseSystem: eksik/geçersiz");
  else if (hsRaw !== opts.houseSystem) errors.push("houseSystem: istenenle uyuşmuyor");

  // bodies
  const bodies: NatalBody[] = [];
  const interpBodies: NatalInterpretation["bodies"] = [];
  const planets = arr(r.planets);
  if (!planets) errors.push("planets: dizi değil");
  for (const p of planets ?? []) {
    const o = obj(p);
    const id = mapBody(o?.name);
    if (!o || !id) {
      dropped.push("planets[].name");
      continue;
    }
    if (bodies.some((b) => b.id === id)) {
      dropped.push("planets[].name(duplicate)");
      continue;
    }
    const pt = eclipticPoint(o);
    const latitude = num(o.latitude, -90, 90);
    const speed = num(o.speed, -50, 50);
    if (!pt || latitude === null || speed === null || typeof o.isRetrograde !== "boolean") {
      errors.push(`planets[${id}]: eksik/geçersiz sayısal alan`);
      continue;
    }
    const house = o.house === undefined || o.house === null ? null : int(o.house, 1, 12);
    if (o.house !== undefined && o.house !== null && house === null) errors.push(`planets[${id}].house: geçersiz`);
    const dignity = o.dignity === undefined || o.dignity === null ? null : mapEnum<Dignity>(o.dignity, DIGNITIES);
    if (o.dignity !== undefined && o.dignity !== null && dignity === null) dropped.push("planets[].dignity");
    bodies.push({ id, ...pt, latitude, house, speed, retrograde: o.isRetrograde, dignity });

    const pi = obj(o.interpretation);
    if (pi) {
      const summary = text(pi.summary);
      const detailed = text(pi.detailed);
      const kw = keywords(pi.keywords);
      if (summary || detailed || kw.length) interpBodies.push({ id, summary, detailed, keywords: kw });
    }
  }
  const classical = bodies.filter((b) => BODY_IDS.indexOf(b.id) < 10).length;
  if (classical < 10) errors.push(`planets: 10 klasik gezegenden ${classical} bulundu`);

  // houses
  const houses: NatalHouse[] = [];
  const hArr = arr(r.houses);
  if (!hArr) errors.push("houses: dizi değil");
  for (const h of hArr ?? []) {
    const o = obj(h);
    const n = int(o?.number, 1, 12);
    const pt = eclipticPoint(o);
    if (n === null || !pt) {
      errors.push("houses[]: eksik/geçersiz");
      continue;
    }
    if (houses.some((x) => x.number === n)) {
      errors.push(`houses[${n}]: tekrar`);
      continue;
    }
    houses.push({ number: n, ...pt });
  }
  houses.sort((a, b) => a.number - b.number);
  if (hArr && houses.length !== 12) errors.push(`houses: 12 yerine ${houses.length}`);

  // angles
  const asc = eclipticPoint(obj(r.ascendant));
  const mc = eclipticPoint(obj(r.midheaven));
  if (!asc || !mc) errors.push("ascendant/midheaven: eksik/geçersiz");

  // points
  const pofO = obj(r.partOfFortune);
  const pofPt = eclipticPoint(pofO);
  const partOfFortune = pofPt
    ? {
        ...pofPt,
        house: pofO?.house === undefined ? null : int(pofO.house, 1, 12),
        sect: mapEnum<"day" | "night">(pofO?.sect, ["day", "night"] as const),
      }
    : null;
  const vxO = obj(r.vertex);
  const vxPt = eclipticPoint(vxO);
  const vertex = vxPt ? { ...vxPt, house: vxO?.house === undefined ? null : int(vxO.house, 1, 12) } : null;

  // aspects
  const aspects: NatalAspect[] = [];
  const interpAspects: NatalInterpretation["aspects"] = [];
  const aArr = arr(r.aspects);
  if (!aArr) errors.push("aspects: dizi değil");
  for (const a of aArr ?? []) {
    const o = obj(a);
    const p1 = mapBody(o?.planet1);
    const p2 = mapBody(o?.planet2);
    const type = typeof o?.type === "string" ? ASPECT_MAP[compact(o.type)] ?? null : null;
    if (!o || !p1 || !p2 || !type) {
      dropped.push("aspects[](planet/type)");
      continue;
    }
    const exactAngle = num(o.angle, 0, 360);
    const orb = num(o.orb, 0, 30);
    const strength = num(o.strength, 0, 100);
    if (exactAngle === null || orb === null || strength === null || typeof o.isApplying !== "boolean") {
      errors.push("aspects[]: eksik/geçersiz sayısal alan");
      continue;
    }
    const nature = mapEnum<AspectNature>(o.interpretation, ASPECT_NATURES);
    aspects.push({ a: p1, b: p2, type, exactAngle, orb, applying: o.isApplying, strength, nature });

    const ai = obj(o.aspectInterpretation);
    if (ai) {
      const summary = text(ai.summary);
      const kw = keywords(ai.keywords);
      if (summary || kw.length) interpAspects.push({ a: p1, b: p2, type, summary, keywords: kw });
    }
  }

  // patterns
  const patterns: NatalPattern[] = [];
  const interpPatterns: NatalInterpretation["patterns"] = [];
  for (const p of arr(r.patterns) ?? []) {
    const o = obj(p);
    const kind = typeof o?.kind === "string" ? PATTERN_MAP[compact(o.kind)] ?? null : null;
    const members = (arr(o?.planets) ?? []).map(mapBody);
    if (!o || !kind || members.length === 0 || members.some((m) => m === null)) {
      dropped.push("patterns[](kind/planets)");
      continue;
    }
    const bodyIds = members as BodyId[];
    patterns.push({
      kind,
      bodies: bodyIds,
      apex: o.apex === undefined || o.apex === null ? null : mapBody(o.apex),
      element: o.element === undefined ? null : mapEnum<Element>(o.element, ELEMENTS),
      modality: o.modality === undefined ? null : mapEnum<Modality>(o.modality, MODALITIES),
      outOfSign: o.dissociate === true,
      tightness: num(o.tightness, 0, 100),
    });
    const t = text(o.interpretation);
    if (t) interpPatterns.push({ kind, bodies: bodyIds, text: t });
  }

  // summary
  const s = obj(r.summary);
  const dist = <K extends string>(v: unknown, keys: readonly K[]): Record<K, number> | null => {
    const o = obj(v);
    if (!o) return null;
    const out = {} as Record<K, number>;
    for (const k of keys) {
      const found = Object.entries(o).find(([kk]) => kk.toLowerCase() === k);
      const n = found ? int(found[1], 0, 14) : 0;
      if (n === null) return null;
      out[k] = n;
    }
    return out;
  };
  const retro = (arr(s?.retrogradePlanets) ?? []).map(mapBody).filter((b): b is BodyId => b !== null);
  const ai = obj(r.aspectsInterpretation);
  const dominantRaw = typeof ai?.dominant === "string" ? ai.dominant.trim().toLowerCase() : null;
  const dominant =
    dominantRaw === "harmonious" || dominantRaw === "challenging" || dominantRaw === "balanced" ? dominantRaw : null;

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };

  const technical: NatalTechnical = {
    schema: NATAL_TECHNICAL_SCHEMA,
    zodiac: "tropical",
    houseSystem: opts.houseSystem,
    nodeType: opts.nodeType,
    echo: { date: echoDate!, time: echoTime!, utcOffsetHours: echoTz!, latitude: echoLat!, longitude: echoLon!, nodeType: echoNode },
    variants: { lilith: "mean", node: opts.nodeType },
    bodies,
    houses,
    angles: { ascendant: asc!, midheaven: mc! },
    points: { partOfFortune, vertex },
    aspects,
    patterns,
    summary: {
      dominantElement: mapEnum<Element>(s?.dominantElement, ELEMENTS),
      dominantModality: mapEnum<Modality>(s?.dominantModality, MODALITIES),
      retrograde: retro,
      elementDistribution: dist(s?.elementDistribution, ELEMENTS),
      modalityDistribution: dist(s?.modalityDistribution, MODALITIES),
      aspectBalance: {
        dominant,
        harmonious: int(ai?.harmonious, 0, 1000),
        challenging: int(ai?.challenging, 0, 1000),
        neutral: int(ai?.neutral, 0, 1000),
      },
    },
  };

  const interpretation: NatalInterpretation = {
    schema: NATAL_INTERP_SCHEMA,
    bodies: interpBodies,
    aspects: interpAspects,
    patterns: interpPatterns,
    overall: { aspectSummary: text(ai?.summary) },
  };

  return {
    ok: true,
    value: { technical, interpretation, unmappedFields: findUnmappedNatalFields(raw), droppedValues: [...new Set(dropped)] },
  };
}

// ─── Bilinmeyen alan tespiti (yalnız YOL; değer asla) ────────────────────────

const KNOWN_NATAL_PATHS = new Set<string>([
  "birthDetails",
  "birthDetails.date",
  "birthDetails.time",
  "birthDetails.latitude",
  "birthDetails.longitude",
  "birthDetails.timezone",
  "birthDetails.nodeType",
  "planets",
  ...[
    "name",
    "nameLocalized",
    "longitude",
    "latitude",
    "sign",
    "signLocalized",
    "degree",
    "house",
    "speed",
    "isRetrograde",
    "dignity",
    "interpretation",
    "interpretation.summary",
    "interpretation.detailed",
    "interpretation.keywords",
  ].map((k) => `planets[].${k}`),
  "houses",
  ...["number", "longitude", "sign", "signLocalized", "degree"].map((k) => `houses[].${k}`),
  "houseSystem",
  "aspects",
  ...[
    "planet1",
    "planet1Localized",
    "planet2",
    "planet2Localized",
    "type",
    "typeLocalized",
    "angle",
    "orb",
    "isApplying",
    "strength",
    "interpretation",
    "aspectInterpretation",
    "aspectInterpretation.summary",
    "aspectInterpretation.keywords",
  ].map((k) => `aspects[].${k}`),
  "patterns",
  ...[
    "kind",
    "name",
    "planets",
    "apex",
    "element",
    "modality",
    "dissociate",
    "tightness",
    "interpretation",
    "interpretationKey",
    "interpretationVars",
  ].map((k) => `patterns[].${k}`),
  "aspectsInterpretation",
  ...["summary", "dominant", "harmonious", "challenging", "neutral"].map((k) => `aspectsInterpretation.${k}`),
  ...["ascendant", "midheaven"].flatMap((p) => [p, ...["sign", "signLocalized", "degree", "longitude"].map((k) => `${p}.${k}`)]),
  "partOfFortune",
  ...["sign", "signLocalized", "degree", "longitude", "house", "sect"].map((k) => `partOfFortune.${k}`),
  "vertex",
  ...["sign", "signLocalized", "degree", "longitude", "house"].map((k) => `vertex.${k}`),
  "summary",
  ...[
    "dominantElement",
    "dominantElementLocalized",
    "dominantModality",
    "dominantModalityLocalized",
    "retrogradePlanets",
    "retrogradePlanetsLocalized",
    "elementDistribution",
    "modalityDistribution",
  ].map((k) => `summary.${k}`),
]);

/** Dinamik anahtarlı haritalar — içine inilmez (anahtarları veri). */
const OPAQUE_NATAL_PATHS = new Set<string>([
  "patterns[].interpretationVars",
  "summary.elementDistribution",
  "summary.modalityDistribution",
  "planets[].interpretation.keywords",
  "aspectInterpretation.keywords",
  "aspects[].aspectInterpretation.keywords",
  "summary.retrogradePlanets",
  "summary.retrogradePlanetsLocalized",
  "patterns[].planets",
]);

const MAX_UNMAPPED = 200;

export function findUnmappedNatalFields(raw: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, path: string, depth: number) => {
    if (out.size >= MAX_UNMAPPED || depth > 8) return;
    if (path && OPAQUE_NATAL_PATHS.has(path)) return;
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 50)) walk(item, `${path}[]`, depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const safeKey = k.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60);
        const p = path ? `${path}.${safeKey}` : safeKey;
        if (!KNOWN_NATAL_PATHS.has(p)) {
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
