// FAZ 0 — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// Julian Day dönüşümleri (UT tabanlı). Standart Gregoryen takvim formülü.

import type { JulianDay } from "./types";

/**
 * Bir UTC anını Julian Day numarasına çevirir (kesirli gün dahil).
 * Gregoryen takvim varsayılır (modern doğum tarihleri için yeterli).
 */
export function dateToJulianDay(utc: Date): JulianDay {
  const year = utc.getUTCFullYear();
  const month = utc.getUTCMonth() + 1;
  const day = utc.getUTCDate();

  const dayFraction =
    (utc.getUTCHours() +
      utc.getUTCMinutes() / 60 +
      utc.getUTCSeconds() / 3600 +
      utc.getUTCMilliseconds() / 3_600_000) /
    24;

  // Meeus, Astronomical Algorithms — Gregoryen takvim.
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);

  const jd0 =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5;

  return jd0 + dayFraction;
}

/**
 * Julian Day numarasını UTC Date'e çevirir (dateToJulianDay tersi).
 * Doğrulama/smoke amaçlıdır.
 */
export function julianDayToDate(jd: JulianDay): Date {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;

  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const dayWithFraction = b - d - Math.floor(30.6001 * e) + f;
  const day = Math.floor(dayWithFraction);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const fracMs = (dayWithFraction - day) * 86_400_000;

  return new Date(Date.UTC(year, month - 1, day) + fracMs);
}
