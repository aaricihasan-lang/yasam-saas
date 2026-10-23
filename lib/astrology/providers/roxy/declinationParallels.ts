// Astroloji — DEKLİNASYON PARALELLERİ (POST /astrology/parallels/monthly) Roxy adaptörü (SAF; 2026-10-22).
//
//   • Gövde: { year, month, timezone: 0, orb, nodeType } — doğum verisi YOK (gökyüzü takvimi). Saat dilimi HER ZAMAN 0 (UTC) gönderilir:
//     sağlayıcı IANA adını pencerenin başında bir kez çözer (yaz/kış saati geçişini izlemez) → yerel saat Yaşam'da gösterimde çevrilir.
//     Böylece önbellek anahtarı gösterim saat diliminden bağımsızdır (aynı ay = aynı istek).
//   • Projeksiyon: beyaz liste, fail-closed. Denetimler: yankılar (yıl / ay / saat dilimi 0 / orb), gök cismi 13'lü küme (Ay ve bilinmeyen
//     ad → hata), tür enum, tarih + saat = datetime (saniyeli biçim de kabul: gerçek yanıt "…T06:41:00"), olay istenen UTC ayının içinde, orb ≤ istenen orb, deklinasyon aralığı, TUTARLILIK:
//     paralelde |δ1 − δ2|, kontraparalelde |δ1 + δ2| raporlanan orb ile ≤ 0,02° (yuvarlama payı). Yinelenen olay tekilleşir.
//   • Gerçek yanıt doğrulandı (23.10.2026): scripts/astrology/fixtures/golden/declination-parallels-monthly-2026-03.json (27 olay;
//     Güneş, Merkür, Venüs, Mars, Jüpiter, Satürn, Neptün, Kiron, Kuzey / Güney Ay Düğümü). Şema örneği
//     (fixtures/schema/declination-parallels-monthly.json) yalnız biçim / fail-closed testleri içindir.
//   • Orb > 0 olay: sağlayıcı ay içinde kesinleşmeyen çiftin en yakın yaklaşım anını da verir (gerçek yanıtta Merkür–Satürn
//     kontraparaleli orb 1,42°) → gösterimde "en yakın yaklaşım (tam kesinleşme yok)" olarak ayrılır (model: isExactContact).
//   • YOK SAYILAN: *Localized alanlar (gösterim Yaşam'ın Türkçe etiketleriyle).

import type { NodeType } from "../../model/western";
import {
  DECLINATION_PARALLELS_TECHNICAL_SCHEMA,
  DECLINATION_BODIES,
  isDeclinationBody,
  monthWindowUtc,
  type DeclinationContact,
  type DeclinationContactType,
  type DeclinationParallelsTechnical,
} from "../../model/westernDeclination";
import { findUnmapped, mapBody, num, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";

export const ROXY_DECLINATION_PARALLELS = { endpoint: "/astrology/parallels/monthly", adapter: "astro-roxy-parallels-monthly-1", projection: "declination-parallels-proj-1" } as const;

/** Orb ↔ deklinasyon tutarlılık payı (derece; sağlayıcı deklinasyonu 4, orbu 2 ondalıkla yuvarlar). */
export const DECLINATION_CONSISTENCY_TOLERANCE = 0.02;

export type DeclinationParallelsRequest = { month: string; orb: number; nodeType: NodeType };

export function declinationParallelsBody(r: DeclinationParallelsRequest) {
  return { year: Number(r.month.slice(0, 4)), month: Number(r.month.slice(5, 7)), timezone: 0, orb: r.orb, nodeType: r.nodeType };
}

export const DECLINATION_PARALLELS_KNOWN = new Set<string>([
  "year",
  "month",
  "timezone",
  "orb",
  "events",
  ...paths("events[]", ["planet1", "planet1Localized", "planet2", "planet2Localized", "type", "date", "time", "datetime", "orb", "declination1", "declination2"]),
]);

const TYPES: readonly DeclinationContactType[] = ["parallel", "contraparallel"];

/**
 * datetime ↔ date + time tutarlılığı. Gerçek yanıt (23.10.2026) saniyeli verir ("2026-03-01T06:41:00"); OpenAPI örneği dakikalı
 * ("2026-03-14T09:42"). İkisi de kabul: `${date}T${time}` veya `${date}T${time}:SS` (SS 00–59). Kesinleşme anı dakika
 * çözünürlüğünde tutulur (exactUtc "YYYY-MM-DDTHH:MMZ"; sağlayıcının `time` alanı da dakikalıdır).
 */
export function datetimeMatches(datetime: unknown, date: string, time: string): boolean {
  if (typeof datetime !== "string") return false;
  const base = `${date}T${time}`;
  if (datetime === base) return true;
  return datetime.length === base.length + 3 && datetime.startsWith(base) && /^:[0-5]\d$/.test(datetime.slice(base.length));
}

export function projectRoxyDeclinationParallels(raw: unknown, req: DeclinationParallelsRequest): AdapterResult<DeclinationParallelsTechnical, never> {
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const errors: string[] = [];
  const dropped: string[] = [];
  const year = Number(req.month.slice(0, 4));
  const month = Number(req.month.slice(5, 7));
  if (r.year !== year) errors.push("year: istenen yılla uyuşmuyor");
  if (r.month !== month) errors.push("month: istenen ayla uyuşmuyor");
  if (r.timezone !== 0) errors.push("timezone: UTC (0) bekleniyordu");
  if (typeof r.orb !== "number" || Math.abs(r.orb - req.orb) > 1e-9) errors.push("orb: istenen orbla uyuşmuyor");
  if (!Array.isArray(r.events)) errors.push("events: dizi değil");
  const window = monthWindowUtc(req.month);
  const contacts: DeclinationContact[] = [];
  const seen = new Set<string>();
  const events = Array.isArray(r.events) ? r.events : [];
  for (let i = 0; i < events.length && errors.length < 25; i++) {
    const e = obj(events[i]);
    const at = `events[${i}]`;
    if (!e) {
      errors.push(`${at}: nesne değil`);
      continue;
    }
    const p1 = mapBody(e.planet1);
    const p2 = mapBody(e.planet2);
    if (!isDeclinationBody(p1) || !isDeclinationBody(p2)) {
      errors.push(`${at}: gök cismi tanınmadı veya kapsam dışı`);
      continue;
    }
    if (p1 === p2) {
      errors.push(`${at}: aynı gök cismi`);
      continue;
    }
    const type = typeof e.type === "string" && (TYPES as readonly string[]).includes(e.type) ? (e.type as DeclinationContactType) : null;
    if (!type) {
      errors.push(`${at}: tür`);
      continue;
    }
    const date = typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null;
    const time = typeof e.time === "string" && /^\d{2}:\d{2}$/.test(e.time) ? e.time : null;
    if (!date || !time || !datetimeMatches(e.datetime, date, time) || !Number.isFinite(Date.parse(`${date}T${time}:00Z`))) {
      errors.push(`${at}: zaman (date / time / datetime)`);
      continue;
    }
    const exactUtc = `${date}T${time}Z`;
    if (exactUtc < window.startUtc || exactUtc >= window.endUtc) {
      errors.push(`${at}: ay dışında`);
      continue;
    }
    const orb = num(e.orb, 0, req.orb + 1e-9);
    if (orb === null) {
      errors.push(`${at}: orb (0 – ${req.orb}°)`);
      continue;
    }
    const d1 = num(e.declination1, -40, 40);
    const d2 = num(e.declination2, -40, 40);
    if (d1 === null || d2 === null) {
      errors.push(`${at}: deklinasyon`);
      continue;
    }
    const gap = type === "parallel" ? Math.abs(d1 - d2) : Math.abs(d1 + d2);
    if (Math.abs(gap - orb) > DECLINATION_CONSISTENCY_TOLERANCE) {
      errors.push(`${at}: tutarsız (${type === "parallel" ? "|δ1 − δ2|" : "|δ1 + δ2|"} = ${gap.toFixed(4)}°, orb ${orb}°)`);
      continue;
    }
    // Kanonik çift sırası (BODY_IDS); deklinasyonlar cisimle birlikte yer değiştirir.
    const swap = DECLINATION_BODIES.indexOf(p1) > DECLINATION_BODIES.indexOf(p2);
    const c: DeclinationContact = swap
      ? { a: p2, b: p1, type, exactUtc, orb, declinationA: d2, declinationB: d1 }
      : { a: p1, b: p2, type, exactUtc, orb, declinationA: d1, declinationB: d2 };
    const key = `${c.a}|${c.b}|${c.type}|${c.exactUtc}`;
    if (seen.has(key)) {
      dropped.push(`${at}: yinelenen olay`);
      continue;
    }
    seen.add(key);
    contacts.push(c);
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  contacts.sort((x, y) => (x.exactUtc < y.exactUtc ? -1 : x.exactUtc > y.exactUtc ? 1 : DECLINATION_BODIES.indexOf(x.a) - DECLINATION_BODIES.indexOf(y.a) || DECLINATION_BODIES.indexOf(x.b) - DECLINATION_BODIES.indexOf(y.b)));
  const parallel = contacts.filter((c) => c.type === "parallel").length;
  return {
    ok: true,
    technical: {
      schema: DECLINATION_PARALLELS_TECHNICAL_SCHEMA,
      frame: "geocentric_apparent_equator_of_date",
      nodeType: req.nodeType,
      month: req.month,
      orbLimit: req.orb,
      window,
      contacts,
      summary: { total: contacts.length, parallel, contraparallel: contacts.length - parallel },
    },
    interpretation: null,
    unmappedFields: findUnmapped(raw, DECLINATION_PARALLELS_KNOWN, new Set()),
    droppedValues: dropped,
  };
}
