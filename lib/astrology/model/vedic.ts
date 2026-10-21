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
/** Sağlayıcı yoga aileleri (Nabhasa dört aile + tekil klasik yogalar). Kimlikler çevrilmez. */
export const VEDIC_YOGA_FAMILIES = ["classical", "asraya", "dala", "akriti", "sankhya"] as const;
export type VedicYogaFamily = (typeof VEDIC_YOGA_FAMILIES)[number];
export const VEDIC_YOGA_FAMILY_LABELS: Record<VedicYogaFamily, string> = {
  classical: "Klasik (tekil yoga)",
  asraya: "Asraya (Nabhasa)",
  dala: "Dala (Nabhasa)",
  akriti: "Akriti (Nabhasa)",
  sankhya: "Sankhya (Nabhasa)",
};
export type VedicYogaCheck = {
  id: string;
  name: string;
  family: string;
  quality: "positive" | "negative" | "both" | null;
  present: boolean;
  /** Sağlayıcının hesapladığı oluşum kanıtı (teknik; tahmin/hüküm değil). */
  evidence: string | null;
  /**
   * AŞAMA 2 (vedic-d1-proj-2): yoga kendi klasik kuralını SAĞLADIĞI hâlde üst sıradaki bir aile tarafından bastırıldıysa o aile
   * (klasik öncelik: Akriti > Asraya; Akriti, Asraya ve Dala > Sankhya); `present` bu durumda false'tur. null = kural gerçekten
   * sağlanmadı (ya da yoga oluşuyor). Alan YOK (undefined) = eski projeksiyonlu kayıt (bilgi alınmamıştı; "bastırılmadı" sayılmaz).
   */
  suppressedBy?: VedicYogaFamily | null;
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
  /** `distance`: iki graha arasındaki açısal uzaklık (derece; AŞAMA 2, vedic-d1-proj-2). Eski projeksiyonlu kayıtta alan yok. */
  planetaryWar: { a: VedicGrahaId; b: VedicGrahaId; winner: VedicGrahaId | null; distance?: number | null }[];
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
/** 2026-10-21: sookshma (4.) ve prana (5.) düzeyleri eklendi — eski kayıtlar ilk üç düzeyi taşır. */
export type VedicDashaLevel = "mahadasha" | "antardasha" | "pratyantardasha" | "sookshma" | "prana";
export const VEDIC_DASHA_LEVELS: readonly VedicDashaLevel[] = ["mahadasha", "antardasha", "pratyantardasha", "sookshma", "prana"];
export type VedicDashaPeriod = {
  lord: VedicGrahaId;
  /** Sağlayıcının doğum ofsetine göre yerel tarih-saati ("YYYY-MM-DDTHH:MM:SS", ofsetsiz). */
  start: string;
  end: string;
  durationYears: number;
  /** Doğumla kesilmiş dönemin teorik başlangıcı (yalnız kesilmişse). */
  nominalStart: string | null;
  /**
   * Aşama 6E — yalnız KP dasha'da (significators:true): dönem lordunun KP significator'ları (Roxy). Placidus evi, star / sub lord,
   * L1–L4 evleri. Roxy dasha ucu Rahu/Ketu'ya "ajan" eki uygular (kp/chart ucundan FARKLI) — görünümde belirtilir.
   */
  kp?: { house: number; starLord: VedicGrahaId; subLord: VedicGrahaId; levels: Record<1 | 2 | 3 | 4, number[]> };
};
export type VedicDashaTechnical = {
  schema: typeof VEDIC_DASHA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  system: "vimshottari";
  /** Tarihlerin yerel saat ofseti (doğum ofseti, saat). */
  utcOffsetHours: number;
  level: VedicDashaLevel;
  /** pratyantardasha / sookshma yalnız 4.–5. düzeyde bulunur (eski kayıtlarda alan yok). */
  path: { mahadasha: VedicGrahaId | null; antardasha: VedicGrahaId | null; pratyantardasha?: VedicGrahaId; sookshma?: VedicGrahaId };
  moon: { longitude: number; nakshatraIndex: number; nakshatraLord: VedicGrahaId };
  /** Yalnız mahadasha düzeyi: doğumdaki ilk dönem bakiyesi. */
  balance: { years: number; months: number; days: number; totalDays: number } | null;
  /** Alt düzeylerde üst dönem (mahadasha / antardasha / pratyantardasha / sookshma). */
  parent: VedicDashaPeriod | null;
  periods: VedicDashaPeriod[];
  /**
   * 2026-10-21: "Güncel dönem zinciri" seçeneği (sağlayıcı /dasha/current) — seçilen anda çalışan 5 düzey. Kayıt TEK DÜZEY
   * kararını bozmaz: `periods` yine yalnız seçilen düzeyin listesidir; zincir her düzeyden YALNIZ o anki dönemi taşır.
   */
  current?: VedicDashaCurrent | null;
};
export const VEDIC_DASHA_CURRENT_SCHEMA = "astro.vedic.dasha.current.v1" as const;
export type VedicDashaChainLink = VedicDashaPeriod & { level: VedicDashaLevel; remainingDays: number | null };
export type VedicDashaCurrent = {
  schema: typeof VEDIC_DASHA_CURRENT_SCHEMA;
  frame: VedicFrame;
  /** Seçilen an: UTC dakika + doğum ofsetinde yerel (sağlayıcıya giden). */
  at: { utc: string; local: string; utcOffsetHours: number };
  /** Mahadasha → Prana (5 halka; her biri bir öncekinin İÇİNDE). */
  chain: VedicDashaChainLink[];
  /** Yalnız KP (significators): çalışan lordların ortak gösterdiği evler (sağlayıcı; bağımsız kesişimle denetlenir). */
  commonHouses?: { allLevels: number[]; dashaBhuktiAntara: number[] } | null;
};
export const VEDIC_DASHA_INTERP_SCHEMA = "astro.vedic.dasha.interp.v1" as const;
export type VedicDashaInterpretation = {
  schema: typeof VEDIC_DASHA_INTERP_SCHEMA;
  parent: string | null;
  periods: { lord: VedicGrahaId; start: string; text: string | null }[];
  /** 6E: Roxy'nin KP dönem gücü değerlendirmesi (puan/derece/etiket; yöntemi belgelenmemiş → yorum katmanı). */
  kpStrength?: { lord: VedicGrahaId; start: string; score: number; grade: string; label: string }[];
  /** 6E: Roxy houseThemes (ev anahtar kelimeleri, anlatı). */
  houseThemes?: { house: number; keywords: string[] }[];
};
/** 6E: KP dasha teknik şeması (Vimshottari tarihleri + dönem lordlarının KP significator'ları). */
export const KP_DASHA_TECHNICAL_SCHEMA = "astro.kp.dasha.v1" as const;

// ─── 5F: Graha Drishti · Ashtakavarga · Shadbala · Panchanga ─────────────────
/** Roxy /aspects ve /panchang uçları ayanamsa ALMAZ (Lahiri sabit) → yalnız Lahiri seçiliyken çalışır. */
export type VedicLahiriFrame = { ayanamsa: "lahiri"; ayanamsaDegrees: number | null };

export const VEDIC_DRISHTI_TECHNICAL_SCHEMA = "astro.vedic.drishti.v1" as const;
export type VedicDrishtiType = 3 | 4 | 5 | 7 | 8 | 9 | 10;
export type VedicDrishtiTechnical = {
  schema: typeof VEDIC_DRISHTI_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicLahiriFrame;
  /**
   * 5.1E: Roxy yöntemi = Parashari BÜTÜN-BURÇ graha drishti (tam bakış: herkes 7.; özel: Mars 4./8., Jüpiter 5./9.,
   * Satürn 3./10.; Rahu/Ketu bakış ATMAZ; güç hep 100; kısmi ¼-½-¾ bakışlar yok). `orb` = burç-içi derece farkı,
   * bakış koşulu DEĞİL. Aşama 5 kayıtları "degree_orb" etiketini taşır (yanlış etiket; veri aynı Roxy yanıtı).
   */
  method: "parashari_whole_sign" | "degree_orb";
  positions: { id: VedicGrahaId; longitude: number; rashi: SignId }[];
  aspects: { from: VedicGrahaId; to: VedicGrahaId; type: VedicDrishtiType; strength: number; orb: number }[];
  mutual: { a: VedicGrahaId; b: VedicGrahaId; type: VedicDrishtiType }[];
};

export const VEDIC_ASHTAKAVARGA_TECHNICAL_SCHEMA = "astro.vedic.ashtakavarga.v1" as const;
export type AshtakaRow = { id: VedicGrahaId | "lagna"; bindus: number[]; total: number };
export type VedicAshtakavargaTechnical = {
  schema: typeof VEDIC_ASHTAKAVARGA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  /** bindus dizileri Koç → Balık (12). */
  bav: AshtakaRow[];
  sav: { bindus: number[]; total: number };
  reducedBav: AshtakaRow[];
  reducedSav: { bindus: number[]; total: number };
  shodhyaPinda: { id: VedicGrahaId | "lagna"; rashiPinda: number; grahaPinda: number; total: number }[];
};
/** BPHS: Bhinnashtakavarga toplamları haritadan bağımsız sabittir (tutarlılık denetimi). */
export const BAV_TOTALS: Readonly<Record<string, number>> = { sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39, lagna: 49 };

export const VEDIC_SHADBALA_TECHNICAL_SCHEMA = "astro.vedic.shadbala.v1" as const;
export const SHADBALA_COMPONENTS = ["sthanaBala", "digBala", "kalaBala", "chestaBala", "naisargikaBala", "drikBala"] as const;
export type ShadbalaComponent = (typeof SHADBALA_COMPONENTS)[number];
export type VedicShadbalaTechnical = {
  schema: typeof VEDIC_SHADBALA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  planets: ({ id: VedicGrahaId } & Record<ShadbalaComponent, number> & {
    totalVirupas: number;
    totalRupas: number;
    minRequired: number;
    strengthRatio: number;
    ishtaPhala: number;
    kashtaPhala: number;
    rank: number;
  })[];
};
/** BPHS sabitleri (tutarlılık denetimi): Naisargika Bala (virupa) ve asgari Rupa. */
export const NAISARGIKA_BALA: Readonly<Record<string, number>> = { sun: 60, moon: 51.43, venus: 42.86, jupiter: 34.29, mercury: 25.71, mars: 17.14, saturn: 8.57 };
export const SHADBALA_MIN_RUPAS: Readonly<Record<string, number>> = { sun: 5, moon: 6, mars: 5, mercury: 7, jupiter: 6.5, venus: 5.5, saturn: 5 };
export const VEDIC_SHADBALA_INTERP_SCHEMA = "astro.vedic.shadbala.interp.v1" as const;
export type VedicShadbalaInterpretation = { schema: typeof VEDIC_SHADBALA_INTERP_SCHEMA; themes: { component: ShadbalaComponent; name: string | null; meaning: string | null }[] };

export const VEDIC_PANCHANGA_TECHNICAL_SCHEMA = "astro.vedic.panchanga.v1" as const;
export const KARANA_IDS = ["bava", "balava", "kaulava", "taitila", "gara", "vanija", "vishti", "shakuni", "chatushpada", "naga", "kimstughna"] as const;
export type VedicPanchangaTechnical = {
  schema: typeof VEDIC_PANCHANGA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicLahiriFrame;
  sunLongitude: number;
  moonLongitude: number;
  /** Doğum anı (Janma) panchangası. */
  tithi: { number: number; name: string; paksha: "shukla" | "krishna"; percent: number; deity: string | null; rulingPlanet: VedicGrahaId | null; element: string | null };
  nakshatra: { index: number; id: NakshatraId; pada: number; lord: VedicGrahaId; deity: string | null; symbol: string | null };
  nityaYoga: { number: number; name: string; percent: number };
  karana: { number: number; id: (typeof KARANA_IDS)[number]; name: string; percent: number; movable: boolean };
  /**
   * 2026-10-21: "Ayrıntılı Panchanga" seçeneği (sağlayıcı /panchang/detailed) — seçilen GÜN + KONUM için gün doğumu/batımı,
   * vara ve muhurta pencereleri. Doğum anı panchangasından (yukarıdaki beş öğe) AYRIDIR; eski kayıtlarda alan yok.
   */
  detail?: VedicPanchangaDetail | null;
};
export const VEDIC_PANCHANGA_DETAIL_SCHEMA = "astro.vedic.panchanga.detail.v1" as const;
export type PanchangaWindow = { start: string; end: string };
export const VARA_IDS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type VedicPanchangaDetail = {
  schema: typeof VEDIC_PANCHANGA_DETAIL_SCHEMA;
  /** Yerel gün (YYYY-MM-DD) ve konum; tüm saatler bu ofsette yerel ("YYYY-MM-DDTHH:MM:SS", ofsetsiz). */
  date: string;
  place: { latitude: number; longitude: number; utcOffsetHours: number; label: string | null };
  /** Vara gün doğumunda başlar (gece yarısı değil). lord = gün yöneticisi (Güneş … Satürn). */
  vara: { id: (typeof VARA_IDS)[number]; lord: VedicGrahaId };
  sunrise: string;
  sunset: string;
  moonrise: string | null;
  moonset: string | null;
  /** Gün doğumunda Ay / Güneş rashisi ve Güneş nakshatrası. */
  moonRashi: SignId | null;
  sunRashi: SignId | null;
  sunNakshatra: { index: number; pada: number; lord: VedicGrahaId } | null;
  /** Gün doğumundaki beş öğe kimlikleri (adlar etiket tablosundan). */
  atSunrise: { tithi: number; paksha: "shukla" | "krishna"; nakshatra: number; nakshatraPada: number; nityaYoga: number; karana: number } | null;
  /** Gündüz süresinin 1/8 dilimleri (klasik kural). */
  rahuKaal: PanchangaWindow;
  yamaganda: PanchangaWindow;
  gulika: PanchangaWindow;
  /** Gündüzün 15 muhurtasından 8.si; sağlayıcı bazı günlerde vermez (null). */
  abhijit: PanchangaWindow | null;
  /** Sağlayıcı kuralı: gün doğumundan 96 dk önce → 48 dk önce (sabit 48 dk muhurta). */
  brahma: PanchangaWindow;
  vijaya: PanchangaWindow | null;
  durMuhurta: PanchangaWindow[];
  varjyam: PanchangaWindow[];
  amritKalam: PanchangaWindow[];
  /** Geçiş anları (yerel) — o gün içinde biten öğe ve sıradaki öğe. */
  transitions: { tithiEnds: string | null; nakshatraEnds: string | null; yogaEnds: string | null; karanaEnds: string | null; moonSignChanges: string | null };
};
export const VEDIC_PANCHANGA_INTERP_SCHEMA = "astro.vedic.panchanga.interp.v1" as const;

// ─── 5.1A: Gochara (Vedik transit; Roxy /vedic-astrology/transit, Lahiri sabit) ─────────────
/** Kaksha yöneticileri (her burç 8 × 3°45′; Satürn → … → Lagna) — yalnız tutarlılık denetimi + etiket. */
export const KAKSHA_LORDS = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon", "lagna"] as const;
export type KakshaLord = (typeof KAKSHA_LORDS)[number];
/** Gochara drishti: bütün-burç (Parashari) tam/özel bakışlar; Rahu/Ketu bakış atmaz (Roxy). 1 = aynı rashi (belgede "conjunction"). */
export type GocharaDrishtiType = 1 | VedicDrishtiType;
export const VEDIC_TRANSIT_TECHNICAL_SCHEMA = "astro.vedic.transit.v1" as const;
export type VedicTransitTechnical = {
  schema: typeof VEDIC_TRANSIT_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  /** Doğum anında okunan Lahiri; transit konumları kendi anlarındaki Lahiri ile (sağlayıcı). */
  frame: VedicLahiriFrame;
  /** Transit anı: UTC dakika + doğum ofsetinde yerel (sağlayıcıya giden). */
  at: { utc: string; local: string; utcOffsetHours: number };
  /** Natal D1 (Lagna'dan bütün-burç ev) — Lagna rashisi natal ev numaralarından türetilir. */
  lagnaRashi: SignId;
  /** Janma Rashi = natal Ay'ın rashisi (klasik Gochara referansı). */
  janmaRashi: SignId;
  natal: { id: VedicGrahaId; longitude: number; rashi: SignId; house: number }[];
  transits: {
    id: VedicGrahaId;
    longitude: number;
    rashi: SignId;
    degreeInRashi: number;
    /** Lagna'dan bütün-burç ev. */
    natalHouse: number;
    /** Janma Rashi'den bütün-burç ev (klasik Gochara). */
    houseFromMoon: number;
    drishti: { to: VedicGrahaId; type: GocharaDrishtiType; orb: number }[];
    kaksha: { number: number; lord: KakshaLord; start: number; end: number; bindu: boolean | null; binduCount: number | null };
  }[];
  /** Sağlayıcının yavaş graha vurguları (Jüpiter, Satürn, Rahu, Ketu) — yalnız kimlik. */
  slow: VedicGrahaId[];
};
export const VEDIC_TRANSIT_INTERP_SCHEMA = "astro.vedic.transit.interp.v1" as const;
export type VedicTransitInterpretation = { schema: typeof VEDIC_TRANSIT_INTERP_SCHEMA; keyTransits: { id: VedicGrahaId; text: string | null }[] };
export type VedicPanchangaInterpretation = { schema: typeof VEDIC_PANCHANGA_INTERP_SCHEMA; nakshatra: string | null; yoga: string | null; karana: string | null };
