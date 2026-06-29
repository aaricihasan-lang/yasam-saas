// FAZ 0 — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// Yerel doğum zamanı -> UTC dönüşümü (iskelet).

import type { HdBirthInput } from "./types";

/**
 * Verilen IANA timezone'da, belirtilen UTC anına denk gelen yerel duvar saati
 * ile UTC arasındaki ofseti (dakika) hesaplar.
 *
 * Intl.DateTimeFormat'in timeZone desteği, IANA tz veritabanının çalışma
 * anındaki sürümünü kullanır.
 */
function timeZoneOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(utcDate);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };

  // Yerel duvar saatini UTC epoch'a çevirip gerçek UTC ile farkı al.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  return Math.round((asUtc - utcDate.getTime()) / 60000);
}

/**
 * Yerel doğum tarih/saatini, verilen IANA timezone'a göre UTC'ye çevirir.
 *
 * UYARI (kasıtlı sınırlama):
 * Bu fonksiyon HD production hesap doğruluğu için nihai timezone çözümü
 * değildir; ileride IANA/tarihsel DST/LMT doğrulaması yapılmadan production
 * kullanılmayacak.
 *
 * Yöntem: Yerel duvar saatini önce naif UTC kabul eder, o anın tz ofsetini
 * ölçer, ardından DST sınır kayması için bir kez daha düzeltir (iki geçiş).
 */
export function localDateTimeToUtc(input: HdBirthInput): Date {
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    throw new Error(`Geçersiz tarih/saat: "${input.date} ${input.time}"`);
  }

  // 1. geçiş: yerel duvar saatini naif UTC kabul et.
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = timeZoneOffsetMinutes(new Date(naiveUtcMs), input.timezone);

  // 2. geçiş: ofseti uygulayıp DST sınırındaki kaymayı düzelt.
  const candidateMs = naiveUtcMs - offset1 * 60000;
  const offset2 = timeZoneOffsetMinutes(new Date(candidateMs), input.timezone);

  return new Date(naiveUtcMs - offset2 * 60000);
}
