// Astroloji — KP Ruling Planets ZAMAN ARALIĞI TARAMASI Roxy adaptörü (SAF; 2026-10-22; teknik `kp.ruling_interval`).
//
// /vedic-astrology/kp/ruling-planets-interval. Hesap motoru sağlayıcıdır; burada yalnız beyaz liste projeksiyon + iç tutarlılık
// denetimi (fail-closed) yapılır, ikinci bir hesap motoru YOKTUR:
//   • yankılar: başlangıç / bitiş / adım / konum / ofset = istek; an sayısı = süre/adım + 1; her an = başlangıç + k·adım (yerel)
//   • tüm lordlar graha; ruling planets kümesi = klasik 5 öğe (gün lordu, Ay burç + yıldız, Lagna burç + yıldız), tekrarsız
//   • Ay ve Lagna sign / star / sub / sub-sub dörtlüsü KP alt bölüm tablosunda VAR (verify/kpLordChain) — yanıt KP numarası vermez;
//     yanlış lord zinciri gösterilmez (RED)
//   • gün lordu = yerel takvim gününün ya da (gün doğumundan önce) önceki günün yöneticisi; pencere içinde yalnız ileri değişir
//   • significator listesi = ruling planets kümesi, evler 1–12 tekrarsız; Ay zinciri 4 düzey kırılımı evler 1–12
// houseThemes (lang=tr anlatı) → yalnız yorum katmanı (mevcut KP_EXTRA_INTERP_SCHEMA; yorum yetki kapısı aynen).

import { KP_EXTRA_INTERP_SCHEMA, type KpAyanamsaId, type KpExtraInterpretation, type KpLordSet } from "../../model/kp";
import { KP_RULING_INTERVAL_TECHNICAL_SCHEMA, type KpLevelHouses, type KpRulingIntervalRow, type KpRulingIntervalTechnical } from "../../model/kpRulingInterval";
import type { VedicGrahaId } from "../../model/vedic";
import { kpLordChainExists } from "../../verify/kpLordChain";
import { mapGraha } from "./vedic";
import { arr, findUnmapped, int, keywords, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";

export const ROXY_KP_RULING_INTERVAL = { endpoint: "/vedic-astrology/kp/ruling-planets-interval", adapter: "astro-roxy-kp-ruling-interval-1", projection: "kp-ruling-interval-proj-1" } as const;

const LORD_KEYS = ["dayLord", "moonSignLord", "moonStarLord", "moonSublord", "moonSubSublord", "lagnaSignLord", "lagnaStarLord", "lagnaSublord", "lagnaSubSublord"];
const LEVEL_OBJS = ["moonSignLordSignifies", "moonStarLordSignifies", "moonSublordSignifies", "moonSignifies"];
const KNOWN = new Set<string>([
  "startDatetime",
  "endDatetime",
  "intervalMinutes",
  ...paths("location", ["latitude", "longitude", "timezone"]),
  "totalIntervals",
  "intervals",
  ...paths("intervals[]", ["date", "time", "datetime", ...LORD_KEYS, "rulingPlanets", "significators", ...LEVEL_OBJS]),
  "intervals[].rulingPlanets[]",
  ...paths("intervals[].significators[]", ["planet", "signifies"]),
  "intervals[].significators[].signifies[]",
  ...LEVEL_OBJS.flatMap((k) => ["L1", "L2", "L3", "L4"].flatMap((l) => [`intervals[].${k}.${l}`, `intervals[].${k}.${l}[]`])),
  "houseThemes",
  "focus",
]);
const OPAQUE = new Set(["houseThemes"]);

const WEEKDAY_LORD: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const addMin = (local: string, m: number) => new Date(Date.parse(`${local}Z`) + m * 60_000).toISOString().slice(0, 19);

export type KpRulingIntervalOpts = {
  startLocal: string;
  endLocal: string;
  intervalMinutes: number;
  utcOffsetHours: number;
  place: { latitude: number; longitude: number; label: string | null };
  ayanamsa: KpAyanamsaId;
  nodeType: "mean" | "true";
  startUtc: string;
  durationMinutes: number;
};

function levels(v: unknown, ctx: string, errors: string[]): KpLevelHouses {
  const o = obj(v);
  const out = { 1: [], 2: [], 3: [], 4: [] } as KpLevelHouses;
  for (const l of [1, 2, 3, 4] as const) {
    const a = arr(o?.[`L${l}`]);
    const hs = (a ?? []).map((h) => int(h, 1, 12));
    if (!a || hs.some((h) => h === null)) errors.push(`${ctx}.L${l}: ev listesi`);
    else out[l] = hs as number[];
  }
  return out;
}

export function projectRoxyKpRulingInterval(raw: unknown, opts: KpRulingIntervalOpts): AdapterResult<KpRulingIntervalTechnical, KpExtraInterpretation> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.startDatetime !== opts.startLocal || r.endDatetime !== opts.endLocal || r.intervalMinutes !== opts.intervalMinutes) errors.push("pencere yankısı istenenle uyuşmuyor");
  const loc = obj(r.location);
  if (Math.abs(Number(loc?.latitude) - opts.place.latitude) > 1e-6 || Math.abs(Number(loc?.longitude) - opts.place.longitude) > 1e-6 || loc?.timezone !== opts.utcOffsetHours) errors.push("location yankısı");
  const items = arr(r.intervals) ?? [];
  const expected = opts.durationMinutes / opts.intervalMinutes + 1;
  if (items.length !== expected || r.totalIntervals !== items.length) errors.push(`an sayısı ${items.length} (beklenen ${expected})`);
  const rows: KpRulingIntervalRow[] = [];
  const offMin = Math.round(opts.utcOffsetHours * 60);
  for (let k = 0; k < items.length && errors.length < 25; k++) {
    const it = obj(items[k]);
    const ctx = `intervals[${k}]`;
    const want = addMin(opts.startLocal, k * opts.intervalMinutes);
    const dt = typeof it?.datetime === "string" && LOCAL_RE.test(it.datetime) ? it.datetime : null;
    if (dt !== want || it?.date !== want.slice(0, 10) || it?.time !== want.slice(11, 16)) {
      errors.push(`${ctx}: an istenen adım değil`);
      continue;
    }
    const L = Object.fromEntries(LORD_KEYS.map((x) => [x, mapGraha(it?.[x])])) as Record<string, VedicGrahaId | null>;
    const rp = (arr(it?.rulingPlanets) ?? []).map(mapGraha);
    if (Object.values(L).some((x) => !x) || rp.length === 0 || rp.some((x) => !x)) {
      errors.push(`${ctx}: lord alanları`);
      continue;
    }
    const moon: KpLordSet = { sign: L.moonSignLord!, star: L.moonStarLord!, sub: L.moonSublord!, subSub: L.moonSubSublord! };
    const lagna: KpLordSet = { sign: L.lagnaSignLord!, star: L.lagnaStarLord!, sub: L.lagnaSublord!, subSub: L.lagnaSubSublord! };
    const classical = [...new Set([L.dayLord!, moon.sign, moon.star, lagna.sign, lagna.star])].sort().join();
    if ([...rp].sort().join() !== classical || new Set(rp).size !== rp.length) errors.push(`${ctx}: rulingPlanets klasik 5 öğe kümesi değil`);
    if (!kpLordChainExists(moon.sign, moon.star, moon.sub, moon.subSub)) errors.push(`${ctx}: Ay sign/star/sub/sub-sub lord zinciri KP alt bölüm tablosunda yok`);
    if (!kpLordChainExists(lagna.sign, lagna.star, lagna.sub, lagna.subSub)) errors.push(`${ctx}: Lagna sign/star/sub/sub-sub lord zinciri KP alt bölüm tablosunda yok`);
    const wd = new Date(`${want.slice(0, 10)}T00:00:00Z`).getUTCDay();
    if (L.dayLord !== WEEKDAY_LORD[wd] && L.dayLord !== WEEKDAY_LORD[(wd + 6) % 7]) errors.push(`${ctx}: gün lordu yerel gün / önceki gün yöneticisi değil`);
    const prev = rows[rows.length - 1];
    if (prev && prev.dayLord !== L.dayLord && WEEKDAY_LORD[(WEEKDAY_LORD.indexOf(prev.dayLord) + 1) % 7] !== L.dayLord) errors.push(`${ctx}: gün lordu ileri sırayla değişmiyor`);
    const significators: KpRulingIntervalRow["significators"] = [];
    for (const s of arr(it?.significators) ?? []) {
      const so = obj(s);
      const id = mapGraha(so?.planet);
      const hs = (arr(so?.signifies) ?? []).map((h) => int(h, 1, 12));
      if (!id || hs.some((h) => h === null) || new Set(hs).size !== hs.length) {
        errors.push(`${ctx}.significators: alan`);
        continue;
      }
      significators.push({ id, houses: hs as number[] });
    }
    if (significators.map((x) => x.id).sort().join() !== [...rp].sort().join()) errors.push(`${ctx}: significators ruling planets kümesiyle uyuşmuyor`);
    const moonLevels = {
      signLord: levels(it?.moonSignLordSignifies, `${ctx}.moonSignLordSignifies`, errors),
      starLord: levels(it?.moonStarLordSignifies, `${ctx}.moonStarLordSignifies`, errors),
      subLord: levels(it?.moonSublordSignifies, `${ctx}.moonSublordSignifies`, errors),
      moon: levels(it?.moonSignifies, `${ctx}.moonSignifies`, errors),
    };
    const utc = new Date(Date.parse(`${want}Z`) - offMin * 60_000).toISOString().slice(0, 16);
    rows.push({ local: want.slice(0, 16), utc, dayLord: L.dayLord!, moon, lagna, rulingPlanets: rp as VedicGrahaId[], significators, moonLevels });
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  const th = obj(r.houseThemes);
  return {
    ok: true,
    technical: {
      schema: KP_RULING_INTERVAL_TECHNICAL_SCHEMA,
      frame: { ayanamsa: opts.ayanamsa },
      nodeType: opts.nodeType,
      method: "moment_chart",
      window: {
        startUtc: opts.startUtc,
        endUtc: new Date(Date.parse(`${opts.startUtc}:00Z`) + opts.durationMinutes * 60_000).toISOString().slice(0, 16),
        startLocal: opts.startLocal.slice(0, 16),
        endLocal: opts.endLocal.slice(0, 16),
        utcOffsetHours: opts.utcOffsetHours,
        durationMinutes: opts.durationMinutes,
        intervalMinutes: opts.intervalMinutes,
      },
      place: opts.place,
      rows,
    },
    interpretation: { schema: KP_EXTRA_INTERP_SCHEMA, houseThemes: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, keywords: keywords(th?.[String(i + 1)]) })).filter((x) => x.keywords.length > 0) },
    unmappedFields: findUnmapped(raw, KNOWN, OPAQUE),
    droppedValues: [],
  };
}
