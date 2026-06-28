/**
 * lib/cosmic/aspects.ts
 * Gezegen açıları (aspect) hesap motoru — FAZ 2A. UI YOK; yalnız kesin astronomik veri.
 *
 * Boylamlar astronomy-engine ile (JPL-grade, tarih sınırı yok); açı = saf aritmetik.
 * Majör açılar (☌ ⚹ □ △ ☍). Çıktı: çift + açı + orb + applying/separating + güç.
 * Exact (tam açı) SAATİ bu fazda HESAPLANMAZ (doğrulama gerektirir — FAZ 2C).
 *
 * Saf fonksiyon: dışarıdan verilen `date` ile çalışır (SSR/client deterministik).
 */

import * as AE from "astronomy-engine";

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type AspectBody =
  | "Güneş" | "Ay" | "Merkür" | "Venüs" | "Mars"
  | "Jüpiter" | "Satürn" | "Uranüs" | "Neptün" | "Plüton";

export type AspectName = "Kavuşum" | "Sekstil" | "Kare" | "Üçgen" | "Karşıt";
export type AspectDirection = "applying" | "separating" | "exact";
export type AspectStrength = "very-strong" | "strong" | "background";

export type AspectEvent = {
  id:          string;
  bodyA:       AspectBody;
  bodyB:       AspectBody;
  bodyASymbol: string;
  bodyBSymbol: string;
  aspect:      AspectName;
  aspectSymbol: string;
  aspectAngle: number;       // 0 | 60 | 90 | 120 | 180
  orbDeg:      number;       // ondalık derece (örn. 1.41)
  orbText:     string;       // "1°24′"
  direction:   AspectDirection;
  strength:    AspectStrength;
  includesMoon: boolean;
  isMajor:     true;
  calculatedAt: string;      // input date ISO
  timezone:    string;       // "Europe/Istanbul (UTC+3)"
};

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const BODY_ORDER: ReadonlyArray<AspectBody> = [
  "Güneş", "Ay", "Merkür", "Venüs", "Mars",
  "Jüpiter", "Satürn", "Uranüs", "Neptün", "Plüton",
];

export const BODY_SYMBOL: Record<AspectBody, string> = {
  "Güneş": "☉", "Ay": "☽", "Merkür": "☿", "Venüs": "♀", "Mars": "♂",
  "Jüpiter": "♃", "Satürn": "♄", "Uranüs": "♅", "Neptün": "♆", "Plüton": "♇",
};

export const BODY_SLUG: Record<AspectBody, string> = {
  "Güneş": "gunes", "Ay": "ay", "Merkür": "merkur", "Venüs": "venus", "Mars": "mars",
  "Jüpiter": "jupiter", "Satürn": "saturn", "Uranüs": "uranus", "Neptün": "neptun", "Plüton": "pluton",
};

// Ay hariç AE gök cismi; Ay özel (EclipticGeoMoon)
const BODY_AE: Record<Exclude<AspectBody, "Ay">, AE.Body> = {
  "Güneş": AE.Body.Sun, "Merkür": AE.Body.Mercury, "Venüs": AE.Body.Venus, "Mars": AE.Body.Mars,
  "Jüpiter": AE.Body.Jupiter, "Satürn": AE.Body.Saturn, "Uranüs": AE.Body.Uranus,
  "Neptün": AE.Body.Neptune, "Plüton": AE.Body.Pluto,
};

const INNER = new Set<AspectBody>(["Merkür", "Venüs", "Mars"]);
const LUMINARY = new Set<AspectBody>(["Güneş", "Ay"]);

export type AspectDef = { name: AspectName; angle: number; symbol: string; slug: string };
export const ASPECTS: ReadonlyArray<AspectDef> = [
  { name: "Kavuşum", angle: 0,   symbol: "☌", slug: "kavusum" },
  { name: "Sekstil", angle: 60,  symbol: "⚹", slug: "sekstil" },
  { name: "Kare",    angle: 90,  symbol: "□", slug: "kare"    },
  { name: "Üçgen",   angle: 120, symbol: "△", slug: "ucgen"   },
  { name: "Karşıt",  angle: 180, symbol: "☍", slug: "karsit"  },
];

const TZ_LABEL = "Europe/Istanbul (UTC+3)";
const EXACT_ORB_DEG = 0.1;   // < 6′ → "exact" (tam açıya çok yakın)

// ─── İç yardımcılar ───────────────────────────────────────────────────────────

export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** İki ekliptik boylam arası açısal uzaklık (0–180°), 0/360 sınırı güvenli. */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** Gezegen/Ay ekliptik boylamı (tropikal, derece). AE hatasında NaN. */
export function getPlanetLongitude(body: AspectBody, date: Date): number {
  try {
    if (body === "Ay") return normalizeAngle(AE.EclipticGeoMoon(date).lon);
    return normalizeAngle(AE.Ecliptic(AE.GeoVector(BODY_AE[body], date, true)).elon);
  } catch {
    return NaN;
  }
}

/** Tek gök cisminin orb katkısı: luminer 6°, iç 4°, dış 3°. */
function bodyOrb(body: AspectBody): number {
  if (LUMINARY.has(body)) return 6;
  if (INNER.has(body)) return 4;
  return 3;
}

/** Çiftin orb limiti = iki cismin orbunun büyüğü (karma iç/dış → 4°). */
function getOrbLimitForPair(a: AspectBody, b: AspectBody): number {
  return Math.max(bodyOrb(a), bodyOrb(b));
}

function getAspectStrength(orbDeg: number): AspectStrength {
  if (orbDeg < 1) return "very-strong";
  if (orbDeg <= 3) return "strong";
  return "background";
}

function orbToText(orbDeg: number): string {
  let deg = Math.floor(orbDeg);
  let min = Math.round((orbDeg - deg) * 60);
  if (min === 60) { deg += 1; min = 0; }
  return `${deg}°${String(min).padStart(2, "0")}′`;
}

/** Yön için zaman adımı (ms): Ay 1s, Güneş/iç 6s, yalnız dış 24s. */
function stepMsForPair(a: AspectBody, b: AspectBody): number {
  if (a === "Ay" || b === "Ay") return 1 * 3_600_000;
  if (LUMINARY.has(a) || LUMINARY.has(b) || INNER.has(a) || INNER.has(b)) return 6 * 3_600_000;
  return 24 * 3_600_000;
}

/**
 * Yön: orb şimdi vs adım sonrası.
 * orb < EXACT_ORB_DEG → "exact"; küçülüyorsa "applying"; aksi "separating".
 * Not: exact SAATİ hesaplanmaz; retro civarında yön anlıktır (rapora bkz.).
 */
function getApplyingSeparating(a: AspectBody, b: AspectBody, angle: number, orbNow: number, date: Date): AspectDirection {
  if (orbNow < EXACT_ORB_DEG) return "exact";
  const step = stepMsForPair(a, b);
  const future = new Date(date.getTime() + step);
  const sepF = angularDistance(getPlanetLongitude(a, future), getPlanetLongitude(b, future));
  const orbFuture = Math.abs(sepF - angle);
  return orbFuture < orbNow ? "applying" : "separating";
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * İki gök cismi arasındaki (varsa) en yakın majör açıyı döner; orb sınırı içinde
 * değilse null. bodyA/bodyB BODY_ORDER sırasına normalize edilir (deterministik id).
 */
export function getAspectBetween(bodyA: AspectBody, bodyB: AspectBody, date: Date): AspectEvent | null {
  if (bodyA === bodyB) return null;
  // Sıralamayı sabitle (i<j): id ve bodyA/bodyB deterministik olsun
  const [a, b] = BODY_ORDER.indexOf(bodyA) <= BODY_ORDER.indexOf(bodyB) ? [bodyA, bodyB] : [bodyB, bodyA];

  const lonA = getPlanetLongitude(a, date);
  const lonB = getPlanetLongitude(b, date);
  if (Number.isNaN(lonA) || Number.isNaN(lonB)) return null;

  const sep = angularDistance(lonA, lonB);

  // En yakın majör açı
  let best: AspectDef | null = null;
  let bestOrb = Infinity;
  for (const asp of ASPECTS) {
    const orb = Math.abs(sep - asp.angle);
    if (orb < bestOrb) { bestOrb = orb; best = asp; }
  }
  if (!best) return null;

  const limit = getOrbLimitForPair(a, b);
  if (bestOrb > limit) return null;

  const direction = getApplyingSeparating(a, b, best.angle, bestOrb, date);

  return {
    id:           `${BODY_SLUG[a]}-${BODY_SLUG[b]}-${best.slug}`,
    bodyA:        a,
    bodyB:        b,
    bodyASymbol:  BODY_SYMBOL[a],
    bodyBSymbol:  BODY_SYMBOL[b],
    aspect:       best.name,
    aspectSymbol: best.symbol,
    aspectAngle:  best.angle,
    orbDeg:       Math.round(bestOrb * 1000) / 1000,
    orbText:      orbToText(bestOrb),
    direction,
    strength:     getAspectStrength(bestOrb),
    includesMoon: a === "Ay" || b === "Ay",
    isMajor:      true,
    calculatedAt: date.toISOString(),
    timezone:     TZ_LABEL,
  };
}

/**
 * Verilen tarihte (anlık) orb içinde aktif tüm majör açılar.
 * 45 çift (i<j) tek kez değerlendirilir; her çift için yalnız en yakın açı.
 * Sıralama: güç (very-strong → strong → background), sonra orb artan.
 */
export function getDailyAspects(date: Date): AspectEvent[] {
  const out: AspectEvent[] = [];
  for (let i = 0; i < BODY_ORDER.length; i++) {
    for (let j = i + 1; j < BODY_ORDER.length; j++) {
      const ev = getAspectBetween(BODY_ORDER[i]!, BODY_ORDER[j]!, date);
      if (ev) out.push(ev);
    }
  }
  const rank: Record<AspectStrength, number> = { "very-strong": 0, "strong": 1, "background": 2 };
  return out.sort((x, y) => rank[x.strength] - rank[y.strength] || x.orbDeg - y.orbDeg);
}
