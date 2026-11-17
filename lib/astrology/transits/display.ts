// Gökyüzü Atlası — İleri Transit: olay anlarının kullanıcı saat diliminde gösterimi (SAF).
// UTC zaman damgası (ms / atUtc) DEĞİŞMEZ; yerel gösterim yalnız ek alandır. Saat dilimi IANA adı olmalıdır (ortak doğrulayıcı).
// DST geçişlerinde ofset o ANIN ofsetidir (ATL-TZ-2026F: sabit IANA tablosu; biçim Intl). Belirsiz/olmayan yerel saat sorunu yoktur: dönüşüm UTC → yerel yöndedir.

import { isValidIanaTimeZone } from "../birth/timeResolution";
import { formatZonedParts } from "../birth/zonedFormat";

export type LocalStamp = { local: string; offset: string; timeZone: string };

const STAMP_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
};

/** UTC ms → yerel "YYYY-MM-DD HH:MM:SS" + "+03:00". Geçersiz saat dilimi → null. */
export function toLocalStamp(ms: number, timeZone: string): LocalStamp | null {
  if (!isValidIanaTimeZone(timeZone) || !Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(formatZonedParts("en-CA", STAMP_OPTS, Math.round(ms / 1000) * 1000, timeZone).map((p) => [p.type, p.value]));
  const off = (parts.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00";
  return { local: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`, offset: off, timeZone };
}

/** Olay listesine yerel gösterim alanı ekler (girdi değişmez). */
export function withLocalTimes<T extends { ms: number }>(events: readonly T[], timeZone: string): (T & { local: LocalStamp | null })[] {
  return events.map((e) => ({ ...e, local: toLocalStamp(e.ms, timeZone) }));
}
