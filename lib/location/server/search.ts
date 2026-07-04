/**
 * lib/location/server/search.ts — SERVER-ONLY global konum arama çekirdeği (FAZ 5 / P5f-2).
 *
 * GeoNames tabanlı server-only artefaktı (lib/location/server-data/global-cities.json)
 * bir kez yükler (module cache) ve normalize edilmiş, diakritik-duyarsız arama sağlar.
 *
 * ÖNEMLİ: Bu dosya YALNIZ server tarafında (app/api/location/search/route.ts) import
 * edilir; hiçbir Client Component import ETMEZ → client bundle'a girmez. Motor/UI/DB/tz
 * helper'a dokunmaz. Türkiye dataset'te YOK (TR authoritative TR_LOCATIONS) → sonuçlar
 * asla TR içermez; TR birleştirmesi P5f-3 client entegrasyonunda yapılır.
 */
import type { Location } from "@/lib/location/types";
import artifactData from "@/lib/location/server-data/global-cities.json";

/** Artefakt kaydı = Location + opsiyonel population (sıralama). */
export type GlobalRecord = Location & { population?: number };

const ARTIFACT = artifactData as unknown as { count: number; locations: GlobalRecord[] };
const LOCATIONS: ReadonlyArray<GlobalRecord> = ARTIFACT.locations;

export const MIN_QUERY_LENGTH = 2;
export const MAX_LIMIT = 10;
export const DEFAULT_LIMIT = 10;

/** Türkçe-güvenli + diakritik-duyarsız normalizasyon (lib/location/index.ts ile aynı kurallar). */
export function normalizeQuery(query: string): string {
  return (query ?? "")
    .replace(/[İI]/g, "i").replace(/ı/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Uygunluk skoru (0 = eşleşme yok). exact > prefix > substring; name > adminRegion > country. */
function scoreOf(loc: GlobalRecord, q: string): number {
  const name = normalizeQuery(loc.name);
  const admin = normalizeQuery(loc.adminRegion);
  const country = normalizeQuery(loc.country);
  const cc = loc.countryCode.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (admin.startsWith(q)) return 45;
  if (admin.includes(q)) return 35;
  if (cc === q || country.startsWith(q)) return 25;
  if (country.includes(q)) return 15;
  return 0;
}

export interface GlobalSearchOptions {
  limit?: number;
  countryCode?: string;
}

/**
 * Global dataset içinde ara. q normalize sonrası MIN_QUERY_LENGTH'ten kısaysa boş döner.
 * Sonuç: skor azalan → nüfus azalan → ad; en fazla `limit` (cap MAX_LIMIT). Aynı-isim id ile ayrışır.
 */
export function searchGlobalLocations(query: string, opts: GlobalSearchOptions = {}): GlobalRecord[] {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const cc = opts.countryCode ? opts.countryCode.toUpperCase() : null;
  const pool: ReadonlyArray<GlobalRecord> = cc ? LOCATIONS.filter(l => l.countryCode === cc) : LOCATIONS;

  return pool
    .map(loc => ({ loc, s: scoreOf(loc, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) =>
      b.s - a.s ||
      (b.loc.population ?? 0) - (a.loc.population ?? 0) ||
      a.loc.name.localeCompare(b.loc.name, "en"))
    .slice(0, limit)
    .map(x => x.loc);
}

/** Toplam yüklü kayıt sayısı (teşhis/harness için). */
export function globalDatasetCount(): number {
  return LOCATIONS.length;
}
