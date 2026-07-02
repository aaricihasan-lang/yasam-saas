/**
 * lib/location/index.ts — Konum arama/çözümleme API iskeleti (FAZ 5 / P1).
 *
 * Saf veri katmanı: hiçbir motora, UI'a veya veritabanına bağımlı değildir ve
 * hiçbirini değiştirmez. Şu an tohum (seed) dataset üzerinde çalışır; P2/P5'te
 * gerçek dataset devreye girince API imzaları AYNI kalır.
 */
import type { Location, LocationSearchOptions } from "./types";
import { SEED_LOCATIONS } from "./data";

export type { Location, LocationSource, LocationOrigin, LocationSearchOptions } from "./types";

/**
 * Türkçe-güvenli normalizasyon: büyük/küçük ve diakritik bağımsız eşleşme.
 * "İzmir" ~ "izmir" ~ "IZMIR"; "Şanlıurfa" ~ "sanliurfa"; "Zürich" ~ "zurich".
 */
export function normalizeLocationQuery(query: string): string {
  return (query ?? "")
    // Türkçe karakterler — her iki kasa açıkça (locale-lowercase quirk'lerinden kaçın)
    .replace(/[İI]/g, "i").replace(/ı/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase()
    // kalan yabancı diakritikler (é, á, ñ...) → taban harf
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bir konumun sorguya uygunluk skoru (0 = eşleşme yok). Yüksek = daha iyi. */
function matchScore(loc: Location, q: string): number {
  const name    = normalizeLocationQuery(loc.name);
  const admin   = normalizeLocationQuery(loc.adminRegion);
  const country = normalizeLocationQuery(loc.country);
  const cc      = loc.countryCode.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (admin.startsWith(q)) return 45;
  if (admin.includes(q)) return 35;
  if (cc === q || country.startsWith(q)) return 25;
  if (country.includes(q)) return 15;
  return 0;
}

/**
 * Konum ara. Boş sorgu → ilk `limit` kayıt (opsiyonel ülke filtresiyle).
 * İsim > il/bölge > ülke sırasıyla skorlanır; eşit skorlar ada göre sıralanır.
 */
export function searchLocations(query: string, options: LocationSearchOptions = {}): Location[] {
  const limit = options.limit ?? 10;
  const base = options.dataset ?? SEED_LOCATIONS;
  const pool: ReadonlyArray<Location> = options.countryCode
    ? base.filter(l => l.countryCode === options.countryCode)
    : base;

  const q = normalizeLocationQuery(query);
  if (!q) return pool.slice(0, limit);

  return pool
    .map(loc => ({ loc, score: matchScore(loc, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.loc.name.localeCompare(b.loc.name, "tr"))
    .slice(0, limit)
    .map(x => x.loc);
}

/** Kararlı kimlikten konum getir; bulunamazsa null. */
export function getLocationById(id: string): Location | null {
  return SEED_LOCATIONS.find(l => l.id === id) ?? null;
}

/**
 * Bir nesnenin geçerli bir Location olup olmadığını doğrular (tip koruması).
 * Koordinat sınırları ve zorunlu alanlar kontrol edilir.
 */
export function isValidLocation(loc: unknown): loc is Location {
  if (!loc || typeof loc !== "object") return false;
  const l = loc as Record<string, unknown>;
  const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const isNonEmpty  = (v: unknown): v is string => typeof v === "string" && v.length > 0;

  return (
    isNonEmpty(l.id) &&
    isNonEmpty(l.name) &&
    isNonEmpty(l.country) &&
    typeof l.countryCode === "string" && l.countryCode.length === 2 &&
    typeof l.adminRegion === "string" &&                       // boş olabilir
    isFiniteNum(l.lat) && l.lat >= -90 && l.lat <= 90 &&
    isFiniteNum(l.lon) && l.lon >= -180 && l.lon <= 180 &&
    isFiniteNum(l.elev) &&
    isNonEmpty(l.tz) &&
    (l.source === "geonames" || l.source === "manual" || l.source === "geolocation" || l.source === "nominatim") &&
    typeof l.verified === "boolean" &&
    (l.origin === "bundled" || l.origin === "user-added")
  );
}
