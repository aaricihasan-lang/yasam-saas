// Gökyüzü Atlası — Gökyüzü Araçları: DERECE GEÇİŞLERİ istek katmanı (efemeris `table.ts` deseni). Saf; ağ / DB YOK.
// Motor (crossings.ts) DEĞİŞMEZ. Tarihler gün (YYYY-MM-DD, UTC); bitiş günü DAHİL.

import { ensurePositionEngine, positionEngineInfo, type PositionEngineInfo } from "../ephemeris/engine";
import { EPHEMERIS_BODIES, type EphemerisBody, type Zodiac } from "../ephemeris/types";
import { CROSSING_MAX_DEGREES, CROSSING_MAX_MS, CROSSING_MAX_RANGE_DAYS, CROSSING_MIN_MS, DEGREE_CROSSINGS_ENGINE_VERSION, findDegreeCrossings, type DegreeCrossing } from "./crossings";

const DAY = 86_400_000;
/** Ay hızlıdır (≈13°/gün): uzun aralık çok büyük yanıt üretir → transit motorundaki Ay sınırıyla aynı. */
export const MOON_MAX_RANGE_DAYS = 400;

export type DegreeRequest = { body: EphemerisBody; degrees: number[]; start: string; end: string; zodiac: Zodiac };
export type DegreeRequestError = { code: "INVALID_INPUT" | "OUT_OF_RANGE" | "RANGE_TOO_LARGE" | "ENGINE_UNAVAILABLE"; field?: string; error: string };
export type DegreeResult = {
  body: EphemerisBody;
  zodiac: Zodiac;
  range: { start: string; end: string };
  degrees: number[];
  events: DegreeCrossing[];
  /** Arama motoru + konum motoru sürümü (ör. "pro-degree-crossings-1+jpl_de440"). */
  engineVersion: string;
  positionEngine: PositionEngineInfo;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayMs(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === s ? ms : null;
}

export function parseDegreeRequest(raw: unknown): { ok: true; value: DegreeRequest } | { ok: false; error: DegreeRequestError } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof b.body !== "string" || !(EPHEMERIS_BODIES as readonly string[]).includes(b.body)) return { ok: false, error: { code: "INVALID_INPUT", field: "body", error: "Geçersiz cisim." } };
  const zodiac: Zodiac | null = b.zodiac === undefined || b.zodiac === "tropical" ? "tropical" : b.zodiac === "sidereal_lahiri" ? "sidereal_lahiri" : null;
  if (!zodiac) return { ok: false, error: { code: "INVALID_INPUT", field: "zodiac", error: "Geçersiz zodyak." } };
  if (!Array.isArray(b.degrees) || b.degrees.length === 0 || b.degrees.length > CROSSING_MAX_DEGREES) {
    return { ok: false, error: { code: "INVALID_INPUT", field: "degrees", error: `1–${CROSSING_MAX_DEGREES} derece seçilmeli.` } };
  }
  if (b.degrees.some((d) => typeof d !== "number" || !Number.isFinite(d) || d < 0 || d >= 360)) {
    return { ok: false, error: { code: "INVALID_INPUT", field: "degrees", error: "Derece 0 ile 360 arasında olmalı (360 hariç)." } };
  }
  const t0 = dayMs(b.start);
  const t1 = dayMs(b.end);
  if (t0 === null) return { ok: false, error: { code: "INVALID_INPUT", field: "start", error: "Başlangıç tarihi geçersiz." } };
  if (t1 === null) return { ok: false, error: { code: "INVALID_INPUT", field: "end", error: "Bitiş tarihi geçersiz." } };
  if (t1 < t0) return { ok: false, error: { code: "INVALID_INPUT", field: "end", error: "Bitiş tarihi başlangıçtan önce olamaz." } };
  if (t0 < CROSSING_MIN_MS || t1 + DAY > CROSSING_MAX_MS) return { ok: false, error: { code: "OUT_OF_RANGE", field: "start", error: "Desteklenen aralık 1920–2150." } };
  if ((t1 - t0) / DAY + 1 > CROSSING_MAX_RANGE_DAYS) return { ok: false, error: { code: "RANGE_TOO_LARGE", field: "end", error: `En fazla ${CROSSING_MAX_RANGE_DAYS} gün seçilebilir.` } };
  if (b.body === "moon" && (t1 - t0) / DAY + 1 > MOON_MAX_RANGE_DAYS) return { ok: false, error: { code: "RANGE_TOO_LARGE", field: "end", error: `Ay için en fazla ${MOON_MAX_RANGE_DAYS} gün seçilebilir.` } };
  const degrees = [...new Set((b.degrees as number[]).map((d) => Math.round(d * 1e6) / 1e6))].sort((x, y) => x - y);
  return { ok: true, value: { body: b.body as EphemerisBody, degrees, start: b.start as string, end: b.end as string, zodiac } };
}

export function buildDegreeCrossings(req: DegreeRequest): { ok: true; result: DegreeResult } | { ok: false; error: DegreeRequestError } {
  const eng = ensurePositionEngine();
  if (!eng.ok) return { ok: false, error: { code: "ENGINE_UNAVAILABLE", error: eng.error } };
  const r = findDegreeCrossings(req.body, req.degrees, dayMs(req.start)!, dayMs(req.end)! + DAY, req.zodiac);
  if (!r.ok) return { ok: false, error: { code: r.code === "out_of_range" ? "OUT_OF_RANGE" : r.code === "range_too_large" ? "RANGE_TOO_LARGE" : "INVALID_INPUT", error: r.error } };
  const positionEngine = positionEngineInfo();
  return {
    ok: true,
    result: { body: req.body, zodiac: req.zodiac, range: { start: req.start, end: req.end }, degrees: req.degrees, events: r.events, engineVersion: `${DEGREE_CROSSINGS_ENGINE_VERSION}+${positionEngine.id}`, positionEngine },
  };
}
