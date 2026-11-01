// Natal 8 ev sistemi — İSTEMCİ + SUNUCU ortak SAF sabitler (Aşama 3, #643). Hesap kodu (astronomy-engine) İÇERMEZ → istemci paketine
// motor girmez. Sunucu doğrulaması lib/astrology/engine/natalHouses.ts'tedir; buradaki listeler ve eşikler oradakilerle testte
// (pro-natal-houses-ui.harness) birebir eşitlenir.

import { HOUSE_SYSTEMS, type HouseSystem } from "./western";

/** #643 motorunun klasik sistemleri (sıra = arayüz sırası). */
export const CLASSIC_NATAL_HOUSE_SYSTEMS = ["regiomontanus", "campanus", "porphyry", "alcabitius"] as const;
export type ClassicNatalHouseSystem = (typeof CLASSIC_NATAL_HOUSE_SYSTEMS)[number];

/** Natal ev sistemi seçenekleri: önce mevcut 4 (sıra korunur), sonra 4 klasik. */
export const NATAL_HOUSE_SYSTEM_OPTIONS = [...HOUSE_SYSTEMS, ...CLASSIC_NATAL_HOUSE_SYSTEMS] as const;
export type NatalHouseSystemOption = HouseSystem | ClassicNatalHouseSystem;

export const isClassicNatalHouseSystem = (x: unknown): x is ClassicNatalHouseSystem => typeof x === "string" && (CLASSIC_NATAL_HOUSE_SYSTEMS as readonly string[]).includes(x);

/** Ürün kutup kuralı (sunucuyla aynı): |enlem| > 66,5° → Placidus, Koch ve 4 klasik sistem tanımsız. */
export const NATAL_POLAR_LATITUDE = 66.5;
/** Yüksek enlem uyarısı eşiği (owner K-A). */
export const NATAL_HIGH_LATITUDE = 60;
export const natalHouseSystemUndefinedAtLatitude = (h: NatalHouseSystemOption, latitude: number) =>
  Math.abs(latitude) > NATAL_POLAR_LATITUDE && (h === "placidus" || h === "koch" || isClassicNatalHouseSystem(h));

/** Klasik sistemde sağlayıcı yorum katmanına eklenen not (sunucu notice'una da eklenir; arayüz görünür kılar). */
export const LOCAL_NATAL_INTERP_NOTE =
  "Gezegen yorumları bu ev sisteminde gösterilmez: hesaplama servisinin yorum metinleri kendi (Placidus) ev numaralarına göre yazılmıştır.";

/** Sonuç ve kayıtlarda klasik sistem kaynak satırı. */
export const LOCAL_NATAL_SOURCE_TEXT = "Evler: Yaşam Sistemi klasik ev hesabı · Gezegen konumları: hesaplama servisi";

/** Aşama 4: kayıtlı analiz (arşiv) ve Word/PDF yöntem bölümünde ev hesabı satırı (owner metni; motor sürümü GÖSTERİLMEZ). */
export const LOCAL_NATAL_HOUSE_CALC_LABEL = "Ev hesabı";
export const LOCAL_NATAL_HOUSE_CALC_VALUE = "Yaşam Sistemi klasik ev hesabı";
export const LOCAL_NATAL_HOUSE_CALC_TEXT = `${LOCAL_NATAL_HOUSE_CALC_LABEL}: ${LOCAL_NATAL_HOUSE_CALC_VALUE}`;
