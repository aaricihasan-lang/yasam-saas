// HD — Yerel doğum zamanı → UTC çözümü, DST belirsizlik/boşluk TESPİTİ ile (SAF).
//
// Dahili motorun localDateTimeToUtc'si (değiştirilmedi) DST boşluğu/çakışmasında sessizce
// bir değer seçer. Otomatik hesap hattında bu KABUL EDİLMEZ:
//   • "gap"       — yerel saat o gün hiç yaşanmamış (ileri alma).        → hesap YOK.
//   • "ambiguous" — yerel saat iki kez yaşanmış (geri alma).             → hesap YOK.
//   • "ok"        — tek geçerli UTC anı (saniye hassasiyetli; LMT dahil).
// Intl (IANA tzdata) kullanılır; yaklaşık/dakika yuvarlaması yapılmaz.

export type BirthTimeResolution =
  | { kind: "ok"; utcIso: string; offsetSeconds: number }
  | { kind: "gap" }
  | { kind: "ambiguous"; offsetsSeconds: number[] }
  | { kind: "invalid"; reason: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Bir UTC anında, tz'deki duvar saatinin UTC epoch karşılığı (ms) — ofseti verir. */
function wallClockMs(utcMs: number, timeZone: string): number {
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

/** HH:mm veya HH:mm:ss → HH:mm:ss (Roxy biçimi). Geçersizse null. */
export function toHms(time: string): string | null {
  const m = TIME_RE.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}:${m[2]}:${String(s).padStart(2, "0")}`;
}

export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$|^UTC$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveBirthLocalTime(date: string, time: string, timeZone: string): BirthTimeResolution {
  const dm = DATE_RE.exec(date);
  if (!dm) return { kind: "invalid", reason: "date" };
  const hms = toHms(time);
  if (!hms) return { kind: "invalid", reason: "time" };
  if (!isValidIanaTimeZone(timeZone)) return { kind: "invalid", reason: "timezone" };

  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi, s] = hms.split(":").map(Number);
  const naive = new Date(0);
  naive.setUTCFullYear(y, mo - 1, d);
  naive.setUTCHours(h, mi, s, 0);
  if (naive.getUTCFullYear() !== y || naive.getUTCMonth() !== mo - 1 || naive.getUTCDate() !== d) {
    return { kind: "invalid", reason: "date" };
  }
  const naiveMs = naive.getTime();

  // Aday ofsetler: ±1 gün içindeki tüm farklı ofsetler (bir geçişin iki yanı).
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
  if (valid.length > 1) {
    return { kind: "ambiguous", offsetsSeconds: valid.map((v) => v.offset / 1000).sort((a, b) => a - b) };
  }
  return { kind: "ok", utcIso: new Date(valid[0].utcMs).toISOString(), offsetSeconds: valid[0].offset / 1000 };
}
