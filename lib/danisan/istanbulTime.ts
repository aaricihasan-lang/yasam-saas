/**
 * lib/danisan/istanbulTime.ts — Danışan Yolculuğu için canonical Europe/Istanbul
 * tarih/ay-sınırı primitifleri (server-side deterministik).
 *
 * NEDEN: Ay sınırları ("Bu Ay …") ve "bugün" (ödev gecikmesi) eskiden tarayıcının
 * YEREL saat dilimine / Vercel runtime UTC'sine bağlıydı → yanlış ay/gün kovası.
 * Türkiye kullanımı için canonical zaman Europe/Istanbul'dur.
 *
 * TASARIM: Yeni bağımlılık YOK. `Intl.DateTimeFormat` (DST-güvenli) + mevcut
 * lib/location/tz.ts `getTimeZoneOffsetMinutes` deseni kullanılır. Istanbul 2016'dan
 * beri sabit UTC+3 (DST yok) olduğundan sonuç deterministiktir; helper yine de
 * genel/DST-güvenli yazıldı.
 */
import { getTimeZoneOffsetMinutes } from "@/lib/location/tz";

const IST_TZ = "Europe/Istanbul";

/** Bir anın Istanbul takvim parçaları (yıl/ay[1-12]/gün). */
function istanbulParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  return { year: Number(m.year), month: Number(m.month), day: Number(m.day) };
}

/** Şu anki mutlak an. (Instant — saat diliminden bağımsızdır; karşılaştırma için.) */
export function istanbulNow(): Date {
  return new Date();
}

/** Istanbul takvim günü "YYYY-MM-DD" (ör. ödev end_date karşılaştırması için). */
export function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(new Date());
}

/** Bir Istanbul duvar-saatini (Y/M0/D 00:00) o an geçerli UTC anına çevirir (DST-güvenli). */
function istanbulMidnightToUtc(year: number, month0: number, day: number): Date {
  const wallAsUtc = Date.UTC(year, month0, day, 0, 0, 0);
  const off1 = getTimeZoneOffsetMinutes(new Date(wallAsUtc), IST_TZ);
  let utc = wallAsUtc - off1 * 60000;
  const off2 = getTimeZoneOffsetMinutes(new Date(utc), IST_TZ);
  if (off2 !== off1) utc = wallAsUtc - off2 * 60000;
  return new Date(utc);
}

/**
 * İçinde `ref` bulunan Istanbul ayının [ay başı, sonraki ay başı) yarı-açık UTC
 * aralığı — ISO string olarak. timestamptz kolonlarında `gte(monthStart)`,
 * `lt(monthEnd)` ile kullanılır.
 */
export function istanbulMonthRange(ref: Date = new Date()): {
  monthStart: string;
  monthEnd: string;
} {
  const { year, month } = istanbulParts(ref); // month: 1-12
  const start = istanbulMidnightToUtc(year, month - 1, 1);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth0 = month === 12 ? 0 : month; // sonraki ayın 0-tabanlı indeksi
  const end = istanbulMidnightToUtc(nextYear, nextMonth0, 1);
  return { monthStart: start.toISOString(), monthEnd: end.toISOString() };
}
