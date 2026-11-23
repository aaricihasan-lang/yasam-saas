// Ortak IANA saat dilimi çekirdeği (SAF; sunucu + tarayıcı; modülden bağımsız). HD-TZ-00 (17.11.2026).
//
//   Veri  : ianaTable.generated.ts — TEK IANA kaynağı (sürüm: TZDB_VERSION; üretici scripts/astrology/tz/gen-tz-table.py)
//           backzone.generated.ts  — 1970 öncesi IANA backzone katmanı (üretici scripts/astrology/tz/gen-backzone-overlay.py)
//   Sıra  : backzone (tablodaki bölgede cutoff öncesi; kapatılabilir) → IANA tablosu → tabloda olmayan ad için Intl (eski yol).
//   Politika YOK: yerel saat hiç yaşanmamışsa (boşluk) ya da iki kez yaşanmışsa (çakışma) ne yapılacağı ÇAĞIRAN modülün
//   kararıdır (Gökyüzü Atlası: kullanıcı seçimi earlier/later; Human Design: ret). Bu modül yalnız geçerli adayları verir.
//
// Atlas ATL-TZ-2026F uygulamasından BİREBİR taşındı (lib/astrology/birth/timeResolution.ts) — sonuçlar değişmez.

import { TZ_BACKZONE_OVERLAY } from "./backzone.generated";
import { TZ_IANA_LINKS, TZ_IANA_META, TZ_IANA_ZONES, type TzIanaRule } from "./ianaTable.generated";

/** Uygulamanın kullandığı IANA tzdata sürümü (tek kaynak: ianaTable.generated.ts). */
export const TZDB_VERSION: string = TZ_IANA_META.tzdataVersion;

/** backzone: 1970 öncesi IANA backzone katmanı uygulansın mı (varsayılan true — Gökyüzü Atlası davranışı). */
export type TzdbOptions = { backzone?: boolean };

/** Tablodaki IANA adı (asıl ad ya da takma ad). */
export function isTableZone(tz: string): boolean {
  return Object.hasOwn(TZ_IANA_ZONES, tz) || Object.hasOwn(TZ_IANA_LINKS, tz);
}

/** IANA bölge adı denetimi: biçim + (tabloda ya da çalışma ortamının Intl'inde tanınan ad). */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$|^UTC$/.test(tz)) return false;
  // ATL-TZ-2026F: sabit IANA tablosundaki ad, çalışma ortamının (eski) Intl'i tanımasa da geçerlidir.
  if (isTableZone(tz)) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * ATL-P1-01 / TZ-01: ICU/Intl IANA "backzone" verisini kullanmaz → 1970 öncesi bazı bölgelerde tarihsel ofset yanlış
 * (ör. Kampala 1951 +3 yerine +2:45, Reykjavik 1955 0 yerine −1). Tablodaki bölgede ve cutoff ÖNCESİNDE ofset, resmî IANA
 * backzone derlemesinden alınır; cutoff sonrası ve tablo dışı bölgeler IANA tablosu / Intl yoluyla.
 */
function backzoneOffsetMs(utcMs: number, timeZone: string): number | null {
  const z = TZ_BACKZONE_OVERLAY[timeZone];
  if (!z || utcMs >= z.cutoff * 1000) return null;
  const t = z.t;
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const at = t[mid][0];
    if (at === null || at * 1000 <= utcMs) lo = mid;
    else hi = mid - 1;
  }
  return t[lo][1] * 1000;
}

/**
 * ATL-TZ-2026F: Intl/ICU tz verisi çalışma ortamına göre eskiyebilir (Node 24.15 = 2026a: Havana 2026-11 UTC−5, IANA 2026f
 * UTC−4). Ofset, sürümü sabitlenmiş IANA tablosundan alınır: açık geçişler + son geçişten sonra TZif kalıcı kuralı
 * (POSIX TZ "Mm.w.d/saat"; RFC 9636 §3.3). Çözülmüş bölge önbelleğe alınır.
 */
type IanaZone = { t: number[]; o: number[]; rule: TzIanaRule };
const IANA_CACHE = new Map<string, IanaZone>(); // yalnız tablodaki adlar (sınırlı)

function ianaZone(timeZone: string): IanaZone | null {
  const hit = IANA_CACHE.get(timeZone);
  if (hit) return hit;
  const name = Object.hasOwn(TZ_IANA_LINKS, timeZone) ? TZ_IANA_LINKS[timeZone] : timeZone;
  const raw = Object.hasOwn(TZ_IANA_ZONES, name) ? TZ_IANA_ZONES[name] : undefined;
  if (!raw) return null;
  const [pal, idx, deltas, rule] = raw;
  const t = [-Infinity];
  let at = 0;
  if (deltas) for (const d of deltas.split(".")) t.push((at += parseInt(d, 36)));
  const z = { t, o: [...idx].map((c) => pal[parseInt(c, 36)]), rule };
  IANA_CACHE.set(timeZone, z);
  return z;
}

/** Proleptik Gregoryen tarih → 1970-01-01'den gün sayısı (Date.UTC'nin 0–99 yıl eşlemesinden bağımsız). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

/** Mm.w.d: m. ayın w. (5 = son) d. günü (0 = Pazar) — 1970'ten gün sayısı. */
function ruleDay(y: number, m: number, w: number, d: number): number {
  const first = daysFromCivil(y, m, 1);
  const len = (m === 12 ? daysFromCivil(y + 1, 1, 1) : daysFromCivil(y, m + 1, 1)) - first;
  let day = 1 + ((d - ((first % 7) + 11) % 7 + 7) % 7) + (w - 1) * 7; // 1970-01-01 Perşembe (4)
  while (day > len) day -= 7;
  return first + day - 1;
}

function ianaOffsetSeconds(utcSec: number, z: IanaZone): number {
  const { t, o, rule } = z;
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid] <= utcSec) lo = mid;
    else hi = mid - 1;
  }
  if (lo < t.length - 1 || rule.length === 1) return o[lo];
  // Son açık geçişten sonra: kalıcı kural. Başlangıç saati standart, bitiş saati yaz saati ofsetiyle yereldir.
  const [std, dst, sm, sw, sd, st, em, ew, ed, et] = rule;
  const y = new Date(utcSec * 1000).getUTCFullYear();
  let best = t[lo];
  let off = o[lo];
  for (let yy = y - 1; yy <= y + 1; yy++) {
    for (const [at, to] of [
      [ruleDay(yy, sm, sw, sd) * 86400 + st - std, dst],
      [ruleDay(yy, em, ew, ed) * 86400 + et - dst, std],
    ]) {
      if (at > best && at <= utcSec) {
        best = at;
        off = to;
      }
    }
  }
  return off;
}

/** Bir UTC anında tz'deki duvar saatinin "naif UTC" ms karşılığı. Geçerli bölge adı varsayılır. */
export function wallClockMs(utcMs: number, timeZone: string, opts: TzdbOptions = {}): number {
  if (opts.backzone !== false) {
    const bz = backzoneOffsetMs(utcMs, timeZone);
    if (bz !== null) return utcMs + bz;
  }
  const iana = ianaZone(timeZone);
  if (iana) {
    const sec = Math.floor(utcMs / 1000); // Intl yolu gibi saniyeye kesilir
    return (sec + ianaOffsetSeconds(sec, iana)) * 1000;
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    era: "short",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const era = parts.find((p) => p.type === "era")?.value ?? "AD";
  const y = era === "BC" ? 1 - get("year") : get("year");
  const d = new Date(0);
  d.setUTCFullYear(y, get("month") - 1, get("day"));
  d.setUTCHours(get("hour"), get("minute"), get("second"), 0);
  return d.getTime();
}

/** Bir UTC anında tz'deki YEREL duvar saati ("YYYY-MM-DD", "HH:MM:SS"). Geçersiz bölge → null. */
export function wallClockAt(utcMs: number, timeZone: string, opts: TzdbOptions = {}): { date: string; time: string } | null {
  if (!isValidIanaTimeZone(timeZone) || !Number.isFinite(utcMs)) return null;
  const iso = new Date(wallClockMs(utcMs, timeZone, opts)).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

/** Bir UTC anında tz'nin UTC ofseti (saniye). Geçersiz bölge → null. */
export function utcOffsetSecondsAt(utcMs: number, timeZone: string, opts: TzdbOptions = {}): number | null {
  if (!isValidIanaTimeZone(timeZone) || !Number.isFinite(utcMs)) return null;
  const sec = Math.floor(utcMs / 1000);
  return (wallClockMs(sec * 1000, timeZone, opts) - sec * 1000) / 1000;
}

export type LocalTimeCandidate = { utcMs: number; offsetSeconds: number };

/**
 * Naif yerel an ("yerel duvar saati UTC gibi okunmuş" ms) → bu yerel saatin gerçekleştiği TÜM UTC anları, UTC'ye göre artan.
 * [] = hiç yaşanmamış (boşluk) · 1 = tek an · 2+ = iki kez yaşanmış (çakışma). Geçerli bölge adı varsayılır.
 * Aday ofsetler: ±36 saat içindeki tüm farklı ofsetler (bir geçişin iki yanı).
 */
export function localTimeCandidates(naiveMs: number, timeZone: string, opts: TzdbOptions = {}): LocalTimeCandidate[] {
  const offsets = new Set<number>();
  for (const probe of [-36, -12, 0, 12, 36]) {
    const t = naiveMs + probe * 3_600_000;
    offsets.add(wallClockMs(t, timeZone, opts) - t);
  }
  const valid: { utcMs: number; offset: number }[] = [];
  for (const off of offsets) {
    const utcMs = naiveMs - off;
    if (wallClockMs(utcMs, timeZone, opts) === naiveMs && !valid.some((v) => v.utcMs === utcMs)) {
      valid.push({ utcMs, offset: off });
    }
  }
  return valid.sort((a, b) => a.utcMs - b.utcMs).map((v) => ({ utcMs: v.utcMs, offsetSeconds: v.offset / 1000 }));
}
