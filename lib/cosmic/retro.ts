/**
 * lib/cosmic/retro.ts
 * Gezegen retro dönemleri — astronomy-engine station hesabı (FAZ 1B).
 *
 * Tarih kaynağı: astronomy-engine (geosentrik ekliptik boylam HIZININ işaret değişimi).
 *   +→−  Station Retrograde   |   −→+  Station Direct
 * Hesaplama Türkiye saatine (UTC+3) göre tarihlendirilir; sabit pencere → SSR/client deterministik.
 *
 * Doğrulama (2026-2040): AE, kürasyonlu ProKerala tablosuyla 2026-2037 aralığında 67/67
 * (ET'de) birebir; 2037-2040 bağımsız kaynaklarla (findyourfate / astro-seek = Swiss Ephemeris)
 * gün-gününe doğrulandı. Eski hardcoded tablo, ABD-Doğu (ET) saatine göre olduğundan TR'de
 * 37/67 dönemi 1 gün erken gösteriyordu; AE bunu Türkiye saatine göre düzeltir.
 *
 * Editöryel içerik (theme) gezegen başına korunur; expertNote ileride eklenebilir.
 */

import * as AE from "astronomy-engine";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type PlanetName = "Merkür" | "Venüs" | "Mars" | "Jüpiter" | "Satürn";

export type RetroPeriod = {
  planet:      PlanetName;
  symbol:      string;
  start:       string;       // YYYY-MM-DD (Türkiye saati)
  end:         string;       // YYYY-MM-DD (Türkiye saati)
  theme:       string;
  expertNote?: string;
};

// ─── Editöryel içerik (gezegen başına sabit — eski tablodan birebir korundu) ──

const RETRO_THEME: Record<PlanetName, string> = {
  "Merkür":  "İletişim, anlaşmalar, teknoloji, eski konular",
  "Venüs":   "İlişkiler, değerler, estetik, para algısı",
  "Mars":    "Eylem, öfke, cesaret, fiziksel enerji",
  "Jüpiter": "İnançlar, büyüme, eğitim, fırsatlar",
  "Satürn":  "Sorumluluk, yapı, disiplin, sınırlar",
};
const RETRO_SYMBOL: Record<PlanetName, string> = {
  "Merkür": "☿", "Venüs": "♀", "Mars": "♂", "Jüpiter": "♃", "Satürn": "♄",
};

// İleride uzman notu eklemek için: anahtar `"<Gezegen>:<YYYY-MM-DD>"` (start tarihi).
const RETRO_EXPERT_NOTES: Record<string, string> = {
  // örn. "Merkür:2026-06-29": "..."  — şu an boş; UI'da expertNote opsiyoneldir.
};

// ─── AE station motoru ────────────────────────────────────────────────────────
// astronomy-engine'de hazır "retrograde" fonksiyonu YOKTUR; station = boylam hızının
// işaret değiştirdiği andır. Kaba tarama (gezegene göre adım, en kısa retro Merkür ~21g)
// + ikili arama ile dakika hassasiyetinde bulunur.

const RETRO_AE_BODY: Record<PlanetName, AE.Body> = {
  "Merkür": AE.Body.Mercury, "Venüs": AE.Body.Venus, "Mars": AE.Body.Mars,
  "Jüpiter": AE.Body.Jupiter, "Satürn": AE.Body.Saturn,
};
const RETRO_AE_STEP_DAYS: Record<PlanetName, number> = {
  "Merkür": 3, "Venüs": 5, "Mars": 5, "Jüpiter": 8, "Satürn": 8,
};
const RETRO_BISECT_ITERS = 28;          // ~saniye-altı hassasiyet (adım/2^28)
const RETRO_TR_OFFSET = 3 * 3_600_000;  // Türkiye UTC+3 sabit (2016'dan beri DST yok)

// Sabit, deterministik pencere (SSR↔client tutarlılığı için new Date() KULLANILMAZ).
const RETRO_FROM_YEAR = 2024;
const RETRO_TO_YEAR   = 2050;

function aeEclLon(body: AE.Body, ms: number): number {
  return AE.Ecliptic(AE.GeoVector(body, new Date(ms), true)).elon;
}
/** işaretli açısal hız (±6s sonlu fark); + ileri, − retro */
function aeVelocity(body: AE.Body, ms: number): number {
  const h = 6 * 3_600_000;
  let d = aeEclLon(body, ms + h) - aeEclLon(body, ms - h);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function aeTrDateStr(ms: number): string {
  const d = new Date(ms + RETRO_TR_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
type AeStation = { kind: "R" | "D"; ms: number };
function aeStations(body: AE.Body, fromMs: number, toMs: number, stepDays: number): AeStation[] {
  const out: AeStation[] = [];
  const step = stepDays * 86_400_000;
  let prev = aeVelocity(body, fromMs);
  for (let t = fromMs; t < toMs; t += step) {
    const nt = Math.min(t + step, toMs);
    const v = aeVelocity(body, nt);
    if (prev !== 0 && Math.sign(v) !== Math.sign(prev)) {
      let lo = t, hi = nt;
      for (let i = 0; i < RETRO_BISECT_ITERS; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(aeVelocity(body, mid)) === Math.sign(prev)) lo = mid; else hi = mid;
      }
      out.push({ kind: prev > 0 ? "R" : "D", ms: hi });
    }
    prev = v;
  }
  return out;
}

/** Tüm gezegenlerin retro dönemlerini AE ile üretir (bir Station R'den sonraki Station D). */
function buildRetroPeriods(fromYear: number, toYear: number): RetroPeriod[] {
  const out: RetroPeriod[] = [];
  const fromMs = Date.UTC(fromYear, 0, 1);
  const toMs   = Date.UTC(toYear, 0, 1);
  for (const planet of Object.keys(RETRO_AE_BODY) as PlanetName[]) {
    const st = aeStations(RETRO_AE_BODY[planet], fromMs, toMs, RETRO_AE_STEP_DAYS[planet]);
    for (let i = 0; i < st.length; i++) {
      if (st[i]!.kind !== "R") continue;
      const dir = st.slice(i + 1).find(s => s.kind === "D");
      if (!dir) continue;  // pencere sonunda yarım kalan retro atlanır
      const start = aeTrDateStr(st[i]!.ms);
      const period: RetroPeriod = {
        planet,
        symbol: RETRO_SYMBOL[planet],
        start,
        end:   aeTrDateStr(dir.ms),
        theme: RETRO_THEME[planet],
      };
      const note = RETRO_EXPERT_NOTES[`${planet}:${start}`];
      if (note) period.expertNote = note;
      out.push(period);
    }
  }
  return out;
}

// Modül yüklemesinde bir kez hesaplanır (ES modülü singleton → süreç/oturum başına 1).
export const RETRO_PERIODS: RetroPeriod[] = buildRetroPeriods(RETRO_FROM_YEAR, RETRO_TO_YEAR);

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
