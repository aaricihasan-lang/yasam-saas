// Human Design transit anı — Türkiye yerel saati (Europe/Istanbul, IANA; tarihsel yaz saati dahil) ↔ UTC. SAF.
//
// Dönüşüm mevcut tek kaynaktan: resolveBirthLocalTime (boşluk / çakışma saatleri SESSİZCE seçilmez, reddedilir).

import { resolveBirthLocalTime } from "../api/birthTimeResolution";

export const TRANSIT_TIME_ZONE = "Europe/Istanbul";
/** Desteklenen tarih aralığı (efemeris ve saat dilimi verisinin güvenilir olduğu aralık). */
export const TRANSIT_MIN_DATE = "1900-01-01";
export const TRANSIT_MAX_DATE = "2100-12-31";

export type TransitMoment = {
  /** Yerel (Türkiye) tarih YYYY-MM-DD ve saat HH:MM. */
  localDate: string;
  localTime: string;
  timeZone: typeof TRANSIT_TIME_ZONE;
  utcIso: string;
  /** Yerel saat − UTC (saniye), ör. +10800. */
  offsetSeconds: number;
};

export type TransitMomentResult = { ok: true; moment: TransitMoment } | { ok: false; code: string; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Türkiye yerel tarih + saat (dakika) → UTC an. */
export function resolveTransitMoment(localDate: string, localTime: string): TransitMomentResult {
  if (!DATE_RE.test(localDate)) return { ok: false, code: "INVALID_DATE", error: "Geçerli bir tarih seçin." };
  if (!TIME_RE.test(localTime)) return { ok: false, code: "INVALID_TIME", error: "Geçerli bir saat seçin (SS:DD)." };
  if (localDate < TRANSIT_MIN_DATE || localDate > TRANSIT_MAX_DATE) {
    return { ok: false, code: "DATE_OUT_OF_RANGE", error: "Tarih 01.01.1900 ile 31.12.2100 arasında olmalı." };
  }
  const r = resolveBirthLocalTime(localDate, localTime, TRANSIT_TIME_ZONE);
  if (r.kind === "invalid") return { ok: false, code: r.reason === "date" ? "INVALID_DATE" : "INVALID_TIME", error: "Geçerli bir tarih ve saat seçin." };
  if (r.kind === "gap") return { ok: false, code: "LOCAL_TIME_GAP", error: "Bu yerel saat, yaz saati geçişi nedeniyle Türkiye'de hiç yaşanmadı. Bir saat sonrasını seçin." };
  if (r.kind === "ambiguous") return { ok: false, code: "LOCAL_TIME_AMBIGUOUS", error: "Bu yerel saat, yaz saati geçişi nedeniyle Türkiye'de iki kez yaşandı. Bir saat öncesini ya da sonrasını seçin." };
  return { ok: true, moment: { localDate, localTime, timeZone: TRANSIT_TIME_ZONE, utcIso: r.utcIso, offsetSeconds: r.offsetSeconds } };
}

/** Verilen UTC anının Türkiye yerel tarih/saati (dakikaya yuvarlanmadan, kesilerek). */
export function istanbulLocalParts(at: Date): { localDate: string; localTime: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TRANSIT_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00";
  return { localDate: `${get("year")}-${get("month")}-${get("day")}`, localTime: `${get("hour")}:${get("minute")}` };
}

/** "Şimdi" (Türkiye saati, dakika). */
export function nowTransitMoment(now: Date = new Date()): TransitMomentResult {
  const { localDate, localTime } = istanbulLocalParts(now);
  return resolveTransitMoment(localDate, localTime);
}

/** UTC ofseti etiketi: +10800 → "UTC+03:00". */
export function utcOffsetLabel(seconds: number): string {
  const sign = seconds < 0 ? "−" : "+";
  const abs = Math.abs(seconds);
  return `UTC${sign}${String(Math.floor(abs / 3600)).padStart(2, "0")}:${String(Math.floor((abs % 3600) / 60)).padStart(2, "0")}`;
}
