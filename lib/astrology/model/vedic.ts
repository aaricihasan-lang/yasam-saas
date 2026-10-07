// Astroloji — Aşama 5 VEDİK / JYOTISH kanonik modelleri (SAF; istemci de import edebilir).
//
// Hesap motoru Roxy'dir; bu dosya yalnız Yaşam Sistemi'nin sağlayıcı-bağımsız veri biçimidir.
// Teknik katmana sağlayıcı serbest metni (yorum, açıklama, tema, sonuç) GİRMEZ; yorumlar ayrı "interp"
// tiplerindedir ve yalnız yetkiyle servis edilir. Kimlikler küçük harf kanonik.
// Batı (tropikal) modellerinden AYRI: aynı danışanın Batı natal ve Vedik D1 sonuçları farklı tekniklerdir.

import type { SignId } from "./western";

/** Navagraha (dokuz graha) — klasik Jyotish. Modern gezegenler (Uranüs/Neptün/Plüton) bu sürümde yok. */
export const VEDIC_GRAHAS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"] as const;
export type VedicGrahaId = (typeof VEDIC_GRAHAS)[number];

/** 27 nakshatra (kanonik sıra = Roxy `nakshatra.key` 0…26). */
export const NAKSHATRAS = [
  "ashwini",
  "bharani",
  "krittika",
  "rohini",
  "mrigashira",
  "ardra",
  "punarvasu",
  "pushya",
  "ashlesha",
  "magha",
  "purva_phalguni",
  "uttara_phalguni",
  "hasta",
  "chitra",
  "swati",
  "vishakha",
  "anuradha",
  "jyeshtha",
  "mula",
  "purva_ashadha",
  "uttara_ashadha",
  "shravana",
  "dhanishta",
  "shatabhisha",
  "purva_bhadrapada",
  "uttara_bhadrapada",
  "revati",
] as const;
export type NakshatraId = (typeof NAKSHATRAS)[number];

/** Klasik nakshatra yöneticileri (Vimshottari sırası) — sağlayıcı lord'u bununla tutarlılık için denetlenir. */
export const NAKSHATRA_LORDS: readonly VedicGrahaId[] = ["ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury"];

export const BALADI = ["bala", "kumara", "yuva", "vriddha", "mrita"] as const;
export const JAGRADADI = ["jagrat", "swapna", "sushupti"] as const;
export const DEEPTADI = ["dipta", "svastha", "pramudita", "shanta", "dina", "duhkhita", "vikala", "khala", "kopa"] as const;
export type Baladi = (typeof BALADI)[number];
export type Jagradadi = (typeof JAGRADADI)[number];
export type Deeptadi = (typeof DEEPTADI)[number];

export const VEDIC_AYANAMSA_IDS = ["lahiri", "raman", "kp-newcomb", "kp-old"] as const;
export type VedicAyanamsaId = (typeof VEDIC_AYANAMSA_IDS)[number];

export type NakshatraPlacement = {
  /** 0…26 */
  index: number;
  id: NakshatraId;
  pada: 1 | 2 | 3 | 4;
  lord: VedicGrahaId;
  /** Nakshatra içinde katedilen oran (0…1). */
  ratio: number;
  /** Nakshatra sonuna kalan derece. */
  remaining: number;
  abhijit: boolean;
};

export type VedicPoint = {
  /** Sidereal ekliptik boylam (0…360), seçilen ayanamsa ile. */
  longitude: number;
  rashi: SignId;
  degreeInRashi: number;
  nakshatra: NakshatraPlacement;
};

export type VedicGraha = VedicPoint & {
  id: VedicGrahaId;
  latitude: number | null;
  /** Lagna'dan bütün-burç (rashi) evi 1…12. */
  house: number;
  retrograde: boolean;
  avastha: { baladi: Baladi | null; jagradadi: Jagradadi | null; deeptadi: Deeptadi | null };
};

export type VedicFrame = { ayanamsa: VedicAyanamsaId; ayanamsaDegrees: number };

// ─── D1 Rashi ────────────────────────────────────────────────────────────────
export const VEDIC_D1_TECHNICAL_SCHEMA = "astro.vedic.d1.v1" as const;
export type VedicYogaCheck = {
  id: string;
  name: string;
  family: string;
  quality: "positive" | "negative" | "both" | null;
  present: boolean;
  /** Sağlayıcının hesapladığı oluşum kanıtı (teknik; tahmin/hüküm değil). */
  evidence: string | null;
};
export type VedicD1Technical = {
  schema: typeof VEDIC_D1_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  /** Ev sistemi: Lagna rashisi = 1. ev (bütün-burç / rashi chakra). */
  houseSystem: "whole_sign";
  lagna: VedicPoint & { house: 1 };
  grahas: VedicGraha[];
  combustion: { id: VedicGrahaId; distanceFromSun: number; orb: number }[];
  planetaryWar: { a: VedicGrahaId; b: VedicGrahaId; winner: VedicGrahaId | null }[];
  yogas: VedicYogaCheck[];
};
export const VEDIC_D1_INTERP_SCHEMA = "astro.vedic.d1.interp.v1" as const;
export type VedicD1Interpretation = {
  schema: typeof VEDIC_D1_INTERP_SCHEMA;
  grahas: { id: VedicGrahaId | "lagna"; rashi: string | null; nakshatra: string | null }[];
  houses: { number: number; description: string | null; themes: string[] }[];
  yogas: { id: string; description: string | null; result: string | null }[];
};

/** Lagna rashisinden bütün-burç ev rashisi (Jyotish rashi chakra kuralı; sağlayıcı verisinden türetme). */
export function houseRashi(lagna: SignId, house: number, signs: readonly SignId[]): SignId {
  const i = signs.indexOf(lagna);
  return signs[(i + house - 1) % 12];
}

// ─── Varga (D2…D60; D9 Navamsa) ──────────────────────────────────────────────
/** Roxy /vedic-astrology/divisional-chart'ın kabul ettiği bölümler (belge, 2026-10). D1 ayrı tekniktir. */
export const VEDIC_VARGA_DIVISIONS = [2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60] as const;
export type VedicVargaDivision = (typeof VEDIC_VARGA_DIVISIONS)[number];

export const VEDIC_VARGA_TECHNICAL_SCHEMA = "astro.vedic.varga.v1" as const;
export type VedicVargaPoint = {
  /** D1 sidereal boylamı (varga, D1 boylamından türetilir; sağlayıcı aynen taşır). */
  longitude: number;
  /** D1 rashisi (⌊boylam/30⌋) — vargottama karşılaştırması için. */
  d1Rashi: SignId;
  /** Bu vargadaki rashi. */
  rashi: SignId;
  /** Varga Lagna'sından bütün-burç ev. */
  house: number;
  nakshatra: NakshatraPlacement;
};
export type VedicVargaGraha = VedicVargaPoint & { id: VedicGrahaId; retrograde: boolean; vargottama: boolean };
export type VedicVargaTechnical = {
  schema: typeof VEDIC_VARGA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  houseSystem: "whole_sign";
  division: { number: VedicVargaDivision; name: string; sanskritName: string; degreesPerDivision: string };
  lagna: VedicVargaPoint & { vargottama: boolean };
  grahas: VedicVargaGraha[];
  vargottama: VedicGrahaId[];
};
export const VEDIC_VARGA_INTERP_SCHEMA = "astro.vedic.varga.interp.v1" as const;
export type VedicVargaInterpretation = { schema: typeof VEDIC_VARGA_INTERP_SCHEMA; significance: string | null };

// ─── Vimshottari Dasha ───────────────────────────────────────────────────────
/** Vimshottari dönem yılları (toplam 120) — yalnız tutarlılık denetimi + görselleştirme ölçeği; tarih HESAPLANMAZ. */
export const VIMSHOTTARI_YEARS: Readonly<Record<VedicGrahaId, number>> = { ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17 };

export const VEDIC_DASHA_TECHNICAL_SCHEMA = "astro.vedic.dasha.v1" as const;
export type VedicDashaLevel = "mahadasha" | "antardasha" | "pratyantardasha";
export type VedicDashaPeriod = {
  lord: VedicGrahaId;
  /** Sağlayıcının doğum ofsetine göre yerel tarih-saati ("YYYY-MM-DDTHH:MM:SS", ofsetsiz). */
  start: string;
  end: string;
  durationYears: number;
  /** Doğumla kesilmiş dönemin teorik başlangıcı (yalnız kesilmişse). */
  nominalStart: string | null;
};
export type VedicDashaTechnical = {
  schema: typeof VEDIC_DASHA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  system: "vimshottari";
  /** Tarihlerin yerel saat ofseti (doğum ofseti, saat). */
  utcOffsetHours: number;
  level: VedicDashaLevel;
  path: { mahadasha: VedicGrahaId | null; antardasha: VedicGrahaId | null };
  moon: { longitude: number; nakshatraIndex: number; nakshatraLord: VedicGrahaId };
  /** Yalnız mahadasha düzeyi: doğumdaki ilk dönem bakiyesi. */
  balance: { years: number; months: number; days: number; totalDays: number } | null;
  /** Alt düzeylerde üst dönem (mahadasha / antardasha). */
  parent: VedicDashaPeriod | null;
  periods: VedicDashaPeriod[];
};
export const VEDIC_DASHA_INTERP_SCHEMA = "astro.vedic.dasha.interp.v1" as const;
export type VedicDashaInterpretation = { schema: typeof VEDIC_DASHA_INTERP_SCHEMA; parent: string | null; periods: { lord: VedicGrahaId; start: string; text: string | null }[] };
