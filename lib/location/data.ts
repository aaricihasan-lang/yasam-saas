/**
 * lib/location/data.ts — GEÇİCİ tohum (seed) dataset (FAZ 5 / P1 iskele).
 *
 * ⚠️ YER TUTUCU: Bu yalnızca API iskeletinin test edilebilmesi için küçük,
 * temsili bir kümedir. Büyük veri buraya P1'de EKLENMEZ.
 *   - Türkiye 81 il → P2'de derlenmiş dataset olarak gelecek.
 *   - Global şehirler (GeoNames) → P5'te gelecek.
 *
 * lib/cosmic/eclipses.ts içindeki TR_CITIES'ten TAMAMEN BAĞIMSIZDIR; onu
 * ne okur ne değiştirir. Motor davranışını etkilemez.
 */
import type { Location } from "./types";

/** Temsili tohum konumlar (audit örnekleri: Manisa, Berlin, London, New York). */
export const SEED_LOCATIONS: ReadonlyArray<Location> = [
  { id: "tr-istanbul", name: "İstanbul", country: "Türkiye",        countryCode: "TR", adminRegion: "İstanbul", lat: 41.0082, lon: 28.9784,  elev: 40,  tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-ankara",   name: "Ankara",   country: "Türkiye",        countryCode: "TR", adminRegion: "Ankara",   lat: 39.9334, lon: 32.8597,  elev: 938, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-izmir",    name: "İzmir",    country: "Türkiye",        countryCode: "TR", adminRegion: "İzmir",    lat: 38.4237, lon: 27.1428,  elev: 25,  tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-manisa",   name: "Manisa",   country: "Türkiye",        countryCode: "TR", adminRegion: "Manisa",   lat: 38.6191, lon: 27.4289,  elev: 71,  tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "de-berlin",   name: "Berlin",   country: "Almanya",        countryCode: "DE", adminRegion: "Berlin",   lat: 52.5200, lon: 13.4050,  elev: 34,  tz: "Europe/Berlin",   source: "manual", verified: true, origin: "bundled" },
  { id: "gb-london",   name: "London",   country: "United Kingdom", countryCode: "GB", adminRegion: "England",  lat: 51.5074, lon: -0.1278,  elev: 11,  tz: "Europe/London",   source: "manual", verified: true, origin: "bundled" },
  { id: "us-newyork",  name: "New York", country: "United States",  countryCode: "US", adminRegion: "New York", lat: 40.7128, lon: -74.0060, elev: 10,  tz: "America/New_York", source: "manual", verified: true, origin: "bundled" },
];
