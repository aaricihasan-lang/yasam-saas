/**
 * lib/location/world.ts — Pilot global dünya şehri dataseti (FAZ 5 / P5b).
 *
 * Salt VERİ katmanı. Hiçbir motoru (lib/cosmic/*), UI'ı veya DB'yi okumaz/etkilemez.
 * `Location` tipine uyar (bkz. ./types). Bu aşamada UI'a BAĞLANMAZ; searchLocations
 * global kullanıma GEÇİRİLMEZ — yalnız gelecekteki global geçiş için pilot kümedir.
 *
 * Kaynak & lisans:
 *   - Koordinatlar, saat dilimleri ve idari bölgeler **GeoNames** (https://www.geonames.org)
 *     verisiyle tutarlıdır. GeoNames verisi **Creative Commons Attribution 4.0 (CC-BY 4.0)**
 *     altında lisanslıdır → kullanımda **atıf zorunludur** ("Konum verisi: GeoNames, CC-BY 4.0").
 *   - `source: "geonames"`, `verified: true` (koordinat + IANA tz düzeyinde).
 *
 * Rakım (elev):
 *   - ⚠️ Bu pilotta tüm şehirler `elev: 0`. Astronomik etki ihmal edilebilir; gerçek
 *     rakımlar tam GeoNames geçişinde (P5f) doldurulacak.
 *
 * Saat dilimi (tz):
 *   - IANA tzid (ör. "Europe/Berlin"). lib/location/tz.ts helper'ları ile DST-doğru
 *     yerel saat üretmek için kullanılır.
 *
 * id şeması: `<cc>-<slug>` veya aynı-isim ayrımı için `<cc>-<admin>-<slug>`
 *   (ör. "fr-paris" ↔ "us-tx-paris").
 */
import type { Location } from "./types";

/** Pilot global büyük şehirler — ~32 kayıt, IANA tz'li, aynı-isim ayrımlı. */
export const WORLD_LOCATIONS: ReadonlyArray<Location> = [
  { id: "de-berlin",         name: "Berlin",         country: "Germany",        countryCode: "DE", adminRegion: "Berlin",              lat: 52.5200,  lon: 13.4050,   elev: 0, tz: "Europe/Berlin",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "gb-london",         name: "London",         country: "United Kingdom", countryCode: "GB", adminRegion: "England",             lat: 51.5074,  lon: -0.1278,   elev: 0, tz: "Europe/London",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "fr-paris",          name: "Paris",          country: "France",         countryCode: "FR", adminRegion: "Île-de-France",       lat: 48.8566,  lon: 2.3522,    elev: 0, tz: "Europe/Paris",                  source: "geonames", verified: true, origin: "bundled" },
  { id: "us-tx-paris",       name: "Paris",          country: "United States",  countryCode: "US", adminRegion: "Texas",               lat: 33.6609,  lon: -95.5555,  elev: 0, tz: "America/Chicago",               source: "geonames", verified: true, origin: "bundled" },
  { id: "us-ny-new-york",    name: "New York",       country: "United States",  countryCode: "US", adminRegion: "New York",            lat: 40.7128,  lon: -74.0060,  elev: 0, tz: "America/New_York",              source: "geonames", verified: true, origin: "bundled" },
  { id: "us-ca-los-angeles", name: "Los Angeles",    country: "United States",  countryCode: "US", adminRegion: "California",          lat: 34.0522,  lon: -118.2437, elev: 0, tz: "America/Los_Angeles",           source: "geonames", verified: true, origin: "bundled" },
  { id: "us-il-chicago",     name: "Chicago",        country: "United States",  countryCode: "US", adminRegion: "Illinois",            lat: 41.8781,  lon: -87.6298,  elev: 0, tz: "America/Chicago",               source: "geonames", verified: true, origin: "bundled" },
  { id: "us-ca-san-francisco", name: "San Francisco", country: "United States", countryCode: "US", adminRegion: "California",          lat: 37.7749,  lon: -122.4194, elev: 0, tz: "America/Los_Angeles",           source: "geonames", verified: true, origin: "bundled" },
  { id: "ca-toronto",        name: "Toronto",        country: "Canada",         countryCode: "CA", adminRegion: "Ontario",             lat: 43.6532,  lon: -79.3832,  elev: 0, tz: "America/Toronto",               source: "geonames", verified: true, origin: "bundled" },
  { id: "jp-tokyo",          name: "Tokyo",          country: "Japan",          countryCode: "JP", adminRegion: "Tokyo",               lat: 35.6762,  lon: 139.6503,  elev: 0, tz: "Asia/Tokyo",                    source: "geonames", verified: true, origin: "bundled" },
  { id: "kr-seoul",          name: "Seoul",          country: "South Korea",    countryCode: "KR", adminRegion: "Seoul",               lat: 37.5665,  lon: 126.9780,  elev: 0, tz: "Asia/Seoul",                    source: "geonames", verified: true, origin: "bundled" },
  { id: "au-sydney",         name: "Sydney",         country: "Australia",      countryCode: "AU", adminRegion: "New South Wales",     lat: -33.8688, lon: 151.2093,  elev: 0, tz: "Australia/Sydney",              source: "geonames", verified: true, origin: "bundled" },
  { id: "nz-auckland",       name: "Auckland",       country: "New Zealand",    countryCode: "NZ", adminRegion: "Auckland",            lat: -36.8509, lon: 174.7645,  elev: 0, tz: "Pacific/Auckland",              source: "geonames", verified: true, origin: "bundled" },
  { id: "ae-dubai",          name: "Dubai",          country: "United Arab Emirates", countryCode: "AE", adminRegion: "Dubai",         lat: 25.2048,  lon: 55.2708,   elev: 0, tz: "Asia/Dubai",                    source: "geonames", verified: true, origin: "bundled" },
  { id: "sg-singapore",      name: "Singapore",      country: "Singapore",      countryCode: "SG", adminRegion: "Singapore",           lat: 1.3521,   lon: 103.8198,  elev: 0, tz: "Asia/Singapore",                source: "geonames", verified: true, origin: "bundled" },
  { id: "hk-hong-kong",      name: "Hong Kong",      country: "Hong Kong",      countryCode: "HK", adminRegion: "Hong Kong",           lat: 22.3193,  lon: 114.1694,  elev: 0, tz: "Asia/Hong_Kong",                source: "geonames", verified: true, origin: "bundled" },
  { id: "cn-beijing",        name: "Beijing",        country: "China",          countryCode: "CN", adminRegion: "Beijing",             lat: 39.9042,  lon: 116.4074,  elev: 0, tz: "Asia/Shanghai",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "cn-shanghai",       name: "Shanghai",       country: "China",          countryCode: "CN", adminRegion: "Shanghai",            lat: 31.2304,  lon: 121.4737,  elev: 0, tz: "Asia/Shanghai",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "in-mumbai",         name: "Mumbai",         country: "India",          countryCode: "IN", adminRegion: "Maharashtra",         lat: 19.0760,  lon: 72.8777,   elev: 0, tz: "Asia/Kolkata",                  source: "geonames", verified: true, origin: "bundled" },
  { id: "in-delhi",          name: "Delhi",          country: "India",          countryCode: "IN", adminRegion: "Delhi",               lat: 28.6139,  lon: 77.2090,   elev: 0, tz: "Asia/Kolkata",                  source: "geonames", verified: true, origin: "bundled" },
  { id: "th-bangkok",        name: "Bangkok",        country: "Thailand",       countryCode: "TH", adminRegion: "Bangkok",             lat: 13.7563,  lon: 100.5018,  elev: 0, tz: "Asia/Bangkok",                  source: "geonames", verified: true, origin: "bundled" },
  { id: "ru-moscow",         name: "Moscow",         country: "Russia",         countryCode: "RU", adminRegion: "Moscow",              lat: 55.7558,  lon: 37.6173,   elev: 0, tz: "Europe/Moscow",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "es-madrid",         name: "Madrid",         country: "Spain",          countryCode: "ES", adminRegion: "Community of Madrid",  lat: 40.4168,  lon: -3.7038,   elev: 0, tz: "Europe/Madrid",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "it-rome",           name: "Rome",           country: "Italy",          countryCode: "IT", adminRegion: "Lazio",               lat: 41.9028,  lon: 12.4964,   elev: 0, tz: "Europe/Rome",                   source: "geonames", verified: true, origin: "bundled" },
  { id: "nl-amsterdam",      name: "Amsterdam",      country: "Netherlands",    countryCode: "NL", adminRegion: "North Holland",       lat: 52.3676,  lon: 4.9041,    elev: 0, tz: "Europe/Amsterdam",              source: "geonames", verified: true, origin: "bundled" },
  { id: "at-vienna",         name: "Vienna",         country: "Austria",        countryCode: "AT", adminRegion: "Vienna",              lat: 48.2082,  lon: 16.3738,   elev: 0, tz: "Europe/Vienna",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "ch-zurich",         name: "Zurich",         country: "Switzerland",    countryCode: "CH", adminRegion: "Zurich",              lat: 47.3769,  lon: 8.5417,    elev: 0, tz: "Europe/Zurich",                 source: "geonames", verified: true, origin: "bundled" },
  { id: "se-stockholm",      name: "Stockholm",      country: "Sweden",         countryCode: "SE", adminRegion: "Stockholm",           lat: 59.3293,  lon: 18.0686,   elev: 0, tz: "Europe/Stockholm",              source: "geonames", verified: true, origin: "bundled" },
  { id: "eg-cairo",          name: "Cairo",          country: "Egypt",          countryCode: "EG", adminRegion: "Cairo",               lat: 30.0444,  lon: 31.2357,   elev: 0, tz: "Africa/Cairo",                  source: "geonames", verified: true, origin: "bundled" },
  { id: "za-johannesburg",   name: "Johannesburg",   country: "South Africa",   countryCode: "ZA", adminRegion: "Gauteng",             lat: -26.2041, lon: 28.0473,   elev: 0, tz: "Africa/Johannesburg",           source: "geonames", verified: true, origin: "bundled" },
  { id: "br-sao-paulo",      name: "São Paulo",      country: "Brazil",         countryCode: "BR", adminRegion: "São Paulo",           lat: -23.5505, lon: -46.6333,  elev: 0, tz: "America/Sao_Paulo",             source: "geonames", verified: true, origin: "bundled" },
  { id: "ar-buenos-aires",   name: "Buenos Aires",   country: "Argentina",      countryCode: "AR", adminRegion: "Buenos Aires",        lat: -34.6037, lon: -58.3816,  elev: 0, tz: "America/Argentina/Buenos_Aires", source: "geonames", verified: true, origin: "bundled" },
  { id: "mx-mexico-city",    name: "Mexico City",    country: "Mexico",         countryCode: "MX", adminRegion: "Mexico City",         lat: 19.4326,  lon: -99.1332,  elev: 0, tz: "America/Mexico_City",           source: "geonames", verified: true, origin: "bundled" },
];
