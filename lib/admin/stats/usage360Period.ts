/**
 * USAGE360 2C — Admin 360 dönem yardımcıları (saf; istemci + sunucu).
 *
 * Tüm günler TÜRKİYE takvim günüdür (IANA Europe/Istanbul; sabit +03 YOK). Presetler
 * "bugün dahil son N takvim günü" anlamındadır: 7 Gün = bugün + önceki 6 gün.
 * Aralık sınırları: detay ≤ 366 gün, zaman çizelgesi ≤ 90 gün (RPC'ler de sınırlar).
 */
import { getZonedDayRange } from "@/lib/location/tz";

export const USAGE360_TZ = "Europe/Istanbul";
export const DETAIL_MAX_DAYS = 366;
export const TIMELINE_MAX_DAYS = 90;

export type Usage360Preset = "today" | "yesterday" | "7" | "30" | "90" | "custom";

export type Usage360Period = {
  preset: Usage360Preset;
  from: string | null; // YYYY-MM-DD (TR)
  to: string | null;
  days: number | null;
  invalid: boolean;
};

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYmd(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = YMD_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Verilen andaki Türkiye takvim günü (YYYY-MM-DD). */
export function trDayOf(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: USAGE360_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
}

/** Takvim günü aritmetiği (saat dilimi bağımsız; yalnız tarih). */
export function addDaysYmd(ymd: string, n: number): string {
  const m = YMD_RE.exec(ymd);
  if (!m) throw new Error("geçersiz tarih");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

export function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function presetUsage360Period(preset: Exclude<Usage360Preset, "custom">, nowMs: number): Usage360Period {
  const today = trDayOf(nowMs);
  if (preset === "today") return { preset, from: today, to: today, days: 1, invalid: false };
  if (preset === "yesterday") {
    const y = addDaysYmd(today, -1);
    return { preset, from: y, to: y, days: 1, invalid: false };
  }
  const n = Number(preset);
  return { preset, from: addDaysYmd(today, -(n - 1)), to: today, days: n, invalid: false };
}

export function customUsage360Period(from: string, to: string): Usage360Period {
  const ok = isYmd(from) && isYmd(to) && from <= to && daysInclusive(from, to) <= DETAIL_MAX_DAYS;
  return ok
    ? { preset: "custom", from, to, days: daysInclusive(from, to), invalid: false }
    : { preset: "custom", from: null, to: null, days: null, invalid: true };
}

export type YmdRangeResult = { ok: true; from: string; to: string; days: number } | { ok: false; error: string };

/** Sunucu doğrulaması: from/to TR takvim günleri; from ≤ to; en fazla maxDays gün. */
export function parseYmdRange(from: string | null, to: string | null, maxDays: number): YmdRangeResult {
  if (!isYmd(from) || !isYmd(to)) return { ok: false, error: "Geçersiz tarih (YYYY-MM-DD bekleniyor)." };
  if (from > to) return { ok: false, error: "Geçersiz tarih aralığı: başlangıç bitişten sonra olamaz." };
  const days = daysInclusive(from, to);
  if (days > maxDays) return { ok: false, error: `Tarih aralığı en fazla ${maxDays} gün olabilir.` };
  return { ok: true, from, to, days };
}

/** TR takvim günü aralığının UTC anları: [from 00:00 TR, to+1 00:00 TR). */
export function ymdRangeToInstants(from: string, to: string): { fromIso: string; toIso: string } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return {
    fromIso: getZonedDayRange(fy, fm - 1, fd, USAGE360_TZ).start.toISOString(),
    toIso: getZonedDayRange(ty, tm - 1, td, USAGE360_TZ).end.toISOString(),
  };
}

/**
 * Seçili dönemin ölçüm başlangıcına göre kapsamı: "none" (dönem tamamen ölçüm öncesi veya
 * ölçüm hiç başlamadı), "partial" (dönem ölçüm başlangıcından önce başlıyor), "full".
 * "none" iken sayılar 0 GÖSTERİLMEZ → "Ölçülemiyor".
 */
export function usage360Coverage(measurementStart: string | null, from: string, to: string): "none" | "partial" | "full" {
  if (!measurementStart) return "none";
  if (to < measurementStart) return "none";
  if (from < measurementStart) return "partial";
  return "full";
}
