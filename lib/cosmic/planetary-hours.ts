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

function calcSunTimes(date: Date, lat: number, lon: number, tzOffsetMinutes: number = TZ_OFFSET_MIN): SunTimes | null {
  // Yerel takvim günü — seçili tz offset'i (default UTC+3 = TR birebir). NOAA geometrisi lon tabanlı.
  const localMs   = date.getTime() + tzOffsetMinutes * 60_000;
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

function fmtLocalHM(date: Date, tzOffsetMinutes: number = TZ_OFFSET_MIN): string {
  const localMs = date.getTime() + tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
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
  gunDogumuStr:      string; // e.g. "05:31" (seçili tz'de)
  gunBatimiStr:      string; // e.g. "20:37" (seçili tz'de)
  sunrise?:          Date;    // additif — mutlak an (seçili tz'de formatlanabilir)
  sunset?:           Date;    // additif — mutlak an
  isFallback?:       boolean; // additif — kutup/ekstrem yaklaşık hesap
};

// ─── Gün yöneticisi (haftanın gününe göre ilk gezegen saati) ─────────────────

/** Seçili günün yönetici gezegenini döndürür (gün doğumu ilk saati baz alınır) */
export function getDayRuler(date: Date, tzOffsetMinutes: number = TZ_OFFSET_MIN): Planet {
  const localMs   = date.getTime() + tzOffsetMinutes * 60_000;
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
  tzOffsetMinutes: number = TZ_OFFSET_MIN,
): PlanetaryHourResult {
  // Bu instant'ın ait olduğu PLANETARY DAY'i çöz. Gezegen günü SUNRISE → NEXT SUNRISE'dır;
  // 00:00 bir sınır DEĞİLDİR. Şafak öncesi (now < bugünkü gün doğumu) instant, DÜN'ün gün
  // doğumunda başlayan gezegen gününe aittir → gün yöneticisi dünden gelir (erken reset YOK).
  const todaySun = calcSunTimes(date, lat, lon, tzOffsetMinutes);
  if (!todaySun) return fallbackPlanetaryHour(date);

  const now     = date.getTime();
  const dayDate = now >= todaySun.sunrise.getTime()
    ? date                                        // gezegen günü bugün (gün doğumunda) başladı
    : new Date(now - 86_400_000);                 // şafak öncesi → dünkü gezegen günü sürüyor

  // Tek canonical matematik: 24 dilim üretici (getPlanetaryHoursForDate). Aynı offset her iki
  // güne verilir (getPlanetaryHour imzası tek offset alır — TUR2 sözleşmesi korunur).
  const slots = getPlanetaryHoursForDate(dayDate, lat, lon, tzOffsetMinutes, tzOffsetMinutes);
  if (slots.length === 0) return fallbackPlanetaryHour(date);

  // Target'ı içeren dilim (sınır float'ları için kelepçele).
  let slot = slots.find(s => now >= s.start.getTime() && now < s.end.getTime());
  if (!slot) slot = now < slots[0]!.start.getTime() ? slots[0]! : slots[slots.length - 1]!;

  const sonrakiChaldeanIdx = (slot.chaldeanIdx + 1) % 7;
  const kalanDakika = Math.max(1, Math.round((slot.end.getTime() - now) / 60_000));
  // Gösterim gün doğumu/batımı = gezegen gününün başladığı günün değerleri (dilimlerle tutarlı).
  const daySun = calcSunTimes(dayDate, lat, lon, tzOffsetMinutes) ?? todaySun;

  return {
    aktifGezegen:     slot.planet,
    sonrakiGezegen:   CHALDEAN_PLANETS[sonrakiChaldeanIdx]!,
    aktifChaldeanIdx: slot.chaldeanIdx,
    kalanDakika,
    saatIndex:        slot.hourIndex,
    isDayHour:        slot.period === "day",
    hourStart:        slot.start,
    hourEnd:          slot.end,
    gunDogumuStr:     fmtLocalHM(daySun.sunrise, tzOffsetMinutes),
    gunBatimiStr:     fmtLocalHM(daySun.sunset, tzOffsetMinutes),
    sunrise:          daySun.sunrise,
    sunset:           daySun.sunset,
    isFallback:       false,
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
    isFallback: true,
  };
}

// ─── Bir günün 24 gezegen saati dilimi (planlayıcı için saf yardımcı) ─────────
// YENİ ASTRONOMİK ALGORİTMA İÇERMEZ. getPlanetaryHour ile AYNI canonical matematiği
// (calcSunTimes NOAA + gündüz/12 + gece/12 + CHALDEAN_PLANETS + DAY_START_IDX) yeniden
// kullanır. Fark yalnız kapsam: tek aktif saat yerine bir gezegen gününün tüm 24 dilimi.

export type PlanetaryHourSlot = {
  planet:      Planet;
  chaldeanIdx: number;        // 0-6 — CHALDEAN_PLANETS dizisindeki index
  hourIndex:   number;        // 0-11 = gündüz saati, 12-23 = gece saati
  period:      "day" | "night";
  start:       Date;
  end:         Date;
};

/**
 * Bir gezegen gününün (gün doğumu → ertesi gün doğumu) tüm 24 saatini üretir.
 * 12 gündüz dilimi: gün doğumu → gün batımı (o günün); her biri (batım−doğuş)/12.
 * 12 gece dilimi: gün batımı → ERTESİ gün doğumu; her biri (ertesi doğuş−batım)/12.
 *
 * Keldani ataması getPlanetaryHour ile birebir aynıdır:
 *   chaldeanIdx = (DAY_START_IDX[weekday] + hourIndex) % 7
 * → gündüz ilk saati (hourIndex 0) daima gün yöneticisidir.
 *
 * DST sınır günü: ertesi günün offset'i farklıysa nextTzOffsetMinutes ile verilir
 * (gece diliminin doğru takvim gününe düşmesi için). Verilmezse tzOffsetMinutes kullanılır.
 *
 * Kutup gün/gecesi (calcSunTimes null) → boş dizi (çağıran fallback gösterebilir).
 */
export function getPlanetaryHoursForDate(
  date: Date,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
  tzOffsetMinutes: number = TZ_OFFSET_MIN,
  nextTzOffsetMinutes: number = tzOffsetMinutes,
): PlanetaryHourSlot[] {
  const sunTimes = calcSunTimes(date, lat, lon, tzOffsetMinutes);
  if (!sunTimes) return [];
  const nextDate     = new Date(date.getTime() + 86_400_000);
  const nextSunTimes = calcSunTimes(nextDate, lat, lon, nextTzOffsetMinutes);
  if (!nextSunTimes) return [];

  const riseMs     = sunTimes.sunrise.getTime();
  const setMs      = sunTimes.sunset.getTime();
  const nextRiseMs = nextSunTimes.sunrise.getTime();

  const dayHourMs   = (setMs - riseMs) / 12;
  const nightHourMs = (nextRiseMs - setMs) / 12;

  // Haftanın günü — seçili tz'de yerel gün (gündüz ilk saatinin yöneticisi)
  const localMs        = date.getTime() + tzOffsetMinutes * 60_000;
  const weekday        = new Date(localMs).getUTCDay();
  const startChaldeanIdx = DAY_START_IDX[weekday] ?? 3;

  const slots: PlanetaryHourSlot[] = [];
  for (let h = 0; h < 24; h++) {
    const isDay       = h < 12;
    const idxInPeriod = isDay ? h : h - 12;
    const startMs     = isDay ? riseMs + idxInPeriod * dayHourMs   : setMs + idxInPeriod * nightHourMs;
    const endMs       = isDay ? riseMs + (idxInPeriod + 1) * dayHourMs : setMs + (idxInPeriod + 1) * nightHourMs;
    const chaldeanIdx = (startChaldeanIdx + h) % 7;
    slots.push({
      planet:      CHALDEAN_PLANETS[chaldeanIdx]!,
      chaldeanIdx,
      hourIndex:   h,
      period:      isDay ? "day" : "night",
      start:       new Date(startMs),
      end:         new Date(endMs),
    });
  }
  return slots;
}

export type PlanetaryDaySlots = {
  /** Gezegen gününün başladığı yerel takvim günü (YYYY-MM-DD, seçili tz). */
  dayKey:  string;
  /** Gün doğumu anı (gezegen günü başlangıcı). */
  dayStart: Date;
  slots:   PlanetaryHourSlot[];
};

/** startDate..endDate (dahil, yerel takvim günü) her gün için 24 dilim üretir.
 *  resolveTzOffset: hedef TARİHE göre DST-doğru offset döndüren callback
 *  (ör. (d) => getTimeZoneOffsetMinutes(d, "Europe/Istanbul")). Böylece bu modül
 *  konum/tz altyapısına bağımlı kalmaz ve testlerde deterministik beslenebilir. */
export function getPlanetaryHoursForRange(
  startDate: Date,
  endDate: Date,
  lat: number,
  lon: number,
  resolveTzOffset: (d: Date) => number,
): PlanetaryDaySlots[] {
  const out: PlanetaryDaySlots[] = [];
  // Yerel takvim günü tabanında yürü (00:00). Gün sayısını normalize et.
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay   = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  for (
    let cur = startDay;
    cur.getTime() <= endDay.getTime();
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  ) {
    const next        = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    const tzOffset    = resolveTzOffset(cur);
    const nextOffset  = resolveTzOffset(next);
    const slots       = getPlanetaryHoursForDate(cur, lat, lon, tzOffset, nextOffset);
    const dayKey      = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    out.push({ dayKey, dayStart: slots[0]?.start ?? cur, slots });
  }
  return out;
}
