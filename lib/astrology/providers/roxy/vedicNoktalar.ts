// Astroloji — VEDİK NOKTALAR adaptörleri (SAF): Upagraha (/vedic-astrology/upagraha) · Heliakal (/vedic-astrology/heliacal). 22.10.2026.
//
// Hesap motoru sağlayıcıdır; burada yalnız beyaz liste projeksiyon + İÇ TUTARLILIK denetimi (fail-closed) yapılır. Uyuşmazlık → hata
// (sonuç KAYDEDİLMEZ, PROVIDER_INVALID_RESPONSE). Bilinmeyen alan → teknik sayılmaz, yalnız yolu raporlanır (*_KNOWN). İki uçta da
// sağlayıcı serbest metni YOKTUR (yanıt yalnız teknik veridir) → yorum katmanı her zaman null.
//
// GERÇEK YANIT DOĞRULAMASI BLOKE (22.10.2026: ücretli çağrı izni yok). Adaptör güncel OpenAPI 2.0.0 yanıt şemasına göre KATI yazıldı;
// test verisi şema-örneği fixture'dır (scripts/astrology/fixtures/schema/*, gerçek sağlayıcı yanıtı DEĞİL).
//
// Denetimler:
//   Upagraha: çerçeve yankısı; zaman tabanlı 6 ve Güneş türevli 5 noktanın TAM kümesi (tekrar / eksik / grup karışması → ret); her
//             noktada burç = boylamın burcu, burç içi derece = boylam mod 30, nakshatra sırası ve pada = boylamdan (sınırda ±0,01°
//             tolerans), nakshatra adı sırayla tutarlı; Aprakasha zinciri SAYISAL olarak (Vyatipata = 360° − Dhuma, Parivesha =
//             Vyatipata + 180°, Indra Chapa = 360° − Parivesha, Upaketu = Indra Chapa + 16°40′; ±0,02°).
//   Heliakal: gün yankısı; graha kümesi (6 görünür graha; tekrar yok; klasik sıra); kalamsa = Surya Siddhanta sınırı (Merkür / Venüs
//             geri harekette dar); Ay geri olamaz; görünürlük = zaman derecesi > kalamsa (sınıra 0,05°'den yakınsa yuvarlama payı);
//             olay türü durumla tutarlı (görünür → son olay udaya, sonraki asta; görünmez → tersi); son olay günü ≤ gün ≤ sonraki olay
//             günü; olay kalamsa'sı grahanın sınırlarından biri; yerel tarih-saat biçimi; UTC = yerel − sabit ofset.

import { SIGN_IDS, type SignId } from "../../model/western";
import { NAKSHATRAS, type VedicAyanamsaId } from "../../model/vedic";
import {
  HELIACAL_GRAHAS,
  HELIACAL_KALAMSA,
  UPAGRAHA_SUN_IDS,
  UPAGRAHA_TIME_IDS,
  VEDIC_HELIACAL_TECHNICAL_SCHEMA,
  VEDIC_UPAGRAHA_TECHNICAL_SCHEMA,
  kalamsaFor,
  type HeliacalGrahaId,
  type UpagrahaId,
  type VedicHeliacalEvent,
  type VedicHeliacalGraha,
  type VedicHeliacalTechnical,
  type VedicUpagrahaPoint,
  type VedicUpagrahaTechnical,
} from "../../model/vedicNoktalar";
import { arr, findUnmapped, int, num, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";
import { vedicPanchangDetailedBody, type GeoPoint } from "./requests";

export const ROXY_VEDIC_UPAGRAHA = { endpoint: "/vedic-astrology/upagraha", adapter: "astro-roxy-vedic-upagraha-1", projection: "vedic-upagraha-proj-1" } as const;
export const ROXY_VEDIC_HELIACAL = { endpoint: "/vedic-astrology/heliacal", adapter: "astro-roxy-vedic-heliacal-1", projection: "vedic-heliacal-proj-1" } as const;

/**
 * /vedic-astrology/heliacal — YEREL GÜN + GÖZLEM YERİ (saat alanı yok: karar o günün gün doğumu / batımında okunur). timezone o gün o
 * yerde geçerli ofset (saat, sayı) — sağlayıcı varsayılanı 5.5 olduğundan HER ZAMAN açıkça gönderilir. Ayanamsa yok (çerçeveden
 * bağımsız: görünürlük ufuk geometrisidir). Gövde biçimi Ayrıntılı Panchanga ile aynıdır (aynı yuvarlama), uç farklıdır.
 */
export function heliacalBody(date: string, place: GeoPoint, offsetHours: number) {
  return vedicPanchangDetailedBody(date, place, offsetHours);
}

const norm = (x: number) => ((x % 360) + 360) % 360;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const signOf = (lon: number): SignId => SIGN_IDS[Math.floor(norm(lon) / 30) % 12];
const NAK_SPAN = 360 / 27;
const PADA_SPAN = 360 / 108;
const slug = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
const rashiOf = (v: unknown): SignId | null => {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (SIGN_IDS as readonly string[]).includes(k) ? (k as SignId) : null;
};
/** Sınıra EDGE'den yakın boylamda iki komşu değerden biri kabul edilir (sağlayıcı boylamı yuvarlar). */
const EDGE = 0.01;
const nearBoundary = (lon: number, span: number) => {
  const r = norm(lon) % span;
  return r < EDGE || span - r < EDGE;
};
const done = <T>(errors: string[], dropped: string[], technical: () => T, raw: unknown, known: Set<string>): AdapterResult<T, null> => {
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, technical: technical(), interpretation: null, unmappedFields: findUnmapped(raw, known, new Set()), droppedValues: [...new Set(dropped)] };
};

// ═══ A · Upagraha ═════════════════════════════════════════════════════════════
const POINT_KEYS = ["name", "longitude", "rashi", "degreeInSign", "nakshatra", "nakshatraIndex", "nakshatraPada"];
const UPAGRAHA_KNOWN = new Set<string>([...paths("frame", ["ayanamsa", "ayanamsaDegrees"]), "timeBased", ...paths("timeBased[]", POINT_KEYS), "sunBased", ...paths("sunBased[]", POINT_KEYS)]);
const upagrahaIdOf = (v: unknown): UpagrahaId | null => {
  if (typeof v !== "string") return null;
  const k = slug(v).replace(/^indrachapa$/, "indra_chapa");
  return ([...UPAGRAHA_TIME_IDS, ...UPAGRAHA_SUN_IDS] as readonly string[]).includes(k) ? (k as UpagrahaId) : null;
};
/** Aprakasha zinciri toleransı (derece): sağlayıcı 2 haneye yuvarlar → her adımda ±0,005, zincirde birikim ≤ 0,02. */
const CHAIN_TOL = 0.02;
const DHUMA_OFFSET = 133 + 20 / 60;
const UPAKETU_OFFSET = 16 + 40 / 60;

function point(it: unknown, group: "time" | "sun", errors: string[], dropped: string[]): VedicUpagrahaPoint | null {
  const o = obj(it);
  const id = upagrahaIdOf(o?.name);
  const lon = num(o?.longitude, 0, 360);
  const rs = rashiOf(o?.rashi);
  const deg = num(o?.degreeInSign, 0, 30);
  const ni = int(o?.nakshatraIndex, 1, 27);
  const pada = int(o?.nakshatraPada, 1, 4);
  if (!id || lon === null || !rs || deg === null || ni === null || pada === null || typeof o?.nakshatra !== "string") {
    errors.push(`${group}Based[]: alan`);
    return null;
  }
  const wantGroup = (UPAGRAHA_TIME_IDS as readonly string[]).includes(id) ? "time" : "sun";
  if (wantGroup !== group) errors.push(`${id}: yanlış grupta (${group === "time" ? "zaman tabanlı" : "Güneş türevli"})`);
  const L = norm(lon);
  if (rs !== signOf(L) && !nearBoundary(L, 30)) errors.push(`${id}: burç boylamla uyuşmuyor`);
  if (Math.abs(deg - (L % 30)) > 0.011 && Math.abs(Math.abs(deg - (L % 30)) - 30) > 0.011) errors.push(`${id}: burç içi derece boylamla uyuşmuyor`);
  const expNi = Math.min(26, Math.floor(L / NAK_SPAN)) + 1;
  if (ni !== expNi && !nearBoundary(L, NAK_SPAN)) errors.push(`${id}: nakshatra sırası boylamla uyuşmuyor`);
  const expPada = Math.min(4, Math.floor((L % NAK_SPAN) / PADA_SPAN) + 1);
  if (pada !== expPada && !nearBoundary(L, PADA_SPAN)) errors.push(`${id}: pada boylamla uyuşmuyor`);
  const nameIdx = (NAKSHATRAS as readonly string[]).indexOf(slug(o.nakshatra as string));
  if (nameIdx >= 0 && nameIdx !== ni - 1) errors.push(`${id}: nakshatra adı sırayla uyuşmuyor`);
  else if (nameIdx < 0) dropped.push(`${group}Based[].nakshatra`);
  return { id, group, longitude: lon, rashi: rs, degreeInRashi: deg, nakshatra: NAKSHATRAS[ni - 1], nakshatraIndex: ni, pada: pada as 1 | 2 | 3 | 4 };
}

export function projectRoxyVedicUpagraha(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicUpagrahaTechnical, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const f = obj(r.frame);
  const ayDeg = num(f?.ayanamsaDegrees, 0, 40);
  if (f?.ayanamsa !== opts.ayanamsa || ayDeg === null) errors.push("frame: istenen ayanamsa değil");
  const tb = arr(r.timeBased);
  const sb = arr(r.sunBased);
  if (!tb || !sb) return { ok: false, errors: ["timeBased/sunBased: dizi değil"] };
  const time = tb.map((x) => point(x, "time", errors, dropped)).filter((x): x is VedicUpagrahaPoint => x !== null);
  const sun = sb.map((x) => point(x, "sun", errors, dropped)).filter((x): x is VedicUpagrahaPoint => x !== null);
  const setEq = (got: VedicUpagrahaPoint[], want: readonly string[]) => got.length === want.length && new Set(got.map((p) => p.id)).size === want.length && want.every((w) => got.some((p) => p.id === w));
  if (!setEq(time, UPAGRAHA_TIME_IDS)) errors.push("timeBased: 6 zaman tabanlı upagraha (Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka) tam ve tekil değil");
  if (!setEq(sun, UPAGRAHA_SUN_IDS)) errors.push("sunBased: 5 Güneş türevli upagraha (Dhuma, Vyatipata, Parivesha, Indra Chapa, Upaketu) tam ve tekil değil");
  const by = (id: string) => sun.find((p) => p.id === id)?.longitude ?? null;
  const [dh, vy, pa, ic, uk] = UPAGRAHA_SUN_IDS.map(by);
  if (dh !== null && vy !== null && angDiff(vy, 360 - dh) > CHAIN_TOL) errors.push("vyatipata: 360° − Dhuma değil");
  if (vy !== null && pa !== null && angDiff(pa, vy + 180) > CHAIN_TOL) errors.push("parivesha: Vyatipata + 180° değil");
  if (pa !== null && ic !== null && angDiff(ic, 360 - pa) > CHAIN_TOL) errors.push("indra_chapa: 360° − Parivesha değil");
  if (ic !== null && uk !== null && angDiff(uk, ic + UPAKETU_OFFSET) > CHAIN_TOL) errors.push("upaketu: Indra Chapa + 16°40′ değil");
  const order = <T extends { id: string }>(xs: T[], ids: readonly string[]) => [...xs].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return done(
    errors,
    dropped,
    () => ({
      schema: VEDIC_UPAGRAHA_TECHNICAL_SCHEMA,
      zodiac: "sidereal",
      frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! },
      timeBased: order(time, UPAGRAHA_TIME_IDS),
      sunBased: order(sun, UPAGRAHA_SUN_IDS),
      impliedSun: Math.round(norm(dh! - DHUMA_OFFSET) * 1e4) / 1e4,
    }),
    raw,
    UPAGRAHA_KNOWN,
  );
}

// ═══ B · Heliakal ═════════════════════════════════════════════════════════════
const EVENT_KEYS = ["type", "horizon", "datetime", "timeDegrees", "kalamsa"];
const HELIACAL_KNOWN = new Set<string>([
  "date",
  "grahas",
  ...paths("grahas[]", ["graha", "visible", "horizon", "timeDegrees", "kalamsa", "retrograde", "longitudeSeparation", "lastEvent", "nextEvent"]),
  ...paths("grahas[].lastEvent", EVENT_KEYS),
  ...paths("grahas[].nextEvent", EVENT_KEYS),
]);
const LOCAL_DT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
/** Görünürlük kararında yuvarlama payı (zaman derecesi 2 hane). */
const VIS_TOL = 0.05;
const grahaOf = (v: unknown): HeliacalGrahaId | null => {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (HELIACAL_GRAHAS as readonly string[]).includes(k) ? (k as HeliacalGrahaId) : null;
};
const horizonOf = (v: unknown) => (v === "east" || v === "west" ? v : null);

/** Yerel tarih-saat (sabit ofset) → UTC ISO. Geçersizse null. */
export function heliacalLocalToUtc(local: string, offsetHours: number): string | null {
  const m = LOCAL_DT_RE.exec(local);
  if (!m) return null;
  const ms = Date.parse(`${local}Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== local) return null;
  return new Date(ms - Math.round(offsetHours * 3600) * 1000).toISOString().slice(0, 19) + "Z";
}

function event(v: unknown, g: HeliacalGrahaId, which: string, offsetHours: number, errors: string[]): VedicHeliacalEvent | null {
  if (v === null) return null;
  const o = obj(v);
  const type = o?.type === "udaya" ? "udaya" : o?.type === "asta" ? "asta" : null;
  const hz = horizonOf(o?.horizon);
  const local = typeof o?.datetime === "string" ? o.datetime : null;
  const td = num(o?.timeDegrees, -180, 360);
  const k = num(o?.kalamsa, 0, 30);
  const utc = local ? heliacalLocalToUtc(local, offsetHours) : null;
  if (!type || !hz || !local || !utc || td === null || k === null) {
    errors.push(`${g}.${which}: alan`);
    return null;
  }
  if (!HELIACAL_KALAMSA[g].includes(k)) errors.push(`${g}.${which}: kalamsa grahanın sınırı değil`);
  // Olay günü ölçü sınırın iki yanında olmalı; Ay günde ~12° uzaklaştığı için payı geniştir.
  if (Math.abs(td - k) > (g === "moon" ? 15 : 5)) errors.push(`${g}.${which}: olay günü zaman derecesi sınırdan çok uzak`);
  return { type, horizon: hz, local, utc, timeDegrees: td, kalamsa: k };
}

export function projectRoxyVedicHeliacal(
  raw: unknown,
  opts: { date: string; latitude: number; longitude: number; utcOffsetHours: number; label: string | null; timeZone: string | null },
): AdapterResult<VedicHeliacalTechnical, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.date !== opts.date) errors.push("date: istenen gün değil");
  const list = arr(r.grahas);
  if (!list) return { ok: false, errors: ["grahas: dizi değil"] };
  const grahas: VedicHeliacalGraha[] = [];
  for (const it of list) {
    const o = obj(it);
    const id = grahaOf(o?.graha);
    const hz = horizonOf(o?.horizon);
    const td = num(o?.timeDegrees, -180, 360);
    const k = num(o?.kalamsa, 0, 30);
    const sep = num(o?.longitudeSeparation, 0, 180);
    if (!id || !hz || td === null || k === null || sep === null || typeof o?.visible !== "boolean" || typeof o?.retrograde !== "boolean" || !("lastEvent" in o) || !("nextEvent" in o)) {
      errors.push("grahas[]: alan");
      continue;
    }
    if (id === "moon" && o.retrograde) errors.push("moon: Ay geri hareket edemez");
    if (k !== kalamsaFor(id, o.retrograde)) errors.push(`${id}: kalamsa Surya Siddhanta sınırı değil`);
    if (Math.abs(td - k) > VIS_TOL && o.visible !== td > k) errors.push(`${id}: görünürlük zaman derecesi / kalamsa ile uyuşmuyor`);
    const last = event(o.lastEvent, id, "lastEvent", opts.utcOffsetHours, errors);
    const next = event(o.nextEvent, id, "nextEvent", opts.utcOffsetHours, errors);
    if (last && last.type !== (o.visible ? "udaya" : "asta")) errors.push(`${id}: son olay mevcut durumla uyuşmuyor`);
    if (next && next.type !== (o.visible ? "asta" : "udaya")) errors.push(`${id}: sonraki olay mevcut durumu bitirmiyor`);
    if (last && last.local.slice(0, 10) > opts.date) errors.push(`${id}: son olay değerlendirme gününden sonra`);
    if (next && next.local.slice(0, 10) < opts.date) errors.push(`${id}: sonraki olay değerlendirme gününden önce`);
    if (last && next && last.local >= next.local) errors.push(`${id}: olay sırası`);
    grahas.push({ id, visible: o.visible, horizon: hz, timeDegrees: td, kalamsa: k, retrograde: o.retrograde, longitudeSeparation: sep, lastEvent: last, nextEvent: next });
  }
  const ids = grahas.map((g) => g.id);
  if (new Set(ids).size !== ids.length) errors.push("grahas: tekrar eden graha");
  const idx = ids.map((g) => HELIACAL_GRAHAS.indexOf(g));
  if (idx.some((x, i) => i > 0 && x < idx[i - 1])) errors.push("grahas: klasik sıra değil");
  if (grahas.length === 0 && list.length === 0) dropped.push("grahas: boş");
  return done(
    errors,
    dropped,
    () => ({
      schema: VEDIC_HELIACAL_TECHNICAL_SCHEMA,
      date: opts.date,
      place: { label: opts.label, latitude: opts.latitude, longitude: opts.longitude, utcOffsetHours: opts.utcOffsetHours, timeZone: opts.timeZone },
      grahas,
      omitted: HELIACAL_GRAHAS.filter((g) => !ids.includes(g)),
    }),
    raw,
    HELIACAL_KNOWN,
  );
}
