// Astroloji — Janma Panchanga "Gezegen saatleri (Hora) + Choghadiya" SEÇENEĞİ Roxy adaptörleri (SAF; 2026-10-22).
//
// /vedic-astrology/panchang/hora ve /panchang/choghadiya: GÜN + KONUM (gövde Ayrıntılı Panchanga ile AYNI üretici —
// vedicPanchangDetailedBody; uç farklı olduğundan önbellek anahtarı ayrıdır). Hesap motoru sağlayıcıdır; burada yalnız beyaz liste
// projeksiyon + iç tutarlılık denetimi (fail-closed) yapılır:
//   • tarih yankısı = istenen gün; 12 + 12 hora / 8 + 8 choghadiya, sıra numaraları, ardışık (boşluksuz) dilimler
//   • ilk gündüz dilimi istenen günde başlar (gün doğumu), son gece dilimi ertesi gün biter (ertesi gün doğumu)
//   • eşit bölme: gündüz/12 · gece/12 (hora), gündüz/8 · gece/8 (choghadiya) — dakika yuvarlaması için ±2 dk
//   • hora yöneticileri: 1. gündüz horası = haftanın günü yöneticisi, sonra Kaldani sırası (gece de aynı sırayla sürer)
//   • choghadiya: ad ↔ yönetici ↔ iyi/kötü sınıfı tutarlı; gündüz/gece klasik sıra (gün yöneticisinden)
// Gün doğumu/batımı yoksa (kutup günü/gecesi) → RED (motor kutup dairesi ötesinde isteği zaten göndermez).

import { VARA_IDS, type VedicGrahaId } from "../../model/vedic";
import {
  CHOGHADIYA_GOOD,
  CHOGHADIYA_LORD,
  CHOGHADIYA_NAMES,
  HORA_SEQUENCE,
  VEDIC_CHOGHADIYA_SCHEMA,
  VEDIC_HORA_SCHEMA,
  type ChoghadiyaName,
  type ChoghadiyaSlot,
  type HoraSlot,
  type HoursPlace,
  type VedicChoghadiyaTechnical,
  type VedicHoraTechnical,
} from "../../model/panchangaHours";
import { mapGraha } from "./vedic";
import { arr, findUnmapped, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";

export const ROXY_VEDIC_HORA = { endpoint: "/vedic-astrology/panchang/hora", adapter: "astro-roxy-vedic-hora-1", projection: "vedic-hora-proj-1" } as const;
export const ROXY_VEDIC_CHOGHADIYA = { endpoint: "/vedic-astrology/panchang/choghadiya", adapter: "astro-roxy-vedic-choghadiya-1", projection: "vedic-choghadiya-proj-1" } as const;

const HORA_KNOWN = new Set<string>(["date", "dayHoras", "nightHoras", ...["dayHoras[]", "nightHoras[]"].flatMap((k) => paths(k, ["planet", "number", "start", "end"]))]);
const CHOG_KNOWN = new Set<string>(["date", "dayChoghadiya", "nightChoghadiya", ...["dayChoghadiya[]", "nightChoghadiya[]"].flatMap((k) => paths(k, ["name", "lord", "effect", "start", "end"]))]);

type Seven = (typeof HORA_SEQUENCE)[number];
const VARA_LORD: Record<(typeof VARA_IDS)[number], Seven> = { sunday: "sun", monday: "moon", tuesday: "mars", wednesday: "mercury", thursday: "jupiter", friday: "venus", saturday: "saturn" };
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const lt = (v: unknown): string | null => (typeof v === "string" && LOCAL_RE.test(v) ? v : null);
const ms = (s: string) => Date.parse(`${s}Z`);
const TOL = 2 * 60_000;
const seven = (v: unknown): Seven | null => {
  const g = mapGraha(v) as VedicGrahaId | null;
  return g && (HORA_SEQUENCE as readonly string[]).includes(g) ? (g as Seven) : null;
};
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
export type HoursOpts = { date: string; latitude: number; longitude: number; utcOffsetHours: number; label: string | null };
const placeOf = (o: HoursOpts): HoursPlace => ({ latitude: o.latitude, longitude: o.longitude, utcOffsetHours: o.utcOffsetHours, label: o.label });

/** Gündüz + gece dilim zinciri ortak denetimi (sayı, ardışıklık, eşit bölme, gün sınırları). */
function checkChain(day: { start: string; end: string }[], night: { start: string; end: string }[], parts: number, date: string, errors: string[]): void {
  const all = [...day, ...night];
  for (let i = 0; i + 1 < all.length; i++) if (all[i].end !== all[i + 1].start) errors.push(`dilim ${i + 1}→${i + 2}: ardışık değil`);
  if (day[0].start.slice(0, 10) !== date) errors.push("ilk gündüz dilimi istenen günde başlamıyor");
  if (night[night.length - 1].end.slice(0, 10) !== nextDay(date)) errors.push("son gece dilimi ertesi gün bitmiyor");
  const even = (xs: { start: string; end: string }[], what: string) => {
    const len = (ms(xs[xs.length - 1].end) - ms(xs[0].start)) / parts;
    if (!(len > 0)) return errors.push(`${what}: süre`);
    xs.forEach((x, i) => {
      const a = ms(xs[0].start) + i * len;
      if (Math.abs(ms(x.start) - a) > TOL || Math.abs(ms(x.end) - (a + len)) > TOL) errors.push(`${what} ${i + 1}: eşit bölmeyle uyuşmuyor`);
    });
  };
  even(day, "gündüz");
  even(night, "gece");
}

export function projectRoxyVedicHora(raw: unknown, opts: HoursOpts): AdapterResult<VedicHoraTechnical, null> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.date !== opts.date) errors.push("date: istenen gün değil");
  const d = arr(r.dayHoras) ?? [];
  const n = arr(r.nightHoras) ?? [];
  if (d.length === 0 || n.length === 0) return { ok: false, errors: ["hora dilimleri yok — bu enlemde bu gün için gün doğumu/batımı tanımsız (kutup günü/gecesi)"] };
  const slot = (v: unknown, i: number, what: string): HoraSlot | null => {
    const o = obj(v);
    const lord = seven(o?.planet);
    const start = lt(o?.start);
    const end = lt(o?.end);
    if (!lord || o?.number !== i + 1 || !start || !end || !(start < end)) {
      errors.push(`${what}[${i}]: alan`);
      return null;
    }
    return { n: i + 1, lord, start, end };
  };
  const day = d.map((x, i) => slot(x, i, "dayHoras"));
  const night = n.map((x, i) => slot(x, i, "nightHoras"));
  if (day.length !== 12 || night.length !== 12) errors.push("12 gündüz + 12 gece hora yok");
  const wd = new Date(`${opts.date}T00:00:00Z`).getUTCDay();
  const dayLord = VARA_LORD[VARA_IDS[wd]];
  if (errors.length === 0) {
    const all = [...day, ...night] as HoraSlot[];
    checkChain(day as HoraSlot[], night as HoraSlot[], 12, opts.date, errors);
    const i0 = HORA_SEQUENCE.indexOf(dayLord);
    all.forEach((h, k) => {
      if (h.lord !== HORA_SEQUENCE[(i0 + k) % 7]) errors.push(`hora ${k + 1}: yönetici Kaldani sırasıyla uyuşmuyor`);
    });
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: { schema: VEDIC_HORA_SCHEMA, date: opts.date, place: placeOf(opts), dayLord, day: day as HoraSlot[], night: night as HoraSlot[] },
    interpretation: null,
    unmappedFields: findUnmapped(raw, HORA_KNOWN, new Set()),
    droppedValues: [],
  };
}

export function projectRoxyVedicChoghadiya(raw: unknown, opts: HoursOpts): AdapterResult<VedicChoghadiyaTechnical, null> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.date !== opts.date) errors.push("date: istenen gün değil");
  const d = arr(r.dayChoghadiya) ?? [];
  const n = arr(r.nightChoghadiya) ?? [];
  if (d.length === 0 || n.length === 0) return { ok: false, errors: ["choghadiya dilimleri yok — bu enlemde bu gün için gün doğumu/batımı tanımsız (kutup günü/gecesi)"] };
  const slot = (v: unknown, i: number, what: string): ChoghadiyaSlot | null => {
    const o = obj(v);
    const name = typeof o?.name === "string" && (CHOGHADIYA_NAMES as readonly string[]).includes(o.name.trim().toLowerCase()) ? (o.name.trim().toLowerCase() as ChoghadiyaName) : null;
    const lord = seven(o?.lord);
    const eff = o?.effect === "Good" ? "good" : o?.effect === "Bad" ? "bad" : null;
    const start = lt(o?.start);
    const end = lt(o?.end);
    if (!name || !lord || !eff || !start || !end || !(start < end)) {
      errors.push(`${what}[${i}]: alan`);
      return null;
    }
    if (CHOGHADIYA_LORD[name] !== lord) errors.push(`${what}[${i}]: ad ↔ yönetici uyuşmuyor`);
    if ((CHOGHADIYA_GOOD.has(name) ? "good" : "bad") !== eff) errors.push(`${what}[${i}]: iyi/kötü sınıfı adla uyuşmuyor`);
    return { n: i + 1, name, lord, effect: eff, start, end };
  };
  const day = d.map((x, i) => slot(x, i, "dayChoghadiya"));
  const night = n.map((x, i) => slot(x, i, "nightChoghadiya"));
  if (day.length !== 8 || night.length !== 8) errors.push("8 gündüz + 8 gece choghadiya yok");
  const wd = new Date(`${opts.date}T00:00:00Z`).getUTCDay();
  const dayLord = VARA_LORD[VARA_IDS[wd]];
  if (errors.length === 0) {
    checkChain(day as ChoghadiyaSlot[], night as ChoghadiyaSlot[], 8, opts.date, errors);
    const i0 = HORA_SEQUENCE.indexOf(dayLord);
    // Klasik sıra: gündüz gün yöneticisinden +1 adımla (8. = 1.); gece gün yöneticisinden 5 ileri başlar, −2 adımla.
    (day as ChoghadiyaSlot[]).forEach((c, k) => {
      if (c.lord !== HORA_SEQUENCE[(i0 + k) % 7]) errors.push(`gündüz choghadiya ${k + 1}: klasik sırayla uyuşmuyor`);
    });
    (night as ChoghadiyaSlot[]).forEach((c, k) => {
      if (c.lord !== HORA_SEQUENCE[(i0 + 5 + 5 * k) % 7]) errors.push(`gece choghadiya ${k + 1}: klasik sırayla uyuşmuyor`);
    });
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: { schema: VEDIC_CHOGHADIYA_SCHEMA, date: opts.date, place: placeOf(opts), dayLord, day: day as ChoghadiyaSlot[], night: night as ChoghadiyaSlot[] },
    interpretation: null,
    unmappedFields: findUnmapped(raw, CHOG_KNOWN, new Set()),
    droppedValues: [],
  };
}
