// Human Design transit anı — yerel tarih + saat + IANA saat dilimi ↔ UTC. SAF (sunucu ve tarayıcıda aynı kod).
//
// Dönüşüm mevcut tek kaynaktan: resolveBirthLocalTime (Intl / IANA tzdata; tarihsel yaz/kış saati ve yerel ortalama
// saat dahil). Boşluk (hiç yaşanmamış yerel saat) REDDEDİLİR; çakışma (iki kez yaşanmış saat) SESSİZCE seçilmez —
// kullanıcı iki olası UTC ofsetinden birini AÇIKÇA seçerse (chosenOffsetSeconds) o an kullanılır.
// Varsayılan saat dilimi Europe/Istanbul: saat dilimi verilmeyen her eski çağrı birebir eski davranışı korur.
// Astronomik motor değişmez: şehir / saat dilimi yalnız UTC anını belirler.

import { isValidIanaTimeZone, resolveBirthLocalTime } from "../api/birthTimeResolution";

export const TRANSIT_TIME_ZONE = "Europe/Istanbul";
/** Desteklenen tarih aralığı (efemeris ve saat dilimi verisinin güvenilir olduğu aralık). */
export const TRANSIT_MIN_DATE = "1900-01-01";
export const TRANSIT_MAX_DATE = "2100-12-31";
const TZ_MAX_LENGTH = 64;
/** Dünyadaki UTC ofsetleri −12 … +14 saat aralığındadır (yerel ortalama saat dahil, güvenli üst sınır). */
const OFFSET_LIMIT_SECONDS = 15 * 3600;

export type TransitMoment = {
  /** Seçilen saat dilimindeki yerel tarih YYYY-MM-DD ve saat HH:MM. */
  localDate: string;
  localTime: string;
  /** IANA saat dilimi (ör. Europe/Istanbul, Europe/London). */
  timeZone: string;
  utcIso: string;
  /** Yerel saat − UTC (saniye), ör. +10800. Sorgu tarihine göre (tarihsel yaz/kış saati dahil). */
  offsetSeconds: number;
};

export type TransitMomentResult =
  | { ok: true; moment: TransitMoment }
  /** offsetsSeconds: yalnız LOCAL_TIME_AMBIGUOUS — kullanıcının seçebileceği iki geçerli UTC ofseti. */
  | { ok: false; code: string; error: string; offsetsSeconds?: number[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Sunucu ve tarayıcı için tek IANA saat dilimi denetimi (biçim + uzunluk + çalışma zamanı tzdata). */
export function isTransitTimeZone(tz: unknown): tz is string {
  return typeof tz === "string" && tz.length > 0 && tz.length <= TZ_MAX_LENGTH && isValidIanaTimeZone(tz);
}

/** Hata metinlerinde bölge: Türkiye için "Türkiye'de", diğerleri için "<IANA> saat diliminde". */
const zoneWhere = (tz: string) => (tz === TRANSIT_TIME_ZONE ? "Türkiye'de" : `${tz} saat diliminde`);

/**
 * Yerel tarih + saat (dakika) + IANA saat dilimi → UTC an. Saat dilimi verilmezse Türkiye (Europe/Istanbul).
 * `chosenOffsetSeconds`: YALNIZ iki kez yaşanmış yerel saatte, kullanıcının seçtiği ofset; geçerli ofsetlerden biri değilse
 * reddedilir. Çakışma olmayan saatte gönderilen ofset hesaplanan ofsetle aynı değilse yine reddedilir (körü körüne kabul yok).
 */
export function resolveTransitMoment(localDate: string, localTime: string, timeZone: string = TRANSIT_TIME_ZONE, chosenOffsetSeconds?: number | null): TransitMomentResult {
  if (!isTransitTimeZone(timeZone)) return { ok: false, code: "INVALID_TIMEZONE", error: "Geçerli bir saat dilimi seçin." };
  if (!DATE_RE.test(localDate)) return { ok: false, code: "INVALID_DATE", error: "Geçerli bir tarih seçin." };
  if (!TIME_RE.test(localTime)) return { ok: false, code: "INVALID_TIME", error: "Geçerli bir saat seçin (SS:DD)." };
  if (localDate < TRANSIT_MIN_DATE || localDate > TRANSIT_MAX_DATE) {
    return { ok: false, code: "DATE_OUT_OF_RANGE", error: "Tarih 01.01.1900 ile 31.12.2100 arasında olmalı." };
  }
  if (chosenOffsetSeconds !== undefined && chosenOffsetSeconds !== null && (!Number.isInteger(chosenOffsetSeconds) || Math.abs(chosenOffsetSeconds) > OFFSET_LIMIT_SECONDS)) {
    return { ok: false, code: "INVALID_OFFSET", error: "Geçersiz UTC ofseti." };
  }
  const r = resolveBirthLocalTime(localDate, localTime, timeZone);
  if (r.kind === "invalid") {
    return r.reason === "timezone"
      ? { ok: false, code: "INVALID_TIMEZONE", error: "Geçerli bir saat dilimi seçin." }
      : { ok: false, code: r.reason === "date" ? "INVALID_DATE" : "INVALID_TIME", error: "Geçerli bir tarih ve saat seçin." };
  }
  if (r.kind === "gap") {
    return { ok: false, code: "LOCAL_TIME_GAP", error: `Bu yerel saat, yaz saati geçişi nedeniyle ${zoneWhere(timeZone)} hiç yaşanmadı. Bir saat sonrasını seçin.` };
  }
  const has = chosenOffsetSeconds !== undefined && chosenOffsetSeconds !== null;
  if (r.kind === "ambiguous") {
    if (!has || !r.offsetsSeconds.includes(chosenOffsetSeconds)) {
      return {
        ok: false,
        code: has ? "INVALID_OFFSET" : "LOCAL_TIME_AMBIGUOUS",
        error: `Bu yerel saat, yaz saati geçişi nedeniyle ${zoneWhere(timeZone)} iki kez yaşandı. Hangi anı kastettiğinizi seçin.`,
        offsetsSeconds: r.offsetsSeconds,
      };
    }
    const [y, mo, d] = localDate.split("-").map(Number);
    const [h, mi] = localTime.split(":").map(Number);
    const naive = new Date(0);
    naive.setUTCFullYear(y, mo - 1, d);
    naive.setUTCHours(h, mi, 0, 0);
    const utcIso = new Date(naive.getTime() - chosenOffsetSeconds * 1000).toISOString();
    return { ok: true, moment: { localDate, localTime, timeZone, utcIso, offsetSeconds: chosenOffsetSeconds } };
  }
  if (has && chosenOffsetSeconds !== r.offsetSeconds) {
    return { ok: false, code: "INVALID_OFFSET", error: "Seçilen UTC ofseti bu tarih ve saat dilimiyle uyuşmuyor." };
  }
  return { ok: true, moment: { localDate, localTime, timeZone, utcIso: r.utcIso, offsetSeconds: r.offsetSeconds } };
}

/** Verilen UTC anının seçilen saat dilimindeki yerel tarih/saati (dakikaya yuvarlanmadan, kesilerek). */
export function localParts(at: Date, timeZone: string = TRANSIT_TIME_ZONE): { localDate: string; localTime: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
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

/** Verilen UTC anının Türkiye yerel tarih/saati (geriye uyumlu ad). */
export function istanbulLocalParts(at: Date): { localDate: string; localTime: string } {
  return localParts(at, TRANSIT_TIME_ZONE);
}

/** "Şimdi" — seçilen saat dilimindeki gerçek güncel tarih/saat (dakika). Varsayılan Türkiye. */
export function nowTransitMoment(now: Date = new Date(), timeZone: string = TRANSIT_TIME_ZONE): TransitMomentResult {
  if (!isTransitTimeZone(timeZone)) return { ok: false, code: "INVALID_TIMEZONE", error: "Geçerli bir saat dilimi seçin." };
  const { localDate, localTime } = localParts(now, timeZone);
  const r = resolveTransitMoment(localDate, localTime, timeZone);
  // "Şimdi" iki kez yaşanan saatteyse gerçek an bellidir: o anın kendi ofseti seçilir (tahmin değil, ölçüm).
  if (!r.ok && r.code === "LOCAL_TIME_AMBIGUOUS" && r.offsetsSeconds) {
    const minute = Math.floor(now.getTime() / 60_000) * 60_000;
    for (const off of r.offsetsSeconds) {
      const c = resolveTransitMoment(localDate, localTime, timeZone, off);
      if (c.ok && Date.parse(c.moment.utcIso) === minute) return c;
    }
  }
  return r;
}

/** UTC ofseti etiketi: +10800 → "UTC+03:00". */
export function utcOffsetLabel(seconds: number): string {
  const sign = seconds < 0 ? "−" : "+";
  const abs = Math.abs(seconds);
  return `UTC${sign}${String(Math.floor(abs / 3600)).padStart(2, "0")}:${String(Math.floor((abs % 3600) / 60)).padStart(2, "0")}`;
}
