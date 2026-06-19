/**
 * astronomy-engine tabanlı astronomik hesaplamalar — SADECE SERVER-SIDE
 *
 * Bağımlılık: npm package "astronomy-engine" (MIT lisansı)
 * Audit endpoint ve server-side hesaplamalar için. moon.ts ile birlikte kullanılır.
 */

import * as AE from "astronomy-engine";

// ─── Veri tipleri ─────────────────────────────────────────────────────────────

export type AEMoonSign = {
  name: string;
  emoji: string;
  lon: number; // ekliptik boylam (0-360°)
};

export type AEMoonPhase = {
  name: string;
  emoji: string;
  degrees: number; // 0=Yeni Ay, 90=İlk Dördün, 180=Dolunay, 270=Son Dördün
};

export type AEMoonData = {
  sign: AEMoonSign;
  phase: AEMoonPhase;
  illumination: number; // 0-100
  moonAgeDays: number;  // önceki yeni aydan itibaren gün
  nextNewMoon: Date;
  nextFullMoon: Date;
};

// ─── Statik tablolar ──────────────────────────────────────────────────────────

const ZODIAC_SIGNS = [
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
] as const;

// MoonPhase() 0-360° döner: 0=Yeni Ay, 90=İlk Dördün, 180=Dolunay, 270=Son Dördün
const MOON_PHASES = [
  { name: "Yeni Ay",        emoji: "🌑", min: 0,   max: 45  },
  { name: "Büyüyen Hilal",  emoji: "🌒", min: 45,  max: 90  },
  { name: "İlk Dördün",    emoji: "🌓", min: 90,  max: 135 },
  { name: "Şişen Ay",      emoji: "🌔", min: 135, max: 180 },
  { name: "Dolunay",       emoji: "🌕", min: 180, max: 225 },
  { name: "Azalan Ay",     emoji: "🌖", min: 225, max: 270 },
  { name: "Son Dördün",    emoji: "🌗", min: 270, max: 315 },
  { name: "Balsamik",      emoji: "🌘", min: 315, max: 360 },
] as const;

// ─── Temel hesaplamalar ───────────────────────────────────────────────────────

/** Ayın tropikal burcu — ekliptik boylamdan (0-360°). */
export function getMoonSignAE(date: Date): AEMoonSign {
  const ecl = AE.EclipticGeoMoon(date);
  const idx = Math.floor(ecl.lon / 30) % 12;
  const sign = ZODIAC_SIGNS[idx] ?? ZODIAC_SIGNS[0];
  return { name: sign.name, emoji: sign.emoji, lon: ecl.lon };
}

/** Ay fazı — derece açısından ad ve emoji. */
export function getMoonPhaseAE(date: Date): AEMoonPhase {
  const degrees = AE.MoonPhase(date);
  const phase = MOON_PHASES.find((p) => degrees >= p.min && degrees < p.max) ?? MOON_PHASES[0];
  return { name: phase.name, emoji: phase.emoji, degrees };
}

/** Ay aydınlanma yüzdesi (0-100). Gerçek geometrik hesaplama. */
export function getMoonIlluminationAE(date: Date): number {
  const illum = AE.Illumination(AE.Body.Moon, date);
  return Math.round(illum.phase_fraction * 100);
}

/** Önceki yeni aydan itibaren geçen gün sayısı (0–29.53).
 *
 *  2 adımlı arama: önce date'ten sonraki yeni ay bulunur,
 *  oradan geriye gidilip o dönemin başlangıç yeni ayı tespit edilir.
 *  Böylece farklı dönemlerdeki referans yeni ayı karışıklığı ortadan kalkar.
 */
export function getMoonAgeDaysAE(date: Date): number {
  const SYNODIC = 29.53059;
  const nextNew = AE.SearchMoonPhase(0, date, SYNODIC + 2);
  if (!nextNew) return 0;
  const prevStart = new Date(nextNew.date.getTime() - (SYNODIC + 1) * 86_400_000);
  const prevNew   = AE.SearchMoonPhase(0, prevStart, SYNODIC + 1);
  if (!prevNew) return 0;
  const age = (date.getTime() - prevNew.date.getTime()) / 86_400_000;
  return Math.max(0, Math.min(age, SYNODIC));
}

/** Sonraki yeni ay tarihi. */
export function getNextNewMoonAE(date: Date): Date {
  const result = AE.SearchMoonPhase(0, date, 35);
  return result?.date ?? new Date(date.getTime() + 29.5 * 86_400_000);
}

/** Sonraki dolunay tarihi. */
export function getNextFullMoonAE(date: Date): Date {
  const result = AE.SearchMoonPhase(180, date, 35);
  return result?.date ?? new Date(date.getTime() + 14.8 * 86_400_000);
}

/** Tüm veriler tek seferde — moonAge için 2 adımlı doğru arama dahil. */
export function getMoonDataAE(date: Date): AEMoonData {
  const SYNODIC  = 29.53059;
  const ecl      = AE.EclipticGeoMoon(date);
  const degrees  = AE.MoonPhase(date);
  const illum    = AE.Illumination(AE.Body.Moon, date);
  const nextNew  = AE.SearchMoonPhase(0, date, SYNODIC + 2);
  const nextFull = AE.SearchMoonPhase(180, date, SYNODIC + 2);

  // moonAge: 2 adımlı doğru hesaplama
  let ageDays = 0;
  if (nextNew) {
    const prevStart = new Date(nextNew.date.getTime() - (SYNODIC + 1) * 86_400_000);
    const prevNew   = AE.SearchMoonPhase(0, prevStart, SYNODIC + 1);
    if (prevNew) {
      ageDays = Math.max(0, Math.min(
        (date.getTime() - prevNew.date.getTime()) / 86_400_000,
        SYNODIC,
      ));
    }
  }

  const signIdx = Math.floor(ecl.lon / 30) % 12;
  const sign    = ZODIAC_SIGNS[signIdx] ?? ZODIAC_SIGNS[0];
  const phase   = MOON_PHASES.find((p) => degrees >= p.min && degrees < p.max) ?? MOON_PHASES[0];

  return {
    sign:         { name: sign.name, emoji: sign.emoji, lon: ecl.lon },
    phase:        { name: phase.name, emoji: phase.emoji, degrees },
    illumination: Math.round(illum.phase_fraction * 100),
    moonAgeDays:  ageDays,
    nextNewMoon:  nextNew?.date ?? new Date(date.getTime() + 29.5 * 86_400_000),
    nextFullMoon: nextFull?.date ?? new Date(date.getTime() + 14.8 * 86_400_000),
  };
}
