// Astroloji — yerel doğum zamanı → UTC (SAF; Intl/IANA tzdata). Human Design'dan BAĞIMSIZ
// uygulama (aynı ilke: sessiz tahmin YOK).
//
//   • gap       — yerel saat o gün hiç yaşanmamış (ileri alma) → hesap YOK (kullanıcı saati düzeltmeli).
//   • ambiguous — yerel saat iki kez yaşanmış (geri alma):
//                   dst_choice=auto    → REDDEDİLİR, iki seçenek döner (uzman açıkça seçer),
//                   dst_choice=earlier → ilk yaşanan an (daha büyük UTC ofseti; genelde yaz saati),
//                   dst_choice=later   → ikinci yaşanan an (daha küçük ofset; genelde kış saati).
//   • ok        — tek geçerli an (saniye hassasiyeti; LMT dahil tarihsel ofsetler korunur).

import { TZ_BACKZONE_OVERLAY } from "./tzBackzoneOverlay.generated";
import { germanLegalTimeLocation, inGermanLegalTimeWindow, type GermanLegalTimeClass } from "./germanLegalTime";

/**
 * Doğum anı çözümleme METODOLOJİ sürümü. 1 = IANA (Intl) + #471 backzone tablosu; 2 = + ATL-P2-07 Alman yasal saati tablosu
 * (1893-04-01 → devir arası kesin Alman yönetimindeki, bugün başka IANA bölgesindeki şehirler → Europe/Berlin kuralları).
 */
export const ASTRO_TIME_METHOD_VERSION = 2;

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

/** 1893-04-01T00:00:00Z: Europe/Berlin (Intl) bu andan önce 23:06:32Z'ye kadar Berlin LMT verir; yasa 23:00:00Z'de yürürlükte. */
const BERLIN_INTL_MEZ_SAFE_MS = Date.UTC(1893, 3, 1);

/**
 * Bir UTC anında tz'deki duvar saatinin "naif UTC" ms karşılığı. `de`: konum ATL-P2-07 Alman yasal saati tablosundaysa sınıfı —
 * kesin aralıktaki anlarda duvar saati Alman yasal saatidir (Europe/Berlin kuralları; ilk 6,5 dk sabit MEZ).
 */
function wallClockMs(utcMs: number, timeZone: string, de: GermanLegalTimeClass | null = null): number {
  if (de && inGermanLegalTimeWindow(de, utcMs)) {
    return utcMs < BERLIN_INTL_MEZ_SAFE_MS ? utcMs + 3_600_000 : intlWallClockMs(utcMs, "Europe/Berlin");
  }
  const bz = backzoneOffsetMs(utcMs, timeZone);
  if (bz !== null) return utcMs + bz;
  return intlWallClockMs(utcMs, timeZone);
}

function intlWallClockMs(utcMs: number, timeZone: string): number {
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
 * `locationId` (isteğe bağlı): doğum yeri konum kimliği (GeoNames "gn-…"). Yalnız ATL-P2-07 tablosundaki kimlik + beklenen IANA
 * bölgesi birlikte eşleşirse kesin Alman yönetimi aralığında Alman yasal saati uygulanır; diğer her girdide davranış AYNEN.
 */
export function resolveAstroBirthTime(date: string, time: string, timeZone: string, choice: DstChoice = "auto", locationId?: string | null): AstroTimeResolution {
  if (!isValidIsoDate(date)) return { kind: "invalid", reason: "date" };
  const hms = normalizeTime(time);
  if (!hms) return { kind: "invalid", reason: "time" };
  if (!isValidIanaTimeZone(timeZone)) return { kind: "invalid", reason: "timezone" };
  const de = germanLegalTimeLocation(locationId, timeZone)?.cls ?? null;

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
    offsets.add(wallClockMs(t, timeZone, de) - t);
  }
  const valid: { utcMs: number; offset: number }[] = [];
  for (const off of offsets) {
    const utcMs = naiveMs - off;
    if (wallClockMs(utcMs, timeZone, de) === naiveMs && !valid.some((v) => v.utcMs === utcMs)) {
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
