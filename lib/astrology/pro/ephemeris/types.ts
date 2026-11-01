// Gökyüzü Atlası — PROFESYONEL EFEMERİS: ortak tipler (SAF; istemci de import edebilir).
//
// Bu dosya ürün akışına BAĞLI DEĞİLDİR. Efemeris satırı yalnız sayı + kanonik kimlik taşır; sağlayıcı serbest metni girmez.
// Her alanın gerçek veri kaynağı ve ölçülü doğruluğu `FIELD_SOURCES` / `ACCURACY` içinde açıkça yazılıdır (docs/astrology/pro/
// profesyonel-efemeris.md). Doğrulanmamış alan (ör. sidereal, sağlayıcı dışı saatte sağlayıcı verisi) KAPALI döner, tahminle
// doldurulmaz.

export const EPHEMERIS_BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "mean_node", "true_node"] as const;
export type EphemerisBody = (typeof EPHEMERIS_BODIES)[number];
export const PLANET_BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
export type PlanetBody = (typeof PLANET_BODIES)[number];
export const isPlanetBody = (b: EphemerisBody): b is PlanetBody => (PLANET_BODIES as readonly string[]).includes(b);

/**
 * Veri kaynağı:
 *  • "local"    — astronomy-engine 2.1.19 (MIT, depoda üretim bağımlılığı). Ücretsiz; her an; her alan. Ölçülü hata bkz. ACCURACY.
 *  • "provider" — hesaplama altyapımızın (sunucu tarafı sağlayıcı) TEK AN konum ucu: günlük 00:00 UT için gün başına 1 çağrı.
 *                 Boylam, ekliptik enlem ve hız sağlayıcıdan; RA/deklinasyon bu değerlerden yerel kesin dönüşümle türetilir.
 */
export type EphemerisSource = "local" | "provider";
export type Zodiac = "tropical" | "sidereal_lahiri";

/** Alan kimlikleri (tablo sütunları). */
export type EphemerisField = "lon" | "lat" | "ra" | "dec" | "speed" | "retro";

export type BodyPosition = {
  body: EphemerisBody;
  /** Ekliptik boylam (gerçek ekinoks ve ekliptik, görünür; sidereal seçiliyse ayanamsa düşülmüş), derece [0,360). */
  lon: number;
  /** Ekliptik enlem, derece. Düğümlerde 0 (tanım gereği). */
  lat: number | null;
  /** Sağ açıklık (gerçek ekvator ve ekinoks), derece [0,360). Düğümler için null. */
  ra: number | null;
  /** Deklinasyon, derece. Düğümler için null. */
  dec: number | null;
  /** Boylamda günlük hareket, derece/gün (±1 saat merkezi fark ya da sağlayıcı hızı). */
  speed: number;
  /** Geri hareket (hız < 0). |hız| istasyon eşiğinin altındaysa `stationary` = true (yön kesin değildir). */
  retro: boolean;
  stationary: boolean;
};

export type EphemerisEvent =
  | { kind: "ingress"; body: EphemerisBody; ut: string; ms: number; fromSign: number; toSign: number; retrograde: boolean; uncertaintySec: number }
  | { kind: "station"; body: EphemerisBody; ut: string; ms: number; direction: "retrograde" | "direct"; lon: number; uncertaintySec: number };

export type EphemerisRow = { date: string; /** UT anı (ISO, "Z" = UT; bkz. timeStandard). */ ut: string; positions: BodyPosition[] };

/** Alan başına gösterim hassasiyeti: ölçülü hatanın güvenle altında kalan en ince birim. */
export type DisplayPrecision = "arcsec" | "arcmin" | "tenth_arcmin";

export type EphemerisMeta = {
  source: EphemerisSource;
  zodiac: Zodiac;
  /** Satır anı: "00:00 UT" (varsayılan) ya da sağlayıcı aylık tablosu için "12:00 UTC". */
  timeOfDay: "00:00" | "12:00";
  timeStandard: string;
  deltaTNote: string;
  ayanamsa: { id: "lahiri"; definition: string; valueAtStart: number } | null;
  nodeNote: string;
  /** Sütun özeti: seçili cisimlerin EN KABA hassasiyeti. */
  precision: Readonly<Record<EphemerisField, DisplayPrecision>>;
  /** Cisim başına hassasiyet (hücre biçimi bununla yapılır; ör. gerçek düğüm hızı dakika, gezegen hızı 0,1′). */
  bodyPrecision: Readonly<Partial<Record<EphemerisBody, Readonly<Record<EphemerisField, DisplayPrecision>>>>>;
  disabledFields: { field: string; reason: string }[];
  providerCalls: number;
  engineVersion: string;
};

export type EphemerisResult = { meta: EphemerisMeta; rows: EphemerisRow[]; events: EphemerisEvent[]; page: { index: number; total: number; startDate: string; endDate: string } };

export type EphemerisError = { code: "INVALID_INPUT" | "RANGE_TOO_LARGE" | "OUT_OF_RANGE" | "FIELD_DISABLED" | "PROVIDER_FAILED"; field?: string; error: string };
