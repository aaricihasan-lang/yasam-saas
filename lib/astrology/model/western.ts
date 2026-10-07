// Astroloji — PROVIDER-BAĞIMSIZ kanonik Batı modeli (SAF; istemci de import edebilir).
//
// Teknik katman yalnız KANONİK KİMLİKLER + SAYILAR taşır; sağlayıcıdan gelen serbest metin
// (isim, açıklama, yorum) bu modele GİREMEZ. Etiketler Yaşam Sistemi'nin kendi Türkçe
// sözlüğünden (lib/astrology/labels/tr.ts) üretilir → sağlayıcı değişse de görünüm aynı kalır.

export const BODY_IDS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "north_node",
  "south_node",
  "chiron",
  "lilith",
] as const;
export type BodyId = (typeof BODY_IDS)[number];

export const SIGN_IDS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;
export type SignId = (typeof SIGN_IDS)[number];

export const ASPECT_TYPES = [
  "conjunction",
  "opposition",
  "trine",
  "square",
  "sextile",
  "semi_sextile",
  "semi_square",
  "sesquiquadrate",
  "quincunx",
] as const;
export type AspectType = (typeof ASPECT_TYPES)[number];

export const PATTERN_KINDS = ["grand_trine", "kite", "t_square", "grand_cross", "yod", "mystic_rectangle", "stellium"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const DIGNITIES = ["domicile", "exaltation", "detriment", "fall", "peregrine"] as const;
export type Dignity = (typeof DIGNITIES)[number];

export const ASPECT_NATURES = ["harmonious", "challenging", "neutral"] as const;
export type AspectNature = (typeof ASPECT_NATURES)[number];

export const ELEMENTS = ["fire", "earth", "air", "water"] as const;
export type Element = (typeof ELEMENTS)[number];
export const MODALITIES = ["cardinal", "fixed", "mutable"] as const;
export type Modality = (typeof MODALITIES)[number];

export const HOUSE_SYSTEMS = ["placidus", "whole-sign", "equal", "koch"] as const;
export type HouseSystem = (typeof HOUSE_SYSTEMS)[number];

export const NODE_TYPES = ["true", "mean"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type EclipticPoint = { longitude: number; sign: SignId; degreeInSign: number };

export type NatalBody = EclipticPoint & {
  id: BodyId;
  latitude: number;
  house: number | null;
  speed: number;
  retrograde: boolean;
  dignity: Dignity | null;
};

export type NatalHouse = EclipticPoint & { number: number };

export type NatalAspect = {
  a: BodyId;
  b: BodyId;
  type: AspectType;
  exactAngle: number;
  orb: number;
  applying: boolean;
  strength: number;
  nature: AspectNature | null;
};

export type NatalPattern = {
  kind: PatternKind;
  bodies: BodyId[];
  apex: BodyId | null;
  element: Element | null;
  modality: Modality | null;
  outOfSign: boolean;
  tightness: number | null;
};

export const NATAL_TECHNICAL_SCHEMA = "astro.western.natal.v1" as const;

export type NatalTechnical = {
  schema: typeof NATAL_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  houseSystem: HouseSystem;
  nodeType: NodeType;
  /** Sağlayıcının kullandığı girdinin yankısı (doğrulama amaçlı). */
  echo: { date: string; time: string; utcOffsetHours: number; latitude: number; longitude: number };
  bodies: NatalBody[];
  houses: NatalHouse[];
  angles: { ascendant: EclipticPoint; midheaven: EclipticPoint } | null;
  points: {
    partOfFortune: (EclipticPoint & { house: number | null; sect: "day" | "night" | null }) | null;
    vertex: (EclipticPoint & { house: number | null }) | null;
  };
  aspects: NatalAspect[];
  patterns: NatalPattern[];
  summary: {
    dominantElement: Element | null;
    dominantModality: Modality | null;
    retrograde: BodyId[];
    elementDistribution: Record<Element, number> | null;
    modalityDistribution: Record<Modality, number> | null;
    aspectBalance: {
      dominant: "harmonious" | "challenging" | "balanced" | null;
      harmonious: number | null;
      challenging: number | null;
      neutral: number | null;
    };
  };
};

export const NATAL_INTERP_SCHEMA = "astro.western.natal.interp.v1" as const;

/** Sağlayıcı OTOMATİK YORUMU — teknikten ayrı katman; yalnız yetkiyle servis edilir. */
export type NatalInterpretation = {
  schema: typeof NATAL_INTERP_SCHEMA;
  bodies: { id: BodyId; summary: string | null; detailed: string | null; keywords: string[] }[];
  aspects: { a: BodyId; b: BodyId; type: AspectType; summary: string | null; keywords: string[] }[];
  patterns: { kind: PatternKind; bodies: BodyId[]; text: string }[];
  overall: { aspectSummary: string | null };
};
