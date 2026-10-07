// Astroloji — doğum yeri kimliği → IANA tz + koordinat (YALNIZ SUNUCU).
//
// Kaynaklar: Yaşam Sistemi genel konum altyapısı (lib/location) — Türkiye 81 il (authoritative),
// pilot dünya şehirleri ve GeoNames sunucu veri seti. DIŞ API YOK (Roxy konum araması
// kullanılmaz → ek istek maliyeti yok). Human Design'ın konum dosyalarına bağımlılık YOK.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import { getGlobalLocationById } from "@/lib/location/server/search";
import type { Location } from "@/lib/location";
import { isValidIanaTimeZone } from "./timeResolution";
import type { ResolvedLocation } from "./profileInput";

assertServerOnly("lib/astrology/birth/location");

function label(l: Location): string {
  const region = l.adminRegion && l.adminRegion !== l.name ? `${l.adminRegion}, ` : "";
  return `${l.name}, ${region}${l.country}`;
}

export function resolveAstroLocation(id: unknown): ResolvedLocation | null {
  if (typeof id !== "string" || !/^[A-Za-z0-9_\-]{2,64}$/.test(id)) return null;
  const loc: Location | null =
    TR_LOCATIONS.find((l) => l.id === id) ?? WORLD_LOCATIONS.find((l) => l.id === id) ?? getGlobalLocationById(id);
  if (!loc) return null;
  if (!isValidIanaTimeZone(loc.tz)) return null;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
  if (loc.lat < -90 || loc.lat > 90 || loc.lon < -180 || loc.lon > 180) return null;
  return { id: loc.id, label: label(loc), timezone: loc.tz, latitude: loc.lat, longitude: loc.lon };
}
