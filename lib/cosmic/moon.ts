// Ay fazı ve ay burcu hesaplamaları
// getMoonSign ve getMoonIllumination → astronomy-engine (JPL doğruluğu), fallback legacy math
// getMoonPhase, getMoonAge → sinodik referans epoch (mevcut yaklaşım, yeterince doğru)

import * as AE from "astronomy-engine";

// ─── Ay Fazı ─────────────────────────────────────────────────────────────────

const MOON_PHASES: ReadonlyArray<{ name: string; emoji: string; max: number }> = [
  { name: "Yeni Ay",        emoji: "🌑", max: 1.85 },
  { name: "Büyüyen Hilal",  emoji: "🌒", max: 7.38 },
  { name: "İlk Dördün",     emoji: "🌓", max: 14.77 },
  { name: "Şişen Ay",       emoji: "🌔", max: 22.15 },
  { name: "Dolunay",        emoji: "🌕", max: 24.0 },
  { name: "Azalan Ay",      emoji: "🌖", max: 26.38 },
  { name: "Son Dördün",     emoji: "🌗", max: 27.69 },
  { name: "Balsamik",       emoji: "🌘", max: 29.53 },
];

/** Referans: 11 Ocak 2024 yeni ay — 11:57 UTC */
const REF_NEW_MOON_MS = new Date("2024-01-11T11:57:00Z").getTime();
const SYNODIC_MONTH   = 29.53059; // gün

function moonAge(date: Date): number {
  const daysSince = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  return ((daysSince % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

/** Bugünün ay fazı: { name, emoji } */
export function getMoonPhase(date: Date): { name: string; emoji: string } {
  const age = moonAge(date);
  for (const p of MOON_PHASES) {
    if (age <= p.max) return { name: p.name, emoji: p.emoji };
  }
  return { name: "Yeni Ay", emoji: "🌑" };
}

// ─── Burç tablosu ─────────────────────────────────────────────────────────────

const ZODIAC_SIGNS: ReadonlyArray<{ name: string; emoji: string }> = [
  { name: "Koç",     emoji: "♈" }, // 0-30°
  { name: "Boğa",    emoji: "♉" }, // 30-60°
  { name: "İkizler", emoji: "♊" }, // 60-90°
  { name: "Yengeç",  emoji: "♋" }, // 90-120°
  { name: "Aslan",   emoji: "♌" }, // 120-150°
  { name: "Başak",   emoji: "♍" }, // 150-180°
  { name: "Terazi",  emoji: "♎" }, // 180-210°
  { name: "Akrep",   emoji: "♏" }, // 210-240°
  { name: "Yay",     emoji: "♐" }, // 240-270°
  { name: "Oğlak",   emoji: "♑" }, // 270-300°
  { name: "Kova",    emoji: "♒" }, // 300-330°
  { name: "Balık",   emoji: "♓" }, // 330-360°
];

// ─── Legacy (yaklaşık) hesaplamalar — AE fallback'i için ─────────────────────

/**
 * Ay burcu — sinodik epoch + sidereal periyot yaklaşımı.
 * Hata: ±4-6 saat/gün birikimli (≈1-2 burç sapma).
 * Sadece AE başarısız olursa kullanılır.
 */
function _legacyMoonSign(date: Date): { name: string; emoji: string } {
  const daysSince = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  const degrees   = ((daysSince * (360 / 27.32)) % 360 + 360) % 360;
  const adjusted  = (degrees + 270) % 360;
  const signIndex = Math.floor(adjusted / 30) % 12;
  const sign      = ZODIAC_SIGNS[signIndex];
  return sign ? { name: sign.name, emoji: sign.emoji } : { name: "Koç", emoji: "♈" };
}

/** Aydınlanma — kosinüs yaklaşımı. Hata: ~%7-10. Sadece AE başarısız olursa. */
function _legacyMoonIllumination(date: Date): number {
  const age = moonAge(date);
  return Math.round((1 - Math.cos(2 * Math.PI * age / SYNODIC_MONTH)) / 2 * 100);
}

// ─── Ay Burcu — astronomy-engine (ekliptik boylam, tropikal) ─────────────────

/**
 * Ayın tropikal burcu.
 * astronomy-engine EclipticGeoMoon → ekliptik boylam → 30°'lik dilimler.
 * JPL Horizons doğruluğu; < 5 dakika hata.
 * Fallback: legacy sinodik yaklaşım.
 */
export function getMoonSign(date: Date): { name: string; emoji: string } {
  try {
    const ecl = AE.EclipticGeoMoon(date);
    const idx  = Math.floor(ecl.lon / 30) % 12;
    const sign = ZODIAC_SIGNS[idx];
    return sign ? { name: sign.name, emoji: sign.emoji } : { name: "Koç", emoji: "♈" };
  } catch {
    return _legacyMoonSign(date);
  }
}

/** Legacy Ay burcu — audit/karşılaştırma amaçlı dışa aktarım. */
export function getMoonSignLegacy(date: Date): { name: string; emoji: string } {
  return _legacyMoonSign(date);
}

// ─── Ek hesaplamalar ──────────────────────────────────────────────────────────

/** Sinodik ay süresi (gün) */
export const SYNODIC_MONTH_DAYS = SYNODIC_MONTH;

/** Faz geçiş sınırları (ageMin dahil, ageMax hariç) */
export const MOON_PHASE_BOUNDS: ReadonlyArray<{
  name: string; emoji: string; ageMin: number; ageMax: number;
}> = [
  { name: "Yeni Ay",       emoji: "🌑", ageMin: 0,     ageMax: 1.85  },
  { name: "Büyüyen Hilal", emoji: "🌒", ageMin: 1.85,  ageMax: 7.38  },
  { name: "İlk Dördün",   emoji: "🌓", ageMin: 7.38,  ageMax: 14.77 },
  { name: "Şişen Ay",     emoji: "🌔", ageMin: 14.77, ageMax: 22.15 },
  { name: "Dolunay",      emoji: "🌕", ageMin: 22.15, ageMax: 24.0  },
  { name: "Azalan Ay",    emoji: "🌖", ageMin: 24.0,  ageMax: 26.38 },
  { name: "Son Dördün",   emoji: "🌗", ageMin: 26.38, ageMax: 27.69 },
  { name: "Balsamik",     emoji: "🌘", ageMin: 27.69, ageMax: 29.53 },
];

/** Ayın yaşı — yeni aydan itibaren gün (0–29.53) */
export function getMoonAge(date: Date): number {
  const daysSince = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  return ((daysSince % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

/**
 * Ayın şu an bulunduğu burçtaki yaklaşık aralığı döner.
 * astronomy-engine her saat hesaplama yapmak yerine 2.28 günlük
 * yaklaşık pencereyi korur — dönem gösterimi için yeterli.
 */
export function getMoonSignPeriod(date: Date): { from: Date; to: Date } {
  const daysSince   = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  const degrees     = ((daysSince * (360 / 27.32)) % 360 + 360) % 360;
  const adjusted    = (degrees + 270) % 360;
  const fraction    = (adjusted % 30) / 30;
  const signDurMs   = (27.32 / 12) * 86_400_000;
  const fromMs      = date.getTime() - fraction * signDurMs;
  return { from: new Date(fromMs), to: new Date(fromMs + signDurMs) };
}

/**
 * Aydınlanma yüzdesi (0–100).
 * astronomy-engine Illumination → phase_fraction (gerçek geometrik açı).
 * Fallback: kosinüs yaklaşımı (~%7-10 hata).
 */
export function getMoonIllumination(date: Date): number {
  try {
    const illum = AE.Illumination(AE.Body.Moon, date);
    return Math.round(illum.phase_fraction * 100);
  } catch {
    return _legacyMoonIllumination(date);
  }
}

/** Legacy aydınlanma — audit/karşılaştırma amaçlı dışa aktarım. */
export function getMoonIlluminationLegacy(date: Date): number {
  return _legacyMoonIllumination(date);
}
