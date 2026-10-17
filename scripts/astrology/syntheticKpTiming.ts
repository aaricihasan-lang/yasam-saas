/**
 * TRANSİT-03 — KP zaman aralığı uçları için SENTETİK yanıt üreticisi (YALNIZ test + yerel sahte Roxy; ürün kodu KULLANMAZ).
 *
 * Gerçek sağlayıcı yanıtı DEĞİLDİR. OpenAPI 2.0.0 şemasındaki alan adlarıyla, bağımsız astronomi (astronomy-engine, görünür
 * jeosentrik tropikal boylam − KP-Newcomb ayanamsa) ve bağımsız KP tablosundan (lib/astrology/verify/kpSub) kurulur.
 * Ayanamsa, gerçek golden kp-planets-at yanıtındaki değere (24,136853° @ 2026-10-07) sabitlenir ve yıllık 50,29″ ile
 * ilerletilir; ortalama Ay düğümü Meeus formülüyle. Üretici kendisi golden'a karşı test edilir (transit03 harness).
 */
import * as Astronomy from "astronomy-engine";
import { kpLordCandidates, kpTable } from "@/lib/astrology/verify/kpSub";
import { NAKSHATRAS, NAKSHATRA_LORDS, type VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_LORDS } from "@/lib/astrology/model/kp";

const AY_REF = 24.136853;
const AY_REF_MS = Date.parse("2026-10-07T09:00:00Z");
const AY_RATE_PER_YEAR = 50.29 / 3600;
export const kpNewcombApprox = (ms: number) => AY_REF + ((ms - AY_REF_MS) / (365.25 * 86_400_000)) * AY_RATE_PER_YEAR;

const BODIES: Record<string, Astronomy.Body> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mars: Astronomy.Body.Mars, mercury: Astronomy.Body.Mercury, jupiter: Astronomy.Body.Jupiter, venus: Astronomy.Body.Venus, saturn: Astronomy.Body.Saturn };
const NAME: Record<string, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };
const SIGN_NAME: Record<string, string> = { aries: "Aries", taurus: "Taurus", gemini: "Gemini", cancer: "Cancer", leo: "Leo", virgo: "Virgo", libra: "Libra", scorpio: "Scorpio", sagittarius: "Sagittarius", capricorn: "Capricorn", aquarius: "Aquarius", pisces: "Pisces" };
const n360 = (x: number) => ((x % 360) + 360) % 360;
const title = (id: string) => id.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Ortalama Ay düğümü (Meeus 22, tropikal). */
function meanNode(ms: number): number {
  const T = (Astronomy.MakeTime(new Date(ms)).tt) / 36525;
  return n360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
}
export function siderealLon(planet: string, ms: number): number {
  const ay = kpNewcombApprox(ms);
  if (planet === "rahu") return n360(meanNode(ms) - ay);
  if (planet === "ketu") return n360(meanNode(ms) + 180 - ay);
  const t = Astronomy.MakeTime(new Date(ms));
  return n360(Astronomy.Ecliptic(Astronomy.GeoVector(BODIES[planet], t, true)).elon - ay);
}
const kpOf = (lon: number) => (kpTable().find((r) => lon >= r.start && lon < r.end) ?? kpTable()[248]).kp;
const signOf = (lon: number) => SIGN_IDS[Math.min(11, Math.floor(lon / 30))];
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** Fonksiyonun değiştiği anı saniyeye kadar bul (ikili arama). */
function refine(planet: string, a: number, b: number, key: (lon: number) => number | string): number {
  const ka = key(siderealLon(planet, a));
  while (b - a > 1000) {
    const m = Math.floor((a + b) / 2);
    if (key(siderealLon(planet, m)) === ka) a = m;
    else b = m;
  }
  return b;
}
function scan(planet: string, startDate: string, endDate: string, key: (lon: number) => number | string): { ms: number; from: number | string; to: number | string }[] {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`) + 86_400_000;
  const step = planet === "moon" ? 10 * 60_000 : 2 * 3600_000;
  const out: { ms: number; from: number | string; to: number | string }[] = [];
  let prevMs = s;
  let prev = key(siderealLon(planet, s));
  for (let t = s + step; t <= e; t += step) {
    const cur = key(siderealLon(planet, Math.min(t, e)));
    if (cur !== prev) {
      const at = refine(planet, prevMs, Math.min(t, e), key);
      if (at < e) out.push({ ms: at, from: prev, to: cur });
    }
    prev = cur;
    prevMs = Math.min(t, e);
  }
  return out;
}

export function syntheticSublordChanges(body: { planet: string; startDate: string; endDate: string }) {
  const planet = Object.entries(NAME).find(([, n]) => n === body.planet)![0];
  const tbl = kpTable();
  const changes = scan(planet, body.startDate, body.endDate, kpOf).map((c) => {
    const f = tbl[(c.from as number) - 1];
    const t = tbl[(c.to as number) - 1];
    return { date: iso(c.ms).slice(0, 10), time: iso(c.ms).slice(11, 16), datetime: iso(c.ms), fromKp: c.from, toKp: c.to, fromSublord: NAME[f.sub], toSublord: NAME[t.sub], fromNakshatraLord: NAME[f.star], toNakshatraLord: NAME[t.star] };
  });
  return { planet: body.planet, startDate: body.startDate, endDate: body.endDate, totalChanges: changes.length, changes };
}

export function syntheticRasiChanges(body: { planet: string; startDate: string; endDate: string }) {
  const planet = Object.entries(NAME).find(([, n]) => n === body.planet)![0];
  const changes = scan(planet, body.startDate, body.endDate, signOf).map((c) => ({
    date: iso(c.ms).slice(0, 10),
    time: iso(c.ms).slice(11, 16),
    datetime: iso(c.ms),
    fromSign: SIGN_NAME[c.from as string],
    fromSignLord: NAME[SIGN_LORDS[c.from as keyof typeof SIGN_LORDS]],
    toSign: SIGN_NAME[c.to as string],
    toSignLord: NAME[SIGN_LORDS[c.to as keyof typeof SIGN_LORDS]],
  }));
  return { planet: body.planet, startDate: body.startDate, endDate: body.endDate, totalChanges: changes.length, changes };
}

function point(planet: string, ms: number) {
  const lon = siderealLon(planet, ms);
  const c = kpLordCandidates(lon, 0)[0];
  const ni = Math.min(26, Math.floor(lon / (360 / 27)));
  const before = siderealLon(planet, ms - 3600_000);
  const retro = planet === "rahu" || planet === "ketu" ? true : n360(lon - before + 180) - 180 < 0;
  const sign = signOf(lon);
  return {
    longitude: Math.round(lon * 1e4) / 1e4,
    degreeInSign: Math.round((lon - SIGN_IDS.indexOf(sign) * 30) * 1e4) / 1e4,
    sign: SIGN_NAME[sign],
    signLord: NAME[SIGN_LORDS[sign]],
    nakshatra: title(NAKSHATRAS[ni]),
    nakshatraLord: NAME[NAKSHATRA_LORDS[ni % 9] as VedicGrahaId],
    sublord: NAME[c.sub],
    subSublord: NAME[c.subSub],
    kpNumber: c.kpNumber,
    isRetrograde: retro,
  };
}

export function syntheticPlanetsInterval(body: { startDatetime: string; endDatetime: string; intervalMinutes: number; ayanamsa: string }) {
  const s = Date.parse(`${body.startDatetime}Z`);
  const e = Date.parse(`${body.endDatetime}Z`);
  const intervals = [];
  for (let t = s; t <= e; t += body.intervalMinutes * 60_000) {
    const planets: Record<string, unknown> = {};
    for (const p of ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"]) planets[NAME[p]] = point(p, t);
    intervals.push({ date: iso(t).slice(0, 10), time: iso(t).slice(11, 16), datetime: iso(t), planets });
  }
  return { startDatetime: body.startDatetime, endDatetime: body.endDatetime, intervalMinutes: body.intervalMinutes, totalIntervals: intervals.length, ayanamsa: body.ayanamsa, ayanamsaValue: Math.round(kpNewcombApprox(s) * 1e6) / 1e6, intervals };
}
