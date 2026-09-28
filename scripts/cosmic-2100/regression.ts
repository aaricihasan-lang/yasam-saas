/**
 * scripts/cosmic-2100/regression.ts
 *
 * Kozmik Ajanda 01.01.2026–31.12.2100 — G1…G8 + 2100 kalıcı REGRESYON testleri.
 * Her bulgu için somut örnek (uzun dönem denetiminden) sabitlenir. Referans değerler:
 *   • Hicri: resmî Umm al-Qura tablosu (hijridate/KACST) + Umm al-Qura kuralı (Swiss Ephemeris).
 *   • Gün doğumu/batımı: USNO API (aa.usno.navy.mil, dakika yuvarlamalı) — ±60 sn tolerans.
 *   • Retro/burç girişi: Swiss Ephemeris + JPL Horizons DE441 (denetim raporu).
 *
 * Çalıştırma: npx tsx scripts/cosmic-2100/regression.ts   (exit 0 = PASS, 1 = FAIL)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  SUPPORT_START_KEY, SUPPORT_END_KEY, SUPPORT_START_YEAR, SUPPORT_END_YEAR,
  isCalendarDaySupported, isRealCalendarDay, clampDayToSupported, checkSupportedRange,
  supportedYears, canNavigateMonth, localDayKey,
} from "../../lib/cosmic/dateRange";
import { hijriFromGregorian, getHijriDate } from "../../lib/cosmic/hijri";
import { gregorianToHijri } from "../../lib/cupping/hijri";
import { getHacamatMonthData, getAllAltinDays } from "../../lib/cosmic/hacamat";
import { validateHacamatReportPayload } from "../../lib/cosmic/hacamatReport";
import {
  getDayRuler, getPlanetaryHour, getPlanetaryHoursForDate, getPlanetaryHoursForRange, locationDayAnchor, CHALDEAN_PLANETS,
} from "../../lib/cosmic/planetary-hours";
import { getTimeZoneOffsetMinutes, zonedWallTimeToUtc } from "../../lib/location/tz";
import { getRetroStatus, getActiveRetros, getNextRetro, getUpcomingRetros, RETRO_PLANETS } from "../../lib/cosmic/retro";
import { getUpcomingCosmicEvents, getSignChangeEventsBetween } from "../../lib/cosmic/events";
import { getEclipsesBetween, getUpcomingEclipses, getPastEclipses } from "../../lib/cosmic/eclipses";
import { getPlanetSignPeriod, getPlanetSigns, getSunSignInfo } from "../../lib/cosmic/planets";
import { getMoonAge, getMoonSign, getMoonPhase, getMoonIllumination, getMoonSignPeriod, getMonthPhaseEvents } from "../../lib/cosmic/moon";
import { parseDateParam, buildPlannerData } from "../../app/cosmic-calendar/planetary-hours/plannerData";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(cond: unknown, label: string): void {
  if (cond) { pass++; } else { fail++; failures.push(label); console.log(`  ❌ ${label}`); }
}
function section(t: string) { console.log(`\n── ${t}`); }
function withTZ<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
}
const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// ═════════════════════════════════════════════════════════════════════════════
section("Tarih aralığı (tek kaynak) + sınırlar");
ok(SUPPORT_START_KEY === "2026-01-01" && SUPPORT_END_KEY === "2100-12-31", "public aralık 2026-01-01…2100-12-31");
ok(SUPPORT_START_YEAR === 2026 && SUPPORT_END_YEAR === 2100, "yıl sabitleri 2026/2100");
ok(isCalendarDaySupported(2026, 1, 1), "MIN 01.01.2026 destekli");
ok(!isCalendarDaySupported(2025, 12, 31), "MIN-1 31.12.2025 REDDEDİLİR");
ok(isCalendarDaySupported(2026, 1, 2), "MIN+1 02.01.2026 destekli");
ok(isCalendarDaySupported(2100, 12, 31), "MAX 31.12.2100 destekli");
ok(isCalendarDaySupported(2100, 12, 30), "MAX-1 30.12.2100 destekli");
ok(!isCalendarDaySupported(2101, 1, 1), "MAX+1 01.01.2101 REDDEDİLİR");
ok(!isRealCalendarDay(2100, 2, 29), "2100-02-29 GERÇEK GÜN DEĞİL (2100 artık yıl değil)");
ok(isRealCalendarDay(2096, 2, 29) && isRealCalendarDay(2028, 2, 29), "2028/2096-02-29 geçerli");
ok(!isRealCalendarDay(2027, 2, 29) && !isRealCalendarDay(2026, 2, 31) && !isRealCalendarDay(2026, 13, 1), "geçersiz takvim günleri reddedilir");
{
  const c1 = clampDayToSupported(new Date(2101, 0, 1, 15, 30));
  ok(localDayKey(c1) === "2100-12-31" && c1.getHours() === 0 && c1.getMinutes() === 0, "G8-C: 2101 kelepçesi → 31.12.2100 00:00 (23:59:59 DEĞİL)");
  const c2 = clampDayToSupported(new Date(2100, 11, 31, 23, 59, 59));
  ok(c2.getHours() === 0 && localDayKey(c2) === "2100-12-31", "G8-C: 31.12.2100 23:59:59 → aynı gün 00:00");
  const c3 = clampDayToSupported(new Date(2020, 5, 1));
  ok(localDayKey(c3) === "2026-01-01" && c3.getHours() === 0, "alt kelepçe → 01.01.2026 00:00");
}
ok(checkSupportedRange(new Date(NaN)).ok === false, "G7: Invalid Date → checkSupportedRange invalid");
ok(checkSupportedRange(new Date(2101, 0, 1)).ok === false && checkSupportedRange(new Date(2100, 11, 31)).ok === true, "checkSupportedRange sınırlar");
ok(!canNavigateMonth(2100, 11, 1) && canNavigateMonth(2100, 10, 1) && !canNavigateMonth(2026, 0, -1), "ay navigasyonu 2026-01…2100-12 ile sınırlı");
ok(supportedYears().length === 75 && supportedYears()[0] === 2026 && supportedYears()[74] === 2100, "yıl listesi 2026…2100 (75 yıl)");

// ═════════════════════════════════════════════════════════════════════════════
section("G1 — Hicri (kanonik Umm al-Qura; tarayıcı Intl YOK)");
ok(getHijriDate(new Date(2029, 7, 10)) === "29 Rebiülevvel 1451", "11.08.2029 sınırı: 10.08.2029 = 29 Rebiülevvel 1451");
ok(getHijriDate(new Date(2029, 7, 11)) === "1 Rebiülahir 1451", "11.08.2029 = 1 Rebiülahir 1451 (ICU '30 Rebiülevvel' diyordu)");
ok(hijriFromGregorian(2026, 2, 18)?.formatted === "1 Ramazan 1447", "1 Ramazan 1447 = 18.02.2026");
ok(hijriFromGregorian(2031, 12, 15)?.formatted === "1 Ramazan 1453", "1 Ramazan 1453 = 15.12.2031 (ICU '30 Şaban' diyordu)");
ok(hijriFromGregorian(2077, 11, 16)?.method === "umm-al-qura-official", "16.11.2077 resmî tablo");
ok(hijriFromGregorian(2077, 11, 17)?.method === "umm-al-qura-criterion", "17.11.2077 kural-hesaplı (resmî DEĞİL etiketli)");
ok(hijriFromGregorian(2100, 12, 31) !== null, "31.12.2100 Hicri çözülür");
ok(hijriFromGregorian(2101, 3, 1) === null, "kapsam dışı (tablo sonu sonrası) → null, TAHMİN YOK");
ok(hijriFromGregorian(2026, 2, 30) === null && getHijriDate(new Date(NaN)) === "—", "G7: geçersiz gün / Invalid Date → null/—");
// Tarayıcı saat dilimi bağımsızlığı (aynı takvim günü → aynı Hicri gün)
{
  const days: Array<[number, number, number]> = [[2029, 8, 11], [2045, 7, 15], [2077, 11, 17], [2100, 12, 31], [2026, 1, 1]];
  let same = true;
  for (const [y, m, d] of days) {
    const vals = ["Europe/Istanbul", "UTC", "America/Los_Angeles", "Pacific/Auckland"].map(tz => withTZ(tz, () => getHijriDate(new Date(y, m - 1, d))));
    if (new Set(vals).size !== 1) same = false;
  }
  ok(same, "Hicri 4 tarayıcı saat diliminde birebir aynı");
}
// Kozmik ↔ Kupa ↔ Hacamat aynı Hicri gün (2026–2100 tüm günler)
{
  let mism = 0, n = 0;
  for (let y = 2026; y <= 2100; y++) for (let m = 0; m < 12; m++) {
    const hm = getHacamatMonthData(y, m);
    for (const day of hm.days) {
      n++;
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
      const a = getHijriDate(new Date(y, m, day.day)), b = gregorianToHijri(iso)?.formatted, c = day.hijriFormatted;
      if (!(a === b && b === c) || a === "—") mism++;
    }
  }
  ok(mism === 0 && n === 27393, `Kozmik/Kupa/Hacamat Hicri 27.393 günde (2026–2100) birebir (fark ${mism}, n ${n})`);
}
// Denetimdeki yanlış Altın Gün örnekleri
{
  const status = (y: number, m: number, d: number) => getHacamatMonthData(y, m - 1).days.find(x => x.day === d)!.status;
  ok(status(2029, 8, 28) !== "altin", "2029-08-28 artık Altın DEĞİL (Hicri 18 Rebiülahir)");
  ok(status(2030, 6, 18) === "altin", "2030-06-18 Altın (17 Safer 1452) — ICU kaçırıyordu");
  ok(status(2033, 1, 18) === "altin", "2033-01-18 Altın (17 Şevval 1454)");
  ok(status(2034, 2, 7) !== "altin", "2034-02-07 artık Altın DEĞİL");
  ok(status(2037, 11, 24) === "altin", "2037-11-24 Altın (17 Şevval 1459)");
  const altin = getAllAltinDays(2026, 2100);
  ok(altin.every(a => a.hijriFormatted.startsWith("17 ") && a.miladi.getDay() === 2), `getAllAltinDays 2026–2100: ${altin.length} gün, hepsi Hicri 17 + Salı`);
}
// Statik: Kozmik kodunda tarayıcı Intl Hicri takvimi YOK
{
  const files = ["lib/cosmic/hijri.ts", "lib/cosmic/hacamat.ts", "app/cosmic-calendar/page.tsx", "lib/calendar/hijriUmmAlQura.ts"];
  ok(files.every(f => !/islamic-umalqura/.test(stripComments(read(f)))), "Kozmik/Hacamat/kanonik çekirdekte Intl islamic-umalqura kullanımı YOK");
}

// ═════════════════════════════════════════════════════════════════════════════
section("G2 — Gezegen saati: konum IANA saat dilimi (tarayıcı saat dilimi DEĞİL)");
{
  const locs: Array<[string, number, number]> = [
    ["Europe/Istanbul", 41.0082, 28.9784], ["Europe/Berlin", 52.52, 13.405], ["Europe/London", 51.5074, -0.1278],
    ["America/New_York", 40.7128, -74.006], ["Asia/Tokyo", 35.6762, 139.6503],
  ];
  for (const browserTz of ["Europe/Istanbul", "Asia/Tokyo", "America/Los_Angeles"]) {
    withTZ(browserTz, () => {
      for (const [tz] of locs) {
        const resolve = (d: Date) => getTimeZoneOffsetMinutes(d, tz);
        const anchor = locationDayAnchor(2026, 6, 1, resolve);
        ok(getDayRuler(anchor, resolve(anchor)).name === "Merkür", `gün yöneticisi 01.07.2026 (Çarşamba) = Merkür · konum ${tz} · tarayıcı ${browserTz}`);
      }
      const r = getPlanetaryHoursForRange(new Date(2026, 6, 1), new Date(2026, 6, 1), 52.52, 13.405, d => getTimeZoneOffsetMinutes(d, "Europe/Berlin"));
      ok(r[0]!.dayKey === "2026-07-01" && Math.abs(r[0]!.slots[0]!.start.getTime() - zonedWallTimeToUtc(2026, 6, 1, 4, 48, "Europe/Berlin").getTime()) <= 90_000 &&
         new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(r[0]!.slots[0]!.start) === "2026-07-01" &&
         r[0]!.slots[0]!.planet.name === "Merkür",
         `planlayıcı Berlin 01.07.2026: gün doğumu USNO 04:48 ±90sn, yönetici Merkür · tarayıcı ${browserTz}`);
    });
  }
  // USNO çapraz (dakika yuvarlamalı): New York / London 01.07.2026
  for (const [tz, lat, lon, rise, set] of [["America/New_York", 40.7128, -74.006, "05:29", "20:31"], ["Europe/London", 51.5074, -0.1278, "04:48", "21:21"]] as const) {
    const resolve = (d: Date) => getTimeZoneOffsetMinutes(d, tz);
    const a = locationDayAnchor(2026, 6, 1, resolve);
    const s = getPlanetaryHoursForDate(a, lat, lon, resolve(a), resolve(new Date(a.getTime() + 86_400_000)));
    const near = (d: Date, hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      const target = zonedWallTimeToUtc(2026, 6, 1, h!, m!, tz).getTime();
      return Math.abs(d.getTime() - target) <= 90_000;
    };
    ok(near(s[0]!.start, rise) && near(s[12]!.start, set), `${tz} 01.07.2026 gün doğumu/batımı USNO ${rise}/${set} ±90sn`);
  }
  // "Saat seç": konumun duvar saati
  ok(zonedWallTimeToUtc(2026, 6, 1, 12, 0, "Europe/Berlin").toISOString() === "2026-07-01T10:00:00.000Z", "Saat seç: Berlin 12:00 (yaz) = 10:00Z");
  ok(zonedWallTimeToUtc(2026, 0, 15, 12, 0, "America/New_York").toISOString() === "2026-01-15T17:00:00.000Z", "Saat seç: NY 12:00 (kış) = 17:00Z");
  // DST geçiş günleri: 24 bitişik dilim, gün doğumu doğru yerel günde, yönetici = haftanın günü
  const DST: Array<[string, number, number, number, number, number]> = [
    ["Europe/Berlin", 52.52, 13.405, 2026, 2, 29], ["Europe/Berlin", 52.52, 13.405, 2026, 9, 25],
    ["Europe/London", 51.5074, -0.1278, 2026, 2, 29], ["Europe/London", 51.5074, -0.1278, 2100, 2, 28],
    ["America/New_York", 40.7128, -74.006, 2026, 2, 8], ["America/New_York", 40.7128, -74.006, 2026, 10, 1],
    ["Europe/Istanbul", 41.0082, 28.9784, 2100, 11, 31],
  ];
  const DAY_START_IDX = [3, 6, 2, 5, 1, 4, 0];
  for (const [tz, lat, lon, y, m0, d] of DST) {
    const r = getPlanetaryHoursForRange(new Date(y, m0, d), new Date(y, m0, d), lat, lon, dd => getTimeZoneOffsetMinutes(dd, tz))[0]!;
    const s = r.slots;
    let contiguous = s.length === 24;
    for (let i = 1; i < s.length; i++) if (Math.abs(s[i]!.start.getTime() - s[i - 1]!.end.getTime()) > 1) contiguous = false;
    const localRise = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(s[0]!.start);
    const wd = new Date(Date.UTC(y, m0, d)).getUTCDay();
    ok(contiguous && localRise === r.dayKey && s[0]!.chaldeanIdx === DAY_START_IDX[wd], `DST/sınır günü ${tz} ${r.dayKey}: 24 bitişik dilim, doğru gün, doğru yönetici`);
  }
  // Şafak öncesi (pre-dawn): İstanbul 01.07.2026 03:00 → önceki gezegen gününün (30.06 Salı) gece saati
  {
    const t = zonedWallTimeToUtc(2026, 6, 1, 3, 0, "Europe/Istanbul");
    const ph = getPlanetaryHour(t, 41.0082, 28.9784, 180);
    const prev = getPlanetaryHoursForDate(zonedWallTimeToUtc(2026, 5, 30, 12, 0, "Europe/Istanbul"), 41.0082, 28.9784, 180, 180);
    const slot = prev.find(sl => t >= sl.start && t < sl.end)!;
    ok(!ph.isDayHour && ph.aktifGezegen.name === slot.planet.name && slot.period === "night", "pre-dawn 03:00 → 30.06 (Salı/Mars günü) gece saati — erken reset YOK");
  }
}

// ═════════════════════════════════════════════════════════════════════════════
section("2100 — Gregoryen JD düzeltmesi (2100 artık yıl DEĞİL)");
{
  // Eski formül: yalnız 1901-03-01…2100-02-28 doğru. ≤2099'da yeni formülle BİREBİR aynı gün doğumu.
  const oldJD = (y: number, m: number, d: number) => 367 * y - Math.floor((7 * (y + Math.floor((m + 9) / 12))) / 4) + Math.floor((275 * m) / 9) + d + 1721013.5 + 0.5;
  const newJD = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12) / 86_400_000 + 2_440_587.5;
  let eqBefore = true;
  for (let y = 1902; y <= 2099; y++) for (const [m, d] of [[1, 1], [3, 1], [6, 15], [12, 31]] as const) if (oldJD(y, m, d) !== newJD(y, m, d)) eqBefore = false;
  ok(eqBefore, "yeni JD ≤2099'da eski formülle birebir (regresyon yok)");
  ok(oldJD(2100, 2, 28) === newJD(2100, 2, 28) && oldJD(2100, 3, 1) === newJD(2100, 3, 1) + 1, "kök neden: eski formül 01.03.2100'den itibaren +1 gün kayıyordu");
  // USNO İstanbul (dakika yuvarlamalı) — ±60 sn
  const IST: Array<[number, number, number, string, string]> = [
    [2100, 1, 28, "07:40", "18:54"], [2100, 2, 1, "07:38", "18:55"], [2100, 2, 15, "07:16", "19:11"],
    [2100, 5, 21, "05:32", "20:40"], [2100, 11, 31, "08:29", "17:45"], [2099, 11, 31, "08:29", "17:45"], [2026, 0, 1, "08:29", "17:46"],
  ];
  for (const [y, m0, d, rise, set] of IST) {
    const a = zonedWallTimeToUtc(y, m0, d, 12, 0, "Europe/Istanbul");
    const s = getPlanetaryHoursForDate(a, 41.0082, 28.9784, 180, 180);
    const tgt = (hhmm: string) => { const [h, mm] = hhmm.split(":").map(Number); return zonedWallTimeToUtc(y, m0, d, h!, mm!, "Europe/Istanbul").getTime(); };
    const dr = Math.abs(s[0]!.start.getTime() - tgt(rise)) / 1000, ds = Math.abs(s[12]!.start.getTime() - tgt(set)) / 1000;
    ok(dr <= 60 && ds <= 60, `İstanbul ${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")} doğuş/batış USNO ${rise}/${set} ±60sn (Δ ${dr.toFixed(0)}/${ds.toFixed(0)} sn)`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
section("G3/G4 — Retro: 8 gezegen, sınır tamponu, UNKNOWN ≠ DIRECT");
{
  ok(RETRO_PLANETS.length === 8 && RETRO_PLANETS.includes("Plüton") && RETRO_PLANETS.includes("Uranüs") && RETRO_PLANETS.includes("Neptün"), "8 gezegen kapsamda");
  const st = getRetroStatus(new Date(2026, 5, 20));
  ok(st.supported && st.active.some(r => r.planet === "Plüton"), "20.06.2026 Plüton retroda (denetim: 'tüm gezegenler direkt' YANLIŞTI)");
  ok(st.supported && st.checkedPlanets.length === 8, "status 8 gezegeni kontrol ettiğini bildirir");
  const j = getActiveRetros(new Date(2050, 11, 25)).find(r => r.planet === "Jüpiter");
  ok(!!j && j.start === "2050-12-21" && j.end === "2051-04-22", "G4: 21.12.2050 Jüpiter retrosu (bitiş 2051) artık görünür");
  const nep = getActiveRetros(new Date(2100, 11, 31)).find(r => r.planet === "Neptün");
  ok(!!nep && nep.end > "2100-12-31", "31.12.2100'de süren retro (bitiş 2101) doğru bilinir");
  const start26 = getActiveRetros(new Date(2026, 0, 1)).map(r => r.planet).sort();
  ok(start26.includes("Jüpiter") && start26.includes("Uranüs"), "01.01.2026'da 2025'te başlamış retrolar (Jüpiter, Uranüs) görünür");
  ok(getRetroStatus(new Date(2101, 0, 1)).supported === false, "01.01.2101 → supported:false (direkt DEĞİL)");
  ok(getRetroStatus(new Date(2025, 11, 31)).supported === false, "31.12.2025 → supported:false");
  ok(getRetroStatus(new Date(NaN)).supported === false, "Invalid Date → supported:false");
  ok(getNextRetro("Uranüs", new Date(2100, 11, 1)) === null, "2101'de başlayan retro public sonraki-retro olarak DÖNMEZ");
  ok(getUpcomingRetros(new Date(2100, 11, 1), 60).every(r => r.start <= "2100-12-31"), "yaklaşan retrolar 31.12.2100'ü aşmaz");
}

// ═════════════════════════════════════════════════════════════════════════════
section("Tutulmalar 2026–2100");
{
  const all = getEclipsesBetween(Date.UTC(2026, 0, 1), Date.UTC(2101, 0, 1));
  const e67 = all.find(e => e.id === "solar-2067-12-06");
  ok(e67?.eclipseType === "hybrid", "2067-12-06 Güneş tutulması HİBRİT (AE 'total' diyordu)");
  ok(all.length > 0 && all.every(e => e.peakUTC >= "2026-01-01" && e.peakUTC < "2101-01-01"), `tutulma listesi 2026–2100 (${all.length} olay)`);
  ok(getUpcomingEclipses(new Date(2100, 11, 1), 5).every(e => e.peakUTC < "2101-01-01"), "yaklaşan tutulmalar 2100 sonunda kesilir");
  ok(getPastEclipses(new Date(2026, 5, 1), 3).length >= 1, "geçmiş tutulma sorgusu çalışır");
}

// ═════════════════════════════════════════════════════════════════════════════
section("G5 — Yavaş gezegen burç girişi gece yarısı sınırı (JPL+SWE doğrulanmış)");
{
  const plPer = getPlanetSignPeriod("Plüton", new Date(Date.UTC(2030, 0, 1, 12)));
  ok(plPer?.from === "2024-11-19", `Plüton → Kova girişi 19.11.2024 (JPL 23:39 TR) — motor 20.11 diyordu (şimdi ${plPer?.from})`);
  const satEv = getSignChangeEventsBetween(Date.UTC(2035, 4, 1), Date.UTC(2035, 5, 1)).find(e => e.planet === "Satürn");
  ok(satEv?.date === "2035-05-11", `Satürn → Aslan 11.05.2035 (JPL 23:45 TR) — motor 12.05 diyordu (şimdi ${satEv?.date})`);
}

// ═════════════════════════════════════════════════════════════════════════════
section("G6 — Ay yaşı 29.53'te donmaz");
{
  // Uzun lunasyon: iki ardışık Yeni Ay arası > 29.6 gün olan ilk durumu bul, son saatlerini test et.
  let tested = false;
  for (let y = 2026; y <= 2030 && !tested; y++) for (let m = 0; m < 12 && !tested; m++) {
    const nm = getMonthPhaseEvents(y, m).filter(e => e.name === "Yeni Ay").map(e => Date.parse(e.timeUTC));
    for (const t of nm) {
      const prevAge = getMoonAge(new Date(t - 60_000));
      if (prevAge > 29.6) {
        const a1 = getMoonAge(new Date(t - 6 * 3_600_000)), a2 = getMoonAge(new Date(t - 3_600_000)), a3 = getMoonAge(new Date(t + 3_600_000));
        ok(a2 > a1 && prevAge > 29.53, `uzun lunasyon (${prevAge.toFixed(2)} g): yaş Yeni Ay'a dek artar (29.53'te DONMAZ)`);
        ok(a3 < 0.1, "Yeni Ay'dan 1 saat sonra yaş ≈ 0 (reset)");
        tested = true; break;
      }
    }
  }
  ok(tested, "uzun lunasyon örneği bulundu");
}

// ═════════════════════════════════════════════════════════════════════════════
section("G7 — Geçersiz tarih fail-closed (sessiz yaklaşık fallback YOK)");
{
  const bad = new Date(NaN);
  const throws = (f: () => unknown) => { try { f(); return false; } catch (e) { return e instanceof RangeError; } };
  ok(throws(() => getMoonSign(bad)), "getMoonSign(Invalid) → RangeError (eskiden 'Koç')");
  ok(throws(() => getMoonPhase(bad)), "getMoonPhase(Invalid) → RangeError (eskiden 'Yeni Ay')");
  ok(throws(() => getMoonIllumination(bad)) && throws(() => getMoonAge(bad)) && throws(() => getMoonSignPeriod(bad)), "Ay aydınlanma/yaş/burç-dönemi Invalid → RangeError");
  ok(throws(() => getPlanetSigns(bad)) && throws(() => getSunSignInfo(bad)), "getPlanetSigns/getSunSignInfo(Invalid) → RangeError (eskiden Güneş 'Oğlak')");
  ok(getPlanetSignPeriod("Mars", bad) === null && getUpcomingCosmicEvents(bad).length === 0, "sign-period/events Invalid → null/boş");
  ok(parseDateParam("2026-02-30") === null && parseDateParam("bozuk") === null, "planlayıcı ?date geçersiz → null");
  const src = stripComments(read("lib/cosmic/moon.ts"));
  ok(!/catch\s*\{\s*\n?\s*return _legacy/.test(src) && !/return _legacyMoon\w+\(date\)\s*;\s*\n\s*\}\s*\n\}/.test(src.replace(/function _legacy[\s\S]*?\n\}/g, "")), "moon.ts: legacy fonksiyonları fallback olarak çağrılmıyor");
}

// ═════════════════════════════════════════════════════════════════════════════
section("G8 — Arayüz / tarih tutarlılığı (statik sözleşme + saf fonksiyonlar)");
{
  ok(validateHacamatReportPayload({ year: 2100, month: 11 }).ok === true, "rapor servisi 2100 kabul");
  ok(validateHacamatReportPayload({ year: 2101, month: 0 }).ok === false && validateHacamatReportPayload({ year: 2025, month: 11 }).ok === false, "rapor servisi 2025/2101 reddeder");
  const hac = read("app/cosmic-calendar/hacamat/page.tsx");
  ok(/const YEAR_RANGE = supportedYears\(\)/.test(hac) && !/2020 \+ i/.test(hac), "Hacamat yıl seçici = supportedYears() (2020–2040 kaldırıldı)");
  ok(parseDateParam("2101-01-01") === null && parseDateParam("2100-12-31") !== null && parseDateParam("2025-12-31") === null, "planlayıcı ?date public aralıkla sınırlı");
  const pl = buildPlannerData({ start: new Date(2100, 11, 15), days: 30, planets: new Set(CHALDEAN_PLANETS.map(p => p.name)), lat: 41.0082, lon: 28.9784, tz: "Europe/Istanbul" });
  ok(pl.groups.at(-1)?.dayKey === "2100-12-31" && pl.days === 17, "planlayıcı 15.12.2100+30 gün → 31.12.2100'de biter (2101 yok)");
  const page = stripComments(read("app/cosmic-calendar/page.tsx"));
  ok(/getDayRuler\(selDayAnchor,/.test(page) && !/getDayRuler\(selectedDate/.test(page), "G2: gün yöneticisi konum-gün çapası ile (selectedDate+offset karışımı YOK)");
  ok(/zonedWallTimeToUtc\(\s*selectedDate\.getFullYear\(\)/.test(page), "G2: 'Saat seç' konumun duvar saati");
  ok(/exactAspectLabel\(pass, selectedDayLabelTz, eclipseTz\)/.test(page) && !/timeZone: TR_TZ, hour/.test(page), "G8-E: 'Tam: HH:mm' seçili konum tz'si (TR sabit YOK)");
  ok(/daySearchResult\(/.test(page) && /OUT_OF_RANGE_MESSAGE/.test(page), "G8-A: Kozmik Arama gün sonuçları public aralıkla doğrulanır");
  ok(/Şu An · Ay-Dünya mesafesi/.test(read("app/cosmic-calendar/page.tsx")), "G8-D: Ay Yörüngesi kartı 'Şu An' etiketli");
  ok(!/Math\.min\(d, new Date\(y, mo \+ 1, 0\)\.getDate\(\)\)/.test(page) && !/Math\.min\(d, new Date\(y, mIdx \+ 1, 0\)\.getDate\(\)\)/.test(page), "G7/G8-A: 31.02 gibi girişler sessizce ay sonuna kaydırılmaz");
  const rc = stripComments(read("app/cosmic-calendar/retro-calendar/page.tsx"));
  ok(/isCalendarDaySupported\(y, mo, d\)/.test(rc) && /outofrange/.test(rc) && !/"Tüm gezegenler direkt hareket halinde"/.test(rc), "G3/G8-A: retro araması aralık dışını 'direkt' göstermez");
  const tr = read("app/cosmic-calendar/transits/[planet]/page.tsx");
  ok(!/2050/.test(tr), "transit sayfasında sabit 2050 kalmadı");
}

// ═════════════════════════════════════════════════════════════════════════════
section("selectedDate / realNow sözleşmesi (kart bazında)");
{
  const page = stripComments(read("app/cosmic-calendar/page.tsx"));
  const SELECTED = [
    "getMoonPhase(selectedDate)", "getLunarDistanceSnapshot(selectedDate)", "getHijriDate(selectedDate)",
    "getRetroStatus(selectedDate)", "getActiveRetros(selectedDate)", "getMoonSign(selectedDate)", "getPlanetSigns(selectedDate)",
    "getDailyAspects(selectedDate)", "getUpcomingEclipses(ref, 10)", "getPastEclipses(ref, 6)",
  ];
  const NOW = [
    "getMoonSign(realNow)", "getPlanetSigns(realNow)", "getUpcomingCosmicEvents(realNow, 10)", "getActiveRetros(realNow)",
    "getCurrentVoidMoon(realNow)", "getLunarDistanceSnapshot(realNow)", "getUpcomingRetros(realNow, 180)",
  ];
  for (const s of SELECTED) ok(page.includes(s), `seçili-gün kartı selectedDate kullanır: ${s}`);
  for (const s of NOW) ok(page.includes(s), `'Şu An' kartı realNow kullanır: ${s}`);
  ok(!/new Date\(\)\s*[,)]/.test(page.replace(/const n = new Date\(\);|const now = new Date\(\);|setRealNow\(new Date\(\)\)|new Date\(\);/g, "")), "seçili-gün kartlarında gizli new Date() yok");
}

// ═════════════════════════════════════════════════════════════════════════════
section("Performans (doğruluğu değiştirmeyen lazy bloklar) — bilgi amaçlı");
{
  const t0 = performance.now();
  getActiveRetros(new Date(2085, 5, 15)); getUpcomingRetros(new Date(2085, 5, 15), 180);
  getUpcomingEclipses(new Date(2085, 5, 15), 10); getPastEclipses(new Date(2085, 5, 15), 6);
  getUpcomingCosmicEvents(new Date(2085, 5, 15), 10);
  const dt = performance.now() - t0;
  console.log(`  ℹ 15.06.2085 için ana sayfa olay seti (retro+tutulma+olay) soğuk hesap: ${dt.toFixed(0)} ms`);
  ok(dt < 4000, "ana sayfa olay seti < 4 sn (soğuk)");
}

console.log(`\n=== cosmic-2100 regresyon: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log(failures.map(f => " - " + f).join("\n")); process.exit(1); }
