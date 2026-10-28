/**
 * Klasik Numeroloji — sağlayıcı uç kaydı (TEK KAYNAK).
 *
 * Her resmî numeroloji ucu burada bir kez tanımlanır. `productCall`:
 *   • "direct"  → ürün bu ucu gerçekten çağırır (tam haritada olmayan ek hesap/yöntem).
 *   • "chart"   → aynı veri /chart yanıtında birebir bulunur; ürün ayrıca ÇAĞIRMAZ (kredi tasarrufu).
 *                 Tutarlılık yalnız doğrulama koşucusunda (scripts/numeroloji-klasik/live) kanıtlanır.
 *   • "catalog" → sabit anlam metni; çevrimdışı içe aktarılır, uzman isteğinde 0 çağrı.
 *   • "daily"   → tohum (seed) tabanlı sembolik çıktı; kişinin doğum verisinden HESAPLANMAZ.
 *
 * Bu dosya mevcut Numeroloji (lib/numeroloji/**) ile hiçbir bağ kurmaz.
 */

export type ClassicMethod = "pythagorean" | "chaldean" | "dual" | "seeded";

export type ClassicEndpointId =
  | "chart"
  | "life_path"
  | "expression"
  | "soul_urge"
  | "personality"
  | "birth_day"
  | "maturity"
  | "bridge"
  | "karmic_lessons"
  | "karmic_debt"
  | "personal_day"
  | "personal_month"
  | "personal_year"
  | "compatibility"
  | "meanings"
  | "daily"
  | "chaldean"
  | "compound_number"
  | "dual"
  | "business_name";

export type ClassicEndpoint = {
  id: ClassicEndpointId;
  method: "GET" | "POST";
  /** /numerology altındaki yol; {n} yol parametresi */
  path: string;
  system: ClassicMethod;
  productCall: "direct" | "chart" | "catalog" | "daily";
};

export const NUMEROLOGY_BASE_PATH = "/numerology";

export const CLASSIC_ENDPOINTS: readonly ClassicEndpoint[] = Object.freeze([
  { id: "chart", method: "POST", path: "/chart", system: "pythagorean", productCall: "direct" },
  { id: "life_path", method: "POST", path: "/life-path", system: "pythagorean", productCall: "chart" },
  { id: "expression", method: "POST", path: "/expression", system: "pythagorean", productCall: "chart" },
  { id: "soul_urge", method: "POST", path: "/soul-urge", system: "pythagorean", productCall: "chart" },
  { id: "personality", method: "POST", path: "/personality", system: "pythagorean", productCall: "chart" },
  { id: "birth_day", method: "POST", path: "/birth-day", system: "pythagorean", productCall: "chart" },
  { id: "maturity", method: "POST", path: "/maturity", system: "pythagorean", productCall: "chart" },
  { id: "bridge", method: "POST", path: "/bridge", system: "pythagorean", productCall: "direct" },
  { id: "karmic_lessons", method: "POST", path: "/karmic-lessons", system: "pythagorean", productCall: "chart" },
  { id: "karmic_debt", method: "POST", path: "/karmic-debt", system: "pythagorean", productCall: "chart" },
  { id: "personal_day", method: "POST", path: "/personal-day", system: "pythagorean", productCall: "direct" },
  { id: "personal_month", method: "POST", path: "/personal-month", system: "pythagorean", productCall: "chart" },
  { id: "personal_year", method: "POST", path: "/personal-year", system: "pythagorean", productCall: "chart" },
  { id: "compatibility", method: "POST", path: "/compatibility", system: "pythagorean", productCall: "direct" },
  { id: "meanings", method: "GET", path: "/meanings/{n}", system: "pythagorean", productCall: "catalog" },
  { id: "daily", method: "POST", path: "/daily", system: "seeded", productCall: "daily" },
  { id: "chaldean", method: "POST", path: "/chaldean", system: "chaldean", productCall: "direct" },
  { id: "compound_number", method: "GET", path: "/compound-number/{n}", system: "chaldean", productCall: "catalog" },
  { id: "dual", method: "POST", path: "/dual", system: "dual", productCall: "direct" },
  { id: "business_name", method: "POST", path: "/business-name", system: "chaldean", productCall: "direct" },
]);

export function getClassicEndpoint(id: ClassicEndpointId): ClassicEndpoint {
  const e = CLASSIC_ENDPOINTS.find((x) => x.id === id);
  if (!e) throw new Error(`bilinmeyen uç: ${id}`);
  return e;
}

/** Sağlayıcı OpenAPI sürümü (29.10.2026 doğrulandı: OpenAPI 3.1.0, info.version 2.0.0). */
export const CLASSIC_PROVIDER_SPEC_VERSION = "numerology-openapi-2.0.0";
