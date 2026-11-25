// R5 ROXY — Atlas teknik × seçenek planı (SAF; ağ yok). Sentetik kişiler; gerçek danışan YOK.
import type { BirthPoint } from "@/lib/astrology/providers/roxy/requests";

export type Persona = { id: string; label: string; birth: BirthPoint; birthUtc: string; tz: string };

/** P1: orta enlem, +3 (İstanbul) · P2: yüksek enlem (Tromsø 69.6K), kış, +1 · P3: 29 Şubat, güney yarıküre, yaz saati +11 (Sidney), gece yarısına yakın. */
export const PERSONAS: Persona[] = [
  { id: "p1", label: "P1 İstanbul 1990-04-01 14:30 +03", birth: { birthDate: "1990-04-01", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "1990-04-01T11:30:00Z", tz: "Europe/Istanbul" },
  { id: "p2", label: "P2 Tromsø 1985-12-21 03:15 +01 (yüksek enlem)", birth: { birthDate: "1985-12-21", birthTime: "03:15:00", utcOffsetSeconds: 3600, latitude: 69.6492, longitude: 18.9553 }, birthUtc: "1985-12-21T02:15:00Z", tz: "Europe/Oslo" },
  { id: "p3", label: "P3 Sidney 2000-02-29 23:50 +11 (29 Şubat, güney)", birth: { birthDate: "2000-02-29", birthTime: "23:50:00", utcOffsetSeconds: 39600, latitude: -33.8688, longitude: 151.2093 }, birthUtc: "2000-02-29T12:50:00Z", tz: "Australia/Sydney" },
];

export const PARTNER: BirthPoint = { birthDate: "1988-09-10", birthTime: "08:05:00", utcOffsetSeconds: 10800, latitude: 39.9334, longitude: 32.8597 };
export const PLACE_LONDON = { latitude: 51.5074, longitude: -0.1278 };
const UUID = "00000000-0000-4000-8000-0000000000aa";

/**
 * Teknik başına ham seçenek (ürün parseOptions fonksiyonundan geçer) + gerekirse birime eklenecek sunucu-çözümlü alanlar (extra).
 * `core: true` → 3 kişide koşulur; diğerleri yalnız P1.
 */
export type AtlasCase = { technique: string; raw: Record<string, unknown>; extra?: Record<string, unknown>; core?: boolean; partner?: boolean; places?: boolean; note?: string; maxUnits?: number; onlyEndpoint?: string };

export const ATLAS_CASES: AtlasCase[] = [
  { technique: "western.natal", raw: { houseSystem: "placidus", nodeType: "true" }, core: true },
  { technique: "western.transit", raw: { atUtc: "2026-11-25T09:00", nodeType: "true" }, core: true },
  { technique: "western.forecast", raw: { startDate: "2026-12-01", days: 30 } },
  { technique: "western.progression", raw: { targetDate: "2026-11-25", nodeType: "true" }, core: true },
  { technique: "western.solar_arc", raw: { targetDate: "2026-11-25", nodeType: "true" } },
  { technique: "western.solar_return", raw: { returnYear: 2026, houseSystem: "placidus" } },
  { technique: "western.lunar_return", raw: { month: "2026-12", houseSystem: "placidus" } },
  { technique: "western.planetary_return", raw: { planet: "saturn", approxDate: "2019-06-01", houseSystem: "placidus" } },
  { technique: "western.synastry", raw: { partnerProfileId: UUID, houseSystem: "placidus", nodeType: "true" }, partner: true },
  { technique: "western.composite", raw: { partnerProfileId: UUID, houseSystem: "placidus", nodeType: "true" }, partner: true },
  { technique: "western.astrocartography", raw: {} },
  { technique: "western.relocation", raw: { targetLocationId: "loc-london", houseSystem: "placidus" }, places: true, maxUnits: 1, note: "birim[1] natal karşılaştırma (natal ile aynı uç) koşulmaz" },
  { technique: "western.local_space", raw: { referenceLocationId: null } },
  { technique: "western.fixed_stars", raw: { nodeType: "true", orb: 1, reportCatalog: false } },
  { technique: "western.profections", raw: { age: 36 } },
  { technique: "western.extra_points", raw: { sections: ["asteroids", "lots", "lilith"], houseSystem: "placidus" } },
  { technique: "western.declination_parallels", raw: { month: "2026-12" } },
  { technique: "vedic.d1", raw: { ayanamsa: "lahiri" }, core: true },
  { technique: "vedic.varga", raw: { ayanamsa: "lahiri", division: 9 } },
  { technique: "vedic.dasha", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.drishti", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.ashtakavarga", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.shadbala", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.panchanga", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.transit", raw: { ayanamsa: "lahiri", atUtc: "2026-11-25T09:00" } },
  { technique: "vedic.bhav_chalit", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.chara_karaka", raw: { ayanamsa: "lahiri", scheme: "eight" } },
  { technique: "vedic.arudha", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.bhava_bala", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.gun_milan", raw: { partnerProfileId: UUID, ayanamsa: "lahiri" }, partner: true },
  { technique: "vedic.sade_sati", raw: { ayanamsa: "lahiri", asOf: "2026-11-25" } },
  { technique: "vedic.dashakoot", raw: { partnerProfileId: UUID, ayanamsa: "lahiri" }, partner: true },
  { technique: "vedic.papasamyam", raw: { partnerProfileId: UUID, ayanamsa: "lahiri" }, partner: true },
  { technique: "vedic.upagraha", raw: { ayanamsa: "lahiri" } },
  { technique: "vedic.heliacal", raw: { date: "2026-11-25" }, extra: { offsetHours: 3 } },
  { technique: "vedic.monthly", raw: { year: 2026, month: 12, sections: ["ingress", "aspects", "lunar", "parallels", "natal_parallels"] } },
  { technique: "kp.chart", raw: { ayanamsa: "kp-newcomb", nodeType: "mean" }, core: true },
  { technique: "kp.dasha", raw: { ayanamsa: "kp-newcomb", nodeType: "mean" } },
  { technique: "kp.ruling", raw: { atUtc: "2026-11-25T09:00", nodeType: "mean" } },
  { technique: "kp.transit", raw: { atUtc: "2026-11-25T09:00", ayanamsa: "kp-newcomb", nodeType: "mean" } },
  { technique: "kp.transit", raw: { ayanamsa: "kp-newcomb", nodeType: "mean", range: { startDate: "2026-12-01", days: 3, kinds: ["sublord", "rasi"], planets: ["moon"] } }, note: "aralık kipi (sublord/rasi değişimleri)" },
  { technique: "kp.horary", raw: { horaryNumber: 108, atUtc: "2026-11-25T09:00", ayanamsa: "kp-newcomb", nodeType: "mean" }, extra: { offsetHours: 3 } },
  { technique: "kp.ruling_interval", raw: { atUtc: "2026-11-25T09:00", ayanamsa: "kp-newcomb", nodeType: "mean", durationMinutes: 60, intervalMinutes: 30 }, extra: { offsetHours: 3 } },
  // 20:15 ek (plan yedeğinden, gerekçe: uç kapsamı tamamlama): Vimshottari alt dönem yolu + güncel dönem zinciri.
  { technique: "vedic.dasha", raw: { ayanamsa: "lahiri", mahadasha: "moon" }, note: "/dasha/sub/{md}" },
  { technique: "vedic.dasha", raw: { ayanamsa: "lahiri", chainAtUtc: "2026-11-25T09:00" }, onlyEndpoint: "/vedic-astrology/dasha/current", note: "/dasha/current (major birimi 19. vakada zaten var)" },
];
