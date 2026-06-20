// Ay fazı ve ay burcu hesaplamaları
// getMoonPhase    → astronomy-engine MoonPhase() derece → 8 faz (FAZ 3)
// getMoonSign     → astronomy-engine EclipticGeoMoon (FAZ 2)
// getMoonIllumination → astronomy-engine Illumination (FAZ 2)
// getMoonAge      → sinodik referans epoch (legacy, fallback ve MOON_PHASE_BOUNDS uyumu)

import * as AE from "astronomy-engine";

// ─── Legacy faz tablosu — day-age tabanlı, MOON_PHASE_BOUNDS ve fallback için ─

const MOON_PHASES: ReadonlyArray<{ name: string; emoji: string; max: number }> = [
  { name: "Yeni Ay",       emoji: "🌑", max: 1.85  },
  { name: "Büyüyen Hilal", emoji: "🌒", max: 7.38  },
  { name: "İlk Dördün",   emoji: "🌓", max: 14.77 },
  { name: "Şişen Ay",     emoji: "🌔", max: 22.15 },
  { name: "Dolunay",      emoji: "🌕", max: 24.0  },
  { name: "Azalan Ay",    emoji: "🌖", max: 26.38 },
  { name: "Son Dördün",   emoji: "🌗", max: 27.69 },
  { name: "Balsamik",     emoji: "🌘", max: 29.53 },
];

// ─── AE faz tablosu — MoonPhase() derece tabanlı (0°=Yeni Ay, 180°=Dolunay) ──
// Her bin 45° = ~3.7 gün. Geçişler astronomik anlarda keskin.

const AE_MOON_PHASES: ReadonlyArray<{ name: string; emoji: string; min: number; max: number }> = [
  { name: "Yeni Ay",       emoji: "🌑", min: 0,   max: 45  },
  { name: "Büyüyen Hilal", emoji: "🌒", min: 45,  max: 90  },
  { name: "İlk Dördün",   emoji: "🌓", min: 90,  max: 135 },
  { name: "Şişen Ay",     emoji: "🌔", min: 135, max: 180 },
  { name: "Dolunay",      emoji: "🌕", min: 180, max: 225 },
  { name: "Azalan Ay",    emoji: "🌖", min: 225, max: 270 },
  { name: "Son Dördün",   emoji: "🌗", min: 270, max: 315 },
  { name: "Balsamik",     emoji: "🌘", min: 315, max: 360 },
];

/** Referans: 11 Ocak 2024 yeni ay — 11:57 UTC */
const REF_NEW_MOON_MS = new Date("2024-01-11T11:57:00Z").getTime();
const SYNODIC_MONTH   = 29.53059; // gün

function moonAge(date: Date): number {
  const daysSince = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  return ((daysSince % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

// ─── Legacy faz hesabı — AE başarısız olursa devreye girer ───────────────────

function _legacyMoonPhase(date: Date): { name: string; emoji: string } {
  const age = moonAge(date);
  for (const p of MOON_PHASES) {
    if (age <= p.max) return { name: p.name, emoji: p.emoji };
  }
  return { name: "Yeni Ay", emoji: "🌑" };
}

// ─── Ay Fazı — astronomy-engine MoonPhase() (FAZ 3) ──────────────────────────

/**
 * Ayın fazı — astronomy-engine MoonPhase() derecesinden hesaplanır.
 * 0°=Yeni Ay, 90°=İlk Dördün, 180°=Dolunay, 270°=Son Dördün.
 * Geçişler JPL doğruluğuyla keskin; legacy 1 günlük gecikme ortadan kalkar.
 * Fallback: sinodik epoch tabanlı eski hesap.
 */
export function getMoonPhase(date: Date): { name: string; emoji: string } {
  try {
    const deg = AE.MoonPhase(date);
    const p   = AE_MOON_PHASES.find((x) => deg >= x.min && deg < x.max);
    return p ? { name: p.name, emoji: p.emoji } : { name: "Yeni Ay", emoji: "🌑" };
  } catch {
    return _legacyMoonPhase(date);
  }
}

/** Legacy faz — audit/karşılaştırma amaçlı dışa aktarım. */
export function getMoonPhaseLegacy(date: Date): { name: string; emoji: string } {
  return _legacyMoonPhase(date);
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

/**
 * Faz geçiş sınırları — AE MoonPhase() derece sistemine uyumlu (FAZ 5A).
 * Her bant 45° = 29.53059/8 ≈ 3.691 gün genişliğinde.
 * 0°=Yeni Ay (0g), 90°=İlk Dördün (7.4g), 180°=Dolunay (14.8g), 270°=Son Dördün (22.1g).
 * Dolunay ageMin=14.765 → progress bar %50 konumunda (eski legacy: ~%75).
 */
export const MOON_PHASE_BOUNDS: ReadonlyArray<{
  name: string; emoji: string; ageMin: number; ageMax: number;
}> = [
  { name: "Yeni Ay",       emoji: "🌑", ageMin: 0,      ageMax: 3.691  },
  { name: "Büyüyen Hilal", emoji: "🌒", ageMin: 3.691,  ageMax: 7.383  },
  { name: "İlk Dördün",   emoji: "🌓", ageMin: 7.383,  ageMax: 11.074 },
  { name: "Şişen Ay",     emoji: "🌔", ageMin: 11.074, ageMax: 14.765 },
  { name: "Dolunay",      emoji: "🌕", ageMin: 14.765, ageMax: 18.457 },
  { name: "Azalan Ay",    emoji: "🌖", ageMin: 18.457, ageMax: 22.148 },
  { name: "Son Dördün",   emoji: "🌗", ageMin: 22.148, ageMax: 25.839 },
  { name: "Balsamik",     emoji: "🌘", ageMin: 25.839, ageMax: 29.531 },
];

/**
 * Ayın yaşı — astronomy-engine SearchMoonPhase 2-adımlı doğru hesaplama (FAZ 5A).
 * Önce sonraki yeni ay bulunur, oradan önceki dönemin başlangıç yeni ayı tespit edilir.
 * Hata: ~dakika mertebesinde (legacy: ~7 saat).
 * Fallback: sinodik epoch yaklaşımı.
 */
export function getMoonAge(date: Date): number {
  try {
    const nextNew = AE.SearchMoonPhase(0, date, SYNODIC_MONTH + 2);
    if (!nextNew) return moonAge(date);
    const prevStart = new Date(nextNew.date.getTime() - (SYNODIC_MONTH + 1) * 86_400_000);
    const prevNew   = AE.SearchMoonPhase(0, prevStart, SYNODIC_MONTH + 1);
    if (!prevNew) return moonAge(date);
    const age = (date.getTime() - prevNew.date.getTime()) / 86_400_000;
    return Math.max(0, Math.min(age, SYNODIC_MONTH));
  } catch {
    return moonAge(date);
  }
}

/** Legacy ay yaşı — sinodik epoch yaklaşımı. Audit/karşılaştırma için. */
export function getMoonAgeLegacy(date: Date): number {
  return moonAge(date);
}

/**
 * Ayın şu an bulunduğu burçtaki gerçek AE giriş/çıkış zamanını döner.
 * EclipticGeoMoon ikili arama ile burç geçiş anlarını ~1 dakika hassasiyetinde bulur.
 * Fallback: sinodik epoch yaklaşımı (legacy).
 */
export function getMoonSignPeriod(date: Date): { from: Date; to: Date } {
  try {
    const ecl0    = AE.EclipticGeoMoon(date);
    const signIdx = Math.floor(ecl0.lon / 30) % 12;

    // ── Giriş zamanı: ≤3 gün geriye ikili arama ──────────────────────────────
    let loMs = date.getTime() - 3 * 86_400_000;
    let hiMs = date.getTime();
    // lo'nun farklı burçta olduğunu garantile
    while (Math.floor(AE.EclipticGeoMoon(new Date(loMs)).lon / 30) % 12 === signIdx) {
      loMs -= 86_400_000;
    }
    while (hiMs - loMs > 60_000) {
      const midMs = Math.floor((loMs + hiMs) / 2);
      if (Math.floor(AE.EclipticGeoMoon(new Date(midMs)).lon / 30) % 12 === signIdx) {
        hiMs = midMs;
      } else {
        loMs = midMs;
      }
    }
    const fromMs = hiMs;

    // ── Çıkış zamanı: ≤3 gün ileriye ikili arama ─────────────────────────────
    loMs = date.getTime();
    hiMs = date.getTime() + 3 * 86_400_000;
    // hi'nin farklı burçta olduğunu garantile
    while (Math.floor(AE.EclipticGeoMoon(new Date(hiMs)).lon / 30) % 12 === signIdx) {
      hiMs += 86_400_000;
    }
    while (hiMs - loMs > 60_000) {
      const midMs = Math.floor((loMs + hiMs) / 2);
      if (Math.floor(AE.EclipticGeoMoon(new Date(midMs)).lon / 30) % 12 === signIdx) {
        loMs = midMs;
      } else {
        hiMs = midMs;
      }
    }
    const toMs = loMs;

    return { from: new Date(fromMs), to: new Date(toMs) };
  } catch {
    // Fallback: sinodik epoch yaklaşımı
    const daysSince  = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
    const degrees    = ((daysSince * (360 / 27.32)) % 360 + 360) % 360;
    const adjusted   = (degrees + 270) % 360;
    const fraction   = (adjusted % 30) / 30;
    const signDurMs  = (27.32 / 12) * 86_400_000;
    const fromMs     = date.getTime() - fraction * signDurMs;
    return { from: new Date(fromMs), to: new Date(fromMs + signDurMs) };
  }
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

// ─── AE tabanlı takvim faz olayları ──────────────────────────────────────────
// Türkiye UTC+3 sabit offset (2016'dan beri DST yok).
// Noon-scan yerine gerçek AE anı kullanılır → takvim marker'ı ile events.ts
// tarih/saati her zaman aynı TR gününü gösterir.

const TR_OFFSET_AY = 3 * 3_600_000;

/** Aylık AE faz olayı — takvim marker'ı ve liste gösterimi için */
export type MonthPhaseEvent = {
  day:     number;   // 1–31, Türkiye takvim günü
  name:    string;
  emoji:   string;
  timeTR:  string;   // "HH:MM" Türkiye saati
  timeUTC: string;   // ISO UTC
};

/** Yaklaşan AE faz olayı — yaklaşan fazlar listesi için */
export type UpcomingPhaseEvent = {
  day:         number;
  date:        Date;    // new Date(trYıl, trAy, trGün, 12) — yalnızca gösterim
  name:        string;
  emoji:       string;
  isMain:      boolean;
  daysFromNow: number;
  timeTR:      string;  // "HH:MM" Türkiye saati
  timeUTC:     string;  // ISO UTC
};

/**
 * Verilen TR takvim ayındaki tüm 8 faz geçişini AE.SearchMoonPhase ile bulur.
 * Türkiye UTC+3 saatine göre gün/saat döner.
 * Gece gerçekleşen fazlar doğru güne atanır (noon-scan +1 gün kayması ortadan kalkar).
 */
export function getMonthPhaseEvents(year: number, month: number): MonthPhaseEvent[] {
  try {
    const events: MonthPhaseEvent[] = [];
    // TR ay penceresi UTC ms: TR gece yarısı = UTC 21:00 (önceki gün)
    const winStart = Date.UTC(year, month,     1, 0, 0, 0) - TR_OFFSET_AY;
    const winEnd   = Date.UTC(year, month + 1, 1, 0, 0, 0) - TR_OFFSET_AY;

    for (let i = 0; i < AE_MOON_PHASES.length; i++) {
      const phase = AE_MOON_PHASES[i]!;
      const angle = i * 45; // 0°=Yeni Ay, 45°=Büyüyen Hilal, … 315°=Balsamik
      // Bir sinodik döngü (~32 gün) öncesinden arama — ay başındaki olayları kaçırmamak için
      let cursor = new Date(winStart - 32 * 86_400_000);

      while (true) {
        const r = AE.SearchMoonPhase(angle, cursor, 32);
        if (!r) break;
        const ms = r.date.getTime();
        if (ms >= winEnd) break;
        if (ms >= winStart) {
          const trMs = ms + TR_OFFSET_AY;
          const td   = new Date(trMs);
          events.push({
            day:     td.getUTCDate(),
            name:    phase.name,
            emoji:   phase.emoji,
            timeTR:  `${String(td.getUTCHours()).padStart(2, "0")}:${String(td.getUTCMinutes()).padStart(2, "0")}`,
            timeUTC: r.date.toISOString(),
          });
        }
        cursor = new Date(ms + 28 * 86_400_000); // sonraki aynı fazı bulmak için ~28 gün ileri
      }
    }

    return events.sort((a, b) =>
      a.day !== b.day ? a.day - b.day : a.timeTR.localeCompare(b.timeTR),
    );
  } catch {
    return [];
  }
}

/**
 * from gününden sonraki days gün içindeki tüm faz geçişlerini AE ile bulur.
 * from günü dahil değil (from+1 ve sonrası).
 * Yaklaşan fazlar listesi ve arama için ortak kaynak.
 */
export function getUpcomingPhaseEvents(from: Date, days: number): UpcomingPhaseEvent[] {
  const MAIN = new Set(["Yeni Ay", "İlk Dördün", "Dolunay", "Son Dördün"]);
  try {
    const results: UpcomingPhaseEvent[] = [];
    const todayMs = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const endMs   = todayMs + days * 86_400_000;

    for (let i = 0; i < AE_MOON_PHASES.length; i++) {
      const phase = AE_MOON_PHASES[i]!;
      const angle = i * 45;
      let cursor  = new Date(from.getTime() - 86_400_000); // 1 gün öncesinden başla

      while (true) {
        const r = AE.SearchMoonPhase(angle, cursor, 32);
        if (!r) break;
        const ms = r.date.getTime();

        const trMs = ms + TR_OFFSET_AY;
        const td   = new Date(trMs);
        // TR takvim günü → yerel Date (daysFromNow hesabı için)
        const calDay = new Date(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate());
        const calMs  = calDay.getTime();

        if (calMs > endMs) break;

        if (calMs > todayMs) {
          results.push({
            day:         td.getUTCDate(),
            date:        new Date(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate(), 12, 0, 0),
            name:        phase.name,
            emoji:       phase.emoji,
            isMain:      MAIN.has(phase.name),
            daysFromNow: Math.round((calMs - todayMs) / 86_400_000),
            timeTR:      `${String(td.getUTCHours()).padStart(2, "0")}:${String(td.getUTCMinutes()).padStart(2, "0")}`,
            timeUTC:     r.date.toISOString(),
          });
        }

        cursor = new Date(ms + 28 * 86_400_000);
      }
    }

    return results.sort((a, b) => a.daysFromNow - b.daysFromNow);
  } catch {
    return [];
  }
}
