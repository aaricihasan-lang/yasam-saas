/**
 * lib/cosmic/planetary-hours.ts
 * Yerel astronomik hesaplama ile gerçek gezegen saatleri.
 * Gün doğumu/batımı NOAA algoritmasıyla hesaplanır.
 * Dış API veya veritabanı kullanılmaz.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// Şimdilik Türkiye/İstanbul koordinatı baz alınır.
// İleride kullanıcı lokasyonuna göre değiştirilecek.
const DEFAULT_LAT = 41.0082;
const DEFAULT_LON = 28.9784;
// Türkiye UTC+3 sabit offset — gelecekte kullanıcı timezone'una göre okunacak
const TZ_OFFSET_MIN = 3 * 60;

// ─── Gezegen tanımları (Keldani sırası: en yavaş → en hızlı) ─────────────────

export type Planet = {
  name: string;
  symbol: string;
  description: string;
};

export const CHALDEAN_PLANETS: ReadonlyArray<Planet> = [
  { name: "Satürn",  symbol: "♄", description: "Disiplin, sabır ve kalıcı çalışmalar için sağlam bir saat." },
  { name: "Jüpiter", symbol: "♃", description: "Büyüme, şans ve bilgelik için bereketli bir saat." },
  { name: "Mars",    symbol: "♂", description: "Cesaret, enerji ve kararlı eylem için güçlü bir saat." },
  { name: "Güneş",   symbol: "☉", description: "Liderlik, güç ve vitalite için parlak bir saat." },
  { name: "Venüs",   symbol: "♀", description: "İlişkiler, uyum ve estetik konularını destekler." },
  { name: "Merkür",  symbol: "☿", description: "İletişim, akıl ve ticari kararlar için keskin bir saat." },
  { name: "Ay",      symbol: "☽", description: "Sezgi, duygular ve içe dönüş için derin bir saat." },
];

// Her haftanın gününün ilk saatinin Keldani dizindeki başlangıç gezegeni
// (0=Paz=Güneş[3], 1=Pzt=Ay[6], 2=Sal=Mars[2], 3=Çar=Merkür[5], 4=Per=Jüpiter[1], 5=Cum=Venüs[4], 6=Cmt=Satürn[0])
const DAY_START_IDX: ReadonlyArray<number> = [3, 6, 2, 5, 1, 4, 0];

// ─── Gün doğumu / batımı hesaplama (NOAA algoritması) ────────────────────────

function toJulianDay(y: number, m: number, d: number): number {
  return (
    367 * y
    - Math.floor((7 * (y + Math.floor((m + 9) / 12))) / 4)
    + Math.floor((275 * m) / 9)
    + d
    + 1721013.5
    + 0.5
  );
}

type SunTimes = { sunrise: Date; sunset: Date };

function calcSunTimes(date: Date, lat: number, lon: number): SunTimes | null {
  // Türkiye yerel tarih
  const localMs   = date.getTime() + TZ_OFFSET_MIN * 60_000;
  const localDate = new Date(localMs);
  const y = localDate.getUTCFullYear();
  const m = localDate.getUTCMonth() + 1;
  const d = localDate.getUTCDate();

  const JD = toJulianDay(y, m, d);
  const T  = (JD - 2451545.0) / 36525; // J2000.0'dan Julian yüzyıllar

  // Güneşin ortalama boylam (derece)
  const L0  = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  // Ortalama anomali
  const M   = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const Mr  = M * DEG;
  // Merkez denklemi
  const C   =
    (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  // Gerçek boylam
  const sunLon = L0 + C;
  // Zodyak düzlem kesişimi
  const omega  = 125.04 - 1934.136 * T;
  // Görünür boylam
  const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  // Ekliptik eğikliği
  const e0 =
    23 +
    (26 +
      (21.448 - T * (46.815 + T * (0.00059 - 0.001813 * T))) / 60) /
      60;
  const e  = e0 + 0.00256 * Math.cos(omega * DEG);
  // Güneş deklinasyonu
  const sinDec = Math.sin(e * DEG) * Math.sin(lambda * DEG);
  const dec    = Math.asin(sinDec);

  // Zaman denklemi (dakika)
  const y2  = Math.tan((e * DEG) / 2) ** 2;
  const ecc = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const L0r = L0 * DEG;
  const EqT =
    4 *
    RAD *
    (y2 * Math.sin(2 * L0r) -
      2 * ecc * Math.sin(Mr) +
      4 * ecc * y2 * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y2 ** 2 * Math.sin(4 * L0r) -
      1.25 * ecc ** 2 * Math.sin(2 * Mr));

  // Güneş öğlesi (UTC'den gece yarısından dakika cinsinden)
  const solarNoon = 720 - 4 * lon - EqT;

  // Gün doğumu/batımı saat açısı (ufuk: 90.833° — standart atmosferik kırılma dahil)
  const cosHA =
    (Math.cos(90.833 * DEG) - Math.sin(lat * DEG) * sinDec) /
    (Math.cos(lat * DEG) * Math.cos(dec));

  // Kutup günü / gecesi
  if (cosHA < -1 || cosHA > 1) return null;

  const HA = Math.acos(cosHA) * RAD;
  const sunriseMin = solarNoon - 4 * HA;
  const sunsetMin  = solarNoon + 4 * HA;

  const startOfDayUtc = new Date(Date.UTC(y, m - 1, d));
  return {
    sunrise: new Date(startOfDayUtc.getTime() + sunriseMin * 60_000),
    sunset:  new Date(startOfDayUtc.getTime() + sunsetMin  * 60_000),
  };
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function fmtUtcPlus3(date: Date): string {
  const localMs = date.getTime() + TZ_OFFSET_MIN * 60_000;
  const d = new Date(localMs);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─── Tip ─────────────────────────────────────────────────────────────────────

export type PlanetaryHourResult = {
  aktifGezegen:      Planet;
  sonrakiGezegen:    Planet;
  aktifChaldeanIdx:  number; // 0-6, CHALDEAN_PLANETS dizisindeki index
  kalanDakika:       number;
  saatIndex:         number; // 0-11=gündüz saati, 12-23=gece saati
  isDayHour:         boolean;
  hourStart:         Date;
  hourEnd:           Date;
  gunDogumuStr:      string; // e.g. "05:31"
  gunBatimiStr:      string; // e.g. "20:37"
};

// ─── Gün yöneticisi (haftanın gününe göre ilk gezegen saati) ─────────────────

/** Seçili günün yönetici gezegenini döndürür (gün doğumu ilk saati baz alınır) */
export function getDayRuler(date: Date): Planet {
  const localMs   = date.getTime() + TZ_OFFSET_MIN * 60_000;
  const localDate = new Date(localMs);
  const weekday   = localDate.getUTCDay();
  const idx       = DAY_START_IDX[weekday] ?? 3;
  return CHALDEAN_PLANETS[idx]!;
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export function getPlanetaryHour(
  date: Date,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
): PlanetaryHourResult {
  const sunTimes = calcSunTimes(date, lat, lon);

  if (!sunTimes) {
    return fallbackPlanetaryHour(date);
  }

  const { sunrise, sunset } = sunTimes;
  const now    = date.getTime();
  const riseMs = sunrise.getTime();
  const setMs  = sunset.getTime();

  let saatIndex: number;
  let hourStart: Date;
  let hourEnd:   Date;

  if (now >= riseMs && now < setMs) {
    // ── Gündüz saati (0-11) ───────────────────────────────────────────────
    const dayDuration     = setMs - riseMs;
    const dayHourDuration = dayDuration / 12;
    const elapsed         = now - riseMs;
    const hourNum         = clamp(Math.floor(elapsed / dayHourDuration), 0, 11);
    saatIndex = hourNum;
    hourStart = new Date(riseMs + hourNum * dayHourDuration);
    hourEnd   = new Date(riseMs + (hourNum + 1) * dayHourDuration);
  } else if (now >= setMs) {
    // ── Gece saati — gün batımından yarının gün doğumuna (12-23) ─────────
    const nextDate     = new Date(date.getTime() + 86_400_000);
    const nextSunTimes = calcSunTimes(nextDate, lat, lon);
    const nextRiseMs   = nextSunTimes?.sunrise.getTime() ?? (setMs + 12 * 3_600_000);
    const nightDuration     = nextRiseMs - setMs;
    const nightHourDuration = nightDuration / 12;
    const elapsed           = now - setMs;
    const hourNum           = clamp(Math.floor(elapsed / nightHourDuration), 0, 11);
    saatIndex = 12 + hourNum;
    hourStart = new Date(setMs + hourNum * nightHourDuration);
    hourEnd   = new Date(setMs + (hourNum + 1) * nightHourDuration);
  } else {
    // ── Gece saati — gece yarısından gün doğumuna (12-23) ────────────────
    const prevDate     = new Date(date.getTime() - 86_400_000);
    const prevSunTimes = calcSunTimes(prevDate, lat, lon);
    const nightStart   = prevSunTimes?.sunset.getTime() ?? (riseMs - 12 * 3_600_000);
    const nightDuration     = riseMs - nightStart;
    const nightHourDuration = nightDuration / 12;
    const elapsed           = now - nightStart;
    const hourNum           = clamp(Math.floor(elapsed / nightHourDuration), 0, 11);
    saatIndex = 12 + hourNum;
    hourStart = new Date(nightStart + hourNum * nightHourDuration);
    hourEnd   = new Date(nightStart + (hourNum + 1) * nightHourDuration);
  }

  // Türkiye yerel haftanın günü
  const localMs   = date.getTime() + TZ_OFFSET_MIN * 60_000;
  const localDate = new Date(localMs);
  const weekday   = localDate.getUTCDay(); // 0=Pazar...6=Cumartesi

  const startChaldeanIdx   = DAY_START_IDX[weekday] ?? 3;
  const aktifChaldeanIdx   = (startChaldeanIdx + saatIndex) % 7;
  const sonrakiChaldeanIdx = (aktifChaldeanIdx + 1) % 7;

  const kalanMs     = hourEnd.getTime() - now;
  const kalanDakika = Math.max(1, Math.round(kalanMs / 60_000));

  return {
    aktifGezegen:     CHALDEAN_PLANETS[aktifChaldeanIdx]!,
    sonrakiGezegen:   CHALDEAN_PLANETS[sonrakiChaldeanIdx]!,
    aktifChaldeanIdx,
    kalanDakika,
    saatIndex,
    isDayHour:  saatIndex < 12,
    hourStart,
    hourEnd,
    gunDogumuStr: fmtUtcPlus3(sunrise),
    gunBatimiStr: fmtUtcPlus3(sunset),
  };
}

// ─── Yedek hesaplama (kutup bölgeleri için) ───────────────────────────────────

function fallbackPlanetaryHour(date: Date): PlanetaryHourResult {
  const h       = date.getHours();
  const weekday = date.getDay();
  const startChaldeanIdx   = DAY_START_IDX[weekday] ?? 3;
  const aktifChaldeanIdx   = (startChaldeanIdx + h) % 7;
  const sonrakiChaldeanIdx = (aktifChaldeanIdx + 1) % 7;
  const hourStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, 0, 0);
  const hourEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h + 1, 0, 0);
  return {
    aktifGezegen:     CHALDEAN_PLANETS[aktifChaldeanIdx]!,
    sonrakiGezegen:   CHALDEAN_PLANETS[sonrakiChaldeanIdx]!,
    aktifChaldeanIdx,
    kalanDakika:      60 - date.getMinutes(),
    saatIndex:        h,
    isDayHour:        h >= 6 && h < 20,
    hourStart,
    hourEnd,
    gunDogumuStr: "06:00",
    gunBatimiStr: "20:00",
  };
}
