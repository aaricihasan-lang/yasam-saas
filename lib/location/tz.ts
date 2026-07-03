/**
 * lib/location/tz.ts — IANA saat dilimi tabanlı güvenli tarih/saat gösterim helper'ları (FAZ 5 / P5a).
 *
 * Saf, yan-etkisiz yardımcılar. `Intl.DateTimeFormat` kullanır → DST (yaz/kış saati)
 * otomatik doğru uygulanır. Global şehir desteği için astronomik motorların ürettiği
 * UTC anlarını, seçili konumun IANA saat dilimine göre yerel saate çevirir.
 *
 * Bu dosya bir MOTOR DEĞİLDİR ve hiçbir motoru/UI'ı/DB'yi okumaz/etkilemez. Astronomik
 * hesap değişmez; yalnızca gösterim katmanı yardımcısıdır.
 *
 * Türkiye regresyonu: `Europe/Istanbul` 2016'dan beri sabit UTC+3 (DST yok) olduğundan
 * bu helper'lar, mevcut UTC+3-sabit gösterimle (lib/cosmic/eclipses.ts `isoTR`) birebir
 * aynı "HH:mm" / tarih sonucunu verir.
 */

/** Bir IANA saat dilimi kimliğinin geçerli olup olmadığını döndürür. */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
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

/** Bir tarihin verilen saat diliminde takvim parçaları (locale-bağımsız, h23). */
function zonedParts(date: Date, timeZone: string): {
  year: string; month: string; day: string; hour: string; minute: string; second: string;
} {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timeZone),
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  // Bazı ortamlarda gece yarısı "24" dönebilir → normalize et.
  if (m.hour === "24") m.hour = "00";
  return {
    year: m.year ?? "1970", month: m.month ?? "01", day: m.day ?? "01",
    hour: m.hour ?? "00", minute: m.minute ?? "00", second: m.second ?? "00",
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
  const p = zonedParts(date, timeZone);
  // Yerel duvar-saatini UTC epoch'u gibi yorumla, gerçek UTC ile farkını al.
  const wallAsUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return Math.round((wallAsUtc - date.getTime()) / 60000);
}
