// Gökyüzü Atlası — Gökyüzü Araçları: AY EVRELERİ ve TUTULMALAR istek katmanı (efemeris `table.ts` deseni). Saf; ağ / DB YOK.
//
// Motor (phases / eclipses / contacts) DEĞİŞMEZ; burada yalnız gövde doğrulanır ve motor çıktısı ekrana uygun düz biçime çevrilir.
// Tarihler gün (YYYY-MM-DD, UTC); bitiş günü DAHİL (motor aralığı [başlangıç 00:00, bitiş+1 gün 00:00)).

import { findLunarEclipses, findSolarEclipses, type LunarEclipseKind, type SolarEclipseEvent, type SolarEclipseKind } from "./eclipses";
import { lunarEclipseContacts, solarEclipseGlobalContacts } from "./contacts";
import { LUNATION_MAX_MS, LUNATION_MAX_RANGE_DAYS, LUNATION_MIN_MS, PHASES, findLunarPhases, type LunarPhase } from "./phases";

const DAY = 86_400_000;
/** Tutulma listesi için en geniş aralık (gün). Motor sınırı daha geniştir; ekran için 50 yıl yeterli. */
export const ECLIPSE_MAX_RANGE_DAYS = 366 * 50;

export type LunationRequest = { kind: "phases" | "eclipses"; start: string; end: string; phases: LunarPhase[] };
export type LunationRequestError = { code: "INVALID_INPUT" | "OUT_OF_RANGE" | "RANGE_TOO_LARGE"; field?: string; error: string };

export type PhaseRow = { phase: LunarPhase; ms: number; moonLon: number; uncertaintySec: number };
export type EclipseContactsView =
  | { body: "moon"; p1: number; u1: number | null; u2: number | null; u3: number | null; u4: number | null; p4: number }
  | { body: "sun"; begin: number; end: number };
export type EclipseRow =
  | { body: "moon"; kind: LunarEclipseKind; peakMs: number; contacts: Extract<EclipseContactsView, { body: "moon" }> | null }
  | { body: "sun"; kind: SolarEclipseKind; centrality: SolarEclipseEvent["centrality"]; peakMs: number; contacts: Extract<EclipseContactsView, { body: "sun" }> | null };
export type LunationResult =
  | { kind: "phases"; range: { start: string; end: string }; phases: PhaseRow[] }
  | { kind: "eclipses"; range: { start: string; end: string }; eclipses: EclipseRow[]; counts: { moon: number; sun: number } };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayMs(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === s ? ms : null;
}

export function parseLunationRequest(raw: unknown): { ok: true; value: LunationRequest } | { ok: false; error: LunationRequestError } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = b.kind === "eclipses" ? "eclipses" : b.kind === "phases" ? "phases" : null;
  if (!kind) return { ok: false, error: { code: "INVALID_INPUT", field: "kind", error: "Gösterilecek tür seçilmeli." } };
  const t0 = dayMs(b.start);
  const t1 = dayMs(b.end);
  if (t0 === null) return { ok: false, error: { code: "INVALID_INPUT", field: "start", error: "Başlangıç tarihi geçersiz." } };
  if (t1 === null) return { ok: false, error: { code: "INVALID_INPUT", field: "end", error: "Bitiş tarihi geçersiz." } };
  if (t1 < t0) return { ok: false, error: { code: "INVALID_INPUT", field: "end", error: "Bitiş tarihi başlangıçtan önce olamaz." } };
  if (t0 < LUNATION_MIN_MS || t1 + DAY > LUNATION_MAX_MS) return { ok: false, error: { code: "OUT_OF_RANGE", field: "start", error: "Desteklenen aralık 1920–2150." } };
  const days = (t1 - t0) / DAY + 1;
  const max = kind === "phases" ? LUNATION_MAX_RANGE_DAYS : ECLIPSE_MAX_RANGE_DAYS;
  if (days > max) return { ok: false, error: { code: "RANGE_TOO_LARGE", field: "end", error: kind === "phases" ? `Ay evrelerinde en fazla ${max} gün seçilebilir.` : "Tutulmalarda en fazla 50 yıl seçilebilir." } };
  let phases: LunarPhase[] = [...PHASES];
  if (b.phases !== undefined) {
    if (!Array.isArray(b.phases) || b.phases.length === 0 || b.phases.length > PHASES.length || b.phases.some((p) => !(PHASES as readonly string[]).includes(p as string))) {
      return { ok: false, error: { code: "INVALID_INPUT", field: "phases", error: "En az bir evre seçilmeli." } };
    }
    phases = PHASES.filter((p) => (b.phases as string[]).includes(p));
  }
  return { ok: true, value: { kind, start: b.start as string, end: b.end as string, phases } };
}

export function buildLunations(req: LunationRequest): { ok: true; result: LunationResult } | { ok: false; error: LunationRequestError } {
  const t0 = dayMs(req.start)!;
  const t1 = dayMs(req.end)! + DAY;
  const range = { start: req.start, end: req.end };
  if (req.kind === "phases") {
    const r = findLunarPhases(t0, t1, req.phases);
    if (!r.ok) return { ok: false, error: { code: r.code === "out_of_range" ? "OUT_OF_RANGE" : r.code === "range_too_large" ? "RANGE_TOO_LARGE" : "INVALID_INPUT", error: r.error } };
    return { ok: true, result: { kind: "phases", range, phases: r.events.map((e) => ({ phase: e.phase, ms: e.ms, moonLon: e.moonLon, uncertaintySec: e.uncertaintySec })) } };
  }
  const lunar = findLunarEclipses(t0, t1);
  if (!lunar.ok) return { ok: false, error: { code: lunar.code === "out_of_range" ? "OUT_OF_RANGE" : lunar.code === "range_too_large" ? "RANGE_TOO_LARGE" : "INVALID_INPUT", error: lunar.error } };
  const solar = findSolarEclipses(t0, t1);
  if (!solar.ok) return { ok: false, error: { code: solar.code === "out_of_range" ? "OUT_OF_RANGE" : solar.code === "range_too_large" ? "RANGE_TOO_LARGE" : "INVALID_INPUT", error: solar.error } };
  const rows: EclipseRow[] = [];
  for (const e of lunar.events) {
    const c = lunarEclipseContacts(e.peakTtMs);
    rows.push({
      body: "moon",
      kind: e.kind,
      peakMs: e.peakMs,
      contacts: c ? { body: "moon", p1: c.p1.utcMs, u1: c.u1?.utcMs ?? null, u2: c.u2?.utcMs ?? null, u3: c.u3?.utcMs ?? null, u4: c.u4?.utcMs ?? null, p4: c.p4.utcMs } : null,
    });
  }
  for (const e of solar.events) {
    const c = solarEclipseGlobalContacts(e.peakTtMs);
    rows.push({ body: "sun", kind: e.kind, centrality: e.centrality, peakMs: e.peakMs, contacts: c ? { body: "sun", begin: c.begin.utcMs, end: c.end.utcMs } : null });
  }
  rows.sort((a, b) => a.peakMs - b.peakMs);
  return { ok: true, result: { kind: "eclipses", range, eclipses: rows, counts: { moon: lunar.events.length, sun: solar.events.length } } };
}
