// Astroloji — Aşama 3 PROVIDER-BAĞIMSIZ kanonik modeller (SAF; istemci de import edebilir).
// Transit · Forecast · Secondary Progression · Solar Arc · Solar/Lunar Return · Synastry · Composite.
//
// Teknik katmanlar yalnız kanonik kimlik + sayı taşır; sağlayıcı serbest metni (isim, açıklama, yorum)
// GİREMEZ. Yorumlar ayrı "interp" tiplerindedir ve yalnız yetkiyle servis edilir.

import type {
  AspectNature,
  AspectType,
  BodyId,
  EclipticPoint,
  HouseSystem,
  NatalAspect,
  NatalBody,
  NatalHouse,
  NodeType,
  SignId,
} from "./western";

export const ANGLE_POINT_IDS = ["ascendant", "midheaven"] as const;
export type AnglePointId = (typeof ANGLE_POINT_IDS)[number];
/** Gezegen/nokta veya açısal nokta (ASC/MC). */
export type PointId = BodyId | AnglePointId;

// ─── Transit (tek an) ────────────────────────────────────────────────────────
export const TRANSIT_TECHNICAL_SCHEMA = "astro.western.transit.v1" as const;
export type TransitBody = EclipticPoint & { id: BodyId; latitude: number; speed: number; retrograde: boolean };
export type TransitAspect = {
  transit: BodyId;
  natal: PointId;
  type: AspectType;
  exactAngle: number;
  orb: number;
  applying: boolean;
  strength: number;
  nature: AspectNature | null;
};
export type TransitTechnical = {
  schema: typeof TRANSIT_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  nodeType: NodeType;
  /** Transit anı (UTC, dakika hassasiyeti). */
  atUtc: string;
  bodies: TransitBody[];
  aspects: TransitAspect[];
  summary: { harmonious: number | null; challenging: number | null; neutral: number | null };
  /**
   * 2026-10-12: çift halka (natal + transit) için natal çerçeve. Roxy transit yanıtı natal konum VERMEZ; çerçeve
   * AYNI doğum verisinin (= aynı revizyon girdisi) ÖNBELLEKTEKİ natal sonucundan, yalnız okunarak eklenir — yeni
   * sağlayıcı isteği YOK. Natal önbellekte yoksa / saat bilinmiyorsa null (harita çizilmez, nedeni gösterilir).
   */
  natalFrame?: TransitNatalFrame | null;
  /**
   * TRANSİT-01 (2026-10-17): transit bir Transit Takvimi gününden açıldıysa, AYNI doğum verisinin önbellekteki takvim
   * sonucundan (forecast, `/forecast/transits` — olaylar sağlayıcıda kesinleşme anına inceltilmiştir) bu açıların
   * kesinleşme anları. YALNIZ okunarak eklenir, yeni sağlayıcı isteği YOK; takvim açılmadıysa alan hiç yoktur.
   */
  calendarExact?: TransitCalendarExact | null;
};
/** Takvim kesinleşme eşleşmesi: aynı transit gezegen + aynı natal hedef + aynı açı türü (yalnız takvim penceresi içinde). */
export type TransitCalendarExact = {
  window: { start: string; end: string };
  /** Takvimin tüm parçaları önbellekte bulundu mu (false → kesinleşme listesi eksik olabilir). */
  complete: boolean;
  hits: { transit: BodyId; natal: PointId; type: AspectType; exactUtc: string[] }[];
};
export type TransitNatalFrame = {
  houseSystem: HouseSystem;
  nodeType: NodeType;
  bodies: (EclipticPoint & { id: BodyId; latitude: number; speed: number; retrograde: boolean; house: number | null })[];
  houses: NatalHouse[];
  angles: { ascendant: EclipticPoint; midheaven: EclipticPoint };
};
export const TRANSIT_INTERP_SCHEMA = "astro.western.transit.interp.v1" as const;
export type TransitInterpretation = {
  schema: typeof TRANSIT_INTERP_SCHEMA;
  aspects: { transit: BodyId; natal: PointId; type: AspectType; summary: string | null; timing: string | null; impact: string | null; guidance: string | null; keywords: string[] }[];
};

// ─── Forecast / transit takvimi ──────────────────────────────────────────────
export const FORECAST_TECHNICAL_SCHEMA = "astro.western.forecast.v1" as const;
export const FORECAST_EVENT_TYPES = ["transit_aspect", "sign_ingress", "retrograde_station", "eclipse", "lunar_phase"] as const;
export type ForecastEventType = (typeof FORECAST_EVENT_TYPES)[number];
export type ForecastEvent = {
  type: ForecastEventType;
  date: string; // YYYY-MM-DD (UTC)
  datetime: string; // ISO UTC
  body: BodyId | null;
  /** transit_aspect: natal hedef; sign_ingress: girilen burç; lunar_phase: burç. */
  targetBody: PointId | null;
  targetSign: SignId | null;
  aspect: AspectType | null;
  orb: number | null;
  station: "retrograde" | "direct" | null;
  eclipseKind: "penumbral" | "partial" | "annular" | "total" | null;
  obscuration: number | null;
  phase: "new_moon" | "full_moon" | null;
  significance: number | null;
};
export type ForecastTechnical = {
  schema: typeof FORECAST_TECHNICAL_SCHEMA;
  window: { start: string; end: string };
  events: ForecastEvent[];
};
/**
 * 2026-10-12 (UAT madde 13): Roxy'nin olay başına açıklama cümlesi (`events[].description`) — AYNEN, ayrı yorum
 * katmanında (yetki kapısı arkasında). Roxy bu teknikte ayrı bir anlatı/özet yorumu SAĞLAMAZ; cümlelerin çoğu olayın
 * olgusal ifadesidir (ör. "Transit Mars, natal Mars ile Kare açısı yapıyor"), istasyon / burç girişi / Ay evresi
 * cümleleri kısa kalıp anlam içerir. Uydurma / özetleme yok.
 */
export const FORECAST_INTERP_SCHEMA = "astro.western.forecast.interp.v1" as const;
export type ForecastInterpretation = {
  schema: typeof FORECAST_INTERP_SCHEMA;
  events: { datetime: string; type: ForecastEventType; body: BodyId | null; targetBody: PointId | null; text: string }[];
};

// ─── Secondary progression ───────────────────────────────────────────────────
export const PROGRESSION_TECHNICAL_SCHEMA = "astro.western.progression.v1" as const;
export type ProgressedBody = EclipticPoint & { id: BodyId; house: number | null; speed: number; retrograde: boolean };
export type ProgressionTechnical = {
  schema: typeof PROGRESSION_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  nodeType: NodeType;
  targetDate: string;
  progressedDate: string | null;
  elapsedYears: number | null;
  /** Ev yerleşimi: ilerletilmiş Yükselen'den sayılan TAM BURÇ evi (sağlayıcı yöntemi). */
  houseMethod: "whole_sign_from_progressed_ascendant";
  bodies: ProgressedBody[];
  angles: { ascendant: EclipticPoint; midheaven: EclipticPoint } | null;
};
export const PROGRESSION_INTERP_SCHEMA = "astro.western.progression.interp.v1" as const;
export type ProgressionInterpretation = {
  schema: typeof PROGRESSION_INTERP_SCHEMA;
  bodies: { id: BodyId; text: string }[];
  overall: string | null;
};

// ─── Solar arc ───────────────────────────────────────────────────────────────
export const SOLAR_ARC_TECHNICAL_SCHEMA = "astro.western.solar_arc.v1" as const;
export type DirectedPoint = { id: PointId; natalLongitude: number; directedLongitude: number; sign: SignId; degreeInSign: number };
/** Directed → natal açılar Yaşam Sistemi'nde ARİTMETİK hesaplanır (sağlayıcı vermez). */
export const SOLAR_ARC_ASPECT_METHOD = "yasam-arith-v1:major-aspects:orb-1deg" as const;
export type SolarArcAspect = { directed: PointId; natal: PointId; type: AspectType; orb: number };
export type SolarArcTechnical = {
  schema: typeof SOLAR_ARC_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  nodeType: NodeType;
  targetDate: string;
  arc: number;
  directed: DirectedPoint[];
  aspectMethod: typeof SOLAR_ARC_ASPECT_METHOD;
  aspects: SolarArcAspect[];
};
export const SOLAR_ARC_INTERP_SCHEMA = "astro.western.solar_arc.interp.v1" as const;
export type SolarArcInterpretation = {
  schema: typeof SOLAR_ARC_INTERP_SCHEMA;
  directed: { id: PointId; text: string }[];
  overall: string | null;
};

// ─── Solar / Lunar return ────────────────────────────────────────────────────
export const RETURN_TECHNICAL_SCHEMA = "astro.western.return.v1" as const;
export type ReturnChart = {
  houseSystem: HouseSystem;
  bodies: Omit<NatalBody, "dignity">[];
  houses: NatalHouse[];
  /** Quadrant/eşit ev sistemlerinde 1. ev = ASC; 10. ev = MC yalnız quadrant (placidus/koch). */
  angles: { ascendant: EclipticPoint | null; midheaven: EclipticPoint | null } | null;
  aspects: NatalAspect[];
  points: {
    partOfFortune: (EclipticPoint & { house: number | null; sect: "day" | "night" | null }) | null;
    vertex: (EclipticPoint & { house: number | null }) | null;
  };
};
export type ReturnTechnical = {
  schema: typeof RETURN_TECHNICAL_SCHEMA;
  kind: "solar" | "lunar";
  zodiac: "tropical";
  /**
   * İstenen yıl (solar) veya yaklaşık tarih (lunar). Lunar (Aşama 3 P2-1 sonrası): ay içindeki dönüş
   * sırası + beklenen dönüş anı (UTC) — aynı ayda iki dönüş olduğunda hangisi olduğu belirsiz kalmaz.
   * Eski kayıtlarda sequence/expectedUtc YOKTUR (o zaman yalnız ilk dönüş hesaplanabiliyordu).
   */
  requested: { returnYear: number | null; returnDate: string | null; sequence?: number | null; expectedUtc?: string | null };
  /** Dönüş anı — sağlayıcının verdiği yerel ofsetli zaman (doğum ofseti) ve ofset. */
  returnLocal: string;
  returnOffsetHours: number;
  natalPoint: EclipticPoint; // solar: natal Güneş · lunar: natal Ay
  location: { latitude: number; longitude: number };
  chart: ReturnChart;
};
export const RETURN_INTERP_SCHEMA = "astro.western.return.interp.v1" as const;
export type ReturnInterpretation = { schema: typeof RETURN_INTERP_SCHEMA; summary: string | null; purpose: string | null; keyThemes: string[] };

// ─── Synastry ────────────────────────────────────────────────────────────────
export const SYNASTRY_TECHNICAL_SCHEMA = "astro.western.synastry.v1" as const;
export type SynastryBody = EclipticPoint & { id: BodyId; house: number | null; houseInOther: number | null; retrograde: boolean };
export type SynastryPerson = { ascendant: { sign: SignId; degreeInSign: number } | null; bodies: SynastryBody[] };
export type SynastryAspect = { a: BodyId; b: BodyId; type: AspectType; exactAngle: number; orb: number; strength: number; nature: AspectNature | null };
export type SynastryTechnical = {
  schema: typeof SYNASTRY_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  houseSystem: HouseSystem;
  nodeType: NodeType;
  person1: SynastryPerson;
  person2: SynastryPerson;
  aspects: SynastryAspect[];
  compatibilityScore: number | null;
  summary: { total: number | null; harmonious: number | null; challenging: number | null; neutral: number | null; byType: Partial<Record<AspectType, number>> };
};
export const SYNASTRY_INTERP_SCHEMA = "astro.western.synastry.interp.v1" as const;
export type SynastryInterpretation = {
  schema: typeof SYNASTRY_INTERP_SCHEMA;
  aspects: { a: BodyId; b: BodyId; type: AspectType; short: string | null; long: string | null; relationshipContext: string | null; keywords: string[] }[];
  overall: { text: string | null; strengths: string[]; challenges: string[] };
};

// ─── Composite ───────────────────────────────────────────────────────────────
export const COMPOSITE_TECHNICAL_SCHEMA = "astro.western.composite.v1" as const;
export type CompositeTechnical = {
  schema: typeof COMPOSITE_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  method: "midpoint";
  houseSystem: HouseSystem;
  nodeType: NodeType;
  bodies: Omit<NatalBody, "dignity">[];
  houses: NatalHouse[];
  angles: { ascendant: EclipticPoint; midheaven: EclipticPoint } | null;
  aspects: NatalAspect[];
};
export const COMPOSITE_INTERP_SCHEMA = "astro.western.composite.interp.v1" as const;
export type CompositeInterpretation = {
  schema: typeof COMPOSITE_INTERP_SCHEMA;
  bodies: { id: BodyId; summary: string | null; relationshipMeaning: string | null; keywords: string[] }[];
  overall: { summary: string | null; strengths: string[]; challenges: string[] };
};
