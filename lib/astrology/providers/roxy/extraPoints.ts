// Astroloji — EK NOKTALAR adaptörleri (SAF; ağ/DB/env YOK). 2026-10-22.
//
// Üç ayrı sağlayıcı ucu = üç ayrı hesap birimi (yalnız seçilen bölüm istek açar):
//   • POST /astrology/asteroids   → Ceres, Pallas, Juno, Vesta (boylam, enlem, burç, derece, ev, hız, retro)
//   • POST /astrology/arabic-lots → yedi Hermetik lot (Fortuna, Spirit, Eros, Necessity, Courage, Victory, Nemesis)
//   • POST /astrology/lilith      → Kara Ay (Black Moon Lilith) ORTALAMA + GERÇEK (osculating) apoje
//
// Natal tekniği, natal istek gövdesi ve natal önbellek anahtarı DEĞİŞMEZ (natal yalnız ortalama Lilith taşır:
// natal.ts `variants: { lilith: "mean" }`). Bu dosya yeni gövde üretir; natal'ın üreticisini kullanmaz.
//
// Gövde: ortak birthBody (LMT dengelemesi dahil) + nodeType "true" (bu uçlarda sonucu etkilemez; gövde sabit kalsın diye)
// + houseSystem. Lotlar için ev sistemi HER ZAMAN "placidus": sağlayıcı sect'i Güneş'in ev yerleşiminden belirler;
// Placidus'ta 7–12. evler ufkun üstüdür (sect geometrik ufukla birebir — sect.ts, 217/217). Whole Sign'da sağlayıcının
// "Güneş 7–12. evde" kuralı ufku kaydırır (ATL-P2-05) → lotlarda kullanılmaz. Lot yanıtında ev alanı YOKTUR.
//
// Doğrulama (fail-closed; bozuk yanıt ekrana/arşive GİTMEZ): yankı = istek; ev sistemi yankısı = istenen; burç/derece
// boylamla tutarlı; asteroit kümesi tam olarak dört ve kanonik sırada; Lilith tam olarak bir ortalama + bir gerçek;
// ortalama apoje retro DEĞİL; retro bayrağı hız işaretiyle tutarlı; lot kimlikleri tam yedi; lot formülü sect ile tutarlı.
// Bu denetimler yeni hesap üretmez; yalnız sağlayıcı sonucunu kabul/ret eder.
// Yorum (Sistem Yorumu katmanı, yetkiyle): her noktanın interpretation metni + summary (+ Lilith note) AYNEN düz metin.

import { SIGN_IDS, type HouseSystem, type SignId } from "../../model/western";
import {
  ASTEROID_IDS,
  EXTRA_POINTS_INTERP_SCHEMA,
  EXTRA_POINTS_PART_SCHEMA,
  LILITH_VARIANTS,
  LOT_IDS,
  LOTS_HOUSE_SYSTEM,
  lotFormulaFor,
  n360,
  VICTORY_LOCAL_METHOD,
  type AsteroidId,
  type ExtraAsteroid,
  type ExtraLilith,
  type ExtraLot,
  type ExtraPointsInterpretation,
  type ExtraPointsPart,
  type ExtraSection,
  type LilithVariant,
  type LotId,
  type LotTerm,
} from "../../model/westernExtraPoints";
import { birthBody, type BirthPoint } from "./requests";
import { findUnmapped, int, mapEnum, mapSign, num, obj, paths, text } from "./shared";
import type { AdapterResult } from "./timing";

export const ROXY_EXTRA_POINTS: Readonly<Record<ExtraSection, { endpoint: string; adapter: string; projection: string }>> = Object.freeze({
  asteroids: { endpoint: "/astrology/asteroids", adapter: "astro-roxy-asteroids-1", projection: "asteroids-proj-1" },
  lots: { endpoint: "/astrology/arabic-lots", adapter: "astro-roxy-arabic-lots-1", projection: "arabic-lots-proj-2" },
  lilith: { endpoint: "/astrology/lilith", adapter: "astro-roxy-lilith-1", projection: "lilith-proj-1" },
});

// ─── İstek ───────────────────────────────────────────────────────────────────

export function asteroidsBody(b: BirthPoint, houseSystem: HouseSystem): Record<string, unknown> {
  return { ...birthBody(b), nodeType: "true", houseSystem };
}
export function lilithBody(b: BirthPoint, houseSystem: HouseSystem): Record<string, unknown> {
  return { ...birthBody(b), nodeType: "true", houseSystem };
}
/** Lotlar: ev sistemi sabit Placidus (sect = geometrik ufuk); natal ev tercihi lot boylamını değiştirmez. */
export function lotsBody(b: BirthPoint): Record<string, unknown> {
  return { ...birthBody(b), nodeType: "true", houseSystem: LOTS_HOUSE_SYSTEM };
}
export function extraSectionBody(section: ExtraSection, b: BirthPoint, houseSystem: HouseSystem): Record<string, unknown> {
  return section === "asteroids" ? asteroidsBody(b, houseSystem) : section === "lilith" ? lilithBody(b, houseSystem) : lotsBody(b);
}

// ─── Projeksiyon ─────────────────────────────────────────────────────────────

export type ExtraPointsExpect = { date: string; time: string; latitude: number; longitude: number; timezone: number; houseSystem: HouseSystem | null };

/** Gövdeden beklenen yankı (projeksiyon sağlayıcı yanıtını bununla doğrular). */
export function extraExpectOf(body: Record<string, unknown>, section: ExtraSection): ExtraPointsExpect {
  return {
    date: String(body.date),
    time: String(body.time),
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    timezone: Number(body.timezone),
    houseSystem: section === "lots" ? null : (body.houseSystem as HouseSystem),
  };
}

const BIRTH_KNOWN = paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone", "nodeType"]);
const KNOWN: Readonly<Record<ExtraSection, Set<string>>> = {
  asteroids: new Set([...BIRTH_KNOWN, "houseSystem", "asteroids", ...paths("asteroids[]", ["name", "nameLocalized", "longitude", "latitude", "sign", "signLocalized", "degree", "house", "speed", "isRetrograde", "interpretation"]), "summary"]),
  lots: new Set([...BIRTH_KNOWN, "sect", "lots", ...paths("lots[]", ["id", "name", "nameLocalized", "longitude", "sign", "signLocalized", "degree", "formula", "interpretation"]), "summary"]),
  lilith: new Set([...BIRTH_KNOWN, "houseSystem", "lilith", ...paths("lilith[]", ["variant", "variantLocalized", "longitude", "latitude", "sign", "signLocalized", "degree", "house", "speed", "isRetrograde", "interpretation", "note"]), "summary"]),
};
/** Test: eşlenmemiş alan denetiminde bilinen yollar (yalnız okuma). */
export const EXTRA_POINTS_KNOWN: Readonly<Record<ExtraSection, ReadonlySet<string>>> = KNOWN;

function echoErrors(r: Record<string, unknown>, e: ExtraPointsExpect): string[] {
  const errors: string[] = [];
  const bd = obj(r.birthDetails);
  if (!bd) return ["birthDetails yok"];
  if (bd.date !== e.date) errors.push("birthDetails.date uyuşmuyor");
  if (typeof bd.time !== "string" || bd.time.slice(0, 5) !== e.time.slice(0, 5)) errors.push("birthDetails.time uyuşmuyor");
  const la = num(bd.latitude, -90, 90);
  const lo = num(bd.longitude, -180, 180);
  if (la === null || lo === null || Math.abs(la - e.latitude) > 1e-4 || Math.abs(lo - e.longitude) > 1e-4) errors.push("birthDetails konum uyuşmuyor");
  const tz = num(bd.timezone, -14, 14);
  if (tz === null || Math.abs(tz - e.timezone) > 1e-4) errors.push("birthDetails.timezone uyuşmuyor");
  if (bd.nodeType !== undefined && bd.nodeType !== "true") errors.push("birthDetails.nodeType uyuşmuyor");
  if (e.houseSystem !== null && r.houseSystem !== e.houseSystem) errors.push("houseSystem yankısı istenenle uyuşmuyor");
  return errors;
}

/** Boylam + burç + burç içi derece tutarlı ekliptik nokta; değilse null. */
function point(o: Record<string, unknown>): { longitude: number; sign: SignId; degreeInSign: number } | null {
  const lon = num(o.longitude, 0, 360);
  const sign = mapSign(o.sign);
  const degreeInSign = num(o.degree, 0, 30);
  if (lon === null || sign === null || degreeInSign === null) return null;
  const longitude = lon % 360;
  const expected = longitude - SIGN_IDS.indexOf(sign) * 30;
  // Burç ↔ boylam ↔ derece tutarlılığı (burç sınırındaki yuvarlama için 0,001° pay).
  if (Math.abs(expected - degreeInSign) > 1e-3 && Math.abs(expected + 360 - degreeInSign) > 1e-3) return null;
  return { longitude, sign, degreeInSign };
}

/** Retro bayrağı hız işaretiyle tutarlı mı (hız 0 → iki bayrak da kabul). */
const retroOk = (speed: number, retro: boolean) => speed === 0 || retro === speed < 0;

const ASTEROID_NAME: Record<string, AsteroidId> = { ceres: "ceres", pallas: "pallas", juno: "juno", vesta: "vesta" };

export function projectRoxyAsteroids(raw: unknown, expect: ExtraPointsExpect): AdapterResult<ExtraPointsPart, ExtraPointsInterpretation> {
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const errors = echoErrors(r, expect);
  const list = Array.isArray(r.asteroids) ? r.asteroids : null;
  if (!list) errors.push("asteroids dizi değil");
  const bodies: ExtraAsteroid[] = [];
  const items: { id: AsteroidId; text: string | null }[] = [];
  for (const x of list ?? []) {
    const o = obj(x);
    const id = typeof o?.name === "string" ? ASTEROID_NAME[o.name.trim().toLowerCase()] : undefined;
    if (!o || !id) {
      errors.push("asteroids[].name bilinmiyor");
      continue;
    }
    if (bodies.some((b) => b.id === id)) {
      errors.push(`asteroids[${id}] tekrar`);
      continue;
    }
    const pt = point(o);
    const latitude = num(o.latitude, -90, 90);
    const speed = num(o.speed, -5, 5);
    const house = int(o.house, 1, 12);
    if (!pt || latitude === null || speed === null || house === null || typeof o.isRetrograde !== "boolean") {
      errors.push(`asteroids[${id}]: eksik/geçersiz alan`);
      continue;
    }
    if (!retroOk(speed, o.isRetrograde)) errors.push(`asteroids[${id}]: retro bayrağı hız işaretiyle tutarsız`);
    bodies.push({ id, ...pt, latitude, house, speed, retrograde: o.isRetrograde });
    items.push({ id, text: text(o.interpretation) });
  }
  if (list && bodies.length !== ASTEROID_IDS.length) errors.push(`asteroids: dört asteroit yerine ${bodies.length}`);
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  const order = (a: { id: AsteroidId }, b: { id: AsteroidId }) => ASTEROID_IDS.indexOf(a.id) - ASTEROID_IDS.indexOf(b.id);
  return {
    ok: true,
    technical: { schema: EXTRA_POINTS_PART_SCHEMA, zodiac: "tropical", section: "asteroids", houseSystem: expect.houseSystem!, bodies: bodies.sort(order) },
    interpretation: { schema: EXTRA_POINTS_INTERP_SCHEMA, asteroids: { items: items.sort(order), summary: text(r.summary) }, lots: null, lilith: null },
    unmappedFields: findUnmapped(raw, KNOWN.asteroids, new Set()),
    droppedValues: [],
  };
}

export function projectRoxyLilith(raw: unknown, expect: ExtraPointsExpect): AdapterResult<ExtraPointsPart, ExtraPointsInterpretation> {
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const errors = echoErrors(r, expect);
  const list = Array.isArray(r.lilith) ? r.lilith : null;
  if (!list) errors.push("lilith dizi değil");
  const found = new Map<LilithVariant, ExtraLilith>();
  const items: { variant: LilithVariant; text: string | null; note: string | null }[] = [];
  for (const x of list ?? []) {
    const o = obj(x);
    const variant = mapEnum<LilithVariant>(o?.variant, LILITH_VARIANTS);
    if (!o || !variant) {
      errors.push("lilith[].variant bilinmiyor");
      continue;
    }
    if (found.has(variant)) {
      errors.push(`lilith[${variant}] tekrar`);
      continue;
    }
    const pt = point(o);
    const latitude = num(o.latitude, -90, 90);
    const speed = num(o.speed, -30, 30);
    const house = int(o.house, 1, 12);
    if (!pt || latitude === null || speed === null || house === null || typeof o.isRetrograde !== "boolean") {
      errors.push(`lilith[${variant}]: eksik/geçersiz alan`);
      continue;
    }
    if (!retroOk(speed, o.isRetrograde)) errors.push(`lilith[${variant}]: retro bayrağı hız işaretiyle tutarsız`);
    // Belge: ortalama apoje her zaman ileri hareketlidir (retro değil, hız > 0).
    if (variant === "mean" && (o.isRetrograde || speed <= 0)) errors.push("lilith[mean]: ortalama apoje retro/negatif hızlı olamaz");
    found.set(variant, { variant, ...pt, latitude, house, speed, retrograde: o.isRetrograde });
    items.push({ variant, text: text(o.interpretation), note: text(o.note) });
  }
  if (list && (!found.has("mean") || !found.has("true") || found.size !== 2)) errors.push("lilith: tam olarak bir ortalama + bir gerçek değişken gerekli");
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: { schema: EXTRA_POINTS_PART_SCHEMA, zodiac: "tropical", section: "lilith", houseSystem: expect.houseSystem!, mean: found.get("mean")!, true: found.get("true")! },
    interpretation: {
      schema: EXTRA_POINTS_INTERP_SCHEMA,
      asteroids: null,
      lots: null,
      lilith: { items: items.sort((a, b) => LILITH_VARIANTS.indexOf(a.variant) - LILITH_VARIANTS.indexOf(b.variant)), summary: text(r.summary) },
    },
    unmappedFields: findUnmapped(raw, KNOWN.lilith, new Set()),
    droppedValues: [],
  };
}

const LOT_TERM: Record<string, LotTerm> = {
  sun: "sun",
  moon: "moon",
  mercury: "mercury",
  venus: "venus",
  mars: "mars",
  jupiter: "jupiter",
  saturn: "saturn",
  "part of fortune": "fortune",
  fortune: "fortune",
  "part of spirit": "spirit",
  spirit: "spirit",
};
const FORMULA_RE = /^\s*ascendant\s*\+\s*([a-z ]+?)\s*-\s*([a-z ]+?)\s*$/i;

/** Sağlayıcı formül metni ("Ascendant + Moon - Sun") → terimler; tanınmazsa null (fail-closed). */
export function parseLotFormula(v: unknown): { plus: LotTerm; minus: LotTerm } | null {
  if (typeof v !== "string") return null;
  const m = FORMULA_RE.exec(v);
  if (!m) return null;
  const plus = LOT_TERM[m[1].trim().toLowerCase().replace(/\s+/g, " ")];
  const minus = LOT_TERM[m[2].trim().toLowerCase().replace(/\s+/g, " ")];
  return plus && minus && plus !== minus ? { plus, minus } : null;
}

export function projectRoxyLots(raw: unknown, expect: ExtraPointsExpect): AdapterResult<ExtraPointsPart, ExtraPointsInterpretation> {
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const errors = echoErrors(r, expect);
  const sect = mapEnum<"day" | "night">(r.sect, ["day", "night"] as const);
  if (!sect) errors.push("sect eksik/geçersiz");
  const list = Array.isArray(r.lots) ? r.lots : null;
  if (!list) errors.push("lots dizi değil");
  const lots: ExtraLot[] = [];
  const items: { id: LotId; text: string | null }[] = [];
  for (const x of list ?? []) {
    const o = obj(x);
    const id = mapEnum<LotId>(o?.id, LOT_IDS);
    if (!o || !id) {
      errors.push("lots[].id bilinmiyor");
      continue;
    }
    if (lots.some((l) => l.id === id)) {
      errors.push(`lots[${id}] tekrar`);
      continue;
    }
    const pt = point(o);
    const f = parseLotFormula(o.formula);
    if (!pt || !f) {
      errors.push(`lots[${id}]: eksik/geçersiz alan (boylam/burç/derece/formül)`);
      continue;
    }
    // Formül bu lotun Paulus terim çiftinden oluşmalı. Fortuna ve Ruh sect'i tanımlar → sıra da sect ile aynı olmalı;
    // diğer lotlarda ters sıra (sağlayıcı yöntem farkı) kabul edilir ama traditional=false ile AÇIKÇA işaretlenir.
    const exp = sect ? lotFormulaFor(id, sect) : null;
    const samePair = !!exp && ((f.plus === exp.plus && f.minus === exp.minus) || (f.plus === exp.minus && f.minus === exp.plus));
    const traditional = !!exp && f.plus === exp.plus && f.minus === exp.minus;
    if (exp && !samePair) errors.push(`lots[${id}]: formül terimleri bu lotun terimleri değil`);
    else if (exp && !traditional && (id === "fortune" || id === "spirit")) errors.push(`lots[${id}]: formül sect ile tutarsız`);
    lots.push({ id, ...pt, plus: f.plus, minus: f.minus, traditional });
    items.push({ id, text: text(o.interpretation) });
  }
  if (list && lots.length !== LOT_IDS.length) errors.push(`lots: yedi lot yerine ${lots.length}`);
  // 2026-10-23 Zafer YEREL PAULUS: YALNIZ sağlayıcı Zafer terimlerini tam TERS sırada verdiyse ve Fortuna + Ruh sect ile Paulus
  // sırasındaysa (yukarıda denetlendi; değilse zaten RED) → Zafer(Paulus) = Fortuna + Ruh − Zafer(sağlayıcı). Kesin özdeşlik
  // (Fortuna + Ruh = 2·ASC); efemeris / tahmin / sabit düzeltme YOK. Sağlayıcı değeri `localFrom` içinde iz olarak saklanır.
  const vi = lots.findIndex((l) => l.id === "victory");
  const fo = lots.find((l) => l.id === "fortune");
  const sp = lots.find((l) => l.id === "spirit");
  if (errors.length === 0 && sect && vi >= 0 && fo?.traditional && sp?.traditional && !lots[vi].traditional) {
    const v = lots[vi];
    const exp = lotFormulaFor("victory", sect);
    if (v.plus === exp.minus && v.minus === exp.plus) {
      const lon = n360(fo.longitude + sp.longitude - v.longitude);
      const si = Math.min(11, Math.floor(lon / 30));
      lots[vi] = { id: "victory", longitude: lon, sign: SIGN_IDS[si], degreeInSign: lon - si * 30, plus: exp.plus, minus: exp.minus, traditional: true, localFrom: { method: VICTORY_LOCAL_METHOD, providerLongitude: v.longitude, providerPlus: v.plus, providerMinus: v.minus } };
    }
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  const order = (a: { id: LotId }, b: { id: LotId }) => LOT_IDS.indexOf(a.id) - LOT_IDS.indexOf(b.id);
  return {
    ok: true,
    technical: { schema: EXTRA_POINTS_PART_SCHEMA, zodiac: "tropical", section: "lots", sect: sect!, sectHouseSystem: LOTS_HOUSE_SYSTEM, lots: lots.sort(order) },
    interpretation: { schema: EXTRA_POINTS_INTERP_SCHEMA, asteroids: null, lots: { items: items.sort(order), summary: text(r.summary) }, lilith: null },
    unmappedFields: findUnmapped(raw, KNOWN.lots, new Set()),
    droppedValues: [],
  };
}

export function sectionOfEndpoint(endpoint: string): ExtraSection | null {
  for (const s of Object.keys(ROXY_EXTRA_POINTS) as ExtraSection[]) if (ROXY_EXTRA_POINTS[s].endpoint === endpoint) return s;
  return null;
}

export function projectRoxyExtraSection(section: ExtraSection, raw: unknown, expect: ExtraPointsExpect): AdapterResult<ExtraPointsPart, ExtraPointsInterpretation> {
  return section === "asteroids" ? projectRoxyAsteroids(raw, expect) : section === "lilith" ? projectRoxyLilith(raw, expect) : projectRoxyLots(raw, expect);
}
