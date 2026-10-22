// Astroloji — EK NOKTALAR (Batı, tropikal) PROVIDER-BAĞIMSIZ model (SAF; istemci de import edebilir). 2026-10-22.
//
// Tek teknik ("western.extra_points"), üç İSTEĞE BAĞLI bölüm — her bölüm ayrı sağlayıcı ucu = ayrı hesap birimi:
//   asteroids → Ceres, Pallas, Juno, Vesta · lots → yedi Hermetik lot · lilith → Kara Ay ORTALAMA + GERÇEK (osculating)
// Natal çarkı kalabalıklaştırılmaz ve natal isteği değişmez: noktalar bu tekniğin kendi ekranında gösterilir; aynı doğum
// verisinin natal sonucu ÖNBELLEKTE varsa (contextUnits — progresyon/transit deseni, yeni istek YOK) natal çark + ek
// noktalar katmanı olarak çizilir ve natal değerlerle tutarlılık denetimi (ortalama Lilith, Şans Noktası, sect) yapılır.
//
// Ortalama ve gerçek Lilith ASLA karışmaz: ayrı alan (lilith.mean / lilith.true), ayrı etiket, ayrı renk.
// Şans Noktası (Fortuna) MÜKERRER değildir: tek kaynak lot tablosudur; natal haritadaki Şans Noktası ile tutarlılığı
// denetlenir ve sonucu açıkça yazılır (uyumsuzluk sessizce düzeltilmez).
// Bu dosyada astronomik hesap YOKTUR; yalnız sağlayıcı verisinin aritmetik tutarlılık denetimi (lot formülü) vardır.

import type { EclipticPoint, HouseSystem, NatalHouse, SignId } from "./western";

export const EXTRA_POINTS_TECHNICAL_SCHEMA = "astro.western.extra_points.v1" as const;
/** Tek bir bölümün (uç) kayıtlı teknik katmanı — önbellek satırı bu şemadadır; görünüm bölümleri birleştirir. */
export const EXTRA_POINTS_PART_SCHEMA = "astro.western.extra_points.part.v1" as const;
export const EXTRA_POINTS_INTERP_SCHEMA = "astro.western.extra_points.interp.v1" as const;

export const EXTRA_SECTIONS = ["asteroids", "lots", "lilith"] as const;
export type ExtraSection = (typeof EXTRA_SECTIONS)[number];

export const ASTEROID_IDS = ["ceres", "pallas", "juno", "vesta"] as const;
export type AsteroidId = (typeof ASTEROID_IDS)[number];

/** Sağlayıcının kanonik sırası (Paulus Alexandrinus'un yedi Hermetik lotu). */
export const LOT_IDS = ["fortune", "spirit", "eros", "necessity", "courage", "victory", "nemesis"] as const;
export type LotId = (typeof LOT_IDS)[number];

export const LILITH_VARIANTS = ["mean", "true"] as const;
export type LilithVariant = (typeof LILITH_VARIANTS)[number];

/** Lotlarda sect'i belirleyen ev sistemi (sağlayıcıya her zaman bu gönderilir; bkz. providers/roxy/extraPoints.ts). */
export const LOTS_HOUSE_SYSTEM = "placidus" as const;

export type ExtraAsteroid = EclipticPoint & { id: AsteroidId; latitude: number; house: number | null; speed: number; retrograde: boolean };
export type ExtraLilith = EclipticPoint & { variant: LilithVariant; latitude: number; house: number | null; speed: number; retrograde: boolean };

/** Lot formülünün terimleri (Yükselen + artı − eksi). */
export type LotTerm = "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn" | "fortune" | "spirit";
/**
 * Lot: sağlayıcının BİLDİRDİĞİ formül terimleri (Yükselen + plus − minus) ve bu formülün Paulus geleneğiyle (sect'e göre)
 * aynı olup olmadığı. Golden 2026-10-22: Zafer (Victory) lotunda sağlayıcı terimleri geleneğin TERSİ sırayla kullanıyor
 * (gündüz Yükselen + Ruh − Jüpiter; Paulus: Yükselen + Jüpiter − Ruh) → traditional=false; değer sessizce düzeltilmez.
 */
export type ExtraLot = EclipticPoint & { id: LotId; plus: LotTerm; minus: LotTerm; traditional: boolean };

/**
 * 2026-10-22 owner kararı: metodolojisi doğrulanmamış lotun burç / derecesi kesin sonuç gibi SUNULMAZ (ekran, çark,
 * Word/PDF, Sistem Yorumu). Zafer (Victory) sağlayıcı yanıtı netleşene ve owner karar verene kadar her durumda gizlenir;
 * Paulus sırasından sapan başka bir lot da gizlenir. Kayıtlı teknik veri DEĞİŞMEZ (yalnız gösterim); diğer lotlar etkilenmez.
 */
export const LOT_POSITION_UNDER_REVIEW: ReadonlySet<LotId> = new Set<LotId>(["victory"]);
export function lotPositionWithheld(l: { id?: unknown; traditional?: unknown }): boolean {
  return l.traditional === false || LOT_POSITION_UNDER_REVIEW.has(l.id as LotId);
}

export type ExtraAsteroidsPart = { section: "asteroids"; houseSystem: HouseSystem; bodies: ExtraAsteroid[] };
export type ExtraLotsPart = { section: "lots"; sect: "day" | "night"; sectHouseSystem: typeof LOTS_HOUSE_SYSTEM; lots: ExtraLot[] };
export type ExtraLilithPart = { section: "lilith"; houseSystem: HouseSystem; mean: ExtraLilith; true: ExtraLilith };

export type ExtraPointsPart = { schema: typeof EXTRA_POINTS_PART_SCHEMA; zodiac: "tropical" } & (ExtraAsteroidsPart | ExtraLotsPart | ExtraLilithPart);

/** Önbellekteki natal çerçeve (yalnız gösterim + tutarlılık denetimi; natal sonuç DEĞİŞTİRİLMEZ). */
export type ExtraNatalFrame = {
  houseSystem: HouseSystem;
  bodies: { id: string; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean }[];
  houses: NatalHouse[];
  angles: { ascendant: EclipticPoint; midheaven: EclipticPoint };
};

export type ConsistencyStatus = "consistent" | "inconsistent" | "unavailable";
export type ExtraNatalCheck = {
  /** Ortalama Lilith (bu uç) ↔ natal Kara Ay Lilith (natal yalnız ortalamayı taşır). */
  meanLilith: { status: ConsistencyStatus; diffDeg: number | null };
  /** Şans Noktası (lot) ↔ natal Şans Noktası: konum farkı + sect aynı mı. */
  fortune: { status: ConsistencyStatus; diffDeg: number | null; lotSect: "day" | "night" | null; natalSect: "day" | "night" | null };
  /** Yedi lotun natal Yükselen + gezegenlerinden Paulus formülleriyle aritmetik denetimi (en büyük fark). */
  lotFormulas: { status: ConsistencyStatus; maxDiffDeg: number | null };
};

export type ExtraPointsTechnical = {
  schema: typeof EXTRA_POINTS_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  /** Asteroit ve Lilith evleri için seçilen ev sistemi. */
  houseSystem: HouseSystem;
  /** Seçilen bölümler (kanonik sıra). */
  sections: ExtraSection[];
  asteroids: Omit<ExtraAsteroidsPart, "section"> | null;
  lots: Omit<ExtraLotsPart, "section"> | null;
  lilith: Omit<ExtraLilithPart, "section"> | null;
  /** Önbellekte aynı doğum verisi + aynı ev sistemiyle natal varsa çerçeve; yoksa null (yeni istek yapılmaz). */
  natalFrame?: ExtraNatalFrame | null;
  natalCheck?: ExtraNatalCheck | null;
};

/** Sistem Yorumu katmanı: her noktanın kısa sağlayıcı açıklaması AYNEN (geçersiz/boş → null; uydurulmaz). */
export type ExtraPointsInterpretation = {
  schema: typeof EXTRA_POINTS_INTERP_SCHEMA;
  asteroids: { items: { id: AsteroidId; text: string | null }[]; summary: string | null } | null;
  lots: { items: { id: LotId; text: string | null }[]; summary: string | null } | null;
  lilith: { items: { variant: LilithVariant; text: string | null; note: string | null }[]; summary: string | null } | null;
};
export const EXTRA_POINTS_INTERP_NOTE = "Otomatik oluşturulan kısa astrolojik açıklama. Kapsamlı uzman değerlendirmesi değildir.";

/**
 * Paulus Alexandrinus (Eisagogika, böl. 23) yedi Hermetik lot — GÜNDÜZ formülü: Yükselen + plus − minus.
 * GECE haritasında artı ve eksi terimleri yer değiştirir (sağlayıcı belgesi + geleneksel kural; Fortuna gece = ASC + Güneş − Ay).
 */
export const LOT_DAY_FORMULA: Readonly<Record<LotId, { plus: LotTerm; minus: LotTerm }>> = Object.freeze({
  fortune: { plus: "moon", minus: "sun" },
  spirit: { plus: "sun", minus: "moon" },
  eros: { plus: "venus", minus: "spirit" },
  necessity: { plus: "fortune", minus: "mercury" },
  courage: { plus: "fortune", minus: "mars" },
  victory: { plus: "jupiter", minus: "spirit" },
  nemesis: { plus: "fortune", minus: "saturn" },
});

export function lotFormulaFor(id: LotId, sect: "day" | "night"): { plus: LotTerm; minus: LotTerm } {
  const f = LOT_DAY_FORMULA[id];
  return sect === "day" ? f : { plus: f.minus, minus: f.plus };
}

export const n360 = (x: number) => ((x % 360) + 360) % 360;
/** İki boylam arasındaki en kısa yay (0–180). */
export const arcDiff = (a: number, b: number) => Math.abs(n360(a - b + 180) - 180);

/** Tutarlılık eşiği (derece): sağlayıcının yuvarlaması + LMT/saniye farkları için pay; aynı doğum anında farklar ≪ bu değer. */
export const EXTRA_CONSISTENCY_TOLERANCE_DEG = 0.05;

/** Seçenek: bölüm listesi (tekrarsız, kanonik sıra); boş/bilinmeyen → null. */
export function extraSectionsOf(v: unknown): ExtraSection[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > EXTRA_SECTIONS.length) return null;
  if (!v.every((x) => typeof x === "string" && (EXTRA_SECTIONS as readonly string[]).includes(x))) return null;
  if (new Set(v).size !== v.length) return null;
  return EXTRA_SECTIONS.filter((s) => v.includes(s));
}
