// Astroloji — VEDİK AYLIK ZAMANLAMA sağlayıcı adaptörü + istek gövdeleri (SAF; 2026-10-22; teknik `vedic.monthly`).
//
// Beş uç, her biri ayrı hesap birimi (bölüm):
//   ingress         /vedic-astrology/transit/monthly     — 9 graha burç (rashi) girişleri + ay başı konumları
//   aspects         /vedic-astrology/aspects/monthly     — Ay hariç gezegenler arası 22 açı türünün kesinleşme anları
//   lunar           /vedic-astrology/aspects/lunar       — Ay ile gezegenler arası 22 açı türü
//   parallels       /vedic-astrology/parallels/monthly   — 7 görünür gezegen deklinasyon paralel / kontraparalel olayları
//   natal_parallels /vedic-astrology/parallels           — doğum anı deklinasyonları + paraleller (doğum saati gerekir)
// Aylık uçlara saat dilimi 0 (UTC) gönderilir: sağlayıcı IANA adını pencerenin başında TEK KEZ çözer ve o ofseti tüm aya uygular
// (yaz/kış saati geçişi olan ayda yanlış yerel saat). UTC'de saklanır; yerel gösterim olay başına seçilen IANA bölgesindedir.
// coordinateSystem açıkça "sidereal" (Lahiri) gönderilir. Hesap motoru sağlayıcıdır: burada yalnız beyaz liste projeksiyon +
// iç tutarlılık denetimi (fail-closed) yapılır; ikinci bir hesap motoru YOKTUR:
//   • yankılar: yıl / ay / timezone = istek; her olay anı istenen UTC ayının içinde; date / time = datetime parçaları
//   • burç girişi: burç ↔ boylam; geçiş komşu burca ve hareket yönüne uygun (ileri +1, geri −1); gezegen başına zincir (ay başı
//     burcu → girişler); Güneş / Ay geri olamaz; Rahu ve Ketu girişleri aynı anda ve karşıt burçlara; Ketu = Rahu + 180°
//   • açılar: açı türü 22'lik listede; mesafe = iki boylamın ayrımı; orb = |mesafe − açı derecesi|; aylık uçta Ay YOK
//   • deklinasyon: paralel orb = |d1 − d2|, kontraparalel orb = |d1 + d2|; doğum anında orb içindeki TÜM çiftler listede
// Yanıtta anlatı (yorum) alanı yoktur → yorum katmanı boş (yorum kapısı etkilenmez). Yerelleştirilmiş adlar (…Localized) bilinen
// alandır ama projekte EDİLMEZ (Türkçe etiketler Yaşam'ın kendi sözlüğünden).

import { SIGN_IDS, type SignId } from "../../model/western";
import type { VedicGrahaId } from "../../model/vedic";
import {
  MONTHLY_ASPECTS,
  NATAL_PARALLEL_ORB,
  VEDIC_MONTHLY_PART_SCHEMA,
  vedicMonthWindow,
  type DeclinationType,
  type MonthlyAspectEvent,
  type MonthlyAspectId,
  type MonthlyIngress,
  type MonthlyLunarEvent,
  type MonthlyParallelEvent,
  type MonthlyStart,
  type NatalDeclination,
  type NatalParallel,
  type VedicMonthlyPart,
  type VedicMonthlySection,
} from "../../model/vedicMonthly";
import { mapGraha, mapRashi } from "./vedic";
import { arr, compact, findUnmapped, num, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";
import type { BirthPoint } from "./requests";
import { birthBody } from "./requests";

export const ROXY_VEDIC_MONTHLY: Readonly<Record<VedicMonthlySection, { endpoint: string; adapter: string; projection: string }>> = {
  ingress: { endpoint: "/vedic-astrology/transit/monthly", adapter: "astro-roxy-vedic-monthly-ingress-1", projection: "vedic-monthly-proj-1" },
  aspects: { endpoint: "/vedic-astrology/aspects/monthly", adapter: "astro-roxy-vedic-monthly-aspects-1", projection: "vedic-monthly-proj-1" },
  lunar: { endpoint: "/vedic-astrology/aspects/lunar", adapter: "astro-roxy-vedic-monthly-lunar-1", projection: "vedic-monthly-proj-1" },
  parallels: { endpoint: "/vedic-astrology/parallels/monthly", adapter: "astro-roxy-vedic-monthly-parallels-1", projection: "vedic-monthly-proj-1" },
  natal_parallels: { endpoint: "/vedic-astrology/parallels", adapter: "astro-roxy-vedic-natal-parallels-1", projection: "vedic-monthly-proj-1" },
};
export function vedicMonthlySectionOfEndpoint(endpoint: string): VedicMonthlySection | null {
  return (Object.keys(ROXY_VEDIC_MONTHLY) as VedicMonthlySection[]).find((s) => ROXY_VEDIC_MONTHLY[s].endpoint === endpoint) ?? null;
}

// ─── İstek gövdeleri ─────────────────────────────────────────────────────────────────────────────────────────────
/** Aylık uçlar: yıl + ay + UTC (0) [+ sidereal]. Doğum verisi GÖNDERİLMEZ → aynı ay tüm danışanlarda aynı anahtar. */
export function vedicMonthlyBody(section: Exclude<VedicMonthlySection, "natal_parallels">, year: number, month: number): Record<string, unknown> {
  return section === "parallels" ? { year, month, timezone: 0 } : { year, month, timezone: 0, coordinateSystem: "sidereal" };
}
/** Doğum anı deklinasyonları: ürünün ortak doğum gövdesi (yerel tarih/saat + ondalık ofset + koordinat) + sabit orb. */
export function vedicNatalParallelsBody(b: BirthPoint): Record<string, unknown> {
  return { ...birthBody(b), orb: NATAL_PARALLEL_ORB };
}

// ─── Ortak yardımcılar ──────────────────────────────────────────────────────────────────────────────────────────
const DT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/;
const VISIBLE: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];
/** Graha olmayan (dış gezegen) adlar: yanıtta görünürse olay atlanır ve AÇIKÇA raporlanır (Vedik takvim 9 graha). */
const OUTER = new Set(["uranus", "neptune", "pluto"]);
const ASPECT_BY_KEY: Record<string, MonthlyAspectId> = {
  ...Object.fromEntries(MONTHLY_ASPECTS.map((a) => [compact(a.id), a.id])),
  sesquiquadrate: "sesqui_square",
  inconjunct: "quincunx",
  biquintile: "bi_quintile",
};
const ANGLE: Record<string, number> = Object.fromEntries(MONTHLY_ASPECTS.map((a) => [a.id, a.angle]));
const TOL = 0.02;
export const separation = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const mapAspectId = (v: unknown): MonthlyAspectId | null => (typeof v === "string" ? (ASPECT_BY_KEY[compact(v)] ?? null) : null);
const LOCALIZED = ["planetLocalized", "planet1Localized", "planet2Localized", "signLocalized", "fromSignLocalized", "toSignLocalized"];

type Win = { year: number; month: number; startUtc: string; endUtc: string };
/** Olay anı → UTC dakika ("YYYY-MM-DDTHH:MM"); date / time tutarlı ve ay içinde değilse null + hata. */
function eventMinute(o: Record<string, unknown> | null, win: Win, ctx: string, errors: string[]): string | null {
  const m = typeof o?.datetime === "string" ? DT_RE.exec(o.datetime) : null;
  if (!m) {
    errors.push(`${ctx}: datetime biçimi`);
    return null;
  }
  const at = `${m[1]}T${m[2]}`;
  if (o?.date !== m[1] || o?.time !== m[2]) errors.push(`${ctx}: date/time datetime ile uyuşmuyor`);
  if (!Number.isFinite(Date.parse(`${at}:00Z`)) || at < win.startUtc || at >= win.endUtc) errors.push(`${ctx}: an istenen UTC ayının dışında (${at})`);
  return at;
}
function echoMonth(r: Record<string, unknown>, win: Win, withTz: boolean, errors: string[]) {
  if (r.year !== win.year || r.month !== win.month) errors.push("yıl / ay yankısı istenenle uyuşmuyor");
  if (withTz && r.timezone !== 0) errors.push("timezone yankısı 0 (UTC) değil");
}
function graha(v: unknown, ctx: string, errors: string[], dropped: string[], allowed: readonly VedicGrahaId[]): VedicGrahaId | null | "skip" {
  const g = mapGraha(v);
  if (g && allowed.includes(g)) return g;
  if (typeof v === "string" && OUTER.has(v.trim().toLowerCase())) {
    dropped.push(`${ctx}(${v.trim().toLowerCase()}: graha değil)`);
    return "skip";
  }
  errors.push(`${ctx}: gezegen ${typeof v === "string" ? v.slice(0, 20) : "yok"}`);
  return null;
}
const ok = <T>(errors: string[], dropped: string[], part: () => T, raw: unknown, known: Set<string>): AdapterResult<T, null> =>
  errors.length > 0 ? { ok: false, errors: errors.slice(0, 25) } : { ok: true, technical: part(), interpretation: null, unmappedFields: findUnmapped(raw, known, new Set()), droppedValues: [...new Set(dropped)] };

// ─── ingress ────────────────────────────────────────────────────────────────────────────────────────────────────
const INGRESS_KNOWN = new Set<string>([
  "year",
  "month",
  "timezone",
  "startingPositions",
  ...paths("startingPositions[]", ["planet", "planetLocalized", "sign", "signLocalized", "longitude"]),
  "transitEvents",
  ...paths("transitEvents[]", ["planet", "planetLocalized", "fromSign", "fromSignLocalized", "toSign", "toSignLocalized", "date", "time", "datetime", "isRetrograde"]),
]);
const ALL_GRAHA: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];
const step = (s: SignId, d: number) => SIGN_IDS[(SIGN_IDS.indexOf(s) + d + 12) % 12];

function projectIngress(raw: unknown, win: Win): AdapterResult<Extract<VedicMonthlyPart, { section: "ingress" }>, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  echoMonth(r, win, true, errors);
  const start: MonthlyStart[] = [];
  for (const it of arr(r.startingPositions) ?? []) {
    const o = obj(it);
    const g = graha(o?.planet, "startingPositions[]", errors, dropped, ALL_GRAHA);
    if (g === "skip" || !g) continue;
    const sign = mapRashi(o?.sign);
    const lon = num(o?.longitude, 0, 360);
    if (!sign || lon === null || lon >= 360) {
      errors.push(`startingPositions.${g}: alan`);
      continue;
    }
    if (SIGN_IDS[Math.floor(lon / 30)] !== sign) errors.push(`startingPositions.${g}: burç boylamla uyuşmuyor`);
    start.push({ planet: g, sign, longitude: lon });
  }
  if (start.length !== 9 || new Set(start.map((x) => x.planet)).size !== 9) errors.push("startingPositions: 9 graha yok");
  const rahu = start.find((x) => x.planet === "rahu");
  const ketu = start.find((x) => x.planet === "ketu");
  if (rahu && ketu && Math.abs(separation(rahu.longitude, ketu.longitude) - 180) > 0.05) errors.push("startingPositions: Ketu Rahu'nun karşısında değil");
  const events: MonthlyIngress[] = [];
  let prevAt = "";
  for (const it of arr(r.transitEvents) ?? []) {
    const o = obj(it);
    const g = graha(o?.planet, "transitEvents[]", errors, dropped, ALL_GRAHA);
    if (g === "skip" || !g) continue;
    const ctx = `transitEvents.${g}`;
    const at = eventMinute(o, win, ctx, errors);
    const from = mapRashi(o?.fromSign);
    const to = mapRashi(o?.toSign);
    if (!at || !from || !to || typeof o?.isRetrograde !== "boolean") {
      errors.push(`${ctx}: alan`);
      continue;
    }
    if (at < prevAt) errors.push(`${ctx}: olaylar kronolojik değil`);
    prevAt = at;
    const retro = o?.isRetrograde === true;
    if (to !== step(from, retro ? -1 : 1)) errors.push(`${ctx}: ${from} → ${to} geçişi hareket yönüyle (${retro ? "geri" : "ileri"}) komşu burç değil`);
    if (retro && (g === "sun" || g === "moon")) errors.push(`${ctx}: Güneş / Ay geri hareket edemez`);
    events.push({ atUtc: at, planet: g, from, to, retrograde: retro });
  }
  // Gezegen başına zincir: ay başı burcu → ilk girişin çıkış burcu → … (atlanan / uydurulan giriş yakalanır).
  for (const s of start) {
    let cur = s.sign;
    for (const e of events.filter((x) => x.planet === s.planet)) {
      if (e.from !== cur) errors.push(`transitEvents.${s.planet}: zincir kopuk (${cur} beklenirken ${e.from})`);
      cur = e.to;
    }
  }
  const rh = events.filter((x) => x.planet === "rahu");
  const kt = events.filter((x) => x.planet === "ketu");
  if (rh.length !== kt.length || rh.some((x, i) => Math.abs(Date.parse(`${x.atUtc}:00Z`) - Date.parse(`${kt[i].atUtc}:00Z`)) > 120_000 || step(x.to, 6) !== kt[i].to))
    errors.push("transitEvents: Rahu ve Ketu girişleri aynı anda karşıt burçlara değil");
  return ok(errors, dropped, () => ({ schema: VEDIC_MONTHLY_PART_SCHEMA, section: "ingress" as const, start: ALL_GRAHA.map((p) => start.find((x) => x.planet === p)!), events }), raw, INGRESS_KNOWN);
}

// ─── aspects / lunar ────────────────────────────────────────────────────────────────────────────────────────────
const ASPECTS_KNOWN = new Set<string>([
  "year",
  "month",
  "timezone",
  "events",
  ...paths("events[]", ["planet1", "planet1Localized", "planet2", "planet2Localized", "aspect", "date", "time", "datetime", "orb", "distance", "planet1Longitude", "planet2Longitude"]),
]);
const LUNAR_KNOWN = new Set<string>([
  "year",
  "month",
  "timezone",
  "events",
  ...paths("events[]", ["planet", "planetLocalized", "aspect", "date", "time", "datetime", "orb", "distance", "moonLongitude", "planetLongitude"]),
]);
const NON_MOON = ALL_GRAHA.filter((g) => g !== "moon");
/** Ortak açı denetimi: mesafe = boylam ayrımı; orb = |mesafe − açı|. */
function aspectNumbers(o: Record<string, unknown> | null, lonKeys: [string, string], ctx: string, errors: string[]) {
  const aspect = mapAspectId(o?.aspect);
  const orb = num(o?.orb, 0, 10);
  const distance = num(o?.distance, 0, 180);
  const l1 = num(o?.[lonKeys[0]], 0, 360);
  const l2 = num(o?.[lonKeys[1]], 0, 360);
  if (!aspect || orb === null || distance === null || l1 === null || l2 === null) {
    errors.push(`${ctx}: açı alanları (${typeof o?.aspect === "string" ? o.aspect.slice(0, 24) : "?"})`);
    return null;
  }
  if (Math.abs(separation(l1, l2) - distance) > TOL) errors.push(`${ctx}: mesafe iki boylamın ayrımı değil`);
  if (Math.abs(Math.abs(distance - ANGLE[aspect]) - orb) > TOL) errors.push(`${ctx}: orb |mesafe − ${aspect}| değil`);
  return { aspect, orb, distance, l1, l2 };
}
function projectAspects(raw: unknown, win: Win): AdapterResult<Extract<VedicMonthlyPart, { section: "aspects" }>, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  echoMonth(r, win, true, errors);
  const events: MonthlyAspectEvent[] = [];
  const seen = new Set<string>();
  for (const it of arr(r.events) ?? []) {
    const o = obj(it);
    const a = graha(o?.planet1, "events[].planet1", errors, dropped, NON_MOON);
    const b = graha(o?.planet2, "events[].planet2", errors, dropped, NON_MOON);
    if (a === "skip" || b === "skip" || !a || !b) continue;
    const ctx = `events.${a}-${b}`;
    if (a === b) errors.push(`${ctx}: aynı gezegen`);
    const at = eventMinute(o, win, ctx, errors);
    const n = aspectNumbers(o, ["planet1Longitude", "planet2Longitude"], ctx, errors);
    if (!at || !n) continue;
    const key = `${[a, b].sort().join()}|${n.aspect}|${at}`;
    if (seen.has(key)) errors.push(`${ctx}: yinelenen olay`);
    seen.add(key);
    events.push({ atUtc: at, a, b, aspect: n.aspect, orb: n.orb, distance: n.distance, lonA: n.l1, lonB: n.l2 });
  }
  events.sort((x, y) => (x.atUtc < y.atUtc ? -1 : x.atUtc > y.atUtc ? 1 : 0));
  return ok(errors, dropped, () => ({ schema: VEDIC_MONTHLY_PART_SCHEMA, section: "aspects" as const, events }), raw, ASPECTS_KNOWN);
}
function projectLunar(raw: unknown, win: Win): AdapterResult<Extract<VedicMonthlyPart, { section: "lunar" }>, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  echoMonth(r, win, true, errors);
  const events: MonthlyLunarEvent[] = [];
  const seen = new Set<string>();
  for (const it of arr(r.events) ?? []) {
    const o = obj(it);
    const p = graha(o?.planet, "events[].planet", errors, dropped, NON_MOON);
    if (p === "skip" || !p) continue;
    const ctx = `events.moon-${p}`;
    const at = eventMinute(o, win, ctx, errors);
    const n = aspectNumbers(o, ["moonLongitude", "planetLongitude"], ctx, errors);
    if (!at || !n) continue;
    const key = `${p}|${n.aspect}|${at}`;
    if (seen.has(key)) errors.push(`${ctx}: yinelenen olay`);
    seen.add(key);
    events.push({ atUtc: at, planet: p, aspect: n.aspect, orb: n.orb, distance: n.distance, moonLon: n.l1, planetLon: n.l2 });
  }
  events.sort((x, y) => (x.atUtc < y.atUtc ? -1 : x.atUtc > y.atUtc ? 1 : 0));
  return ok(errors, dropped, () => ({ schema: VEDIC_MONTHLY_PART_SCHEMA, section: "lunar" as const, events }), raw, LUNAR_KNOWN);
}

// ─── deklinasyon ────────────────────────────────────────────────────────────────────────────────────────────────
const PARALLELS_KNOWN = new Set<string>([
  "year",
  "month",
  "timezone",
  "events",
  ...paths("events[]", ["planet1", "planet1Localized", "planet2", "planet2Localized", "type", "date", "time", "datetime", "orb", "dec1", "dec2"]),
]);
const NATAL_KNOWN = new Set<string>([
  "datetime",
  "planets",
  ...paths("planets[]", ["name", "nameLocalized", "declination", "rightAscension"]),
  "parallels",
  ...paths("parallels[]", ["planet1", "planet1Localized", "planet2", "planet2Localized", "type", "orb", "dec1", "dec2"]),
]);
const DEC_MAX = 35;
const declType = (v: unknown): DeclinationType | null => (v === "parallel" || v === "contraparallel" ? v : null);
const declOrb = (t: DeclinationType, d1: number, d2: number) => (t === "parallel" ? Math.abs(d1 - d2) : Math.abs(d1 + d2));

function projectParallels(raw: unknown, win: Win): AdapterResult<Extract<VedicMonthlyPart, { section: "parallels" }>, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  // Yanıt şemasında timezone yankısı yok; varsa 0 olmalı.
  echoMonth(r, win, r.timezone !== undefined, errors);
  const events: MonthlyParallelEvent[] = [];
  const seen = new Set<string>();
  for (const it of arr(r.events) ?? []) {
    const o = obj(it);
    const a = graha(o?.planet1, "events[].planet1", errors, dropped, VISIBLE);
    const b = graha(o?.planet2, "events[].planet2", errors, dropped, VISIBLE);
    if (a === "skip" || b === "skip" || !a || !b) continue;
    const ctx = `events.${a}-${b}`;
    const at = eventMinute(o, win, ctx, errors);
    const type = declType(o?.type);
    const orb = num(o?.orb, 0, 3);
    const d1 = num(o?.dec1, -DEC_MAX, DEC_MAX);
    const d2 = num(o?.dec2, -DEC_MAX, DEC_MAX);
    if (!at || !type || orb === null || d1 === null || d2 === null || a === b) {
      errors.push(`${ctx}: alan`);
      continue;
    }
    if (Math.abs(declOrb(type, d1, d2) - orb) > TOL) errors.push(`${ctx}: orb ${type === "parallel" ? "|d1 − d2|" : "|d1 + d2|"} değil`);
    const key = `${[a, b].sort().join()}|${type}|${at}`;
    if (seen.has(key)) errors.push(`${ctx}: yinelenen olay`);
    seen.add(key);
    events.push({ atUtc: at, a, b, type, orb, decA: d1, decB: d2 });
  }
  events.sort((x, y) => (x.atUtc < y.atUtc ? -1 : x.atUtc > y.atUtc ? 1 : 0));
  return ok(errors, dropped, () => ({ schema: VEDIC_MONTHLY_PART_SCHEMA, section: "parallels" as const, events }), raw, PARALLELS_KNOWN);
}

function projectNatalParallels(raw: unknown, req: { atLocal: string; orb: number }): AdapterResult<Extract<VedicMonthlyPart, { section: "natal_parallels" }>, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.datetime !== req.atLocal) errors.push("datetime doğum anı değil");
  const planets: NatalDeclination[] = [];
  for (const it of arr(r.planets) ?? []) {
    const o = obj(it);
    const g = graha(o?.name, "planets[]", errors, dropped, ALL_GRAHA);
    if (g === "skip" || !g) continue;
    const d = num(o?.declination, -DEC_MAX, DEC_MAX);
    const ra = num(o?.rightAscension, 0, 360);
    if (d === null || ra === null || ra >= 360) {
      errors.push(`planets.${g}: alan`);
      continue;
    }
    planets.push({ id: g, declination: d, rightAscension: ra });
  }
  if (planets.length < 7 || new Set(planets.map((p) => p.id)).size !== planets.length || !VISIBLE.every((v) => planets.some((p) => p.id === v))) errors.push("planets: 7 görünür gezegen yok / yineleniyor");
  const parallels: NatalParallel[] = [];
  const seen = new Set<string>();
  for (const it of arr(r.parallels) ?? []) {
    const o = obj(it);
    const a = graha(o?.planet1, "parallels[].planet1", errors, dropped, ALL_GRAHA);
    const b = graha(o?.planet2, "parallels[].planet2", errors, dropped, ALL_GRAHA);
    if (a === "skip" || b === "skip" || !a || !b) continue;
    const ctx = `parallels.${a}-${b}`;
    const type = declType(o?.type);
    const orb = num(o?.orb, 0, 3);
    const d1 = num(o?.dec1, -DEC_MAX, DEC_MAX);
    const d2 = num(o?.dec2, -DEC_MAX, DEC_MAX);
    const pa = planets.find((p) => p.id === a);
    const pb = planets.find((p) => p.id === b);
    if (!type || orb === null || d1 === null || d2 === null || a === b || !pa || !pb) {
      errors.push(`${ctx}: alan`);
      continue;
    }
    if (Math.abs(pa.declination - d1) > 1e-3 || Math.abs(pb.declination - d2) > 1e-3) errors.push(`${ctx}: dec1/dec2 gezegen tablosuyla uyuşmuyor`);
    if (Math.abs(declOrb(type, d1, d2) - orb) > TOL) errors.push(`${ctx}: orb ${type === "parallel" ? "|d1 − d2|" : "|d1 + d2|"} değil`);
    if (orb > req.orb + TOL) errors.push(`${ctx}: orb istenen ${req.orb}° sınırını aşıyor`);
    const key = `${[a, b].sort().join()}|${type}`;
    if (seen.has(key)) errors.push(`${ctx}: yinelenen çift`);
    seen.add(key);
    parallels.push({ a, b, type, orb, decA: d1, decB: d2 });
  }
  // Tamlık: orb içinde kalan (sınırdan TOL kadar içeride) her çift listede olmalı (eksik çift = yanlış tablo).
  for (let i = 0; i < planets.length; i++)
    for (let j = i + 1; j < planets.length; j++)
      for (const t of ["parallel", "contraparallel"] as const) {
        const v = declOrb(t, planets[i].declination, planets[j].declination);
        if (v <= req.orb - TOL && !seen.has(`${[planets[i].id, planets[j].id].sort().join()}|${t}`)) errors.push(`parallels: ${planets[i].id}-${planets[j].id} ${t} (${v.toFixed(2)}°) listede yok`);
      }
  return ok(errors, dropped, () => ({ schema: VEDIC_MONTHLY_PART_SCHEMA, section: "natal_parallels" as const, atLocal: req.atLocal, orb: req.orb, planets, parallels }), raw, NATAL_KNOWN);
}

/** Bölüm yanıtını projekte eder. Aylık bölümlerde body = {year, month,…}; doğum anı bölümünde body = doğum gövdesi + orb. */
export function projectRoxyVedicMonthlySection(section: VedicMonthlySection, raw: unknown, body: Record<string, unknown>): AdapterResult<VedicMonthlyPart, null> {
  if (section === "natal_parallels") {
    const time = String(body.time ?? "");
    return projectNatalParallels(raw, { atLocal: `${String(body.date)}T${time.length === 5 ? `${time}:00` : time}`, orb: Number(body.orb) });
  }
  const year = Number(body.year);
  const month = Number(body.month);
  const win = { year, month, ...vedicMonthWindow(year, month) };
  switch (section) {
    case "ingress":
      return projectIngress(raw, win);
    case "aspects":
      return projectAspects(raw, win);
    case "lunar":
      return projectLunar(raw, win);
    case "parallels":
      return projectParallels(raw, win);
  }
}

/** Test / belge: bilinen alanlar (yerelleştirilmiş adlar dahil; projekte edilmez). */
export const VEDIC_MONTHLY_LOCALIZED_FIELDS = LOCALIZED;
