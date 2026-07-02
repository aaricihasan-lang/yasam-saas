/**
 * lib/location/types.ts — Global konum veri modeli (FAZ 5 / P1).
 *
 * Bu bir MOTOR DEĞİLDİR. Konum yönetimi veri katmanıdır. Koordinat üreten
 * motorlar (lib/cosmic/eclipses.ts, lib/cosmic/planetary-hours.ts) bu katmandan
 * yalnız ham koordinat + saat dilimi alır ({ lat, lon, elev, tz }). Motorlar
 * şehir adı bilmez; şehir↔koordinat çözümlemesi tamamen bu katmanda yapılır.
 *
 * Not: Bu dosya production motor davranışına DOKUNMAZ; yalnız gelecekteki global
 * konum seçici için tip iskeletidir.
 */

/** Koordinatın hangi kaynaktan geldiği. */
export type LocationSource =
  | "geonames"     // derlenmiş offline dataset (birincil, planlanan)
  | "manual"       // elle kürasyon / doğrulanmış giriş
  | "geolocation"  // tarayıcı Geolocation API (kullanıcı onayı ile)
  | "nominatim";   // geocoding API fallback (OpenStreetMap)

/** Kaydın kökeni: paketle gelen mi, kullanıcı mı ekledi. */
export type LocationOrigin = "bundled" | "user-added";

/** Tek bir konum kaydı — motor girdisi bu kaydın koordinat alanlarıdır. */
export interface Location {
  /** Kararlı benzersiz kimlik. Seçim/eşleşme bununla yapılır — isim ile DEĞİL. */
  id: string;
  /** Görünen ad. Örn. "Manisa". */
  name: string;
  /** Ülke adı (yerelleştirilmiş görünüm). Örn. "Türkiye". */
  country: string;
  /** ISO 3166-1 alpha-2 ülke kodu. Örn. "TR". */
  countryCode: string;
  /** İl / eyalet / bölge — aynı-isim ayrımı için (Paris/France ↔ Paris/Texas). */
  adminRegion: string;
  /** Enlem, derece [-90, 90]. */
  lat: number;
  /** Boylam, derece [-180, 180]. */
  lon: number;
  /** Rakım, metre. Tutulma temas anları için; bilinmiyorsa 0 (astronomik etki küçük). */
  elev: number;
  /** IANA saat dilimi kimliği. Örn. "Europe/Istanbul". DST-doğru yerel zaman için ZORUNLU. */
  tz: string;
  /** Koordinatın kaynağı. */
  source: LocationSource;
  /** Koordinat doğrulandı mı. */
  verified: boolean;
  /** Kaydın kökeni. */
  origin: LocationOrigin;
}

/** searchLocations() için opsiyonlar. */
export interface LocationSearchOptions {
  /** Maksimum sonuç sayısı (varsayılan 10). */
  limit?: number;
  /** ISO alpha-2 ülke koduyla filtre (ör. "TR"). */
  countryCode?: string;
  /**
   * Aranacak konum kümesi. Verilmezse paketli tohum (SEED_LOCATIONS) kullanılır.
   * P3 → TR_LOCATIONS (81 il); P5 → global dataset. Motorlar bu katmandan bağımsızdır.
   */
  dataset?: ReadonlyArray<Location>;
}
