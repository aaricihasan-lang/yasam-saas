// Astroloji — NATAL ÇARK GÖRÜNÜM SEÇİMİ (SAF; istemci güvenli). Yalnız Natal sonuç / kayıtlı Natal ekranı kullanır.
//
//   • Temel / Profesyonel görünüm AYNI kanonik teknik veriyi kullanır: burada hiçbir değer hesaplanmaz, yuvarlanmaz,
//     değiştirilmez; yalnız "çarkta neyin çizileceği" seçilir. Görünüm değişimi sağlayıcı isteği / kredi / kayıt üretmez.
//   • Açı LİSTESİ (teknik veri) silinmez; görünüm yalnız ÇİZİLEN açıları filtreler → "toplam" ve "çizilen" sayıları ayrı.
//   • Orb kuralları DEĞİŞMEZ: açılar sağlayıcının verdiği orb ile aynen kalır (bu dosya orb'a göre eleme yapmaz).
//   • Vertex / Şans Noktası yalnız teknik veride gerçekten varsa (saat biliniyorsa) çizilebilir; sahte konum üretilmez.

import { BODY_IDS, type AspectNature, type AspectType, type BodyId, type NatalAspect, type NatalTechnical, type SignId } from "../model/western";

export const NATAL_WHEEL_MODES = ["basic", "pro"] as const;
export type NatalWheelMode = (typeof NATAL_WHEEL_MODES)[number];

export const NATAL_WHEEL_MODE_LABELS: Record<NatalWheelMode, string> = { basic: "Temel", pro: "Profesyonel" };

/** Kullanıcının çarkta açıp kapatabileceği isteğe bağlı noktalar (10 gezegen her zaman çizilir). */
export const NATAL_OPTIONAL_POINTS = ["nodes", "chiron", "lilith", "vertex", "fortune"] as const;
export type NatalOptionalPoint = (typeof NATAL_OPTIONAL_POINTS)[number];

export const NATAL_OPTIONAL_POINT_LABELS: Record<NatalOptionalPoint, string> = {
  nodes: "Ay Düğümleri",
  chiron: "Kiron",
  lilith: "Lilith",
  vertex: "Vertex",
  fortune: "Şans Noktası",
};

export type NatalPointSelection = Record<NatalOptionalPoint, boolean>;

/** Temel: yalnız Ay Düğümleri (sade). Profesyonel: önceki çarkla aynı gövdeler (Düğümler, Kiron, Lilith); Vertex ve
 *  Şans Noktası çarka zorla eklenmez — kullanıcı seçer. */
export const DEFAULT_POINTS: Record<NatalWheelMode, NatalPointSelection> = {
  basic: { nodes: true, chiron: false, lilith: false, vertex: false, fortune: false },
  pro: { nodes: true, chiron: true, lilith: true, vertex: false, fortune: false },
};

/** Varsayılan görünüm Profesyonel: mevcut çarkın gösterdiği bütün gövde ve açılar aynen kalır (önceki davranış korunur). */
export const DEFAULT_MODE: NatalWheelMode = "pro";

/**
 * Açı çizgisi filtresi (yalnız çizim; liste ve orb değişmez). Varsayılan: hepsi açık, odak yok → önceki çizim aynen.
 *   • major / minor: açı grubu (Temel görünüm zaten yalnız başlıca açıları çizer; orada minor anlamsızdır).
 *   • harmonious / challenging / neutral: sağlayıcının verdiği açı niteliği (nitelik yoksa "neutral" sayılır).
 *   • focus: yalnız bu gövdeye değen açılar çizilir (ör. Güneş'in açıları); null = tüm gövdeler.
 */
export type NatalAspectFilter = { major: boolean; minor: boolean; harmonious: boolean; challenging: boolean; neutral: boolean; focus: BodyId | null };

export const DEFAULT_ASPECT_FILTER: NatalAspectFilter = { major: true, minor: true, harmonious: true, challenging: true, neutral: true, focus: null };

const FILTER_FLAGS = ["major", "minor", "harmonious", "challenging", "neutral"] as const;

export function isDefaultAspectFilter(f: NatalAspectFilter): boolean {
  return f.focus === null && FILTER_FLAGS.every((k) => f[k]);
}

export type NatalWheelPrefs = { mode: NatalWheelMode; points: Record<NatalWheelMode, NatalPointSelection>; filter: NatalAspectFilter };

export const DEFAULT_PREFS: NatalWheelPrefs = {
  mode: DEFAULT_MODE,
  points: { basic: { ...DEFAULT_POINTS.basic }, pro: { ...DEFAULT_POINTS.pro } },
  filter: { ...DEFAULT_ASPECT_FILTER },
};

/** Temel görünümde çizilen başlıca (Ptolemaik) açılar. */
export const BASIC_ASPECT_TYPES: ReadonlySet<AspectType> = new Set(["conjunction", "sextile", "square", "trine", "opposition"]);

/** Temel görünümde açı çizgisi alan gövdeler: yalnız 10 gezegen (düğüm / Kiron / Lilith çizgisi yok). */
export const PLANET_IDS: ReadonlySet<BodyId> = new Set(["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]);

const POINT_OF_BODY: Partial<Record<BodyId, NatalOptionalPoint>> = {
  north_node: "nodes",
  south_node: "nodes",
  chiron: "chiron",
  lilith: "lilith",
};

/** Kuzey–Güney Ay Düğümü arasındaki (her zaman tam karşıt) eksen "açısı". */
export function isNodeAxis(a: Pick<NatalAspect, "a" | "b">): boolean {
  return (a.a === "north_node" && a.b === "south_node") || (a.a === "south_node" && a.b === "north_node");
}

/** Seçime göre çarkta GÖSTERİLMEYEN gövdeler (gezegenler hiçbir zaman gizlenmez). */
export function hiddenBodiesFor(points: NatalPointSelection): Set<BodyId> {
  const out = new Set<BodyId>();
  for (const [body, key] of Object.entries(POINT_OF_BODY) as [BodyId, NatalOptionalPoint][]) if (!points[key]) out.add(body);
  return out;
}

type AspectLike = Pick<NatalAspect, "a" | "b" | "type"> & { nature?: AspectNature | null };

/** Çarkta çizilecek açı mı? (Liste değişmez; yalnız çizim.) `filter` verilmezse yalnız mod + nokta seçimi uygulanır. */
export function isAspectDrawn(a: AspectLike, mode: NatalWheelMode, hidden: ReadonlySet<BodyId>, filter?: NatalAspectFilter): boolean {
  if (hidden.has(a.a) || hidden.has(a.b)) return false;
  // KAD–GAD karşıtlığı tanım gereği her haritada 180°: merkezden geçen sabit çizgi bilgi taşımaz → çizilmez (listede kalır).
  if (isNodeAxis(a)) return false;
  if (mode === "basic" && !(BASIC_ASPECT_TYPES.has(a.type) && PLANET_IDS.has(a.a) && PLANET_IDS.has(a.b))) return false;
  if (!filter) return true;
  if (!filter[BASIC_ASPECT_TYPES.has(a.type) ? "major" : "minor"]) return false;
  if (!filter[a.nature ?? "neutral"]) return false;
  if (filter.focus && a.a !== filter.focus && a.b !== filter.focus) return false;
  return true;
}

export type WheelExtraPoint = { id: "vertex" | "fortune"; glyph: string; label: string; longitude: number; sign: SignId; degreeInSign: number };

/** Çarka eklenebilecek özel noktalar — YALNIZ teknik veride varsa (saat bilinmiyorsa points null → hiçbiri). */
export function extraPointsFor(t: Pick<NatalTechnical, "points">, points: NatalPointSelection): WheelExtraPoint[] {
  const out: WheelExtraPoint[] = [];
  const pof = t.points?.partOfFortune;
  if (points.fortune && pof) out.push({ id: "fortune", glyph: "⊗", label: "Şans Noktası", longitude: pof.longitude, sign: pof.sign, degreeInSign: pof.degreeInSign });
  const vx = t.points?.vertex;
  if (points.vertex && vx) out.push({ id: "vertex", glyph: "Vx", label: "Vertex", longitude: vx.longitude, sign: vx.sign, degreeInSign: vx.degreeInSign });
  return out;
}

/** Hangi isteğe bağlı nokta bu haritada gerçekten mevcut? (Mevcut olmayan seçenek arayüzde pasif gösterilir.) */
export function availablePoints(t: Pick<NatalTechnical, "bodies" | "points">): NatalPointSelection {
  const has = (id: BodyId) => t.bodies.some((b) => b.id === id);
  return {
    nodes: has("north_node") || has("south_node"),
    chiron: has("chiron"),
    lilith: has("lilith"),
    vertex: !!t.points?.vertex,
    fortune: !!t.points?.partOfFortune,
  };
}

/** Toplam açı sayısı ile çarkta çizilen açı sayısı (arayüz ikisini AYRI gösterir). */
export function aspectCounts(aspects: readonly AspectLike[], mode: NatalWheelMode, hidden: ReadonlySet<BodyId>, filter?: NatalAspectFilter) {
  let drawn = 0;
  for (const a of aspects) if (isAspectDrawn(a, mode, hidden, filter)) drawn++;
  return { total: aspects.length, drawn };
}

/** Yerel tercih (yalnız bu tarayıcı; kayıt / rapor / sağlayıcı ile ilgisi yok) — bozuk değer güvenle varsayılana döner. */
export function parsePrefs(raw: string | null | undefined): NatalWheelPrefs {
  if (!raw) return clonePrefs(DEFAULT_PREFS);
  try {
    const v = JSON.parse(raw) as Partial<NatalWheelPrefs> | null;
    const mode: NatalWheelMode = v && (NATAL_WHEEL_MODES as readonly string[]).includes(v.mode as string) ? (v.mode as NatalWheelMode) : DEFAULT_MODE;
    const pick = (m: NatalWheelMode): NatalPointSelection => {
      const src = (v?.points as Record<string, unknown> | undefined)?.[m] as Record<string, unknown> | undefined;
      const base = { ...DEFAULT_POINTS[m] };
      if (src && typeof src === "object") for (const k of NATAL_OPTIONAL_POINTS) if (typeof src[k] === "boolean") base[k] = src[k] as boolean;
      return base;
    };
    const fsrc = v?.filter as Record<string, unknown> | undefined;
    const filter: NatalAspectFilter = { ...DEFAULT_ASPECT_FILTER };
    if (fsrc && typeof fsrc === "object") {
      for (const k of FILTER_FLAGS) if (typeof fsrc[k] === "boolean") filter[k] = fsrc[k] as boolean;
      if (typeof fsrc.focus === "string" && (BODY_IDS as readonly string[]).includes(fsrc.focus)) filter.focus = fsrc.focus as BodyId;
    }
    return { mode, points: { basic: pick("basic"), pro: pick("pro") }, filter };
  } catch {
    return clonePrefs(DEFAULT_PREFS);
  }
}

function clonePrefs(p: NatalWheelPrefs): NatalWheelPrefs {
  return { mode: p.mode, points: { basic: { ...p.points.basic }, pro: { ...p.points.pro } }, filter: { ...p.filter } };
}
