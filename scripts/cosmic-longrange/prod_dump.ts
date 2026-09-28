/**
 * scripts/cosmic-longrange/prod_dump.ts
 *
 * UZUN DÖNEM DOĞRULAMA — production lib/cosmic motorlarını 01.01.2026–31.12.2100 (+sınır) için çağırır,
 * çıktıyı CSV olarak döker. Referans karşılaştırması compare.py'de (Swiss Ephemeris + JPL + USNO + UQ).
 * Production kodunu DEĞİŞTİRMEZ; yalnız çağırır.
 *
 * Kullanım: npx tsx scripts/cosmic-longrange/prod_dump.ts <mode> <Y0> <Y1> <outDir>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as AE from "astronomy-engine";
import { getPlanetLongitude, getDailyAspects, BODY_ORDER } from "../../lib/cosmic/aspects";
import { getPlanetSigns, getPlanetSignPeriod, type PlanetKey } from "../../lib/cosmic/planets";
import { getMoonSign, getMoonPhase, getMoonIllumination, getMoonAge, getMoonSignPeriod, getMonthPhaseEvents } from "../../lib/cosmic/moon";
import { getAllRetroPeriods, getRetroStatus } from "../../lib/cosmic/retro";
import { getSignChangeEventsBetween } from "../../lib/cosmic/events";
import { getPlanetaryHoursForRange, getPlanetaryHour, getDayRuler, locationDayAnchor, CHALDEAN_PLANETS } from "../../lib/cosmic/planetary-hours";
import { getHijriDate } from "../../lib/cosmic/hijri";
import { getHacamatMonthData } from "../../lib/cosmic/hacamat";
import { gregorianToHijri } from "../../lib/cupping/hijri";
import { getSolarEclipses, getLunarEclipses } from "../../lib/cosmic/eclipses";
import { getTimeZoneOffsetMinutes } from "../../lib/location/tz";

const [, , mode, y0s, y1s, outDirArg] = process.argv;
const Y0 = Number(y0s), Y1 = Number(y1s);
const outDir = path.resolve(outDirArg!);
fs.mkdirSync(outDir, { recursive: true });
const TR = 3 * 3_600_000;
const SIGNS = ["Koç","Boğa","İkizler","Yengeç","Aslan","Başak","Terazi","Akrep","Yay","Oğlak","Kova","Balık"];
const PHASES = ["Yeni Ay","Büyüyen Hilal","İlk Dördün","Şişen Ay","Dolunay","Azalan Ay","Son Dördün","Balsamik"];
const PLANET_KEYS: PlanetKey[] = ["Güneş","Merkür","Venüs","Mars","Jüpiter","Satürn","Uranüs","Neptün","Plüton"];
const out = (name: string) => fs.createWriteStream(path.join(outDir, name));
const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
function* days(y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let m = 0; m < 12; m++) for (let d = 1; d <= dim(y, m); d++) yield [y, m, d] as const;
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

if (mode === "positions") {
  // Her gün × 4 TR saati (00/06/12/18) + UI alanları (burç/faz/aydınlanma/yaş).
  const w = out(`positions_${Y0}_${Y1}.csv`);
  w.write("utc_ms,deltaT_s," + BODY_ORDER.map((_, i) => `lon${i}`).join(",") + "," +
    PLANET_KEYS.map((_, i) => `sign${i}`).join(",") + ",moonSign,moonPhase,moonPhaseDeg,illum,moonAge\n");
  for (const [y, m, d] of days(Y0, Y1)) {
    for (const h of [0, 6, 12, 18]) {
      const ms = Date.UTC(y, m, d, h) - TR;
      const dt = new Date(ms);
      const t = AE.MakeTime(dt);
      const lons = BODY_ORDER.map(b => getPlanetLongitude(b, dt).toFixed(7));
      const signs = getPlanetSigns(dt).map(p => SIGNS.indexOf(p.sign));
      w.write(`${ms},${((t.tt - t.ut) * 86400).toFixed(3)},${lons.join(",")},${signs.join(",")},${SIGNS.indexOf(getMoonSign(dt).name)},` +
        `${PHASES.indexOf(getMoonPhase(dt).name)},${AE.MoonPhase(dt).toFixed(6)},${getMoonIllumination(dt)},${getMoonAge(dt).toFixed(5)}\n`);
    }
  }
  w.end();
}

if (mode === "moonevents") {
  const w = out(`moonphase_${Y0}_${Y1}.csv`);
  w.write("year,month,day,phase,timeTR,timeUTC\n");
  for (let y = Y0; y <= Y1; y++) for (let m = 0; m < 12; m++)
    for (const e of getMonthPhaseEvents(y, m)) w.write(`${y},${m + 1},${e.day},${PHASES.indexOf(e.name)},${e.timeTR},${e.timeUTC}\n`);
  w.end();
  const w2 = out(`mooningress_${Y0}_${Y1}.csv`);
  w2.write("from_ms,to_ms,sign\n");
  let cur = Date.UTC(Y0, 0, 1) - TR;
  const end = Date.UTC(Y1 + 1, 0, 1) - TR;
  while (cur < end) {
    const p = getMoonSignPeriod(new Date(cur));
    w2.write(`${p.from.getTime()},${p.to.getTime()},${SIGNS.indexOf(getMoonSign(new Date((p.from.getTime() + p.to.getTime()) / 2)).name)}\n`);
    cur = p.to.getTime() + 120_000;
  }
  w2.end();
}

if (mode === "retro") {
  const w = out(`retro_periods.csv`);
  w.write("planet,start,end\n");
  for (const r of getAllRetroPeriods()) w.write(`${r.planet},${r.start},${r.end}\n`);
  w.end();
  const w2 = out(`retro_daily_${Y0}_${Y1}.csv`);
  w2.write("date,supported,active\n");
  for (const [y, m, d] of days(Y0, Y1)) {
    const st = getRetroStatus(new Date(y, m, d, 12));
    w2.write(`${iso(y, m, d)},${st.supported ? 1 : 0},${st.supported ? st.active.map(r => r.planet).sort().join("|") : ""}\n`);
  }
  w2.end();
  const w3 = out(`signchange_events.csv`);
  w3.write("date,planet,title\n");
  for (const e of getSignChangeEventsBetween(Date.UTC(2024, 0, 1), Date.UTC(2102, 0, 1))) w3.write(`${e.date},${e.planet},"${e.title}"\n`);
  w3.end();
}

if (mode === "signperiod") {
  // Referans (compare.py ref_ingress) her bitişik burç kalışının ORTA anını verir; production
  // getPlanetSignPeriod o anda sorgulanır → her giriş/çıkış tarihi iki kez doğrulanır.
  const q = JSON.parse(fs.readFileSync(path.join(outDir, "ref_stays.json"), "utf8")) as Array<{ planet: PlanetKey; mid_ms: number }>;
  const w = out(`signperiod_prod.csv`);
  w.write("planet,mid_ms,from,to\n");
  for (const { planet, mid_ms } of q) {
    const p = getPlanetSignPeriod(planet, new Date(mid_ms));
    w.write(`${planet},${mid_ms},${p?.from ?? ""},${p?.to ?? ""}\n`);
  }
  w.end();
}

if (mode === "phours") {
  const CITIES = [
    { id: "istanbul", lat: 41.0082, lon: 28.9784, tz: "Europe/Istanbul" },
    { id: "ankara", lat: 39.9334, lon: 32.8597, tz: "Europe/Istanbul" },
    { id: "van", lat: 38.4942, lon: 43.38, tz: "Europe/Istanbul" },
    { id: "berlin", lat: 52.52, lon: 13.405, tz: "Europe/Berlin" },
    { id: "london", lat: 51.5074, lon: -0.1278, tz: "Europe/London" },
    { id: "newyork", lat: 40.7128, lon: -74.006, tz: "America/New_York" },
    { id: "sydney", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" },
    { id: "singapore", lat: 1.3521, lon: 103.8198, tz: "Asia/Singapore" },
    { id: "reykjavik", lat: 64.1466, lon: -21.9426, tz: "Atlantic/Reykjavik" },
    { id: "tromso", lat: 69.6492, lon: 18.9553, tz: "Europe/Oslo" },
  ];
  // Senkron, yıl-yıl yazım (büyük çıktı bellekte biriktirilmez).
  const f1 = path.join(outDir, `phours_${Y0}_${Y1}.csv`), f2 = path.join(outDir, `phours_probe_${Y0}_${Y1}.csv`);
  fs.writeFileSync(f1, "city,date,sunrise_ms,sunset_ms,nextrise_ms,first_idx,ruler_idx,slot_ok\n");
  fs.writeFileSync(f2, "city,probe_ms,planet_idx,is_day,fallback\n");
  for (const c of CITIES) {
    const resolve = (d: Date) => getTimeZoneOffsetMinutes(d, c.tz);
    for (let y = Y0; y <= Y1; y++) {
      const b1: string[] = [], b2: string[] = [];
      // UI planlayıcısı ile AYNI yol: getPlanetaryHoursForRange (konum günü, DST-doğru offset).
      for (const day of getPlanetaryHoursForRange(new Date(y, 0, 1), new Date(y, 11, 31), c.lat, c.lon, resolve)) {
        const [yy, m, d] = day.dayKey.split("-").map(Number);
        const anchor = locationDayAnchor(yy!, m! - 1, d!, resolve);
        const ruler = CHALDEAN_PLANETS.indexOf(getDayRuler(anchor, resolve(anchor)));
        const slots = day.slots;
        if (slots.length !== 24) { b1.push(`${c.id},${day.dayKey},,,,,${ruler},0`); continue; }
        let okS = 1;
        for (let i = 1; i < 24; i++) {
          if (Math.abs(slots[i]!.start.getTime() - slots[i - 1]!.end.getTime()) > 1) okS = 0;
          if (slots[i]!.chaldeanIdx !== (slots[i - 1]!.chaldeanIdx + 1) % 7) okS = 0;
        }
        b1.push(`${c.id},${day.dayKey},${slots[0]!.start.getTime()},${slots[12]!.start.getTime()},${slots[23]!.end.getTime()},${slots[0]!.chaldeanIdx},${ruler},${okS}`);
        const localMid = anchor.getTime() - 12 * 3_600_000;
        const rise = slots[0]!.start.getTime(), set = slots[12]!.start.getTime();
        if (!["istanbul", "berlin", "newyork", "sydney"].includes(c.id) && d! % 3 !== 0) continue;
        const probes = [0.5, 3, 6, 12, 18].map(h => localMid + h * 3_600_000).concat([rise - 120_000, rise + 120_000, set - 120_000, set + 120_000]);
        for (const p of probes) {
          const r = getPlanetaryHour(new Date(p), c.lat, c.lon, resolve(new Date(p)));
          b2.push(`${c.id},${p},${r.aktifChaldeanIdx},${r.isDayHour ? 1 : 0},${r.isFallback ? 1 : 0}`);
        }
      }
      fs.appendFileSync(f1, b1.join("\n") + (b1.length ? "\n" : ""));
      fs.appendFileSync(f2, b2.join("\n") + (b2.length ? "\n" : ""));
    }
  }
}

if (mode === "hijri") {
  const tz = (process.env.TZ ?? "default").replace(/\//g, "_");
  const w = out(`hijri_${tz}_${Y0}_${Y1}.csv`);
  w.write("date,cosmic,hacamat,cupping,method\n");
  for (let y = Y0; y <= Y1; y++) for (let m = 0; m < 12; m++) {
    for (const day of getHacamatMonthData(y, m).days) {
      const k = iso(y, m, day.day);
      w.write(`${k},${getHijriDate(new Date(y, m, day.day))},${day.hijriFormatted},${gregorianToHijri(k)?.formatted ?? "NULL"},${day.hijriMethod ?? ""}\n`);
    }
  }
  w.end();
}

if (mode === "hacamat") {
  const w = out(`hacamat_${Y0}_${Y1}.csv`);
  w.write("date,weekday,hijri_day,status\n");
  for (let y = Y0; y <= Y1; y++) for (let m = 0; m < 12; m++)
    for (const d of getHacamatMonthData(y, m).days) w.write(`${iso(y, m, d.day)},${d.weekDay},${d.hijriDay},${d.status}\n`);
  w.end();
}

if (mode === "eclipses") {
  const w = out(`eclipses.csv`);
  w.write("kind,type,peakUTC\n");
  for (const e of getSolarEclipses()) w.write(`solar,${e.eclipseType},${e.peakUTC}\n`);
  for (const e of getLunarEclipses()) w.write(`lunar,${e.eclipseType},${e.peakUTC}\n`);
  w.end();
}

if (mode === "aspects") {
  const w = out(`aspects_${Y0}_${Y1}.csv`);
  w.write("utc_ms,set\n");
  for (const [y, m, d] of days(Y0, Y1)) {
    const ms = Date.UTC(y, m, d, 12) - TR;
    w.write(`${ms},${getDailyAspects(new Date(ms)).map(a => `${a.bodyA}-${a.bodyB}-${a.aspectAngle}`).sort().join("|")}\n`);
  }
  w.end();
}
console.log(`done ${mode} ${Y0}-${Y1}`);
