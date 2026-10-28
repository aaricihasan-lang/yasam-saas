// Gökyüzü Atlası — Klasik Batı Horary: soru haritası birleştirici (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Tek giriş noktası: soru anı (UTC) + konum + ekol profili → çerçeve, Regiomontanus evleri, gezegen tablosu (asal + arızi asalet,
// yanma evresi, hız, ev), kabul matrisi, anlık açılar, Ay'ın seyri, Şans noktası, gezegen saati (radikallik verisi), dikkat
// noktaları. HÜKÜM YOK. Sağlayıcı (Roxy natal-chart) anlık görüntüsü verilirse yerel değerlerle KARŞILAŞTIRILIR; eşik aşılırsa
// harita "tutarsız" işaretlenir (sessiz düzeltme yapılmaz).
//
// Yerel saat → UTC dönüşümü bu katmanda YAPILMAZ: ürün mevcut `lib/astrology/birth/timeResolution` (IANA + backzone, belirsiz/
// boşluk saat uyarıları) zincirini kullanmalıdır. Burada yalnız UTC alınır.

import * as Astronomy from "astronomy-engine";
import { accidentalDignity, type AccidentalResult } from "./accidental";
import { essentialDignity, inViaCombusta, partOfFortune, receptionsOf, solarPhase, sunAboveHorizon, sunAltitude, type EssentialDignity, type HoraryProfile, type SolarPhase } from "./calc";
import { degreesToNextCusp, houseOf, regiomontanusCusps, skyFrameAt, type HouseError, type SkyFrame } from "./houses";
import { CLASSICAL_PLANETS, DOMICILE, LILLY_POINTS, TRIPLICITY, degInSign, elementOf, signOf, type ClassicalPlanet } from "./tables";
import { aspectNow, lonAt, moonCourse, speedAt, type AspectNow, type MoonCourse } from "./timeline";

const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

export type ProviderSnapshot = { planets: Partial<Record<ClassicalPlanet, { lon: number; speed: number }>>; asc: number; mc: number };
export type ConsistencyCheck = { maxPlanetLonDiff: number; maxSpeedDiff: number; ascDiff: number; mcDiff: number; ok: boolean; limits: { lon: number; speed: number; angle: number } };

export type PlanetRow = {
  planet: ClassicalPlanet;
  lon: number;
  sign: string;
  degree: number;
  speed: number;
  retrograde: boolean;
  house: number;
  degreesToNextCusp: number;
  solar: { phase: SolarPhase; distance: number; crossSign: boolean } | null;
  essential: EssentialDignity;
  /** CA s. 115: ev yöneticiliğiyle karşılıklı kabul +5, yücelmeyle +4 (gezegen o asalete zaten sahip değilse). */
  mutualReception: { with: ClassicalPlanet; by: "domicile" | "exaltation"; points: number | null }[];
  accidental: AccidentalResult;
};

export type PlanetaryHour = { dayRuler: ClassicalPlanet; hourRuler: ClassicalPlanet; hourNumber: number; isDayHour: boolean; startUtc: string; endUtc: string; sunriseDefinition: string };

export type WesternHoraryChart = {
  profile: { id: string; label: string; unverified: string[] };
  /** Hangi bileşen hangi yöntemle üretildi; null = bu profilde uygulanmadı (Lilly'ninki yerine konmadı). */
  methodology: HoraryProfile["methodology"] & { inheritedFromLilly: string[]; houseSystem: "regiomontanus"; ephemeris: "astronomy-engine 2.1.19 (geosantrik görünür, gerçek ekliptik)" };
  questionUtc: string;
  latitude: number;
  longitude: number;
  frame: SkyFrame;
  houseSystem: "regiomontanus";
  cusps: number[];
  sect: { day: boolean; sunAltitude: number; method: "geometric_altitude" };
  planets: PlanetRow[];
  receptions: { guest: ClassicalPlanet; host: ClassicalPlanet; by: string[] }[];
  aspects: AspectNow[];
  moon: MoonCourse;
  partOfFortune: { lon: number; sign: string; house: number; formula: HoraryProfile["fortune"] };
  planetaryHour: PlanetaryHour | null;
  /** Yalnız `methodology.radicality = lilly_ca121`; aksi hâlde null. Üçlü denetimi Lilly'nin üçlü tablosuyla (CA s. 121 örneği: su
   *  üçlüsünde Mars) — profilin tablosu Lilly değilse bu alan zaten üretilmez. */
  radicality: { ascRuler: ClassicalPlanet; hourRuler: ClassicalPlanet | null; same: boolean; hourRulerRulesAscTriplicity: boolean; note: string } | null;
  /** Yalnız `methodology.considerations = lilly_ca121_123`; aksi hâlde boş. */
  considerations: { key: string; evidence: string }[];
  consistency: ConsistencyCheck | null;
};

const CHALDEAN: readonly ClassicalPlanet[] = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"];
const WEEKDAY_RULER: readonly ClassicalPlanet[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

/**
 * Gezegen saati (CA s. 121 "Lord of the hour"): gün doğumundan batımına 12 eşit gündüz saati, batımdan ertesi doğuma 12 gece
 * saati; 1. gündüz saatinin yöneticisi = günün yöneticisi, sonra Kalde sırası. Gün doğumu/batımı astronomy-engine `SearchRiseSet`
 * (Güneş'in ÜST kenarı + standart kırılma). Lilly bu tanımı yazmaz → `sunriseDefinition` eğitmen kararı. Kutupta doğum/batım
 * yoksa null. Günün tarihi: o gündoğumunun YEREL ORTALAMA ZAMANA göre haftanın günü (boylam/15 sa).
 */
export function planetaryHour(utcMs: number, latitude: number, longitude: number): PlanetaryHour | null {
  const obs = new Astronomy.Observer(latitude, longitude, 0);
  const prevRise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, new Date(utcMs - 1.5 * 86_400_000), 2);
  if (!prevRise) return null;
  // utcMs'den önceki en son gün doğumu.
  let rise = prevRise.date.getTime();
  for (let i = 0; i < 3; i++) {
    const nx = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, new Date(rise + 60_000), 2);
    if (!nx || nx.date.getTime() > utcMs) break;
    rise = nx.date.getTime();
  }
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, -1, new Date(rise + 60_000), 2);
  const nextRise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, new Date(rise + 60_000), 2);
  if (!set || !nextRise) return null;
  const s = set.date.getTime();
  const r2 = nextRise.date.getTime();
  if (!(rise <= utcMs && utcMs < r2 && s > rise && s < r2)) return null;
  const weekday = new Date(rise + (longitude / 15) * 3_600_000).getUTCDay();
  const dayRuler = WEEKDAY_RULER[weekday];
  const isDayHour = utcMs < s;
  const len = isDayHour ? (s - rise) / 12 : (r2 - s) / 12;
  const base = isDayHour ? rise : s;
  const k = Math.min(11, Math.floor((utcMs - base) / len));
  const hourNumber = (isDayHour ? 0 : 12) + k + 1;
  const hourRuler = CHALDEAN[(CHALDEAN.indexOf(dayRuler) + hourNumber - 1) % 7];
  const iso = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
  return { dayRuler, hourRuler, hourNumber, isDayHour, startUtc: iso(base + k * len), endUtc: iso(base + (k + 1) * len), sunriseDefinition: "üst kenar + standart kırılma (astronomy-engine)" };
}

export function buildWesternHoraryChart(input: {
  questionUtc: string;
  latitude: number;
  longitude: number;
  profile: HoraryProfile;
  provider?: ProviderSnapshot;
  northNode?: number | null;
}): WesternHoraryChart | HouseError {
  const ms = Date.parse(input.questionUtc);
  const frame = skyFrameAt(ms, input.latitude, input.longitude);
  if ("error" in frame) return frame;
  const cusps = regiomontanusCusps(frame.ramc, frame.latitude, frame.obliquity);
  if (!Array.isArray(cusps)) return cusps;
  const p = input.profile;
  const pos = Object.fromEntries(CLASSICAL_PLANETS.map((x) => [x, lonAt(x, ms)])) as Record<ClassicalPlanet, number>;
  const spd = Object.fromEntries(CLASSICAL_PLANETS.map((x) => [x, speedAt(x, ms)])) as Record<ClassicalPlanet, number>;
  const alt = sunAltitude(pos.sun, frame.ramc, frame.latitude, frame.obliquity);
  const day = sunAboveHorizon(pos.sun, frame.ramc, frame.latitude, frame.obliquity);

  const planets: PlanetRow[] = CLASSICAL_PLANETS.map((pl) => {
    const lon = pos[pl];
    const ess = essentialDignity(pl, lon, day, p);
    const mutual: PlanetRow["mutualReception"] = [];
    for (const other of CLASSICAL_PLANETS) {
      if (other === pl) continue;
      const r1 = receptionsOf(lon, other, day, p);
      const r2 = receptionsOf(pos[other], pl, day, p);
      const scored = p.methodology.scoring === "lilly_ca115";
      if (r1.includes("domicile") && r2.includes("domicile") && !ess.domicile) mutual.push({ with: other, by: "domicile", points: scored ? LILLY_POINTS.domicile : null });
      else if (r1.includes("exaltation") && r2.includes("exaltation") && !ess.exaltation) mutual.push({ with: other, by: "exaltation", points: scored ? LILLY_POINTS.exaltation : null });
    }
    const house = houseOf(lon, cusps);
    return {
      planet: pl,
      lon,
      sign: signOf(lon),
      degree: degInSign(lon),
      speed: spd[pl],
      retrograde: spd[pl] < 0,
      house,
      degreesToNextCusp: degreesToNextCusp(lon, cusps),
      solar: pl === "sun" ? null : solarPhase(lon, pos.sun, p),
      essential: ess,
      mutualReception: mutual,
      accidental: accidentalDignity({ planet: pl, lon, speed: spd[pl], house, positions: pos, northNode: input.northNode ?? null, stars: { mode: "none", orb: null } }, p),
    };
  });

  const receptions: WesternHoraryChart["receptions"] = [];
  for (const guest of CLASSICAL_PLANETS) for (const host of CLASSICAL_PLANETS) {
    if (guest === host) continue;
    const by = receptionsOf(pos[guest], host, day, p);
    if (by.length) receptions.push({ guest, host, by });
  }
  const aspects: AspectNow[] = [];
  for (let i = 0; i < CLASSICAL_PLANETS.length; i++) for (let j = i + 1; j < CLASSICAL_PLANETS.length; j++) {
    const s = aspectNow(CLASSICAL_PLANETS[i], CLASSICAL_PLANETS[j], ms);
    if (s.withinMoieties) aspects.push(s);
  }
  const moon = moonCourse(ms);
  const pofLon = partOfFortune(frame.asc, pos.sun, pos.moon, day, p.fortune);
  const hour = planetaryHour(ms, input.latitude, input.longitude);
  const ascSign = signOf(cusps[0]);
  const ascRuler = DOMICILE[ascSign as keyof typeof DOMICILE];
  const trip = TRIPLICITY.lilly[elementOf(ascSign as keyof typeof DOMICILE)];
  const radicality = hour && p.methodology.radicality === "lilly_ca121"
    ? {
        ascRuler,
        hourRuler: hour.hourRuler,
        same: hour.hourRuler === ascRuler,
        hourRulerRulesAscTriplicity: trip.includes(hour.hourRuler),
        note: "CA s. 121: saat yöneticisi ile ASC yöneticisi aynı, aynı üçlüden ya da 'aynı doğadan' ise radikal. 'Aynı doğa' (sıcak/kuru vb.) tablosu bu katmanda yok → uzman değerlendirir.",
      }
    : null;

  // Dikkat noktaları (CA s. 121–123) — yalnız konum kanıtı; uyarı mı engel mi eğitmen kararı.
  const cons: WesternHoraryChart["considerations"] = [];
  const lillyCons = p.methodology.considerations === "lilly_ca121_123";
  const ascDeg = degInSign(cusps[0]);
  const shortAscension = ["capricorn", "aquarius", "pisces", "aries", "taurus", "gemini"].includes(ascSign);
  if (ascDeg < p.ascEarly) cons.push({ key: "asc_early", evidence: `ASC ${ascSign} ${ascDeg.toFixed(2)}°${shortAscension ? " (kısa doğuşlu burç — CA s. 122 'especially')" : ""}` });
  if (ascDeg >= p.ascLate) cons.push({ key: "asc_late", evidence: `ASC ${ascSign} ${ascDeg.toFixed(2)}°` });
  if (inViaCombusta(pos.moon, p)) cons.push({ key: "moon_via_combusta", evidence: `Ay ${pos.moon.toFixed(2)}°` });
  if (degInSign(pos.moon) >= 29) cons.push({ key: "moon_late_degree", evidence: `Ay ${signOf(pos.moon)} ${degInSign(pos.moon).toFixed(2)}° (CA s. 122 "later degrees"; 29° eşiği kaynakta yok)` });
  if (moon.voidOfCourse) cons.push({ key: "moon_void_of_course", evidence: `burç girişi ${moon.ingressUtc}; ${["taurus", "cancer", "sagittarius", "pisces"].includes(moon.sign) ? "Boğa/Yengeç/Yay/Balık: CA s. 122 'somewhat she performs'" : ""}`.trim() });
  const sat = planets.find((x) => x.planet === "saturn")!;
  if (sat.house === 1) cons.push({ key: "saturn_in_1", evidence: `Satürn 1. evde${sat.retrograde ? ", geri" : ""}` });
  if (sat.house === 7) cons.push({ key: "saturn_in_7", evidence: "Satürn 7. evde" });
  const lord1 = planets.find((x) => x.planet === ascRuler)!;
  if (lord1.solar?.phase === "combust") cons.push({ key: "lord1_combust", evidence: `${ascRuler} yanık (${lord1.solar.distance.toFixed(2)}°)` });
  const lord7 = planets.find((x) => x.planet === DOMICILE[signOf(cusps[6]) as keyof typeof DOMICILE])!;
  if (lord7.retrograde || lord7.essential.fall || lord7.essential.detriment || lord7.solar?.phase === "combust") {
    cons.push({ key: "lord7_afflicted", evidence: `${lord7.planet}: ${[lord7.retrograde && "geri", lord7.essential.fall && "düşüş", lord7.essential.detriment && "zarar", lord7.solar?.phase === "combust" && "yanık"].filter(Boolean).join(", ")} (CA s. 122–123)` });
  }

  let consistency: ConsistencyCheck | null = null;
  if (input.provider) {
    const pv = input.provider;
    const lons = CLASSICAL_PLANETS.filter((x) => pv.planets[x]).map((x) => Math.abs(wrap180(pv.planets[x]!.lon - pos[x])));
    const sps = CLASSICAL_PLANETS.filter((x) => pv.planets[x]).map((x) => Math.abs(pv.planets[x]!.speed - spd[x]));
    const limits = { lon: 0.02, speed: 0.01, angle: 0.02 };
    const c = { maxPlanetLonDiff: Math.max(0, ...lons), maxSpeedDiff: Math.max(0, ...sps), ascDiff: Math.abs(wrap180(pv.asc - frame.asc)), mcDiff: Math.abs(wrap180(pv.mc - frame.mc)) };
    consistency = { ...c, limits, ok: c.maxPlanetLonDiff <= limits.lon && c.maxSpeedDiff <= limits.speed && c.ascDiff <= limits.angle && c.mcDiff <= limits.angle };
  }

  return {
    profile: { id: p.id, label: p.label, unverified: [...p.unverified] },
    methodology: { ...p.methodology, inheritedFromLilly: [...p.inheritedFromLilly], houseSystem: "regiomontanus", ephemeris: "astronomy-engine 2.1.19 (geosantrik görünür, gerçek ekliptik)" },
    questionUtc: new Date(ms).toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    frame,
    houseSystem: "regiomontanus",
    cusps,
    sect: { day, sunAltitude: alt, method: "geometric_altitude" },
    planets,
    receptions,
    aspects,
    moon,
    partOfFortune: { lon: pofLon, sign: signOf(pofLon), house: houseOf(pofLon, cusps), formula: p.fortune },
    planetaryHour: hour,
    radicality,
    considerations: lillyCons ? cons : [],
    consistency,
  };
}

/** analyzePair için kabul fonksiyonu (sect + profil ile). */
export const receiverFor = (chart: Pick<WesternHoraryChart, "sect">, p: HoraryProfile) => (guestLon: number, host: ClassicalPlanet) => receptionsOf(guestLon, host, chart.sect.day, p) as string[];
