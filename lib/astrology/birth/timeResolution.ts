// Astroloji — yerel doğum zamanı → UTC (SAF; sürümü sabitlenmiş IANA tzdata tablosu). Human Design'dan BAĞIMSIZ
// uygulama (aynı ilke: sessiz tahmin YOK).
//
//   Ofset kaynağı (ATL-TZ-2026F): tzIana.generated.ts (IANA 2026f; çalışma ortamının ICU/Intl sürümünden bağımsız —
//   Node/Vercel/tarayıcı aynı sonucu verir) + 1970 öncesi backzone tablosu. Tabloda olmayan ad → Intl (eski yol).
//
//   • gap       — yerel saat o gün hiç yaşanmamış (ileri alma) → hesap YOK (kullanıcı saati düzeltmeli).
//   • ambiguous — yerel saat iki kez yaşanmış (geri alma):
//                   dst_choice=auto    → REDDEDİLİR, iki seçenek döner (uzman açıkça seçer),
//                   dst_choice=earlier → ilk yaşanan an (daha büyük UTC ofseti; genelde yaz saati),
//                   dst_choice=later   → ikinci yaşanan an (daha küçük ofset; genelde kış saati).
//   • ok        — tek geçerli an (saniye hassasiyeti; LMT dahil tarihsel ofsetler korunur).

import { TZ_BACKZONE_OVERLAY } from "./tzBackzoneOverlay.generated";
import { TZ_IANA_LINKS, TZ_IANA_ZONES, type TzIanaRule } from "./tzIana.generated";

export type DstChoice = "auto" | "earlier" | "later";

export type AstroTimeResolution =
  | { kind: "ok"; utcIso: string; offsetSeconds: number; ambiguousResolved: boolean }
  | { kind: "gap" }
  | { kind: "ambiguous"; options: { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number }[] }
  | { kind: "invalid"; reason: "date" | "time" | "timezone" };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$|^UTC$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** HH:mm veya HH:mm:ss → HH:mm:ss. Geçersizse null. */
export function normalizeTime(time: string): string | null {
  const m = TIME_RE.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}:${m[2]}:${String(s).padStart(2, "0")}`;
}

export function isValidIsoDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const d = new Date(0);
  d.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/**
 * ATL-P1-01 / TZ-01: ICU/Intl IANA "backzone" verisini kullanmaz → 1970 öncesi bazı bölgelerde tarihsel ofset yanlış
 * (ör. Kampala 1951 +3 yerine +2:45, Reykjavik 1955 0 yerine −1). Tablodaki bölgede ve cutoff ÖNCESİNDE ofset, resmî IANA
 * backzone derlemesinden (tzBackzoneOverlay.generated.ts) alınır; cutoff sonrası ve tablo dışı bölgeler Intl yoluyla aynen.
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
 * UTC−4). Ofset, sürümü sabitlenmiş IANA tablosundan (tzIana.generated.ts) alınır: açık geçişler + son geçişten sonra
 * TZif kalıcı kuralı (POSIX TZ "Mm.w.d/saat"; RFC 9636 §3.3). Çözülmüş bölge önbelleğe alınır.
 */
type IanaZone = { t: number[]; o: number[]; rule: TzIanaRule };
const IANA_CACHE = new Map<string, IanaZone>(); // yalnız tablodaki adlar (sınırlı)

function ianaZone(timeZone: string): IanaZone | null {
  const hit = IANA_CACHE.get(timeZone);
  if (hit) return hit;
  const raw = TZ_IANA_ZONES[TZ_IANA_LINKS[timeZone] ?? timeZone];
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

/** Bir UTC anında tz'deki duvar saatinin "naif UTC" ms karşılığı. */
function wallClockMs(utcMs: number, timeZone: string): number {
  const bz = backzoneOffsetMs(utcMs, timeZone);
  if (bz !== null) return utcMs + bz;
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

/**
 * Bir UTC anında tz'deki YEREL duvar saati ("YYYY-MM-DD", "HH:MM:SS") — resolveAstroBirthTime ile AYNI ofset kaynağı (tablodaki
 * bölgede cutoff öncesi backzone, aksi hâlde IANA tablosu; tablo dışı adda Intl). Geçersiz bölge → null. (14.11.2026, ATL-B03: UTC → yerel çevirisi Intl'den
 * alınınca backzone bölgelerinde geri doğrulama tutmuyordu; ör. Europe/Oslo 1965.)
 */
export function wallClockAt(utcMs: number, timeZone: string): { date: string; time: string } | null {
  if (!isValidIanaTimeZone(timeZone) || !Number.isFinite(utcMs)) return null;
  const iso = new Date(wallClockMs(utcMs, timeZone)).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

export function resolveAstroBirthTime(date: string, time: string, timeZone: string, choice: DstChoice = "auto"): AstroTimeResolution {
  if (!isValidIsoDate(date)) return { kind: "invalid", reason: "date" };
  const hms = normalizeTime(time);
  if (!hms) return { kind: "invalid", reason: "time" };
  if (!isValidIanaTimeZone(timeZone)) return { kind: "invalid", reason: "timezone" };

  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, s] = hms.split(":").map(Number);
  const naive = new Date(0);
  naive.setUTCFullYear(y, mo - 1, d);
  naive.setUTCHours(h, mi, s, 0);
  const naiveMs = naive.getTime();

  // Aday ofsetler: ±36 saat içindeki tüm farklı ofsetler (bir geçişin iki yanı).
  const offsets = new Set<number>();
  for (const probe of [-36, -12, 0, 12, 36]) {
    const t = naiveMs + probe * 3_600_000;
    offsets.add(wallClockMs(t, timeZone) - t);
  }
  const valid: { utcMs: number; offset: number }[] = [];
  for (const off of offsets) {
    const utcMs = naiveMs - off;
    if (wallClockMs(utcMs, timeZone) === naiveMs && !valid.some((v) => v.utcMs === utcMs)) {
      valid.push({ utcMs, offset: off });
    }
  }
  if (valid.length === 0) return { kind: "gap" };
  if (valid.length === 1) {
    return { kind: "ok", utcIso: new Date(valid[0].utcMs).toISOString(), offsetSeconds: valid[0].offset / 1000, ambiguousResolved: false };
  }
  // Belirsiz: daha erken UTC anı = ilk yaşanan (daha büyük ofset).
  valid.sort((a, b) => a.utcMs - b.utcMs);
  const earlier = valid[0];
  const later = valid[valid.length - 1];
  if (choice === "earlier" || choice === "later") {
    const pick = choice === "earlier" ? earlier : later;
    return { kind: "ok", utcIso: new Date(pick.utcMs).toISOString(), offsetSeconds: pick.offset / 1000, ambiguousResolved: true };
  }
  return {
    kind: "ambiguous",
    options: [
      { choice: "earlier", utcIso: new Date(earlier.utcMs).toISOString(), offsetSeconds: earlier.offset / 1000 },
      { choice: "later", utcIso: new Date(later.utcMs).toISOString(), offsetSeconds: later.offset / 1000 },
    ],
  };
}

/** Saniye ofseti → sağlayıcının beklediği ondalık saat (6 basamak; LMT kesirleri korunur). */
export function offsetSecondsToDecimalHours(offsetSeconds: number): number {
  return Math.round((offsetSeconds / 3600) * 1e6) / 1e6;
}
