// HD — doğum yeri çözümü (SERVER-ONLY).
//
// İstemci yalnız konum KİMLİĞİ gönderir; IANA timezone + enlem/boylam SUNUCUDA mevcut
// Yaşam Sistemi konum altyapısından (lib/location) çözülür. İstemcinin gönderdiği tz/koordinata
// GÜVENİLMEZ; serbest metin birth_place timezone kabul EDİLMEZ.
//   • Türkiye: TR_LOCATIONS (81 il, authoritative)
//   • Pilot dünya şehirleri: WORLD_LOCATIONS
//   • Global: GeoNames server-only dataset (getGlobalLocationById)
//   • HD Türkiye 973 ilçe: "trd-…" kimlikleri YALNIZ sunucu veri setinden (trDistricts.ts)

import { TR_LOCATIONS } from "@/lib/location/tr";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import { getGlobalLocationById } from "@/lib/location/server/search";
import type { Location } from "@/lib/location";
import { getTrDistrictRecord } from "@/lib/human-design/location/trDistricts";
import { isValidIanaTimeZone } from "./birthTimeResolution";
import { isLocationRef, verifyLocationRef } from "./hdLocationRef";

export type HdBirthLocation = {
  id: string;
  label: string;
  timezone: string;
  latitude: number;
  longitude: number;
};

function label(l: Location): string {
  const region = l.adminRegion && l.adminRegion !== l.name ? `${l.adminRegion}, ` : "";
  return `${l.name}, ${region}${l.country}`;
}

export function resolveHdBirthLocation(id: unknown): HdBirthLocation | null {
  // Roxy konum araması (ilçe/şehir) → sunucu imzalı referans; imza doğrulanmazsa null.
  if (isLocationRef(id)) return verifyLocationRef(id);
  if (typeof id !== "string" || !/^[A-Za-z0-9_\-]{2,64}$/.test(id)) return null;
  const d = getTrDistrictRecord(id);
  if (d) return { id: d.id, label: d.label, timezone: d.tz, latitude: d.lat, longitude: d.lon };
  const loc: Location | null =
    TR_LOCATIONS.find((l) => l.id === id) ??
    WORLD_LOCATIONS.find((l) => l.id === id) ??
    getGlobalLocationById(id);
  if (!loc) return null;
  if (!isValidIanaTimeZone(loc.tz)) return null;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
  if (loc.lat < -90 || loc.lat > 90 || loc.lon < -180 || loc.lon > 180) return null;
  return { id: loc.id, label: label(loc), timezone: loc.tz, latitude: loc.lat, longitude: loc.lon };
}
