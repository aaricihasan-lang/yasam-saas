// Astroloji — Aşama 6 Roxy KP adaptörleri (SAF). Hesap motoru Roxy; burada yalnız beyaz liste projeksiyon + iç tutarlılık
// denetimi (fail-closed) yapılır, ikinci bir hesap motoru YOKTUR.
//
// /vedic-astrology/kp/chart denetimleri:
//   • meta: ayanamsa tipi = istenen; ev sistemi = placidus; doğum tarih/saat/konum/ofset yankısı = gönderilen
//   • her nokta: burç ↔ boylam, burç lordu ↔ klasik yönetici, nakshatra/pada ↔ boylam, star lord ↔ Vimshottari sırası,
//     sub / sub-sub lord + KP numarası ↔ KP alt bölüm kuralı (verify/kpSub; 4 ondalık yuvarlama toleransı)
//   • 12 cusp sırayla; Placidus karşıt cusp'lar (h, h+6) tam 180°; ascendant = cusp 1
//   • 7 graha + Rahu + Ketu; Ketu = Rahu + 180°; gezegen evi ↔ cusp aralığı
//   • significators: 9 graha × 4 düzey ↔ 12 ev × 4 düzey birebir; düzey düzleştirmeleri (all / allHouses) tutarlı
// houseThemes (anlatı, lang=tr) → yalnız yorum katmanı. significators[].description (yerel düzey etiketi) → alınmaz (düzey no var).

import { SIGN_IDS, type SignId } from "../../model/western";
import { NAKSHATRAS, NAKSHATRA_LORDS, type VedicGrahaId } from "../../model/vedic";
import {
  KP_CHART_INTERP_SCHEMA,
  KP_CHART_TECHNICAL_SCHEMA,
  SIGN_LORDS,
  type KpAyanamsaId,
  type KpBody,
  type KpChartInterpretation,
  type KpChartTechnical,
  type KpCusp,
  type KpLevel,
  type KpPoint,
  type KpSignificators,
} from "../../model/kp";
import { kpLordCandidates } from "../../verify/kpSub";
import { mapGraha, mapRashi } from "./vedic";
import { arr, findUnmapped, int, keywords, num, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";

const NAK = 360 / 27;
const PADA = 360 / 108;
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
/** Roxy nakshatra yazımları → kanonik kimlik (yalnız ad denetimi; kimlik boylamdan türetilir). */
const NAK_ALIAS: Record<string, string> = { moola: "mula", dhanishtha: "dhanishta", shatabhishak: "shatabhisha", jyeshta: "jyeshtha", purva_phalguni: "purva_phalguni" };

export const ROXY_KP_CHART = { endpoint: "/vedic-astrology/kp/chart", adapter: "astro-roxy-kp-chart-1", projection: "kp-chart-proj-1" } as const;

const POINT_KEYS = ["longitude", "sign", "signLord", "nakshatra", "nakshatraLord", "pada", "starLord", "subLord", "subSubLord", "kpNumber"];
const KP_CHART_KNOWN = new Set<string>([
  ...paths("meta", ["date", "time", "latitude", "longitude", "timezone", "ayanamsa", "ayanamsaType", "houseSystem"]),
  ...paths("ascendant", POINT_KEYS),
  "cusps",
  ...paths("cusps[]", ["house", ...POINT_KEYS]),
  "planets",
  ...paths("planets[]", ["planet", "house", "retrograde", ...POINT_KEYS]),
  "nodes",
  ...["rahu", "ketu"].flatMap((n) => paths(`nodes.${n}`, ["house", ...POINT_KEYS])),
  "significators",
  "significators.houseWise",
  ...paths("significators.houseWise[]", ["house", "significators", "all"]),
  ...paths("significators.houseWise[].significators[]", ["level", "description", "planets"]),
  "significators.houseWise[].significators[].planets[]",
  "significators.houseWise[].all[]",
  "significators.planetWise",
  ...paths("significators.planetWise[]", ["planet", "house", "starLord", "subLord", "signifies", "allHouses"]),
  ...paths("significators.planetWise[].signifies[]", ["level", "houses"]),
  "significators.planetWise[].signifies[].houses[]",
  "significators.planetWise[].allHouses[]",
  "houseThemes",
  "focus",
]);
const KP_CHART_OPAQUE = new Set(["houseThemes"]);

const norm360 = (x: number) => ((x % 360) + 360) % 360;
const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Ortak KP nokta projeksiyonu + tutarlılık denetimi. */
export function projectKpPoint(o: Record<string, unknown> | null, ctx: string, errors: string[], dropped: string[], opts: { requirePada: boolean; requireSign: boolean }): KpPoint | null {
  const longitude = num(o?.longitude, 0, 360);
  const rashi = mapRashi(o?.sign);
  const signLord = mapGraha(o?.signLord);
  const star = mapGraha(o?.starLord);
  const sub = mapGraha(o?.subLord);
  const subSub = mapGraha(o?.subSubLord);
  const kpNumber = int(o?.kpNumber, 1, 249);
  const pada = o?.pada === undefined && !opts.requirePada ? null : int(o?.pada, 1, 4);
  if (longitude === null || !rashi || (opts.requireSign && !signLord) || !star || !sub || !subSub || kpNumber === null || (opts.requirePada && pada === null)) {
    errors.push(`${ctx}: alan`);
    return null;
  }
  const lon = norm360(longitude);
  const si = Math.min(11, Math.floor(lon / 30));
  if (SIGN_IDS[si] !== rashi) errors.push(`${ctx}: burç boylamla uyuşmuyor`);
  if (signLord && SIGN_LORDS[rashi] !== signLord) errors.push(`${ctx}: burç lordu klasik yöneticiyle uyuşmuyor`);
  const ni = Math.min(26, Math.floor(lon / NAK));
  const ep = Math.min(4, Math.floor((lon % NAK) / PADA) + 1);
  if (pada !== null && pada !== ep) errors.push(`${ctx}: pada boylamla uyuşmuyor`);
  if (star !== NAKSHATRA_LORDS[ni % 9]) errors.push(`${ctx}: star lord Vimshottari sırasıyla uyuşmuyor`);
  if (o?.nakshatraLord !== undefined && mapGraha(o.nakshatraLord) !== star) errors.push(`${ctx}: nakshatraLord ≠ starLord`);
  if (typeof o?.nakshatra === "string") {
    const s = slug(o.nakshatra);
    if ((NAK_ALIAS[s] ?? s) !== NAKSHATRAS[ni]) dropped.push(`${ctx}.nakshatra`);
  }
  const cand = kpLordCandidates(lon);
  if (!cand.some((c) => c.star === star && c.sub === sub && c.subSub === subSub && c.kpNumber === kpNumber)) errors.push(`${ctx}: sub/sub-sub lord veya KP numarası KP alt bölüm kuralıyla uyuşmuyor`);
  return {
    longitude: lon,
    rashi,
    degreeInRashi: lon - si * 30,
    signLord: signLord ?? SIGN_LORDS[rashi],
    nakshatra: { index: ni, id: NAKSHATRAS[ni], pada: (pada ?? ep) as 1 | 2 | 3 | 4 },
    starLord: star,
    subLord: sub,
    subSubLord: subSub,
    kpNumber,
  };
}

/** Placidus cusp aralığından ev (cusp h ≤ boylam < cusp h+1). */
export function placidusHouse(longitude: number, cusps: { house: number; longitude: number }[]): number {
  const sorted = [...cusps].sort((a, b) => a.house - b.house);
  for (let i = 0; i < 12; i++) {
    const a = sorted[i].longitude;
    const b = sorted[(i + 1) % 12].longitude;
    const span = norm360(b - a);
    if (norm360(longitude - a) < span) return sorted[i].house;
  }
  return 0;
}

const LEVELS: KpLevel[] = [1, 2, 3, 4];

function projectSignificators(raw: Record<string, unknown> | null, errors: string[]): KpSignificators {
  const planets: KpSignificators["planets"] = [];
  for (const it of arr(raw?.planetWise) ?? []) {
    const o = obj(it);
    const id = mapGraha(o?.planet);
    if (!id) {
      errors.push("significators.planetWise[]: graha");
      continue;
    }
    const levels = { 1: [], 2: [], 3: [], 4: [] } as Record<KpLevel, number[]>;
    for (const s of arr(o?.signifies) ?? []) {
      const so = obj(s);
      const lv = int(so?.level, 1, 4) as KpLevel | null;
      const hs = (arr(so?.houses) ?? []).map((h) => int(h, 1, 12));
      if (!lv || hs.some((h) => h === null)) {
        errors.push(`significators.planetWise.${id}: düzey`);
        continue;
      }
      levels[lv] = hs as number[];
    }
    const flat = LEVELS.flatMap((l) => levels[l]);
    const all = (arr(o?.allHouses) ?? []).map((h) => int(h, 1, 12));
    if (all.join() !== flat.join()) errors.push(`significators.planetWise.${id}: allHouses düzeylerle uyuşmuyor`);
    planets.push({ id, levels });
  }
  const houses: KpSignificators["houses"] = [];
  for (const it of arr(raw?.houseWise) ?? []) {
    const o = obj(it);
    const house = int(o?.house, 1, 12);
    if (house === null) {
      errors.push("significators.houseWise[]: ev");
      continue;
    }
    const levels = { 1: [], 2: [], 3: [], 4: [] } as Record<KpLevel, VedicGrahaId[]>;
    for (const s of arr(o?.significators) ?? []) {
      const so = obj(s);
      const lv = int(so?.level, 1, 4) as KpLevel | null;
      const ps = (arr(so?.planets) ?? []).map(mapGraha);
      if (!lv || ps.some((p) => !p)) {
        errors.push(`significators.houseWise.${house}: düzey`);
        continue;
      }
      levels[lv] = ps as VedicGrahaId[];
    }
    const flat = LEVELS.flatMap((l) => levels[l]);
    if ((arr(o?.all) ?? []).map(mapGraha).join() !== flat.join()) errors.push(`significators.houseWise.${house}: all düzeylerle uyuşmuyor`);
    houses.push({ house, levels });
  }
  if (planets.length !== 9 || new Set(planets.map((p) => p.id)).size !== 9) errors.push("significators.planetWise: 9 graha yok");
  if (houses.map((h) => h.house).join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push("significators.houseWise: 12 ev sırası");
  // Çapraz: ev h, düzey L'de graha p ⇔ graha p, düzey L'de ev h.
  for (const h of houses) {
    for (const l of LEVELS) {
      const fromPlanets = planets.filter((p) => p.levels[l].includes(h.house)).map((p) => p.id).sort().join();
      if ([...new Set(h.levels[l])].sort().join() !== fromPlanets) errors.push(`significators: ev ${h.house} düzey ${l} gezegen listesiyle uyuşmuyor`);
    }
  }
  return { planets, houses };
}

export function projectRoxyKpChart(
  raw: unknown,
  opts: { ayanamsa: KpAyanamsaId; nodeType: "mean" | "true"; birth: { date: string; time: string; latitude: number; longitude: number; timezone: number } },
): AdapterResult<KpChartTechnical, KpChartInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const meta = obj(r.meta);
  const ayDeg = num(meta?.ayanamsa, 0, 40);
  if (meta?.ayanamsaType !== opts.ayanamsa || ayDeg === null) errors.push("meta: istenen KP ayanamsa değil");
  if (meta?.houseSystem !== "placidus") errors.push("meta: ev sistemi Placidus değil");
  const b = opts.birth;
  if (meta?.date !== b.date || meta?.time !== b.time || meta?.timezone !== b.timezone || Math.abs(Number(meta?.latitude) - b.latitude) > 1e-6 || Math.abs(Number(meta?.longitude) - b.longitude) > 1e-6) errors.push("meta: doğum yankısı gönderilenle uyuşmuyor");
  const ascendant = projectKpPoint(obj(r.ascendant), "ascendant", errors, dropped, { requirePada: true, requireSign: true });
  const cusps: KpCusp[] = [];
  for (const it of arr(r.cusps) ?? []) {
    const o = obj(it);
    const house = int(o?.house, 1, 12);
    const p = projectKpPoint(o, `cusps.${String(house)}`, errors, dropped, { requirePada: true, requireSign: true });
    if (house === null || !p) continue;
    cusps.push({ ...p, house });
  }
  if (cusps.map((c) => c.house).join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push("cusps: 12 ev sırası");
  else {
    for (let h = 0; h < 6; h++) if (sep(cusps[h + 6].longitude, norm360(cusps[h].longitude + 180)) > 1e-3) errors.push(`cusps: ${h + 1}/${h + 7} karşıt değil (Placidus)`);
    if (ascendant && sep(ascendant.longitude, cusps[0].longitude) > 1e-6) errors.push("ascendant ≠ cusp 1");
  }
  const bodies: KpBody[] = [];
  for (const it of arr(r.planets) ?? []) {
    const o = obj(it);
    const id = mapGraha(o?.planet);
    const p = projectKpPoint(o, `planets.${String(o?.planet)}`, errors, dropped, { requirePada: true, requireSign: true });
    const house = int(o?.house, 1, 12);
    if (!id || !p || house === null || typeof o?.retrograde !== "boolean") {
      errors.push(`planets.${String(o?.planet)}: alan`);
      continue;
    }
    bodies.push({ ...p, id, house, retrograde: o.retrograde });
  }
  if (bodies.map((x) => x.id).join() !== "sun,moon,mars,mercury,jupiter,venus,saturn") errors.push("planets: 7 graha sırası");
  const nodes = obj(r.nodes);
  for (const n of ["rahu", "ketu"] as const) {
    const o = obj(nodes?.[n]);
    const p = projectKpPoint(o, `nodes.${n}`, errors, dropped, { requirePada: true, requireSign: true });
    const house = int(o?.house, 1, 12);
    if (!p || house === null) {
      errors.push(`nodes.${n}: alan`);
      continue;
    }
    // Roxy düğümde retro alanı vermez; ortalama düğüm her zaman geri hareketlidir (belge) → null = "alan yok".
    bodies.push({ ...p, id: n, house, retrograde: null });
  }
  const ra = bodies.find((x) => x.id === "rahu");
  const ke = bodies.find((x) => x.id === "ketu");
  if (!ra || !ke || sep(ke.longitude, norm360(ra.longitude + 180)) > 1e-3) errors.push("nodes: Ketu = Rahu + 180° değil");
  if (cusps.length === 12) for (const x of bodies) if (placidusHouse(x.longitude, cusps) !== x.house) errors.push(`${x.id}: ev Placidus cusp aralığıyla uyuşmuyor`);
  const significators = projectSignificators(obj(r.significators), errors);
  const themes = obj(r.houseThemes);
  return errors.length > 0
    ? { ok: false, errors: errors.slice(0, 25) }
    : {
        ok: true,
        technical: {
          schema: KP_CHART_TECHNICAL_SCHEMA,
          zodiac: "sidereal",
          frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! },
          houseSystem: "placidus",
          nodeType: opts.nodeType,
          ascendant: ascendant!,
          cusps,
          bodies,
          significators,
        },
        interpretation: {
          schema: KP_CHART_INTERP_SCHEMA,
          houseThemes: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, keywords: keywords(themes?.[String(i + 1)]) })).filter((x) => x.keywords.length > 0),
        },
        unmappedFields: findUnmapped(raw, KP_CHART_KNOWN, KP_CHART_OPAQUE),
        droppedValues: [...new Set(dropped)],
      };
}

export type { SignId };
