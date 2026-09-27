/**
 * lib/time/reportTime.ts — Rapor / Word / dosya adı / form varsayılanı için
 * TEK ortak tarih-saat yardımcısı (server + client güvenli, bağımlılıksız).
 *
 * NEDEN: Vercel fonksiyonları UTC'de çalışır. `toLocale*String` timeZone vermeden
 * çağrılınca 10:00 randevu Word'de 07:00, gece 01:22 analiz önceki gün 22:22
 * basılıyordu (FA-02). `toISOString().slice(0,10)` ise 00:00–03:00 arası "dün"
 * üretiyordu (FA-37).
 *
 * KURALLAR:
 *  - timestamptz (an / instant) değerler → hedef saat dilimine ÇEVRİLİR.
 *  - DATE (takvim günü, "YYYY-MM-DD") değerler → ASLA saat dilimiyle kaydırılmaz.
 *  - TEXT tarih alanları (ör. clients.dogum "27.09.2026") → güvenli ayrıştırma;
 *    anlaşılamazsa ham metin/fallback döner, asla exception fırlatmaz.
 *  - Varsayılan saat dilimi Europe/Istanbul; ileride kullanıcı/tenant tercihi
 *    `resolveReportTimeZone` üzerinden tek noktadan bağlanır.
 */

export const DEFAULT_TIME_ZONE = "Europe/Istanbul";
const DEFAULT_LOCALE = "tr-TR";

export type DateStyle = "numeric" | "long" | "weekdayLong";

export type TimeOpts = {
  timeZone?: string;
  locale?: string;
  /** Değer boş/geçersizse döndürülecek metin (varsayılan ""). */
  fallback?: string;
};

type DateInput = string | number | Date | null | undefined;

// ─── Saat dilimi çözümleme ───────────────────────────────────────────────────

const tzValidity = new Map<string, boolean>();

export function isValidTimeZoneName(tz: string): boolean {
  const cached = tzValidity.get(tz);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    ok = true;
  } catch {
    ok = false;
  }
  tzValidity.set(tz, ok);
  return ok;
}

/**
 * Raporda kullanılacak saat dilimi. Öncelik: kullanıcı → tenant → varsayılan.
 * Geçersiz değerler sessizce atlanır (fail-safe).
 */
export function resolveReportTimeZone(ctx?: {
  userTz?: string | null;
  tenantTz?: string | null;
}): string {
  for (const candidate of [ctx?.userTz, ctx?.tenantTz]) {
    if (candidate && typeof candidate === "string" && isValidTimeZoneName(candidate.trim())) {
      return candidate.trim();
    }
  }
  return DEFAULT_TIME_ZONE;
}

function tzOf(opts?: TimeOpts): string {
  const tz = opts?.timeZone;
  return tz && isValidTimeZoneName(tz) ? tz : DEFAULT_TIME_ZONE;
}

// ─── Formatter önbelleği ─────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    fmtCache.set(key, f);
  }
  return f;
}

function dateOptions(style: DateStyle, timeZone: string): Intl.DateTimeFormatOptions {
  if (style === "long") return { timeZone, day: "numeric", month: "long", year: "numeric" };
  if (style === "weekdayLong") return { timeZone, day: "numeric", month: "long", year: "numeric", weekday: "long" };
  return { timeZone, day: "2-digit", month: "2-digit", year: "numeric" };
}

// ─── Ayrıştırma ──────────────────────────────────────────────────────────────

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

type Ymd = { y: number; m: number; d: number };

function validYmd(y: number, m: number, d: number): Ymd | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** "YYYY-MM-DD" mi? (saf takvim günü) */
export function isDateOnlyString(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_RE.test(value.trim());
}

/** Takvim günü ayrıştırır: "YYYY-MM-DD" veya "GG.AA.YYYY" / "GG/AA/YYYY" / "GG-AA-YYYY". */
export function parseCalendarDate(value: unknown): Ymd | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = DATE_ONLY_RE.exec(s);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = DMY_RE.exec(s);
  if (m) return validYmd(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Bir anı (instant) Date'e çevirir; geçersizse null. */
export function toInstant(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Instant (timestamptz) biçimleme ─────────────────────────────────────────

/** Anı hedef saat diliminde tarih olarak biçimler: "27.09.2026" | "27 Eylül 2026". */
export function formatInstantDate(value: DateInput, opts?: TimeOpts & { style?: DateStyle }): string {
  const d = toInstant(value);
  if (!d) return opts?.fallback ?? "";
  return fmt(opts?.locale ?? DEFAULT_LOCALE, dateOptions(opts?.style ?? "numeric", tzOf(opts))).format(d);
}

/** Anı hedef saat diliminde saat olarak biçimler: "01:22". */
export function formatInstantTime(value: DateInput, opts?: TimeOpts): string {
  const d = toInstant(value);
  if (!d) return opts?.fallback ?? "";
  return fmt(opts?.locale ?? DEFAULT_LOCALE, {
    timeZone: tzOf(opts),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** Anı tarih + saat olarak biçimler: "27.09.2026 01:22" (style=long → "27 Eylül 2026 01:22"). */
export function formatInstantDateTime(value: DateInput, opts?: TimeOpts & { style?: DateStyle }): string {
  const d = toInstant(value);
  if (!d) return opts?.fallback ?? "";
  return `${formatInstantDate(d, opts)} ${formatInstantTime(d, opts)}`;
}

/** Anın hedef saat dilimindeki takvim günü: "YYYY-MM-DD" (gruplama / aralık filtresi için). */
export function zonedDayKey(value: DateInput, opts?: TimeOpts): string {
  const d = toInstant(value);
  if (!d) return opts?.fallback ?? "";
  return fmt("en-CA", { timeZone: tzOf(opts), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// ─── Takvim günü (DATE) biçimleme — ASLA kaydırılmaz ─────────────────────────

/** Saf takvim gününü biçimler; saat dilimi dönüşümü YAPILMAZ. */
export function formatDateOnly(value: unknown, opts?: Omit<TimeOpts, "timeZone"> & { style?: DateStyle }): string {
  const ymd = parseCalendarDate(value);
  if (!ymd) return opts?.fallback ?? "";
  // UTC öğlen + timeZone UTC → hiçbir saat diliminde gün kaymaz.
  const noon = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12));
  return fmt(opts?.locale ?? DEFAULT_LOCALE, dateOptions(opts?.style ?? "numeric", "UTC")).format(noon);
}

/**
 * Karışık alanlar için (ör. `session_date || created_at`, TEXT tarih kolonları):
 *  - takvim günü ("YYYY-MM-DD", "GG.AA.YYYY") → formatDateOnly (kaydırmasız)
 *  - ISO an ("…T…Z", "+00:00") → formatInstantDate (hedef saat dilimi)
 *  - anlaşılamayan metin → ham metin (kırpılmış) — veri kaybolmaz, crash olmaz.
 */
export function formatDateLoose(value: unknown, opts?: TimeOpts & { style?: DateStyle }): string {
  if (value === null || value === undefined) return opts?.fallback ?? "";
  if (value instanceof Date || typeof value === "number") return formatInstantDate(value, opts);
  const s = String(value).trim();
  if (!s) return opts?.fallback ?? "";
  if (parseCalendarDate(s)) return formatDateOnly(s, opts);
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) {
    const out = formatInstantDate(s, opts);
    if (out) return out;
  }
  return s;
}

/** Karışık alanın takvim anahtarı ("YYYY-MM-DD"); takvim günü kaydırılmaz, an çevrilir. */
export function looseDayKey(value: unknown, opts?: TimeOpts): string {
  if (value === null || value === undefined) return opts?.fallback ?? "";
  if (typeof value === "string") {
    const ymd = parseCalendarDate(value);
    if (ymd) return `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`;
  }
  return zonedDayKey(value as DateInput, opts);
}

// ─── "Bugün" / dosya adı / rapor tarihi ──────────────────────────────────────

/** Hedef saat dilimindeki bugün: "YYYY-MM-DD" (form varsayılanları, gecikme kontrolü). */
export function todayInZone(opts?: TimeOpts, now: Date = new Date()): string {
  return zonedDayKey(now, opts);
}

/** Dosya adı için tarih damgası: "YYYY-MM-DD" (yerel gün). */
export function reportFileDate(opts?: TimeOpts, now: Date = new Date()): string {
  return zonedDayKey(now, opts);
}

/** Kapak / "Rapor tarihi" etiketi: "27 Eylül 2026". */
export function reportGeneratedLabel(opts?: TimeOpts & { style?: DateStyle }, now: Date = new Date()): string {
  return formatInstantDate(now, { ...opts, style: opts?.style ?? "long" });
}

/** İki takvim günü arasındaki gün farkı (b - a); geçersizse null. */
export function calendarDayDiff(a: string, b: string): number | null {
  const pa = parseCalendarDate(a);
  const pb = parseCalendarDate(b);
  if (!pa || !pb) return null;
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((tb - ta) / 86_400_000);
}
