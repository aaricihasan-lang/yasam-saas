/**
 * lib/cosmic/retro.ts
 * Gezegen retro dönemleri — 2026-2030 manuel veri.
 * Yorumlar uzman tarafından sonradan eklenecek (expertNote alanı).
 */

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type PlanetName = "Merkür" | "Venüs" | "Mars" | "Jüpiter" | "Satürn";

export type RetroPeriod = {
  planet:      PlanetName;
  symbol:      string;
  start:       string;       // YYYY-MM-DD
  end:         string;       // YYYY-MM-DD
  theme:       string;       // Kısa ana tema
  expertNote?: string;       // Uzman yorumu — sonradan eklenecek
};

// ─── Veri ─────────────────────────────────────────────────────────────────────

export const RETRO_PERIODS: RetroPeriod[] = [

  // ── Merkür Retrosu — yılda 3-4 kez, ~3 hafta ──────────────────────────────
  { planet: "Merkür", symbol: "☿", start: "2026-01-13", end: "2026-02-04",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2026-05-10", end: "2026-06-02",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2026-09-13", end: "2026-10-05",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2026-12-28", end: "2027-01-18",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2027-04-21", end: "2027-05-14",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2027-08-28", end: "2027-09-20",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2027-12-12", end: "2028-01-01",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2028-04-02", end: "2028-04-24",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2028-08-05", end: "2028-08-27",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2028-11-23", end: "2028-12-12",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2029-03-13", end: "2029-04-05",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2029-07-14", end: "2029-08-07",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2029-11-05", end: "2029-11-25",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2030-02-21", end: "2030-03-15",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2030-06-25", end: "2030-07-18",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2030-10-18", end: "2030-11-07",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },

  // ── Venüs Retrosu — ~18 ayda bir, ~6 hafta ────────────────────────────────
  { planet: "Venüs", symbol: "♀", start: "2027-07-22", end: "2027-09-03",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2029-03-01", end: "2029-04-12",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2030-09-04", end: "2030-10-14",
    theme: "İlişkiler, değerler, estetik, para algısı" },

  // ── Mars Retrosu — ~26 ayda bir, ~2.5 ay ──────────────────────────────────
  { planet: "Mars", symbol: "♂", start: "2027-03-26", end: "2027-06-18",
    theme: "Eylem, öfke, cesaret, fiziksel enerji" },
  { planet: "Mars", symbol: "♂", start: "2029-05-24", end: "2029-08-02",
    theme: "Eylem, öfke, cesaret, fiziksel enerji" },

  // ── Jüpiter Retrosu — yılda bir, ~4 ay ────────────────────────────────────
  { planet: "Jüpiter", symbol: "♃", start: "2026-11-11", end: "2027-03-11",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2027-12-18", end: "2028-04-14",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2029-01-23", end: "2029-05-19",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2030-03-02", end: "2030-06-28",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },

  // ── Satürn Retrosu — yılda bir, ~4.5 ay ───────────────────────────────────
  { planet: "Satürn", symbol: "♄", start: "2026-05-29", end: "2026-10-14",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2027-06-05", end: "2027-10-22",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2028-06-11", end: "2028-10-28",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2029-06-17", end: "2029-11-03",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2030-06-23", end: "2030-11-09",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
];

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

/** YYYY-MM-DD → yerel gece yarısı Date */
export function parseRetroDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function toMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// ─── Fonksiyonlar ─────────────────────────────────────────────────────────────

/** Seçilen tarihte aktif retro dönemlerini döndürür */
export function getActiveRetros(date: Date): RetroPeriod[] {
  const d = toMidnight(date);
  return RETRO_PERIODS.filter(r => {
    const s = parseRetroDate(r.start);
    const e = parseRetroDate(r.end);
    return d >= s && d <= e;
  });
}

/** En az bir retro aktif mi */
export function isRetroActive(date: Date): boolean {
  return getActiveRetros(date).length > 0;
}

/** Önümüzdeki N gün içinde başlayacak retroları tarih sırasıyla döndürür */
export function getUpcomingRetros(date: Date, days = 60): RetroPeriod[] {
  const d      = toMidnight(date);
  const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return RETRO_PERIODS.filter(r => {
    const s = parseRetroDate(r.start);
    return s > d && s <= cutoff;
  }).sort((a, b) => parseRetroDate(a.start).getTime() - parseRetroDate(b.start).getTime());
}

/** Belirli gezegen için sonraki retro dönemini döndürür */
export function getNextRetro(planet: PlanetName, date: Date): RetroPeriod | null {
  const d = toMidnight(date);
  return RETRO_PERIODS.find(r => r.planet === planet && parseRetroDate(r.start) > d) ?? null;
}
