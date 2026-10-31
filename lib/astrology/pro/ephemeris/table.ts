// Gökyüzü Atlası — PROFESYONEL EFEMERİS: istek doğrulama + tablo kurucu (SAF; ağ yalnız enjekte edilen `fetchDay` ile).
//
// Görünümler: gün (tek satır), ay (ayın her günü), yıl (12 sayfa = ay; olaylar sayfa ayı için), aralık (en çok 10 yıl; 31 günlük sayfa).
// Satır anı daima 00:00 UT. Olaylar (burç girişi, istasyon) yerel motorla, sayfa penceresi [ilk gün 00:00, son gün+1 00:00) içinde.
// Sağlayıcı kaynağında bir gün bile alınamazsa tablo YEREL veriyle SESSİZCE tamamlanmaz → PROVIDER_FAILED.

import { eraOf, FIELD_SOURCES, precisionFor, type EraBand } from "./accuracy";
import { DELTA_T_FIRST_YEAR, DELTA_T_LAST_YEAR, deltaTClass } from "./deltaT";
import { findEvents } from "./events";
import { eclipticToEquatorial, lahiriMeanAyanamsa, lahiriTrueAyanamsa, localPosition, localSpeed, n360, obliquityAt, STATION_THRESHOLD_DEG_PER_DAY } from "./local";
import { Lru, PROVIDER_MAX_DAYS_PER_REQUEST, projectProviderPlanets, type ProviderNodeType, type ProviderPositions } from "./provider";
import { EPHEMERIS_BODIES, type BodyPosition, type EphemerisBody, type EphemerisError, type EphemerisField, type EphemerisMeta, type EphemerisResult, type EphemerisRow, type EphemerisSource, type Zodiac } from "./types";

export const ENGINE_VERSION = "pro-ephemeris-1";
export const MAX_RANGE_DAYS = 3653; // 10 yıl
export const PAGE_DAYS = 31;
const DAY = 86_400_000;

export type EphemerisView = "day" | "month" | "year" | "range";
export type EphemerisRequest = {
  view: EphemerisView;
  start: string; // YYYY-MM-DD (gün: o gün; ay: ayın 1'i; yıl: 1 Ocak; aralık: başlangıç)
  end: string; // dahil
  page: number;
  bodies: EphemerisBody[];
  zodiac: Zodiac;
  source: EphemerisSource;
  nodeType: ProviderNodeType;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function parseDate(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return ms;
}
export const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const yearOk = (ms: number) => {
  const y = new Date(ms).getUTCFullYear();
  return y >= DELTA_T_FIRST_YEAR && y <= DELTA_T_LAST_YEAR;
};

export function parseEphemerisRequest(raw: unknown): { ok: true; value: EphemerisRequest } | { ok: false; error: EphemerisError } {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const bad = (field: string, error: string): { ok: false; error: EphemerisError } => ({ ok: false, error: { code: "INVALID_INPUT", field, error } });
  const view = r.view;
  if (view !== "day" && view !== "month" && view !== "year" && view !== "range") return bad("view", "Görünüm geçersiz.");
  const zodiac = r.zodiac ?? "tropical";
  if (zodiac !== "tropical" && zodiac !== "sidereal_lahiri") return bad("zodiac", "Zodyak geçersiz.");
  const source = r.source ?? "local";
  if (source !== "local" && source !== "provider") return bad("source", "Kaynak geçersiz.");
  const nodeType = r.nodeType ?? "true";
  if (nodeType !== "true" && nodeType !== "mean") return bad("nodeType", "Düğüm türü geçersiz.");
  let bodies: EphemerisBody[];
  if (r.bodies === undefined) bodies = EPHEMERIS_BODIES.filter((b) => b !== (nodeType === "true" ? "mean_node" : "true_node"));
  else {
    if (!Array.isArray(r.bodies) || r.bodies.length === 0 || r.bodies.length > EPHEMERIS_BODIES.length) return bad("bodies", "Cisim listesi geçersiz.");
    const set = new Set<EphemerisBody>();
    for (const b of r.bodies) {
      if (typeof b !== "string" || !(EPHEMERIS_BODIES as readonly string[]).includes(b)) return bad("bodies", "Bilinmeyen cisim.");
      set.add(b as EphemerisBody);
    }
    bodies = EPHEMERIS_BODIES.filter((b) => set.has(b));
  }
  if (source === "provider" && bodies.some((b) => (b === "mean_node" && nodeType === "true") || (b === "true_node" && nodeType === "mean"))) {
    return bad("bodies", "Sağlayıcı kaynağında yalnız seçili düğüm türü gösterilebilir.");
  }
  const page = r.page === undefined ? 0 : r.page;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 0 || page > 200) return bad("page", "Sayfa geçersiz.");

  let start: number | null;
  let end: number | null;
  if (view === "day") {
    start = parseDate(r.date);
    end = start;
    if (start === null) return bad("date", "Tarih geçersiz (YYYY-AA-GG).");
  } else if (view === "month") {
    const y = r.year;
    const m = r.month;
    if (typeof y !== "number" || !Number.isInteger(y) || typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 12) return bad("month", "Yıl/ay geçersiz.");
    start = Date.UTC(y, m - 1, 1);
    end = Date.UTC(y, m, 1) - DAY;
  } else if (view === "year") {
    const y = r.year;
    if (typeof y !== "number" || !Number.isInteger(y)) return bad("year", "Yıl geçersiz.");
    if (page > 11) return bad("page", "Yıllık görünümde sayfa 0–11 (ay).");
    start = Date.UTC(y, 0, 1);
    end = Date.UTC(y, 11, 31);
  } else {
    start = parseDate(r.start);
    end = parseDate(r.end);
    if (start === null) return bad("start", "Başlangıç tarihi geçersiz.");
    if (end === null) return bad("end", "Bitiş tarihi geçersiz.");
    if (end < start) return bad("end", "Bitiş başlangıçtan önce olamaz.");
    if ((end - start) / DAY + 1 > MAX_RANGE_DAYS) return { ok: false, error: { code: "RANGE_TOO_LARGE", field: "end", error: "Aralık en çok 10 yıl olabilir." } };
  }
  if (start === null || end === null) return bad("date", "Tarih geçersiz.");
  if (!yearOk(start) || !yearOk(end)) return { ok: false, error: { code: "OUT_OF_RANGE", field: "date", error: `Tarih ${DELTA_T_FIRST_YEAR}–${DELTA_T_LAST_YEAR} aralığında olmalı.` } };
  return { ok: true, value: { view, start: ymd(start), end: ymd(end), page, bodies, zodiac, source, nodeType } };
}

/** Sayfa penceresi (gün listesi). Yıl görünümünde sayfa = ay; diğerlerinde 31 günlük dilim. */
export function pageWindow(req: EphemerisRequest): { days: number[]; total: number; index: number } | null {
  const a = Date.parse(`${req.start}T00:00:00Z`);
  const b = Date.parse(`${req.end}T00:00:00Z`);
  if (req.view === "year") {
    const y = new Date(a).getUTCFullYear();
    const s = Date.UTC(y, req.page, 1);
    const e = Date.UTC(y, req.page + 1, 1) - DAY;
    return { days: daysBetween(s, e), total: 12, index: req.page };
  }
  const n = Math.round((b - a) / DAY) + 1;
  const total = Math.max(1, Math.ceil(n / PAGE_DAYS));
  if (req.page >= total) return null;
  const s = a + req.page * PAGE_DAYS * DAY;
  const e = Math.min(b, s + (PAGE_DAYS - 1) * DAY);
  return { days: daysBetween(s, e), total, index: req.page };
}
function daysBetween(s: number, e: number): number[] {
  const out: number[] = [];
  for (let t = s; t <= e; t += DAY) out.push(t);
  return out;
}

export type FetchDay = (date: string, nodeType: ProviderNodeType) => Promise<unknown | null>;
const PROVIDER_CACHE = new Lru<ProviderPositions>(4000);

function coarser(a: EraBand, b: EraBand, field: EphemerisField, req: EphemerisRequest, bodies: readonly EphemerisBody[] = req.bodies) {
  const order = { arcsec: 0, tenth_arcmin: 1, arcmin: 2 } as const;
  const pa = precisionFor(field, req.source, a, bodies, req.zodiac !== "tropical");
  const pb = precisionFor(field, req.source, b, bodies, req.zodiac !== "tropical");
  return order[pa] >= order[pb] ? pa : pb;
}

function localRow(ms: number, req: EphemerisRequest): EphemerisRow {
  return { date: ymd(ms), ut: new Date(ms).toISOString().replace(".000Z", "Z"), positions: req.bodies.map((b) => localPosition(b, ms, req.zodiac)) };
}

function providerRow(ms: number, req: EphemerisRequest, pos: ProviderPositions): EphemerisRow {
  const { trueObliquity } = obliquityAt(ms);
  const ayan = req.zodiac === "sidereal_lahiri" ? lahiriTrueAyanamsa(ms) : 0;
  const positions: BodyPosition[] = req.bodies.map((b) => {
    const p = pos[b]!;
    const speed = localSpeed(b, ms);
    const isNode = b === "mean_node" || b === "true_node";
    const eq = isNode ? null : eclipticToEquatorial(p.lon, p.lat, trueObliquity);
    return { body: b, lon: n360(p.lon - ayan), lat: isNode ? 0 : p.lat, ra: eq?.ra ?? null, dec: eq?.dec ?? null, speed, retro: speed < 0, stationary: Math.abs(speed) < STATION_THRESHOLD_DEG_PER_DAY };
  });
  return { date: ymd(ms), ut: new Date(ms).toISOString().replace(".000Z", "Z"), positions };
}

export async function buildEphemeris(req: EphemerisRequest, deps: { fetchDay?: FetchDay } = {}): Promise<{ ok: true; result: EphemerisResult } | { ok: false; error: EphemerisError }> {
  const w = pageWindow(req);
  if (!w) return { ok: false, error: { code: "INVALID_INPUT", field: "page", error: "Sayfa aralık dışı." } };
  const first = w.days[0];
  const last = w.days[w.days.length - 1];
  if (req.source === "provider" && w.days.length > PROVIDER_MAX_DAYS_PER_REQUEST) return { ok: false, error: { code: "RANGE_TOO_LARGE", error: "Sağlayıcı kaynağında sayfa en çok 31 gün." } };

  let providerCalls = 0;
  const rows: EphemerisRow[] = [];
  if (req.source === "provider") {
    if (!deps.fetchDay) return { ok: false, error: { code: "PROVIDER_FAILED", error: "Hesaplama altyapısı yapılandırılmamış." } };
    for (const ms of w.days) {
      const key = `${ymd(ms)}|${req.nodeType}`;
      let pos = PROVIDER_CACHE.get(key);
      if (!pos) {
        providerCalls += 1;
        const raw = await deps.fetchDay(ymd(ms), req.nodeType);
        const pr = raw === null ? null : projectProviderPlanets(raw, req.nodeType);
        if (!pr || !pr.ok) return { ok: false, error: { code: "PROVIDER_FAILED", error: "Hesaplama altyapısından bu gün alınamadı; tablo eksik veriyle gösterilmez.", field: ymd(ms) } };
        pos = pr.positions;
        PROVIDER_CACHE.set(key, pos);
      }
      rows.push(providerRow(ms, req, pos));
    }
  } else {
    for (const ms of w.days) rows.push(localRow(ms, req));
  }
  const events = findEvents(req.bodies, first, last + DAY, req.zodiac, req.source);
  const eraA = eraOf(new Date(first).getUTCFullYear());
  const eraB = eraOf(new Date(last).getUTCFullYear());
  const fields: EphemerisField[] = ["lon", "lat", "ra", "dec", "speed", "retro"];
  const precision = Object.fromEntries(fields.map((f) => [f, coarser(eraA, eraB, f, req)])) as EphemerisMeta["precision"];
  const bodyPrecision = Object.fromEntries(req.bodies.map((b) => [b, Object.fromEntries(fields.map((f) => [f, coarser(eraA, eraB, f, req, [b])]))])) as EphemerisMeta["bodyPrecision"];
  const dtc = [deltaTClass(first), deltaTClass(last)];
  const meta: EphemerisMeta = {
    source: req.source,
    zodiac: req.zodiac,
    timeOfDay: "00:00",
    timeStandard:
      req.source === "provider"
        ? "Satırlar 00:00 UT (1972–2030 arası UTC; fark < 0,9 s). Konumlar görünür geosantrik, gerçek ekinoks ve ekliptik."
        : "Satırlar 00:00 UT (UT1). Konumlar görünür geosantrik, gerçek ekinoks ve ekliptik; TT = UT + ΔT.",
    deltaTNote: dtc.includes("predicted") ? "Gelecek tarih: ΔT tahminidir, Ay konumu ve olay anları belirsizdir." : dtc.includes("historical_model") ? "1800 öncesi: ΔT tarihsel modelden; Ay'da saniyeler mertebesinde belirsizlik." : "ΔT gözlem değerlerinden.",
    ayanamsa: req.zodiac === "sidereal_lahiri" ? { id: "lahiri", definition: FIELD_SOURCES[req.source].sidereal, valueAtStart: lahiriMeanAyanamsa(first) } : null,
    nodeNote: req.source === "provider" ? `Düğüm: ${req.nodeType === "true" ? "gerçek (oskülasyon)" : "ortalama"}` : "Ortalama düğüm (Meeus) ve gerçek (oskülasyon) düğüm yerel hesaptır.",
    precision,
    bodyPrecision,
    disabledFields: [],
    providerCalls,
    engineVersion: ENGINE_VERSION,
  };
  return { ok: true, result: { meta, rows, events, page: { index: w.index, total: w.total, startDate: ymd(first), endDate: ymd(last) } } };
}
