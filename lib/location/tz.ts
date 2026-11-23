/**
 * lib/location/tz.ts — IANA saat dilimi tabanlı güvenli tarih/saat gösterim helper'ları (FAZ 5 / P5a).
 *
 * Saf, yan-etkisiz yardımcılar. Global şehir desteği için astronomik motorların ürettiği UTC anlarını, seçili
 * konumun IANA saat dilimine göre yerel saate çevirir (ve tersini yapar).
 *
 * KZM-TZ-01 (18.11.2026): ofset ve duvar saati artık çalışma ortamının Intl/ICU verisinden DEĞİL, ortak sürümü
 * sabitlenmiş IANA çekirdeğinden (lib/time/tzdb/core — Atlas #811, HD #818 ile aynı kaynak; 1970 öncesi ortak
 * backzone politikası) gelir. Sunucu (Node 24.15 = tz 2026a) ve eski tarayıcılar Havana / Winnipeg / Vancouver /
 * Edmonton / Casablanca / El Aaiún'da 1 saat yanlış ofset veriyordu → seçili saatin gezegen saati yanlış UTC anından
 * hesaplanıyor, gün pencereleri ve gösterilen saatler kayıyordu. Tabloda olmayan ad → Intl (eski yol, aynen).
 *
 * Bu dosya bir MOTOR DEĞİLDİR ve hiçbir motoru/UI'ı/DB'yi okumaz/etkilemez. Astronomik hesap değişmez.
 *
 * Türkiye regresyonu: `Europe/Istanbul` 2016'dan beri sabit UTC+3 (DST yok) → sonuçlar eskisiyle birebir aynı.
 */

import { isTableZone, localTimeCandidates, wallClockMs } from "../time/tzdb/core";

/** Bir IANA saat dilimi kimliğinin geçerli olup olmadığını döndürür (sabit IANA tablosundaki ad ya da Intl'in tanıdığı ad). */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
  if (isTableZone(timeZone)) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Geçerli tz döndürür; geçersizse "UTC"ye düşer (üretimde çökme önlenir). */
function safeZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

/** UTC anında tz'deki duvar saati, "yerel saat UTC gibi okunmuş" ms olarak (saniyeye kesilir; Intl yolu gibi). */
function wallMs(utcMs: number, timeZone: string): number {
  if (!Number.isFinite(utcMs)) throw new RangeError("Invalid time value"); // eski Intl.formatToParts davranışı
  return wallClockMs(utcMs, safeZone(timeZone));
}

/** Bir tarihin verilen saat diliminde takvim parçaları (locale-bağımsız, h23). */
function zonedParts(date: Date, timeZone: string): {
  year: string; month: string; day: string; hour: string; minute: string; second: string;
} {
  const d = new Date(wallMs(date.getTime(), timeZone));
  const p2 = (n: number) => String(n).padStart(2, "0");
  return {
    year: String(d.getUTCFullYear()).padStart(4, "0"), month: p2(d.getUTCMonth() + 1), day: p2(d.getUTCDate()),
    hour: p2(d.getUTCHours()), minute: p2(d.getUTCMinutes()), second: p2(d.getUTCSeconds()),
  };
}

/** Bir UTC anını, verilen saat diliminde "HH:mm" (24 saat) olarak döndürür. */
export function formatInTimeZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Bir UTC anını, verilen saat diliminde "YYYY-MM-DD HH:mm" olarak döndürür. */
export function formatDateTimeInTimeZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/**
 * Verilen tarihte, saat diliminin UTC'ye göre ofsetini DAKİKA cinsinden döndürür.
 * DST'ye duyarlıdır (aynı tz farklı tarihlerde farklı değer verebilir).
 * Örn. Europe/Istanbul → +180; Europe/Berlin kış → +60, yaz → +120;
 *      America/New_York kış → -300, yaz → -240; Asia/Tokyo → +540.
 */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const t = date.getTime();
  const sec = Math.floor(t / 1000) * 1000; // duvar saati saniyeye kesildiği için fark da saniye tabanında alınır
  return Math.round((wallMs(t, timeZone) - sec) / 60000);
}

/**
 * Yerel duvar saati (naif ms) → UTC ms. Tek anlamlı saatte o an. DST/geçiş durumlarında sessiz ve yöne bağlı seçim
 * YAPILMAZ (eski iki geçişli çözüm boşlukta batı bölgelerinde 1 saat geri, doğu bölgelerinde 1 saat ileri gidiyor; çakışmada
 * batıda ilk, doğuda — Berlin, Londra, Kahire, Beyrut, Gazze — ikinci anı seçiyordu):
 *   - çakışma (saat iki kez yaşandı): ilk (erken) an;
 *   - boşluk (saat hiç yaşanmadı): geçişten ÖNCEKİ ofsetle yorumlanır (RFC 5545 §3.3.5; Temporal "compatible") →
 *     boşluğun uzunluğu kadar ileri (ör. New York 02:30 → 03:30 EDT).
 */
function zonedWallToUtcMs(naiveMs: number, timeZone: string): number {
  const c = localTimeCandidates(naiveMs, timeZone);
  if (c.length) return c[0].utcMs;
  const before = wallClockMs(naiveMs - 36 * 3_600_000, timeZone) - (naiveMs - 36 * 3_600_000); // geçiş öncesi ofset (ms)
  return naiveMs - before;
}

/**
 * Yerel takvim gününün (naif 00:00) İLK anı: gece yarısı yaşandıysa ilk gerçekleşmesi; gece yarısı bir boşluğa
 * düşüyorsa (Havana, Santiago, Kahire, Beyrut… geçişleri 00:00/24:00'da) yerel saatin o güne geçtiği
 * geçiş anı. Eski çözüm bu günlerde pencereyi önceki günün son saatinden başlatıyordu (1 saat erken).
 */
function zonedDayStartMs(naiveMidnightMs: number, timeZone: string): number {
  const c = localTimeCandidates(naiveMidnightMs, timeZone);
  if (c.length) return c[0].utcMs;
  // Boşluk: duvar saati < gece yarısı olan son an ile ≥ gece yarısı olan ilk an arasındaki geçiş (saniye çözünürlüğü).
  let lo = naiveMidnightMs - 36 * 3_600_000; // duvar < gece yarısı
  let hi = naiveMidnightMs + 36 * 3_600_000; // duvar ≥ gece yarısı
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
    if (wallClockMs(mid, timeZone) >= naiveMidnightMs) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Bir IANA saat dilimindeki DUVAR SAATİNİ (y, m0 0-11, d, hh, mm) mutlak ana (Date, UTC) çevirir.
 * Tarayıcı saat dilimi hesaba GİRMEZ (Kozmik G2). Çakışma → ilk an; boşluk → geçiş öncesi ofsetle (yukarıya bkz.).
 * Durumu göstermek isteyen çağıran `zonedWallTimeKind` kullanır.
 */
export function zonedWallTimeToUtc(
  year: number, month0: number, day: number, hour: number, minute: number, timeZone: string,
): Date {
  return new Date(zonedWallToUtcMs(Date.UTC(year, month0, day, hour, minute, 0), safeZone(timeZone)));
}

/** Yerel duvar saatinin durumu: "ok" (tek an) · "overlap" (iki kez yaşandı; ilk an kullanılır) · "gap" (hiç yaşanmadı). */
export function zonedWallTimeKind(
  year: number, month0: number, day: number, hour: number, minute: number, timeZone: string,
): "ok" | "overlap" | "gap" {
  const n = localTimeCandidates(Date.UTC(year, month0, day, hour, minute, 0), safeZone(timeZone)).length;
  return n === 0 ? "gap" : n > 1 ? "overlap" : "ok";
}

/**
 * Bir takvim gününün (Y/M/D), verilen IANA saat diliminde [gün başı, ertesi gün başı) yarı-açık UTC aralığı.
 * Astronomik motor UTC/instant'ta çalışır; bu yalnız "hangi yerel güne ait" penceresini üretir. Global selectedDate
 * semantiği DEĞİŞMEZ — çağıran yalnız Y/M/D geçirir; tarayıcı saat dilimi sonucu etkilemez.
 *
 * DST doğruluğu: her sınır kendi ofsetiyle bağımsız çözüldüğünden yerel gün 23s (ilkbahar) / 24s / 25s (sonbahar)
 * olabilir ve pencere buna uyar. Gece yarısı boşluğa düşen günde gün başı = geçiş anı. Ardışık günlerin pencereleri
 * örtüşmez/boşluk bırakmaz (bir günün end'i = ertesinin start'ı).
 */
export function getZonedDayRange(
  year: number, month0: number, day: number, timeZone: string,
): { start: Date; end: Date } {
  const tz = safeZone(timeZone);
  const startMs = zonedDayStartMs(Date.UTC(year, month0, day), tz);
  // Ertesi takvim günü — ay/yıl taşmasında güvenli (Date.UTC normalize eder).
  const endMs = zonedDayStartMs(Date.UTC(year, month0, day + 1), tz);
  return { start: new Date(startMs), end: new Date(endMs) };
}
