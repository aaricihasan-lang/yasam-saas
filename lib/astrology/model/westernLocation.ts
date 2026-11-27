// Astroloji — Aşama 4 PROVIDER-BAĞIMSIZ konum teknikleri modelleri (SAF; istemci de import edebilir).
// Astrocartography · Relocation · Local Space.
//
// Temel kural (relocation + local space): DOĞUM ANI DEĞİŞMEZ, yalnız gözlem/konum değişir. Gezegenlerin
// ekliptik konumları natal ile aynıdır; konuma bağlı olan ASC/MC/evler (relocation) ve ufuk yönleridir
// (local space). Astrocartography çizgileri yalnız doğum ANINA bağlıdır (konumdan bağımsız).
// Teknik katmana sağlayıcı serbest metni GİRMEZ; yorumlar ayrı "interp" tiplerindedir.

import type { BodyId, EclipticPoint, HouseSystem, NatalAspect, NatalHouse, SignId } from "./western";

/** Konum referansı (hedef / gözlem noktası). Saat dilimi hesaba GİRMEZ (yalnız gösterim). */
export type PlaceRef = { locationId: string | null; label: string; latitude: number; longitude: number; timezone: string | null };

export const ACG_ANGLES = ["mc", "ic", "asc", "dsc"] as const;
export type AcgAngle = (typeof ACG_ANGLES)[number];

// ─── Astrocartography ────────────────────────────────────────────────────────
export const ACG_TECHNICAL_SCHEMA = "astro.western.astrocartography.v1" as const;
/** [enlem, boylam] — derece. */
export type LatLon = [number, number];
export type AcgCurve = { points: LatLon[]; circumpolarBeyond: number | null };
export type AcgBody = {
  id: BodyId;
  rightAscension: number;
  declination: number;
  /** Sabit coğrafi boylam (dikey meridyen çizgisi). */
  mcLongitude: number;
  icLongitude: number;
  asc: AcgCurve;
  dsc: AcgCurve;
};
export type AstrocartographyTechnical = {
  schema: typeof ACG_TECHNICAL_SCHEMA;
  /** Sağlayıcının yankıladığı düğüm türü (golden: "true" — düğüm hattı gerçek düğüm; belge "ortalama" der). */
  nodeEcho: string | null;
  sampling: { latitudeMin: number; latitudeMax: number };
  bodies: AcgBody[];
};
export const ACG_INTERP_SCHEMA = "astro.western.astrocartography.interp.v1" as const;
export type AstrocartographyInterpretation = {
  schema: typeof ACG_INTERP_SCHEMA;
  lines: { id: BodyId; angle: AcgAngle; text: string }[];
  summary: string | null;
};

// ─── Relocation ──────────────────────────────────────────────────────────────
export const RELOCATION_TECHNICAL_SCHEMA = "astro.western.relocation.v1" as const;
export const COMPASS_16 = ["n", "nne", "ne", "ene", "e", "ese", "se", "sse", "s", "ssw", "sw", "wsw", "w", "wnw", "nw", "nnw"] as const;
export type Compass16 = (typeof COMPASS_16)[number];
export type RelocationTechnical = {
  schema: typeof RELOCATION_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  houseSystem: HouseSystem;
  /** Doğum anı sabit (doğum yeri ofseti); hedef konum yalnız açıları/evleri değiştirir. */
  birthPlace: { latitude: number; longitude: number };
  target: { latitude: number; longitude: number };
  bodies: (EclipticPoint & { id: BodyId; latitude: number; house: number | null; speed: number; retrograde: boolean })[];
  houses: NatalHouse[];
  angles: { ascendant: EclipticPoint; midheaven: EclipticPoint };
  vertex: (EclipticPoint & { house: number | null }) | null;
  changes: {
    ascendantSignChanged: boolean;
    planetsChangedHouse: { id: BodyId; natalHouse: number; relocatedHouse: number }[];
    /** Sağlayıcı: yeni açılara ≤3° gök cisimleri. */
    angularBodies: BodyId[];
    distanceKm: number;
    direction: Compass16 | null;
  };
  /** Karşılaştırma için natal (aynı doğum anı, DOĞUM YERİ) — natal birimden birleştirilir; yoksa null. */
  natal: {
    angles: { ascendant: EclipticPoint; midheaven: EclipticPoint } | null;
    houses: NatalHouse[];
    bodyHouses: { id: BodyId; house: number | null }[];
    /**
     * 2026-11-27: Relocation çarkının açı çizgileri. Açılar YALNIZ gezegen boylamlarına bağlıdır; doğum anı aynı olduğundan
     * natal birimin açı listesi aynen geçerlidir (ASC/MC hedefli açı yoktur). Yalnız iki gövdenin boylamı relocation'da
     * natal ile aynı olan açılar taşınır (relocationAspectsOf). Bu alandan önce kaydedilmiş analizlerde YOKTUR (undefined).
     */
    aspects?: NatalAspect[];
  } | null;
};
/** Ekran ve Word/PDF: açı çizgilerinin kaynağı (relocation çarkı açıklaması). */
export const RELOCATION_ASPECTS_NOTE = "Açı çizgileri natal açı listesidir: doğum anı aynı olduğu için gezegenler arası açılar değişmez; değişen yalnız Yükselen/MC ve evlerdir.";
/** Açı listesinden ÖNCE kaydedilmiş relocation analizi: çark açısız çizilir, nedeni yazılır. */
export const RELOCATION_NO_ASPECTS_NOTE = "Bu kayıtta açı listesi olmadığı için açı çizgisi çizilmez (analiz yeniden kaydedilirse eklenir).";

/** Relocation ↔ natal gövde boylamı aynı sayılma sınırı (derece; sağlayıcı aynı anı aynı boylamla verir — ölçülen fark 0). */
export const RELOCATION_SAME_LONGITUDE_DEG = 0.001;

/**
 * Natal açı listesinden relocation çarkına geçerli olanlar: iki gövde de relocation'da var ve boylamları natal ile AYNI
 * (yeni hesap YOK; açı türü / orb / doğa natal kayıttan aynen).
 */
export function relocationAspectsOf(relBodies: { id: string; longitude: number }[], natalBodies: { id: string; longitude: number }[], natalAspects: NatalAspect[]): NatalAspect[] {
  const rel = new Map(relBodies.map((b) => [b.id, b.longitude]));
  const nat = new Map(natalBodies.map((b) => [b.id, b.longitude]));
  const same = (id: string) => {
    const r = rel.get(id);
    const n = nat.get(id);
    return r !== undefined && n !== undefined && Math.abs((((r - n) % 360) + 540) % 360 - 180) <= RELOCATION_SAME_LONGITUDE_DEG;
  };
  return natalAspects.filter((a) => same(a.a) && same(a.b));
}

export const RELOCATION_INTERP_SCHEMA = "astro.western.relocation.interp.v1" as const;
export type RelocationInterpretation = {
  schema: typeof RELOCATION_INTERP_SCHEMA;
  bodies: { id: BodyId; summary: string | null; detailed: string | null; keywords: string[] }[];
  summary: string | null;
};

// ─── Local Space ─────────────────────────────────────────────────────────────
export const LOCAL_SPACE_TECHNICAL_SCHEMA = "astro.western.local_space.v1" as const;
export type LocalSpaceBody = {
  id: BodyId;
  /** Gerçek kuzeyden saat yönünde derece. */
  azimuth: number;
  altitude: number;
  compass: Compass16;
  aboveHorizon: boolean;
  /** Referans noktasından azimut yönünde büyük çember yol noktaları (ilk nokta = referans). */
  line: LatLon[];
};
export type LocalSpaceTechnical = {
  schema: typeof LOCAL_SPACE_TECHNICAL_SCHEMA;
  reference: { latitude: number; longitude: number };
  bodies: LocalSpaceBody[];
};
export const LOCAL_SPACE_INTERP_SCHEMA = "astro.western.local_space.interp.v1" as const;
export type LocalSpaceInterpretation = { schema: typeof LOCAL_SPACE_INTERP_SCHEMA; bodies: { id: BodyId; text: string }[]; summary: string | null };

export type { SignId };
