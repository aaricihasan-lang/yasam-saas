// Astroloji — SABİT YILDIZLAR (Batı, tropikal) PROVIDER-BAĞIMSIZ model (SAF; istemci de import edebilir).
//
// Yöntem: EKLİPTİK BOYLAM KAVUŞUMU. Yıldızın doğum anındaki görünür (presesyon + nütasyon + yıllık aberasyon)
// tropikal boylamı ile natal nokta boylamı arasındaki fark ≤ orb. Bu PARAN DEĞİLDİR (paran = yıldız ile gezegenin
// aynı anda ufuk/meridyen üzerinde olması; ayrı astronomik hesap ister, bu modelde YOK).
//
// Kaynak: Roxy POST /astrology/fixed-stars. Sağlayıcıdan her zaman en geniş orb (3°) bir kez istenir; uzmanın
// seçtiği orb (0,5–3°) yalnız FİLTREDİR → orb değişikliği yeni sağlayıcı isteği gerektirmez.
// Teknik katman yalnız kanonik kimlik + sayı taşır (yıldız kimliği sağlayıcının kanonik `id`'si; Türkçe ad ve
// takımyıldız Yaşam'ın kendi kataloğundan — lib/astrology/labels/fixedStars.ts). Anahtar kelimeler ve kavuşum
// anlatıları YORUM katmanındadır (yetkiyle).

import type { BodyId, EclipticPoint, NodeType } from "./western";

export const FIXED_STARS_TECHNICAL_SCHEMA = "astro.western.fixed_stars.v1" as const;
export const FIXED_STARS_INTERP_SCHEMA = "astro.western.fixed_stars.interp.v1" as const;

/** Roxy belgesi: orb sorgu parametresi en fazla 3°. Sağlayıcıdan HER ZAMAN bu değer istenir. */
export const FIXED_STAR_ORB_QUERY = 3 as const;
/** Gösterim/rapor orbu seçenekleri (filtre; yeni istek gerektirmez). */
export const FIXED_STAR_ORB_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3] as const;
export type FixedStarOrb = (typeof FIXED_STAR_ORB_OPTIONS)[number];
/** Varsayılan 1°: ekliptik boylam kavuşumunda yaygın profesyonel uygulama (Roxy varsayılanı da 1°). */
export const FIXED_STAR_ORB_DEFAULT: FixedStarOrb = 1;

/** Geleneksel (Ptolemaik) gezegen doğası — yalnız 7 klasik gezegen. */
export const TRADITIONAL_PLANETS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
export type TraditionalPlanet = (typeof TRADITIONAL_PLANETS)[number];

export type FixedStarPointId = BodyId | "ascendant" | "midheaven";

export type FixedStar = EclipticPoint & {
  /** Sağlayıcının kanonik kimliği (küçük harf, tire). */
  id: string;
  magnitude: number;
  /** Geleneksel doğa (ör. Algol = Satürn + Jüpiter); ayrıştırılamazsa null. */
  nature: TraditionalPlanet[] | null;
};

export type FixedStarContact = {
  star: string;
  point: FixedStarPointId;
  /** Natal noktanın boylamı (sağlayıcı yanıtından). */
  pointLongitude: number;
  /** Boylam farkı (derece). */
  orb: number;
};

export type FixedStarsTechnical = {
  schema: typeof FIXED_STARS_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  method: "ecliptic_longitude_conjunction";
  nodeType: NodeType;
  /** Sağlayıcıya gönderilen (en geniş) orb; temaslar bu sınırın içindedir. */
  orbQueried: number;
  /** Sağlayıcının döndürdüğü TÜM yıldızlar (kavuşumu olmayanlar dahil; hiçbiri atılmaz). */
  stars: FixedStar[];
  /** Tüm temaslar (≤ orbQueried), en sıkı önce. */
  contacts: FixedStarContact[];
};

export type FixedStarsInterpretation = {
  schema: typeof FIXED_STARS_INTERP_SCHEMA;
  /** Yıldız başına sağlayıcı anahtar kelimeleri (sağlayıcı İngilizce verir; görüntüde Türkçe sözlükle). */
  stars: { id: string; keywords: string[] }[];
  /** Kavuşum başına sağlayıcı anlatısı (lang=tr). */
  contacts: { star: string; point: FixedStarPointId; text: string }[];
  /** Sağlayıcı özeti — sorgulanan orba (3°) göre yazılır. */
  summary: string | null;
};

/** Gösterim orbuna göre temas filtresi (sınır dahil). */
export function contactsWithinOrb<T extends { orb: number }>(contacts: readonly T[], orb: number): T[] {
  return contacts.filter((c) => c.orb <= orb + 1e-9);
}

/** Seçenekten gösterim orbu: geçersiz/eksik → varsayılan. */
export function fixedStarOrbOf(v: unknown): FixedStarOrb {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return (FIXED_STAR_ORB_OPTIONS as readonly number[]).includes(n) ? (n as FixedStarOrb) : FIXED_STAR_ORB_DEFAULT;
}
