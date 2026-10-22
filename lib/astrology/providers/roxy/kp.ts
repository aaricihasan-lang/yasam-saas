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
  KP_EXTRA_INTERP_SCHEMA,
  KP_HORARY_TECHNICAL_SCHEMA,
  KP_RULING_TECHNICAL_SCHEMA,
  KP_TRANSIT_TECHNICAL_SCHEMA,
  type KpExtraInterpretation,
  type KpHoraryTechnical,
  type KpRulingTechnical,
  type KpTransitTechnical,
  type KpPositionRow,
  type KpRasiChange,
  type KpSublordChange,
  type KpTimingPart,
  type KpTimingPlanet,
} from "../../model/kp";
import { kpLordCandidates, kpSpan, kpTable } from "../../verify/kpSub";
import { mapGraha, mapRashi } from "./vedic";
import { arr, findUnmapped, int, keywords, num, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";

const NAK = 360 / 27;
/** ATL-P2-03: sağlayıcının bölünmüş sub 2. parçasında verdiği yanlış KP numarası (adaptör hata nedeni; motor kullanıcı mesajını buna göre seçer). */
export const KP_SPLIT_SUB_PROVIDER_ERROR = "KP numarası bölünmüş alt bölümde servis tarafından tutarsız";
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
  ...paths("significators.planetWise[]", ["planet", "house", "starLord", "subLord", "signifies", "allHouses", "agentHouses"]),
  "significators.planetWise[].agentHouses[]",
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
export function projectKpPoint(o: Record<string, unknown> | null, ctx: string, errors: string[], dropped: string[], opts: { requirePada: boolean; requireSign: boolean; requireSubSub?: boolean }): KpPoint | null {
  const longitude = num(o?.longitude, 0, 360);
  const rashi = mapRashi(o?.sign);
  const signLord = mapGraha(o?.signLord);
  const star = mapGraha(o?.starLord);
  const sub = mapGraha(o?.subLord);
  const needSS = opts.requireSubSub !== false;
  const subSub = o?.subSubLord === undefined && !needSS ? null : mapGraha(o?.subSubLord);
  const kpNumber = int(o?.kpNumber, 1, 249);
  const pada = o?.pada === undefined && !opts.requirePada ? null : int(o?.pada, 1, 4);
  if (longitude === null || !rashi || (opts.requireSign && !signLord) || !star || !sub || (needSS && !subSub) || kpNumber === null || (opts.requirePada && pada === null)) {
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
  if (!cand.some((c) => c.star === star && c.sub === sub && (subSub === null || c.subSub === subSub) && c.kpNumber === kpNumber)) {
    // ATL-P2-03 (2026-10-20): burç sınırında bölünen sub'ın 2. parçasında sağlayıcı 1. parçanın numarasını verir (lordlar doğru).
    // Sonuç yine REDDEDİLİR (yanlış numara gösterilmez); yalnız hata nedeni ayrılır → kullanıcıya doğru açıklama.
    const prev = kpTable()[kpNumber - 1];
    const split = prev && prev.star === star && prev.sub === sub && cand.some((c) => c.star === star && c.sub === sub && (subSub === null || c.subSub === subSub) && c.kpNumber === kpNumber + 1);
    errors.push(split ? `${ctx}: ${KP_SPLIT_SUB_PROVIDER_ERROR} (beklenen ${kpNumber + 1}, gelen ${kpNumber})` : `${ctx}: sub/sub-sub lord veya KP numarası KP alt bölüm kuralıyla uyuşmuyor`);
  }
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

export function projectSignificators(raw: Record<string, unknown> | null, errors: string[]): KpSignificators {
  // 1) Ev-bazlı tablo (her uçta SADE kural; düğüm ajan eki içermez).
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
  // 2) Gezegen-bazlı tablo. Horary ucunda düğümler için Roxy `signifies`'ı AJAN EKLİ verir, `allHouses` ve ev tablosu ise SADE kural
  //    (+ ayrı `agentHouses`). Bu durumda sade düzeyler ev tablosundan alınır; ajan ekli liste ayrı saklanır (kp/chart ucunda yok).
  const planets: KpSignificators["planets"] = [];
  for (const it of arr(raw?.planetWise) ?? []) {
    const o = obj(it);
    const id = mapGraha(o?.planet);
    if (!id) {
      errors.push("significators.planetWise[]: graha");
      continue;
    }
    const given = { 1: [], 2: [], 3: [], 4: [] } as Record<KpLevel, number[]>;
    for (const s of arr(o?.signifies) ?? []) {
      const so = obj(s);
      const lv = int(so?.level, 1, 4) as KpLevel | null;
      const hs = (arr(so?.houses) ?? []).map((h) => int(h, 1, 12));
      if (!lv || hs.some((h) => h === null)) {
        errors.push(`significators.planetWise.${id}: düzey`);
        continue;
      }
      given[lv] = hs as number[];
    }
    const all = (arr(o?.allHouses) ?? []).map((h) => int(h, 1, 12));
    const agentRaw = o?.agentHouses;
    if (agentRaw !== undefined) {
      const agentHouses = (arr(agentRaw) ?? []).map((h) => int(h, 1, 12));
      if (id !== "rahu" && id !== "ketu") errors.push(`significators.planetWise.${id}: ajan evleri yalnız düğümde olabilir`);
      if (agentHouses.some((h) => h === null)) errors.push(`significators.planetWise.${id}: agentHouses`);
      const plain = { 1: [], 2: [], 3: [], 4: [] } as Record<KpLevel, number[]>;
      for (const l of LEVELS) plain[l] = houses.filter((h) => h.levels[l].includes(id)).map((h) => h.house);
      const union = new Set(LEVELS.flatMap((l) => given[l]));
      for (const l of LEVELS) for (const h of plain[l]) if (!given[l].includes(h)) errors.push(`significators.planetWise.${id}: sade L${l} evi ${h} ajan ekli listede yok`);
      for (const h of agentHouses) if (h !== null && !union.has(h)) errors.push(`significators.planetWise.${id}: ajan evi ${h} listede yok`);
      if ([...all].sort().join() !== LEVELS.flatMap((l) => plain[l]).sort().join()) errors.push(`significators.planetWise.${id}: allHouses sade düzeylerle uyuşmuyor`);
      planets.push({ id, levels: plain, agent: { levels: given, houses: agentHouses as number[] } });
      continue;
    }
    const flat = LEVELS.flatMap((l) => given[l]);
    if (all.join() !== flat.join()) errors.push(`significators.planetWise.${id}: allHouses düzeylerle uyuşmuyor`);
    planets.push({ id, levels: given });
  }
  if (planets.length !== 9 || new Set(planets.map((p) => p.id)).size !== 9) errors.push("significators.planetWise: 9 graha yok");
  if (houses.map((h) => h.house).join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push("significators.houseWise: 12 ev sırası");
  // Çapraz: ev h, düzey L'de graha p ⇔ graha p (sade), düzey L'de ev h.
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

// ═══ 6F · Ruling Planets (/vedic-astrology/kp/ruling-planets) ═══════════════
// Denetimler: datetime yankısı = istenen UTC anı; konum/ofset yankısı; tüm lordlar graha; rulingPlanets kümesi = klasik 5 öğe
// (gün lordu, Ay burç + yıldız lordu, Lagna burç + yıldız lordu) — Roxy sub lordları kümeye katmaz; significator listesi =
// ruling planets kümesi, evler 1–12. Ayanamsa alanı YOK (Roxy KP-Newcomb dahili; testte Ay sub lordu KP efemerisiyle çapraz denetlenir).
export const ROXY_KP_RULING = { endpoint: "/vedic-astrology/kp/ruling-planets", adapter: "astro-roxy-kp-ruling-1", projection: "kp-ruling-proj-1" } as const;
const RP_LORD_KEYS = ["dayLord", "moonSignLord", "moonStarLord", "moonSublord", "moonSubSublord", "lagnaSignLord", "lagnaStarLord", "lagnaSublord", "lagnaSubSublord"];
const KP_RULING_KNOWN = new Set<string>([
  "datetime",
  ...paths("location", ["latitude", "longitude", "timezone"]),
  ...RP_LORD_KEYS,
  "rulingPlanets",
  "rulingPlanets[]",
  "significators",
  ...paths("significators[]", ["planet", "signifies"]),
  "significators[].signifies[]",
  "houseThemes",
  "focus",
]);

type RpLords = { dayLord: VedicGrahaId; moon: KpRulingTechnical["moon"]; lagna: KpRulingTechnical["lagna"]; rulingPlanets: VedicGrahaId[] };
function projectRpLords(o: Record<string, unknown> | null, ctx: string, errors: string[]): RpLords | null {
  const L = Object.fromEntries(RP_LORD_KEYS.map((k) => [k, mapGraha(o?.[k])])) as Record<string, VedicGrahaId | null>;
  const rp = (arr(o?.rulingPlanets) ?? []).map(mapGraha);
  if (Object.values(L).some((x) => !x) || rp.length === 0 || rp.some((x) => !x)) {
    errors.push(`${ctx}: ruling planet alanları`);
    return null;
  }
  const classical = [...new Set([L.dayLord, L.moonSignLord, L.moonStarLord, L.lagnaSignLord, L.lagnaStarLord])].sort().join();
  if ([...new Set(rp)].sort().join() !== classical || new Set(rp).size !== rp.length) errors.push(`${ctx}: rulingPlanets klasik 5 öğe kümesi değil`);
  return {
    dayLord: L.dayLord!,
    moon: { sign: L.moonSignLord!, star: L.moonStarLord!, sub: L.moonSublord!, subSub: L.moonSubSublord! },
    lagna: { sign: L.lagnaSignLord!, star: L.lagnaStarLord!, sub: L.lagnaSublord!, subSub: L.lagnaSubSublord! },
    rulingPlanets: rp as VedicGrahaId[],
  };
}
const themesOf = (v: unknown) => {
  const th = obj(v);
  return Array.from({ length: 12 }, (_, i) => ({ house: i + 1, keywords: keywords(th?.[String(i + 1)]) })).filter((x) => x.keywords.length > 0);
};

export function projectRoxyKpRuling(
  raw: unknown,
  opts: { atUtc: string; local: string; utcOffsetHours: number; place: { latitude: number; longitude: number }; withBirth?: boolean },
): AdapterResult<KpRulingTechnical, KpExtraInterpretation> {
  const withBirth = opts.withBirth !== false;
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  // ATL-P2-02 (2026-10-20): ondalık ofset (ör. 0,833333 sa = 2999,9988 sn) sağlayıcı yankısında "…:00.001Z/.002Z" olur → <1 sn kabul;
  // ≥1 sn kayma hâlâ reddedilir (Lagna 1 sn'de ~15″; KP sub sınırına göre önemsiz).
  if (typeof r.datetime !== "string" || !(Math.abs(Date.parse(r.datetime) - Date.parse(`${opts.atUtc}:00Z`)) < 1000)) errors.push("datetime istenen an değil");
  const loc = obj(r.location);
  if (Math.abs(Number(loc?.latitude) - opts.place.latitude) > 1e-6 || Math.abs(Number(loc?.longitude) - opts.place.longitude) > 1e-6 || loc?.timezone !== opts.utcOffsetHours) errors.push("location yankısı");
  const lords = projectRpLords(r, "rulingPlanets", errors);
  const significators: KpRulingTechnical["significators"] = [];
  for (const it of arr(r.significators) ?? []) {
    const o = obj(it);
    const id = mapGraha(o?.planet);
    const hs = (arr(o?.signifies) ?? []).map((h) => int(h, 1, 12));
    if (!id || hs.some((h) => h === null) || new Set(hs).size !== hs.length) {
      errors.push("significators[]: alan");
      continue;
    }
    significators.push({ id, houses: hs as number[] });
  }
  if (withBirth && lords && significators.map((x) => x.id).sort().join() !== [...lords.rulingPlanets].sort().join()) errors.push("significators ruling planets kümesiyle uyuşmuyor");
  // 9A-P2-04: doğum verisi gönderilmediyse significator GELMEMELİ (gelirse gözlem yeri haritasından olur → reddedilir).
  if (!withBirth && (r.significators !== undefined || significators.length > 0)) errors.push("doğum verisiz istekte significators beklenmiyor");
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: {
      schema: KP_RULING_TECHNICAL_SCHEMA,
      frame: { ayanamsa: "kp-newcomb" },
      at: { utc: opts.atUtc, local: opts.local, utcOffsetHours: opts.utcOffsetHours },
      place: opts.place,
      ...lords!,
      significators,
      ...(withBirth ? {} : { significatorsOmitted: "place_differs" as const }),
    },
    interpretation: { schema: KP_EXTRA_INTERP_SCHEMA, houseThemes: themesOf(r.houseThemes) },
    unmappedFields: findUnmapped(raw, KP_RULING_KNOWN, new Set(["houseThemes"])),
    droppedValues: [],
  };
}

// ═══ 6F · KP transit = KP efemeris tek an (/vedic-astrology/kp/planets-interval) ═
export const ROXY_KP_PLANETS_AT = { endpoint: "/vedic-astrology/kp/planets-interval", adapter: "astro-roxy-kp-planets-at-1", projection: "kp-transit-proj-1" } as const;
const PI_KEYS = ["longitude", "degreeInSign", "sign", "signLord", "nakshatra", "nakshatraLord", "sublord", "subSublord", "kpNumber", "isRetrograde"];
const PI_NAMES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
const KP_PI_KNOWN = new Set<string>([
  "startDatetime",
  "endDatetime",
  "intervalMinutes",
  "totalIntervals",
  "ayanamsa",
  "ayanamsaValue",
  "intervals",
  ...paths("intervals[]", ["date", "time", "datetime", "planets"]),
  ...PI_NAMES.flatMap((n) => paths(`intervals[].planets.${n}`, PI_KEYS)),
]);
export function projectRoxyKpPlanetsAt(raw: unknown, opts: { atUtc: string; ayanamsa: KpAyanamsaId; nodeType: "mean" | "true" }): AdapterResult<KpTransitTechnical, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.ayanamsa !== opts.ayanamsa) errors.push("ayanamsa yankısı");
  const ayDeg = num(r.ayanamsaValue, 0, 40);
  if (ayDeg === null) errors.push("ayanamsaValue");
  const first = obj((arr(r.intervals) ?? [])[0]);
  if (first?.datetime !== `${opts.atUtc}:00`) errors.push("ilk aralık istenen an değil");
  const pl = obj(first?.planets);
  const bodies: KpTransitTechnical["bodies"] = [];
  for (const name of PI_NAMES) {
    const o = obj(pl?.[name]);
    const id = mapGraha(name)!;
    const mapped = o ? { longitude: o.longitude, sign: o.sign, signLord: o.signLord, nakshatra: o.nakshatra, starLord: o.nakshatraLord, subLord: o.sublord, subSubLord: o.subSublord, kpNumber: o.kpNumber } : null;
    const p = projectKpPoint(mapped, `planets.${name}`, errors, dropped, { requirePada: false, requireSign: true });
    if (!p || typeof o?.isRetrograde !== "boolean") {
      if (p) errors.push(`planets.${name}: retro`);
      continue;
    }
    if (Math.abs(Number(o.degreeInSign) - p.degreeInRashi) > 1e-3) errors.push(`planets.${name}: degreeInSign`);
    bodies.push({ ...p, id, retrograde: o.isRetrograde });
  }
  if (bodies.length !== 9) errors.push("9 graha yok");
  const ra = bodies.find((x) => x.id === "rahu");
  const ke = bodies.find((x) => x.id === "ketu");
  if (ra && ke && sep(ke.longitude, norm360(ra.longitude + 180)) > 1e-3) errors.push("Ketu = Rahu + 180° değil");
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: { schema: KP_TRANSIT_TECHNICAL_SCHEMA, frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, nodeType: opts.nodeType, at: { utc: opts.atUtc }, bodies },
    interpretation: null,
    unmappedFields: findUnmapped(raw, KP_PI_KNOWN, new Set()),
    droppedValues: [...new Set(dropped)],
  };
}

// ═══ 6F · KP Horary (/vedic-astrology/kp/horary) ═══════════════════════════
// Denetimler: sayı + soru anı + ayanamsa yankısı; Asc KP numarası = sayı; spanFrom/To = KP tablosundaki dilim; Asc = dilim ORTA
// noktası (belge); cusp 1 = Asc; 12 cusp sırayla ve karşıt; noktalar KP alt bölüm kuralıyla tutarlı; gezegen evi ↔ Placidus aralığı;
// significator çaprazı; ruling planets klasik 5 öğe.
export const ROXY_KP_HORARY = { endpoint: "/vedic-astrology/kp/horary", adapter: "astro-roxy-kp-horary-1", projection: "kp-horary-proj-1" } as const;
const H_POINT = ["longitude", "sign", "star", "starLord", "subLord", "kpNumber"];
const KP_HORARY_KNOWN = new Set<string>([
  "horaryNumber",
  "questionTime",
  "ayanamsaType",
  "ayanamsaDegrees",
  ...paths("ascendant", [...H_POINT, "degreeInSign", "spanFrom", "spanTo"]),
  "cusps",
  ...paths("cusps[]", ["house", ...H_POINT]),
  "planets",
  ...paths("planets[]", ["planet", "house", "isRetrograde", "subSubLord", ...H_POINT]),
  ...paths("rulingPlanets", RP_LORD_KEYS),
  "rulingPlanets.rulingPlanets",
  "rulingPlanets.rulingPlanets[]",
  ...[...KP_CHART_KNOWN].filter((k) => k.startsWith("significators")),
  "houseThemes",
  "focus",
]);
export function projectRoxyKpHorary(
  raw: unknown,
  opts: { horaryNumber: number; atUtc: string; ayanamsa: KpAyanamsaId; nodeType: "mean" | "true"; place: { latitude: number; longitude: number } },
): AdapterResult<KpHoraryTechnical, KpExtraInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.horaryNumber !== opts.horaryNumber) errors.push("horaryNumber yankısı");
  if (typeof r.questionTime !== "string" || Date.parse(r.questionTime) !== Date.parse(`${opts.atUtc}:00Z`)) errors.push("questionTime istenen an değil");
  if (r.ayanamsaType !== opts.ayanamsa) errors.push("ayanamsaType yankısı");
  const ayDeg = num(r.ayanamsaDegrees, 0, 40);
  if (ayDeg === null) errors.push("ayanamsaDegrees");
  const pt = (o: Record<string, unknown> | null) => (o ? { ...o, nakshatra: o.star } : null);
  const ao = obj(r.ascendant);
  const ascendant = projectKpPoint(pt(ao), "ascendant", errors, dropped, { requirePada: false, requireSign: false, requireSubSub: false });
  const span = kpSpan(opts.horaryNumber);
  const from = num(ao?.spanFrom, 0, 360);
  const to = num(ao?.spanTo, 0, 360);
  if (!span || from === null || to === null || Math.abs(from - span.start) > 1e-3 || Math.abs(to - span.end) > 1e-3) errors.push("ascendant span KP tablosuyla uyuşmuyor");
  if (ascendant && span && (ascendant.kpNumber !== opts.horaryNumber || Math.abs(ascendant.longitude - (span.start + span.end) / 2) > 1e-3)) errors.push("ascendant sayının alt bölüm orta noktası değil");
  const cusps: KpCusp[] = [];
  for (const it of arr(r.cusps) ?? []) {
    const o = obj(it);
    const house = int(o?.house, 1, 12);
    const p = projectKpPoint(pt(o), `cusps.${String(house)}`, errors, dropped, { requirePada: false, requireSign: false, requireSubSub: false });
    if (house === null || !p) continue;
    cusps.push({ ...p, house });
  }
  if (cusps.map((c) => c.house).join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push("cusps: 12 ev sırası");
  else {
    for (let h = 0; h < 6; h++) if (sep(cusps[h + 6].longitude, norm360(cusps[h].longitude + 180)) > 1e-3) errors.push(`cusps: ${h + 1}/${h + 7} karşıt değil`);
    if (ascendant && sep(ascendant.longitude, cusps[0].longitude) > 1e-6) errors.push("ascendant ≠ cusp 1");
  }
  const bodies: KpBody[] = [];
  for (const it of arr(r.planets) ?? []) {
    const o = obj(it);
    const id = mapGraha(o?.planet);
    const p = projectKpPoint(pt(o), `planets.${String(o?.planet)}`, errors, dropped, { requirePada: false, requireSign: false });
    const house = int(o?.house, 1, 12);
    if (!id || !p || house === null || typeof o?.isRetrograde !== "boolean") {
      errors.push(`planets.${String(o?.planet)}: alan`);
      continue;
    }
    bodies.push({ ...p, id, house, retrograde: o.isRetrograde });
  }
  if (bodies.map((x) => x.id).join() !== "sun,moon,mars,mercury,jupiter,venus,saturn,rahu,ketu") errors.push("planets: 9 graha sırası");
  const ra = bodies.find((x) => x.id === "rahu");
  const ke = bodies.find((x) => x.id === "ketu");
  if (!ra || !ke || sep(ke.longitude, norm360(ra.longitude + 180)) > 1e-3) errors.push("Ketu = Rahu + 180° değil");
  if (cusps.length === 12) for (const x of bodies) if (placidusHouse(x.longitude, cusps) !== x.house) errors.push(`${x.id}: ev Placidus cusp aralığıyla uyuşmuyor`);
  const significators = projectSignificators(obj(r.significators), errors);
  const ruling = projectRpLords(obj(r.rulingPlanets), "rulingPlanets", errors);
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: {
      schema: KP_HORARY_TECHNICAL_SCHEMA,
      frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! },
      houseSystem: "placidus",
      nodeType: opts.nodeType,
      horaryNumber: opts.horaryNumber,
      at: { utc: opts.atUtc },
      place: opts.place,
      span: { from: from!, to: to! },
      ascendant: ascendant!,
      cusps,
      bodies,
      significators,
      ruling: ruling!,
    },
    interpretation: { schema: KP_EXTRA_INTERP_SCHEMA, houseThemes: themesOf(r.houseThemes) },
    unmappedFields: findUnmapped(raw, KP_HORARY_KNOWN, new Set(["houseThemes"])),
    droppedValues: [...new Set(dropped)],
  };
}

export type { SignId };

// ═══ TRANSİT-03 · KP zaman aralığı (sublord-changes / rasi-changes / planets-interval aralık) ═══════════════
// Şema OpenAPI 2.0.0'dan (17.10.2026). Gerçek yanıt örneği henüz YOK (owner onaylı golden çağrı bekleniyor) → doğrulama
// biçimden bağımsız ve SIKI: yankılar (gezegen, tarih aralığı, ayanamsa), sayım = liste uzunluğu, kronolojik sıra, pencere
// içi; KP numarası komşuluğu (±1, 249↔1 sarması) ve her numaranın sub/yıldız lordu bağımsız KP tablosuyla (verify/kpSub)
// birebir; rasi komşuluğu + burç yöneticileri. Herhangi biri tutmazsa sonuç KAYDEDİLMEZ (fail-closed).
export const ROXY_KP_SUBLORD = { endpoint: "/vedic-astrology/kp/sublord-changes", adapter: "astro-roxy-kp-sublord-1", projection: "kp-timing-proj-1" } as const;
export const ROXY_KP_RASI = { endpoint: "/vedic-astrology/kp/rasi-changes", adapter: "astro-roxy-kp-rasi-1", projection: "kp-timing-proj-1" } as const;
export const ROXY_KP_PLANETS_RANGE = { endpoint: "/vedic-astrology/kp/planets-interval", adapter: "astro-roxy-kp-planets-range-1", projection: "kp-timing-proj-1" } as const;
/** Tek parçada kabul edilen en çok satır (Ay ≈ 9 sub-lord geçişi/gün; 92 gün ≈ 830). Aşılırsa sonuç kaydedilmez — kırpılmaz. */
export const KP_TIMING_MAX_ROWS = 2000;

const CHANGE_DT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)?$/;
/** Sağlayıcı anı (timezone 0) → ISO UTC "YYYY-MM-DDTHH:MM:SSZ"; tarih/saat alanlarıyla tutarlılık. */
function changeInstant(o: Record<string, unknown> | null, ctx: string, errors: string[]): string | null {
  const dt = typeof o?.datetime === "string" ? o.datetime.trim() : "";
  const m = CHANGE_DT.exec(dt);
  if (!m) {
    errors.push(`${ctx}: datetime biçimi`);
    return null;
  }
  if (o?.date !== undefined && o.date !== m[1]) errors.push(`${ctx}: date ↔ datetime`);
  if (o?.time !== undefined && o.time !== m[2]) errors.push(`${ctx}: time ↔ datetime`);
  const iso = `${m[1]}T${m[2]}${m[3] ? m[3].slice(0, 3) : ":00"}Z`;
  if (!Number.isFinite(Date.parse(iso))) {
    errors.push(`${ctx}: geçersiz an`);
    return null;
  }
  return iso;
}
/**
 * Sub-lord geçişi KP numarası kuralı. GERÇEK yanıtla (17.10.2026, kp-sublord-moon) saptandı: sağlayıcı yalnız sub-lord'un
 * GERÇEKTEN değiştiği anı raporlar; bir sub burç sınırında iki KP numarasına bölündüğünde (aynı yıldız + sub lord) ara
 * numarayı ayrı olay saymaz ve fromKp olarak dönemin İLK numarasını verir (ör. 105→107; 106 = 105'in Başak parçası).
 * Kabul: from→to arası (kısa yönde) en çok 2 adım ve atlanan numara(lar) from ile AYNI yıldız + sub lord'a sahip.
 */
function kpTransitionOk(a: number, b: number, table: ReturnType<typeof kpTable>): boolean {
  const fwd = (((b - a) % 249) + 249) % 249;
  const bwd = (((a - b) % 249) + 249) % 249;
  const dir = fwd <= bwd ? 1 : -1;
  const steps = Math.min(fwd, bwd);
  if (steps < 1 || steps > 2) return false;
  for (let k = 1; k < steps; k++) {
    const mid = table[(((a - 1 + dir * k) % 249) + 249) % 249];
    if (mid.sub !== table[a - 1].sub || mid.star !== table[a - 1].star) return false;
  }
  return true;
}
/**
 * ATL-P2-03 (2026-10-21): zincir sürekliliği. Burç sınırı sub-lord olayı DEĞİLDİR → sağlayıcı DOĞRU numara verdiğinde bölünmüş sub'da
 * önceki satırın yeni KP'si ile bu satırın önceki KP'si o sub'ın İKİ PARÇASI olabilir (ileri: 61→62, 63→64; geri: 64→63, 62→61).
 * Kabul: aynı numara ya da komşu numara + aynı yıldız + aynı sub lord (yalnız 6 bölünmüş sub). Diğer her kopukluk RED.
 */
function kpChainOk(prevTo: number, from: number, table: ReturnType<typeof kpTable>): boolean {
  if (prevTo === from) return true;
  if (Math.abs(from - prevTo) !== 1) return false;
  const a = table[prevTo - 1];
  const b = table[from - 1];
  return a.star === b.star && a.sub === b.sub;
}
/**
 * ATL-P2-03: GERİ hareketle bölünmüş sub'a girişte sağlayıcı yeni KP olarak sub'ın 1. parça numarasını verir (gerçek yanıt
 * 21.10.2026, Merkür 2026-07-06: 64→62; doğrusu 64→63). Sonuç yine REDDEDİLİR; yalnız hata nedeni ayrılır (kullanıcı mesajı).
 */
function kpRetroSplitMislabel(a: number, b: number, table: ReturnType<typeof kpTable>): boolean {
  if ((((a - b) % 249) + 249) % 249 !== 2) return false;
  const mid = table[(((a - 2) % 249) + 249) % 249];
  const to = table[b - 1];
  return mid.star === to.star && mid.sub === to.sub;
}
const signAdjacent = (a: SignId, b: SignId) => {
  const d = (SIGN_IDS.indexOf(b) - SIGN_IDS.indexOf(a) + 12) % 12;
  return d === 1 || d === 11;
};

export type KpChangesExpect = { planet: KpTimingPlanet; startDate: string; endDate: string };

function changesHeader(r: Record<string, unknown>, ex: KpChangesExpect, errors: string[]): unknown[] {
  if (mapGraha(r.planet) !== ex.planet) errors.push("planet yankısı");
  if (r.startDate !== ex.startDate || r.endDate !== ex.endDate) errors.push("tarih aralığı yankısı");
  const list = arr(r.changes);
  if (!list) {
    errors.push("changes");
    return [];
  }
  if (int(r.totalChanges, 0, 1_000_000) !== list.length) errors.push("totalChanges ≠ liste");
  if (list.length > KP_TIMING_MAX_ROWS) errors.push(`satır sınırı aşıldı (${list.length} > ${KP_TIMING_MAX_ROWS}) — daha kısa bir aralık seçin`);
  return list;
}
function inWindowSorted<T extends { atUtc: string }>(rows: T[], ex: KpChangesExpect, errors: string[]) {
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i].atUtc.slice(0, 10);
    if (d < ex.startDate || d > ex.endDate) errors.push(`changes[${i}]: pencere dışı`);
    if (i > 0 && rows[i].atUtc < rows[i - 1].atUtc) errors.push("changes: kronolojik değil");
  }
}

type PartOf<K extends KpTimingPart["kind"]> = Extract<KpTimingPart, { kind: K }>;
export type KpTimingAdapterResult<K extends KpTimingPart["kind"]> = { ok: true; part: PartOf<K>; unmappedFields: string[] } | { ok: false; errors: string[] };

const SUBLORD_KNOWN = new Set<string>(["planet", "startDate", "endDate", "totalChanges", "changes", ...paths("changes[]", ["date", "time", "datetime", "fromKp", "toKp", "fromSublord", "toSublord", "fromNakshatraLord", "toNakshatraLord"])]);
export function projectRoxyKpSublordChanges(raw: unknown, ex: KpChangesExpect): KpTimingAdapterResult<"sublord"> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const list = changesHeader(r, ex, errors);
  const table = kpTable();
  const changes: KpSublordChange[] = [];
  list.forEach((c, i) => {
    const o = obj(c);
    const ctx = `changes[${i}]`;
    const atUtc = changeInstant(o, ctx, errors);
    const fromKp = int(o?.fromKp, 1, 249);
    let toKp = int(o?.toKp, 1, 249);
    const fromSub = mapGraha(o?.fromSublord);
    let toSub = mapGraha(o?.toSublord);
    const fromStar = mapGraha(o?.fromNakshatraLord);
    const toStar = mapGraha(o?.toNakshatraLord);
    if (!atUtc || fromKp === null || toKp === null || !fromSub || !toSub || !fromStar || !toStar) {
      errors.push(`${ctx}: alan`);
      return;
    }
    // Bilinen sağlayıcı kusuru (gerçek 92 gün Ay yanıtı, 17.10.2026): nakshatra başlangıcında satır ESKİ KP no + sub ile gelir
    // ("46→46", sub Ay→Ay) ama yeni yıldız lordu doğrudur. Düzeltme YALNIZ: aynı KP + aynı sub + değişen yıldız; komşu numara
    // tek ve o numaranın yıldızı = yeni yıldız (nakshatranın ilk sub'ı) [kanıt 1: bağımsız KP tablosu]; sağlayıcının SONRAKİ
    // kaydı o numara + o sub ile başlıyor [kanıt 2]. İki kanıt da ŞART: sonraki kayıt yoksa (aralığın son satırı) düzeltme
    // YAPILMAZ → satır tablo denetiminden düşer, sonuç reddedilir. Düzeltilen satır `corrected` ile işaretlenir (ekran + rapor).
    let corrected: KpSublordChange["corrected"];
    if (fromKp === toKp && fromSub === toSub && fromStar !== toStar) {
      const cands = [(fromKp % 249) + 1, ((fromKp + 247) % 249) + 1].filter((k) => table[k - 1].star === toStar && table[k - 1].sub === toStar);
      const next = obj(list[i + 1]);
      const nextFrom = next ? int(next.fromKp, 1, 249) : null;
      const ok = cands.length === 1 && next !== null && nextFrom === cands[0] && mapGraha(next.fromSublord) === table[cands[0] - 1].sub;
      if (ok) {
        corrected = { providerToKp: toKp, providerToSub: toSub };
        toKp = cands[0];
        toSub = table[cands[0] - 1].sub;
      }
    }
    if (!kpTransitionOk(fromKp, toKp, table))
      errors.push(kpRetroSplitMislabel(fromKp, toKp, table) ? `${ctx}: ${KP_SPLIT_SUB_PROVIDER_ERROR} (geri giriş: beklenen ${toKp + 1}, gelen ${toKp})` : `${ctx}: KP numaraları komşu değil (${fromKp}→${toKp})`);
    if (fromSub === toSub && fromStar === toStar) errors.push(`${ctx}: sub-lord değişmiyor`);
    if (table[fromKp - 1].sub !== fromSub || table[fromKp - 1].star !== fromStar) errors.push(`${ctx}: önceki KP ${fromKp} lordları tabloyla uyuşmuyor`);
    if (table[toKp - 1].sub !== toSub || table[toKp - 1].star !== toStar) errors.push(`${ctx}: yeni KP ${toKp} lordları tabloyla uyuşmuyor`);
    if (changes.length > 0 && !kpChainOk(changes[changes.length - 1].toKp, fromKp, table)) errors.push(`${ctx}: zincir kopuk (önceki yeni KP ≠ bu önceki KP)`);
    changes.push({ atUtc, fromKp, toKp, fromSub, toSub, fromStar, toStar, ...(corrected ? { corrected } : {}) });
  });
  inWindowSorted(changes, ex, errors);
  if (errors.length) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, part: { kind: "sublord", planet: ex.planet, window: { startDate: ex.startDate, endDate: ex.endDate }, changes }, unmappedFields: findUnmapped(raw, SUBLORD_KNOWN, new Set()) };
}

const RASI_KNOWN = new Set<string>(["planet", "startDate", "endDate", "totalChanges", "changes", ...paths("changes[]", ["date", "time", "datetime", "fromSign", "fromSignLord", "toSign", "toSignLord"])]);
export function projectRoxyKpRasiChanges(raw: unknown, ex: KpChangesExpect): KpTimingAdapterResult<"rasi"> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const list = changesHeader(r, ex, errors);
  const changes: KpRasiChange[] = [];
  list.forEach((c, i) => {
    const o = obj(c);
    const ctx = `changes[${i}]`;
    const atUtc = changeInstant(o, ctx, errors);
    const fromRashi = mapRashi(o?.fromSign);
    const toRashi = mapRashi(o?.toSign);
    const fromLord = mapGraha(o?.fromSignLord);
    const toLord = mapGraha(o?.toSignLord);
    if (!atUtc || !fromRashi || !toRashi || !fromLord || !toLord) {
      errors.push(`${ctx}: alan`);
      return;
    }
    if (!signAdjacent(fromRashi, toRashi)) errors.push(`${ctx}: burçlar komşu değil`);
    if (SIGN_LORDS[fromRashi] !== fromLord || SIGN_LORDS[toRashi] !== toLord) errors.push(`${ctx}: burç yöneticisi`);
    if (changes.length > 0 && changes[changes.length - 1].toRashi !== fromRashi) errors.push(`${ctx}: zincir kopuk`);
    changes.push({ atUtc, fromRashi, toRashi, fromLord, toLord });
  });
  inWindowSorted(changes, ex, errors);
  if (errors.length) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, part: { kind: "rasi", planet: ex.planet, window: { startDate: ex.startDate, endDate: ex.endDate }, changes }, unmappedFields: findUnmapped(raw, RASI_KNOWN, new Set()) };
}

/** planets-interval aralık: her nokta tek-an adaptörüyle AYNI KP nokta denetiminden geçer (lord ↔ boylam, Ketu = Rahu + 180°). */
export function projectRoxyKpPlanetsRange(raw: unknown, ex: { startUtc: string; endUtc: string; intervalMinutes: number; ayanamsa: KpAyanamsaId }): KpTimingAdapterResult<"positions"> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.ayanamsa !== ex.ayanamsa) errors.push("ayanamsa yankısı");
  if (int(r.intervalMinutes, 15, 1440) !== ex.intervalMinutes) errors.push("intervalMinutes yankısı");
  const ayDeg = num(r.ayanamsaValue, 0, 40);
  if (ayDeg === null) errors.push("ayanamsaValue");
  const list = arr(r.intervals) ?? [];
  if (int(r.totalIntervals, 0, 100_000) !== list.length) errors.push("totalIntervals ≠ liste");
  const expectN = Math.round((Date.parse(`${ex.endUtc}Z`) - Date.parse(`${ex.startUtc}Z`)) / (ex.intervalMinutes * 60_000)) + 1;
  if (list.length !== expectN) errors.push(`nokta sayısı ${list.length} ≠ beklenen ${expectN}`);
  if (list.length > KP_TIMING_MAX_ROWS) errors.push("satır sınırı aşıldı");
  const rows: KpPositionRow[] = [];
  list.forEach((it, i) => {
    const o = obj(it);
    const want = new Date(Date.parse(`${ex.startUtc}Z`) + i * ex.intervalMinutes * 60_000).toISOString().slice(0, 19);
    if (o?.datetime !== want) errors.push(`intervals[${i}]: an ${String(o?.datetime)} ≠ ${want}`);
    const pl = obj(o?.planets);
    const bodies: KpPositionRow["bodies"] = [];
    for (const name of PI_NAMES) {
      const q = obj(pl?.[name]);
      const id = mapGraha(name)!;
      const mapped = q ? { longitude: q.longitude, sign: q.sign, signLord: q.signLord, nakshatra: q.nakshatra, starLord: q.nakshatraLord, subLord: q.sublord, subSubLord: q.subSublord, kpNumber: q.kpNumber } : null;
      const p = projectKpPoint(mapped, `intervals[${i}].${name}`, errors, dropped, { requirePada: false, requireSign: true });
      if (!p || typeof q?.isRetrograde !== "boolean") {
        if (p) errors.push(`intervals[${i}].${name}: retro`);
        continue;
      }
      bodies.push({ ...p, id, retrograde: q.isRetrograde });
    }
    if (bodies.length !== 9) errors.push(`intervals[${i}]: 9 graha yok`);
    const ra = bodies.find((x) => x.id === "rahu");
    const ke = bodies.find((x) => x.id === "ketu");
    if (ra && ke && sep(ke.longitude, norm360(ra.longitude + 180)) > 1e-3) errors.push(`intervals[${i}]: Ketu = Rahu + 180° değil`);
    rows.push({ atUtc: `${want}Z`, bodies });
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, part: { kind: "positions", window: { startUtc: ex.startUtc, endUtc: ex.endUtc }, intervalMinutes: ex.intervalMinutes, ayanamsaDegrees: ayDeg!, rows }, unmappedFields: findUnmapped(raw, KP_PI_KNOWN, new Set()) };
}
