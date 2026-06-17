// Ay fazı ve ay burcu hesaplamaları
// Kaynak algoritması app/page.tsx LivePanel'den alınıp modülarize edildi.

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

// ─── Ay Burcu ───────────────────────────────────────────────────────────────

const ZODIAC_SIGNS: ReadonlyArray<{ name: string; emoji: string }> = [
  { name: "Koç",    emoji: "♈" },
  { name: "Boğa",   emoji: "♉" },
  { name: "İkizler", emoji: "♊" },
  { name: "Yengeç", emoji: "♋" },
  { name: "Aslan",  emoji: "♌" },
  { name: "Başak",  emoji: "♍" },
  { name: "Terazi", emoji: "♎" },
  { name: "Akrep",  emoji: "♏" },
  { name: "Yay",    emoji: "♐" },
  { name: "Oğlak",  emoji: "♑" },
  { name: "Kova",   emoji: "♒" },
  { name: "Balık",  emoji: "♓" },
];

/**
 * Ayın yaklaşık burcu.
 * Ay sidereal devresini ~27.32 günde tamamlar.
 * Referans epoch (11 Oca 2024 yeni ay) ≈ Oğlak girişi (270° ekliptik).
 */
export function getMoonSign(date: Date): { name: string; emoji: string } {
  const daysSince = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  const degrees   = ((daysSince * (360 / 27.32)) % 360 + 360) % 360;
  const adjusted  = (degrees + 270) % 360; // Koç = 0° olacak şekilde döndür
  const signIndex = Math.floor(adjusted / 30) % 12;
  const sign      = ZODIAC_SIGNS[signIndex];
  return sign ? { name: sign.name, emoji: sign.emoji } : { name: "Koç", emoji: "♈" };
}

// ─── Ek hesaplamalar ─────────────────────────────────────────────────────────

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

/** Aydınlanma yüzdesi (0–100, kosinüs yaklaşımı) */
export function getMoonIllumination(date: Date): number {
  const age = getMoonAge(date);
  return Math.round((1 - Math.cos(2 * Math.PI * age / SYNODIC_MONTH)) / 2 * 100);
}
