/**
 * lib/cosmic/retro.ts
 * Gezegen retro dönemleri — astronomy-engine station hesabı (FAZ 1B).
 *
 * Tarih kaynağı: astronomy-engine (geosentrik ekliptik boylam HIZININ işaret değişimi).
 *   +→−  Station Retrograde   |   −→+  Station Direct
 * Hesaplama Türkiye saatine (UTC+3) göre tarihlendirilir; sabit pencere → SSR/client deterministik.
 *
 * Kapsam: 8 gezegen (Merkür…Plüton). Public aralık 01.01.2026–31.12.2100; internal tampon
 * 2024…2101 (dateRange). Doğrulama: scripts/cosmic-longrange — her retro başlangıç/bitiş günü
 * Swiss Ephemeris hız işaretiyle 2026–2100 boyunca karşılaştırılır.
 * (Tarihçe: eski hardcoded tablo ET saatine göreydi, TR'de 37/67 dönemi 1 gün erken gösteriyordu.)
 *
 * Editöryel içerik (theme) gezegen başına korunur; expertNote ileride eklenebilir.
 */

import * as AE from "astronomy-engine";
import {
  INTERNAL_START_YEAR, INTERNAL_END_YEAR_EXCLUSIVE, SUPPORT_START_KEY, SUPPORT_END_KEY,
  isValidDate, localDayKey, isDayKeySupported,
} from "./dateRange";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type PlanetName =
  | "Merkür" | "Venüs" | "Mars" | "Jüpiter" | "Satürn"
  | "Uranüs" | "Neptün" | "Plüton";

/** Retro durumu hesaplanan TÜM gezegenler (G3: 8 gezegen; "tümü direkt" ancak bu 8'i kontrol edilince). */
export const RETRO_PLANETS: ReadonlyArray<PlanetName> = [
  "Merkür", "Venüs", "Mars", "Jüpiter", "Satürn", "Uranüs", "Neptün", "Plüton",
];

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
  "Uranüs":  "Değişim, özgürleşme, yenilik, ani gelişmeler",
  "Neptün":  "Sezgi, hayal gücü, ruhsallık, belirsizlik",
  "Plüton":  "Dönüşüm, güç, derin süreçler, yeniden doğuş",
};
const RETRO_SYMBOL: Record<PlanetName, string> = {
  "Merkür": "☿", "Venüs": "♀", "Mars": "♂", "Jüpiter": "♃", "Satürn": "♄",
  "Uranüs": "♅", "Neptün": "♆", "Plüton": "♇",
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
  "Uranüs": AE.Body.Uranus, "Neptün": AE.Body.Neptune, "Plüton": AE.Body.Pluto,
};
// Adım, en kısa retro/direkt aralığından küçük olmalı (dış gezegen retrosu ~5 ay → 8g güvenli).
const RETRO_AE_STEP_DAYS: Record<PlanetName, number> = {
  "Merkür": 3, "Venüs": 5, "Mars": 5, "Jüpiter": 8, "Satürn": 8,
  "Uranüs": 8, "Neptün": 8, "Plüton": 8,
};
// Bisection: adım/2^20 → Merkür (3g) ~0.25 sn, dış gezegen (8g) ~0.66 sn hassasiyet — gün-bazlı
// retro tarihleri için fazlasıyla yeterli (AE station doğruluğu zaten ~dakika mertebesinde).
const RETRO_BISECT_ITERS = 20;
const RETRO_TR_OFFSET = 3 * 3_600_000;  // Türkiye UTC+3 sabit (2016'dan beri DST yok)
const DAY_MS = 86_400_000;

// Sabit, deterministik INTERNAL pencere (SSR↔client tutarlılığı için new Date() KULLANILMAZ).
// G4: public aralık (01.01.2026–31.12.2100) kör biçimde KESİLMEZ — dateRange'deki internal tampon
// (2024-01-01 … 2102-01-01, hariç) kullanılır; böylece 01.01.2026'da süren (2025'te başlamış) ve
// 31.12.2100'de süren (2101'de biten) retroların durumu doğru bilinir. Tampon günleri PUBLIC değildir.
const GRID_EPOCH_MS = Date.UTC(INTERNAL_START_YEAR, 0, 1);
const GRID_END_MS   = Date.UTC(INTERNAL_END_YEAR_EXCLUSIVE, 0, 1);

// PERFORMANS (doğruluğu DEĞİŞTİRMEZ): station'lar tüm pencere yerine 2 yıllık BLOKLAR hâlinde,
// yalnız istenen tarihin çevresinde ve bir kez (memo) hesaplanır. Tarama ızgarası GLOBAL olarak
// GRID_EPOCH_MS'e hizalıdır → bir bloğun sonucu hangi sırayla/hangi sayfada istendiğinden bağımsızdır
// (SSR↔client ve sayfalar arası birebir). Cache doğruluk kaynağı DEĞİLDİR; kaynak AE station hesabıdır.
const BLOCK_DAYS = 730;   // ≥ en uzun retro (~5.5 ay) → bir retro en fazla iki komşu blokta

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

function stepMs(planet: PlanetName): number { return RETRO_AE_STEP_DAYS[planet] * DAY_MS; }
function blockSteps(planet: PlanetName): number { return Math.ceil(BLOCK_DAYS / RETRO_AE_STEP_DAYS[planet]); }
function blockSpanMs(planet: PlanetName): number { return blockSteps(planet) * stepMs(planet); }
function blockCount(planet: PlanetName): number { return Math.ceil((GRID_END_MS - GRID_EPOCH_MS) / blockSpanMs(planet)); }
function blockOf(planet: PlanetName, ms: number): number {
  return Math.max(0, Math.min(blockCount(planet) - 1, Math.floor((ms - GRID_EPOCH_MS) / blockSpanMs(planet))));
}

const stationCache = new Map<string, AeStation[]>();
/** b. bloktaki station'lar (hız işaret değişimi; global hizalı ızgara + ikili arama). */
function stationsInBlock(planet: PlanetName, b: number): AeStation[] {
  const key = `${planet}|${b}`;
  const hit = stationCache.get(key);
  if (hit) return hit;
  const body = RETRO_AE_BODY[planet];
  const step = stepMs(planet), bs = blockSteps(planet);
  const out: AeStation[] = [];
  let prev = aeVelocity(body, GRID_EPOCH_MS + b * bs * step);
  for (let k = b * bs; k < (b + 1) * bs; k++) {
    const t = GRID_EPOCH_MS + k * step, nt = t + step;
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
  stationCache.set(key, out);
  return out;
}

const periodCache = new Map<string, RetroPeriod[]>();
/** b. blokta BAŞLAYAN retro dönemleri (Station R → sonraki Station D; D komşu blokta olabilir). */
function periodsStartingInBlock(planet: PlanetName, b: number): RetroPeriod[] {
  const key = `${planet}|${b}`;
  const hit = periodCache.get(key);
  if (hit) return hit;
  const st = stationsInBlock(planet, b);
  const next = b + 1 < blockCount(planet) ? stationsInBlock(planet, b + 1) : [];
  const seq = [...st, ...next];
  const out: RetroPeriod[] = [];
  for (let i = 0; i < st.length; i++) {
    if (st[i]!.kind !== "R") continue;
    const dir = seq.slice(i + 1).find(s => s.kind === "D");
    if (!dir) continue;  // yalnız INTERNAL pencere sonunda (2101 sonrası tampon) mümkün — public'i etkilemez
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
  periodCache.set(key, out);
  return out;
}

/** TR gün-anahtarı (YYYY-MM-DD) → o günün TR 12:00 anı (UTC ms). */
function keyToMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, 12) - RETRO_TR_OFFSET;
}

const intersectsPublic = (r: RetroPeriod) => r.end >= SUPPORT_START_KEY && r.start <= SUPPORT_END_KEY;

/**
 * [fromKey, toKey] günleriyle KESİŞEN retro dönemleri (sorgu public aralıkla kırpılır).
 * Sıra: gezegen (RETRO_PLANETS) → kronolojik. Yalnız ilgili bloklar hesaplanır.
 */
export function getRetroPeriodsBetween(fromKey: string, toKey: string): RetroPeriod[] {
  const f = fromKey < SUPPORT_START_KEY ? SUPPORT_START_KEY : fromKey;
  const t = toKey > SUPPORT_END_KEY ? SUPPORT_END_KEY : toKey;
  if (f > t) return [];
  const out: RetroPeriod[] = [];
  for (const planet of RETRO_PLANETS) {
    const b0 = Math.max(0, blockOf(planet, keyToMs(f)) - 1);
    const b1 = Math.min(blockCount(planet) - 1, blockOf(planet, keyToMs(t)) + 1);
    for (let b = b0; b <= b1; b++) {
      for (const r of periodsStartingInBlock(planet, b)) if (r.end >= f && r.start <= t) out.push(r);
    }
  }
  return out;
}

let _allPeriods: RetroPeriod[] | null = null;
/**
 * Public aralıkla KESİŞEN TÜM retro dönemleri (01.01.2026–31.12.2100 içinde en az bir günü olan;
 * kenar dönemlerin start/end'i tampona taşabilir — doğru bilgidir). Tüm blokları hesaplar (ağır):
 * yalnız istatistik/tam liste gereken yerlerde kullanın; tarih-odaklı sorgular için
 * getRetroStatus / getRetroPeriodsBetween tercih edin.
 */
export function getAllRetroPeriods(): RetroPeriod[] {
  if (_allPeriods) return _allPeriods;
  _allPeriods = getRetroPeriodsBetween(SUPPORT_START_KEY, SUPPORT_END_KEY).filter(intersectsPublic);
  return _allPeriods;
}

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

export type RetroStatus =
  | { supported: true; active: RetroPeriod[]; checkedPlanets: ReadonlyArray<PlanetName> }
  | { supported: false; reason: "invalid" | "out-of-range" };

/**
 * Seçilen (yerel) takvim gününün retro durumu. G3/G7: desteklenmeyen veya geçersiz tarihte
 * "direkt" DENMEZ — supported:false döner (UI "kapsam dışı" gösterir). supported:true ise
 * 8 gezegenin tamamı kontrol edilmiştir; active boşsa "tüm gezegenler direkt" söylenebilir.
 */
export function getRetroStatus(date: Date): RetroStatus {
  if (!isValidDate(date)) return { supported: false, reason: "invalid" };
  const key = localDayKey(date);
  if (!isDayKeySupported(key)) return { supported: false, reason: "out-of-range" };
  return { supported: true, active: activeOnDay(key), checkedPlanets: RETRO_PLANETS };
}

function activeOnDay(key: string): RetroPeriod[] {
  return getRetroPeriodsBetween(key, key);
}

/**
 * Seçilen tarihte aktif retro dönemleri (gün bazlı: start ≤ gün ≤ end, Türkiye tarihi).
 * Desteklenmeyen/geçersiz tarihte BOŞ döner — bu "direkt" anlamına GELMEZ; durumu ayırt etmek
 * gereken her yer getRetroStatus kullanmalıdır.
 */
export function getActiveRetros(date: Date): RetroPeriod[] {
  const st = getRetroStatus(date);
  return st.supported ? st.active : [];
}

/** En az bir retro aktif mi */
export function isRetroActive(date: Date): boolean {
  return getActiveRetros(date).length > 0;
}

/** Önümüzdeki N gün içinde başlayacak retroları tarih sırasıyla döndürür (public aralıkta). */
export function getUpcomingRetros(date: Date, days = 60): RetroPeriod[] {
  if (!isValidDate(date)) return [];
  const d      = toMidnight(date);
  const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  const fromKey = localDayKey(d), cutKey = localDayKey(cutoff);
  return getRetroPeriodsBetween(fromKey, cutKey)
    .filter(r => r.start > fromKey && r.start <= cutKey)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Belirli gezegen için sonraki retro dönemini döndürür (public aralıkta başlayan). */
export function getNextRetro(planet: PlanetName, date: Date): RetroPeriod | null {
  if (!isValidDate(date)) return null;
  const key = localDayKey(toMidnight(date));
  if (key >= SUPPORT_END_KEY) return null;
  for (let b = blockOf(planet, keyToMs(key < SUPPORT_START_KEY ? SUPPORT_START_KEY : key)); b < blockCount(planet); b++) {
    const hit = periodsStartingInBlock(planet, b).find(r => r.start > key);
    if (hit) return hit.start <= SUPPORT_END_KEY ? hit : null;
  }
  return null;
}
