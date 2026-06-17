/**
 * lib/cosmic/retro.ts
 * Gezegen retro dönemleri — 2026-2036 doğrulanmış veri.
 *
 * Kaynak: ProKerala Planetary Retrograde Calendars
 * Çapraz doğrulama: MoonTracks.com (Merkür), In-The-Sky.org (Satürn),
 *                   DrikPanchang (Satürn), Britannica (Merkür 2026)
 * Kapsam: 2026-01-01 → 2036-12-31 (bazı retro dönemleri 2037'ye uzanır)
 * Uyarı: 2037-2040 arası doğrulanmış kaynak yetersizliği nedeniyle dahil edilmedi.
 *
 * Yorumlar uzman tarafından sonradan eklenecek (expertNote alanı).
 */

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type PlanetName = "Merkür" | "Venüs" | "Mars" | "Jüpiter" | "Satürn";

export type RetroPeriod = {
  planet:      PlanetName;
  symbol:      string;
  start:       string;       // YYYY-MM-DD
  end:         string;       // YYYY-MM-DD
  theme:       string;
  expertNote?: string;
};

// ─── Veri ─────────────────────────────────────────────────────────────────────

export const RETRO_PERIODS: RetroPeriod[] = [

  // ── Merkür Retrosu ☿ — yılda 3-4 kez, ~21 gün ────────────────────────────
  // 2026
  { planet: "Merkür", symbol: "☿", start: "2026-02-26", end: "2026-03-20",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2026-06-29", end: "2026-07-23",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2026-10-24", end: "2026-11-13",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2027
  { planet: "Merkür", symbol: "☿", start: "2027-02-09", end: "2027-03-03",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2027-06-10", end: "2027-07-04",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2027-10-07", end: "2027-10-28",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2028
  { planet: "Merkür", symbol: "☿", start: "2028-01-24", end: "2028-02-14",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2028-05-21", end: "2028-06-14",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2028-09-19", end: "2028-10-11",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2029 — bu yıl 4 retro (Aralık retrosu 2030'a taşıyor)
  { planet: "Merkür", symbol: "☿", start: "2029-01-07", end: "2029-01-27",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2029-05-01", end: "2029-05-25",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2029-09-02", end: "2029-09-24",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2029-12-22", end: "2030-01-11",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2030
  { planet: "Merkür", symbol: "☿", start: "2030-04-12", end: "2030-05-06",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2030-08-15", end: "2030-09-08",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2030-12-05", end: "2030-12-25",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2031
  { planet: "Merkür", symbol: "☿", start: "2031-03-25", end: "2031-04-18",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2031-07-29", end: "2031-08-22",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2031-11-19", end: "2031-12-09",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2032
  { planet: "Merkür", symbol: "☿", start: "2032-03-07", end: "2032-03-30",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2032-07-09", end: "2032-08-03",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2032-11-02", end: "2032-11-22",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2033
  { planet: "Merkür", symbol: "☿", start: "2033-02-18", end: "2033-03-12",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2033-06-21", end: "2033-07-15",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2033-10-16", end: "2033-11-06",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2034
  { planet: "Merkür", symbol: "☿", start: "2034-02-02", end: "2034-02-23",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2034-06-02", end: "2034-06-26",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2034-09-29", end: "2034-10-21",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2035
  { planet: "Merkür", symbol: "☿", start: "2035-01-17", end: "2035-02-06",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2035-05-13", end: "2035-06-06",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2035-09-12", end: "2035-10-05",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  // 2036 (Aralık retrosu 2037'ye taşıyor)
  { planet: "Merkür", symbol: "☿", start: "2036-04-23", end: "2036-05-17",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2036-08-25", end: "2036-09-17",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },
  { planet: "Merkür", symbol: "☿", start: "2036-12-14", end: "2037-01-03",
    theme: "İletişim, anlaşmalar, teknoloji, eski konular" },

  // ── Venüs Retrosu ♀ — ~19 ayda bir, ~41 gün ──────────────────────────────
  // Venüs 2026, 2028, 2029/2030, 2031, 2033, 2034, 2036
  { planet: "Venüs", symbol: "♀", start: "2026-10-03", end: "2026-11-13",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2028-05-10", end: "2028-06-22",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2029-12-16", end: "2030-01-26",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2031-07-20", end: "2031-09-01",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2033-02-27", end: "2033-04-10",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2034-09-30", end: "2034-11-11",
    theme: "İlişkiler, değerler, estetik, para algısı" },
  { planet: "Venüs", symbol: "♀", start: "2036-05-08", end: "2036-06-20",
    theme: "İlişkiler, değerler, estetik, para algısı" },

  // ── Mars Retrosu ♂ — ~26 ayda bir, ~70 gün ────────────────────────────────
  // Mars retrograde olmayan yıllar: 2026, 2028, 2030, 2032, 2034, 2036
  { planet: "Mars", symbol: "♂", start: "2027-01-10", end: "2027-04-01",
    theme: "Eylem, öfke, cesaret, fiziksel enerji" },
  { planet: "Mars", symbol: "♂", start: "2029-02-14", end: "2029-05-05",
    theme: "Eylem, öfke, cesaret, fiziksel enerji" },
  { planet: "Mars", symbol: "♂", start: "2031-03-28", end: "2031-06-13",
    theme: "Eylem, öfke, cesaret, fiziksel enerji" },
  { planet: "Mars", symbol: "♂", start: "2033-05-26", end: "2033-08-01",
    theme: "Eylem, öfke, cesaret, fiziksel enerji" },
  { planet: "Mars", symbol: "♂", start: "2035-08-15", end: "2035-10-15",
    theme: "Eylem, öfke, cesaret, fiziksel enerji" },

  // ── Jüpiter Retrosu ♃ — yılda 1 kez, ~4 ay ────────────────────────────────
  // 2027 retrosu yok (2026-12-12'de başlayan 2027-04-12'ye uzanıyor)
  { planet: "Jüpiter", symbol: "♃", start: "2026-12-12", end: "2027-04-12",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2028-01-12", end: "2028-05-13",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2029-02-10", end: "2029-06-13",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2030-03-13", end: "2030-07-14",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2031-04-15", end: "2031-08-16",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2032-05-19", end: "2032-09-17",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2033-06-25", end: "2033-10-23",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2034-08-02", end: "2034-11-28",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2035-09-09", end: "2036-01-04",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },
  { planet: "Jüpiter", symbol: "♃", start: "2036-10-13", end: "2037-02-09",
    theme: "İnançlar, büyüme, eğitim, fırsatlar" },

  // ── Satürn Retrosu ♄ — yılda 1 kez, ~4.5 ay ──────────────────────────────
  { planet: "Satürn", symbol: "♄", start: "2026-07-26", end: "2026-12-10",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2027-08-09", end: "2027-12-23",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2028-08-22", end: "2029-01-05",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2029-09-06", end: "2030-01-18",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2030-09-20", end: "2031-02-01",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2031-10-05", end: "2032-02-16",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2032-10-18", end: "2033-03-01",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2033-11-02", end: "2034-03-15",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2034-11-16", end: "2035-03-30",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2035-11-30", end: "2036-04-12",
    theme: "Sorumluluk, yapı, disiplin, sınırlar" },
  { planet: "Satürn", symbol: "♄", start: "2036-12-12", end: "2037-04-27",
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
