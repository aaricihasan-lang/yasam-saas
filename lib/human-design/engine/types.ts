// FAZ 0 — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// Bu dosya yalnızca motor iskeletinin tip sözleşmelerini tanımlar.
// Gate / line / type / authority / profile / center / channel hesaplaması YOKTUR.

// -------------------------------------------------------
// Girdi tipleri
// -------------------------------------------------------

/** Doğum konumu — ondalık derece (WGS84). */
export type GeoLocation = {
  /** Enlem, ondalık derece. Kuzey pozitif (-90..+90). */
  lat: number;
  /** Boylam, ondalık derece. Doğu pozitif (-180..+180). */
  lon: number;
};

/** Ham doğum girdisi (kullanıcıdan gelen yerel zaman). */
export type HdBirthInput = {
  /** Yerel tarih, "YYYY-MM-DD". */
  date: string;
  /** Yerel saat, "HH:mm" (24 saat). */
  time: string;
  /** IANA timezone kimliği, örn. "Europe/Istanbul". */
  timezone: string;
  /** Doğum konumu. */
  location: GeoLocation;
};

// -------------------------------------------------------
// Astronomik ara tipler
// -------------------------------------------------------

/** Julian Day numarası (UT tabanlı, kesirli gün dahil). */
export type JulianDay = number;

/** Ekliptik boylam, derece [0, 360). */
export type EclipticLongitude = number;

/**
 * HD aktivasyonlarında kullanılan gök cisimleri.
 *
 * 11 temel cisim sağlayıcı tarafından doğrudan hesaplanır; Earth ve SouthNode
 * türetilir (FAZ 2A):
 *   Earth     = Sun + 180°
 *   SouthNode = NorthNode + 180°
 */
export type PlanetName =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Pluto"
  | "NorthNode"
  // ── türetilen cisimler ──
  | "Earth"
  | "SouthNode";

/** Tek bir cismin tek bir andaki konumu. */
export type PlanetPosition = {
  planet: PlanetName;
  /** Geosentrik tropikal ekliptik boylam, derece [0, 360). */
  longitude: EclipticLongitude;
};

/**
 * Sağlayıcı meta verisi — çıktıda doğruluk durumunu açıkça belgeler.
 * (FAZ 2A. Production hesap doğruluk iddiası taşımaz.)
 */
export type ProviderMetadata = {
  /** Hesap kaynağı, örn. "astronomy-engine". */
  provider: string;
  /** Olgunluk durumu, örn. "production-validated". */
  mode: string;
  /** Ay düğümü tipi (true / mean / ae-default) — belgelenir. */
  nodeType: string;
};

/**
 * Gezegen boylamı sağlayıcı arayüzü.
 *
 * MockPlanetLongitudeProvider (FAZ 0) ve AstronomyEnginePlanetLongitudeProvider
 * (FAZ 2A) bu arayüzü uygular — motor kodu değişmeden sağlayıcı takılabilir.
 */
export interface PlanetLongitudeProvider {
  /** Sağlayıcının kimliği (loglama/doğrulama için). */
  readonly name: string;
  /** Opsiyonel meta veri (doğruluk durumu). */
  readonly metadata?: ProviderMetadata;
  /** Verilen Julian Day için tüm cisimlerin boylamlarını döndürür. */
  getLongitudes(jd: JulianDay): PlanetPosition[];
}

// -------------------------------------------------------
// Ham motor çıktısı (iskelet)
// -------------------------------------------------------

/**
 * İskelet motorun ham çıktısı.
 * Hesaplanmış HD özellikleri (gate/line/type/...) İÇERMEZ.
 * Yalnızca zaman + astronomik ara değerleri taşır.
 */
export type HdEngineRawOutput = {
  /** FAZ etiketinin makinece okunur işareti. */
  phase: "faz-0-skeleton";
  /** Bu çıktının production hesap iddiası taşımadığını belirten not. */
  disclaimer: string;
  input: HdBirthInput;
  /** Yerel zamanın UTC ISO-8601 karşılığı. */
  utcIso: string;
  /** Personality (bilinçli) anı için Julian Day. */
  personalityJulianDay: JulianDay;
  /** Sağlayıcının kimliği. */
  provider: string;
  /** Personality anındaki ham gezegen boylamları (mock). */
  personalityPositions: PlanetPosition[];
};
