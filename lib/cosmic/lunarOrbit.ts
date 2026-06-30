/**
 * lib/cosmic/lunarOrbit.ts
 * FAZ 3C — Production AY YÖRÜNGESİ (Lunar Orbit) motoru.
 *
 * UI'da HENÜZ KULLANILMAZ (FAZ 3C Adım 3'te bağlanacak). FAZ 2C aspect, FAZ 3A eclipse,
 * FAZ 3B voidMoon motorlarına DOKUNMAZ — yalnız astronomy-engine'i kullanır.
 *
 * ── Tanımlar (KİLİTLİ — değiştirme) ───────────────────────────────────────────
 *   • Mesafe = GEOCENTRIC merkez-merkez (Dünya merkezi ↔ Ay merkezi). Topocentric DEĞİL.
 *     Kaynak: AE Libration().dist_km / SearchLunarApsis().dist_km.
 *   • Supermoon = Yeniay/Dolunay, lunasyonu çevreleyen perigee–apogee aralığında perigee
 *     tarafındaki %10 (Nolle/Espenak %90) içinde. Micromoon = apogee tarafındaki %10.
 *     Ham distance_km HER ZAMAN saklanır; sabit eşik (≤360.000 / ≥405.000 km) yalnız yardımcı.
 *   • Apsis zamanı DÜZ ekstremumdur → DAKİKA düzeyi (saniye iddia EDİLMEZ). Syzygy ~saniye.
 *
 * ── Bağımsız doğrulama ────────────────────────────────────────────────────────
 *   scripts/cosmic-validation/lunarorbit/ (Swiss Ephemeris): mesafe ≤52km, apsis 54/54
 *   (zaman ≤17dk, ≤53km), syzygy 49/49 (≤40sn, ≤14km), supermoon/micromoon 0 uyumsuz.
 *
 * Saf/deterministik: yalnız dışarıdan verilen Date'lerle (gizli new Date() yok).
 */

import * as AE from "astronomy-engine";

// ─── Tipler ─────────────────────────────────────────────────────────────────────

export type DistanceType = "geocentric-center-to-center";
export type LunarValidation = "harness-verified";
export type LunarConfidence = "high";

export type LunarDistanceSnapshot = {
  dateUTC: string;
  dateTR: string;
  distanceKm: number;
  distanceAu: number;
  apparentDiameterDeg: number;
  distanceType: DistanceType;
  source: string;
  validationStatus: LunarValidation;
  confidence: LunarConfidence;
};

export type LunarApsisEvent = {
  id: string;
  kind: "perigee" | "apogee";
  timeUTC: string;
  timeTR: string;
  distanceKm: number;
  distanceAu: number;
  apparentDiameterDeg: number;
  precisionPolicy: "minute-level";
  source: string;
  validationStatus: LunarValidation;
  confidence: LunarConfidence;
  notes: string[];
};

export type ApsisRef = { timeUTC: string; timeTR: string; distanceKm: number };

export type LunarSyzygyEvent = {
  id: string;
  kind: "new-moon" | "full-moon";
  timeUTC: string;
  timeTR: string;
  distanceKm: number;
  distanceAu: number;
  apparentDiameterDeg: number;
  nearestPerigee: ApsisRef | null;
  nearestApogee: ApsisRef | null;
  nollePercent: number;            // 0=perigee, 100=apogee; ≤10 super, ≥90 micro
  isSupermoon: boolean;
  isMicromoon: boolean;
  fixedThresholdSuperCheck: boolean;   // ham ≤360.000 km (yalnız yardımcı)
  fixedThresholdMicroCheck: boolean;   // ham ≥405.000 km (yalnız yardımcı)
  definition: string;
  distanceType: DistanceType;
  source: string;
  validationStatus: LunarValidation;
  confidence: LunarConfidence;
  notes: string[];
};

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const AU_KM = 149_597_870.7;       // IAU
const NOLLE = 0.10;                // %90 yaklaşım
const FIXED_SUPER_KM = 360_000;
const FIXED_MICRO_KM = 405_000;
const DAY_MS = 86_400_000;
const TR_OFFSET_MS = 3 * 3_600_000;
const DISTANCE_TYPE: DistanceType = "geocentric-center-to-center";

const DEFINITION =
  "Mesafe: geocentric merkez-merkez Ay-Dünya. Supermoon/Micromoon: Nolle/Espenak %90 yaklaşımı " +
  "(yeniay/dolunay, çevreleyen perigee–apogee aralığının perigee/apogee tarafındaki %10'u içinde). " +
  "Ham mesafe her zaman gösterilir; sabit eşik yalnız yardımcı çapraz kontroldür.";
const SOURCE =
  "astronomy-engine (SearchLunarApsis + Libration + SearchMoonPhase); harness-doğrulanmış vs Swiss Ephemeris";

// ─── Yardımcılar ────────────────────────────────────────────────────────────────

const isoZ = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
function isoTR(ms: number): string {
  const t = new Date(ms + TR_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+03:00`;
}
const round1 = (x: number): number => Math.round(x * 10) / 10;
const round = (x: number, n: number): number => Math.round(x * 10 ** n) / 10 ** n;

type RawApsis = { kind: "perigee" | "apogee"; timeMs: number; distKm: number; distAu: number };

function enumerateRawApsides(startMs: number, endMs: number): RawApsis[] {
  const out: RawApsis[] = [];
  let a = AE.SearchLunarApsis(new Date(startMs));
  let guard = 0;
  while (a.time.date.getTime() < endMs && guard++ < 4000) {
    out.push({
      kind: a.kind === 0 ? "perigee" : "apogee",
      timeMs: a.time.date.getTime(),
      distKm: a.dist_km, distAu: a.dist_au,
    });
    a = AE.NextLunarApsis(a);
  }
  return out;
}

function buildApsis(r: RawApsis): LunarApsisEvent {
  const diam = AE.Libration(new Date(r.timeMs)).diam_deg;
  return {
    id: `apsis-${r.kind}-${isoZ(r.timeMs)}`,
    kind: r.kind,
    timeUTC: isoZ(r.timeMs), timeTR: isoTR(r.timeMs),
    distanceKm: round1(r.distKm), distanceAu: round(r.distAu, 8),
    apparentDiameterDeg: round(diam, 5),
    precisionPolicy: "minute-level",
    source: SOURCE, validationStatus: "harness-verified", confidence: "high",
    notes: ["Apsis, mesafenin düz ekstremumudur → zaman dakika düzeyindedir (saniye iddia edilmez)."],
  };
}

function bracketingApsides(syzMs: number, apsides: RawApsis[]): { perigee: RawApsis; apogee: RawApsis } | null {
  for (let i = 0; i < apsides.length - 1; i++) {
    if (apsides[i]!.timeMs <= syzMs && syzMs <= apsides[i + 1]!.timeMs) {
      const a = apsides[i]!, b = apsides[i + 1]!;
      return { perigee: a.kind === "perigee" ? a : b, apogee: a.kind === "apogee" ? a : b };
    }
  }
  return null;
}

const apsisRef = (r: RawApsis): ApsisRef => ({ timeUTC: isoZ(r.timeMs), timeTR: isoTR(r.timeMs), distanceKm: round1(r.distKm) });

function buildSyzygy(timeMs: number, kind: "new-moon" | "full-moon", apsidesWide: RawApsis[]): LunarSyzygyEvent {
  const lib = AE.Libration(new Date(timeMs));
  const dist = lib.dist_km;
  const br = bracketingApsides(timeMs, apsidesWide);
  let nollePercent = 0, isSupermoon = false, isMicromoon = false;
  let nearestPerigee: ApsisRef | null = null, nearestApogee: ApsisRef | null = null;
  const notes: string[] = [];
  if (br) {
    const P = br.perigee.distKm, A = br.apogee.distKm;
    const rng = A - P;
    const pct = rng > 0 ? (dist - P) / rng : 0;
    nollePercent = round(pct * 100, 1);
    isSupermoon = pct <= NOLLE;
    isMicromoon = pct >= (1 - NOLLE);
    nearestPerigee = apsisRef(br.perigee);
    nearestApogee = apsisRef(br.apogee);
    if (isSupermoon) notes.push("Supermoon (Nolle/Espenak %90 yaklaşımı).");
    if (isMicromoon) notes.push("Micromoon (Nolle/Espenak %90 yaklaşımı).");
  } else {
    notes.push("Çevreleyen apsis bulunamadı; sınıflandırma yapılamadı.");
  }
  return {
    id: `syzygy-${kind}-${isoZ(timeMs)}`,
    kind,
    timeUTC: isoZ(timeMs), timeTR: isoTR(timeMs),
    distanceKm: round1(dist), distanceAu: round(dist / AU_KM, 8),
    apparentDiameterDeg: round(lib.diam_deg, 5),
    nearestPerigee, nearestApogee,
    nollePercent, isSupermoon, isMicromoon,
    fixedThresholdSuperCheck: dist <= FIXED_SUPER_KM,
    fixedThresholdMicroCheck: dist >= FIXED_MICRO_KM,
    definition: DEFINITION, distanceType: DISTANCE_TYPE,
    source: SOURCE, validationStatus: "harness-verified", confidence: "high",
    notes,
  };
}

function enumerateRawSyzygies(startMs: number, endMs: number): { timeMs: number; kind: "new-moon" | "full-moon" }[] {
  const out: { timeMs: number; kind: "new-moon" | "full-moon" }[] = [];
  for (const [target, kind] of [[0, "new-moon"], [180, "full-moon"]] as const) {
    let t = new Date(startMs);
    let guard = 0;
    while (t.getTime() < endMs && guard++ < 1000) {
      const ev = AE.SearchMoonPhase(target, t, 40);
      if (!ev || ev.date.getTime() >= endMs) break;
      out.push({ timeMs: ev.date.getTime(), kind });
      t = new Date(ev.date.getTime() + 2 * DAY_MS);
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

// ─── Memoizasyon (deterministik → güvenli) ──────────────────────────────────────
const _apsisCache = new Map<string, LunarApsisEvent[]>();
const _syzygyCache = new Map<string, LunarSyzygyEvent[]>();

// ─── Public API ─────────────────────────────────────────────────────────────────

/** Verilen andaki Ay-Dünya geocentric merkez-merkez mesafesi + apparent çapı. */
export function getLunarDistanceSnapshot(date: Date): LunarDistanceSnapshot {
  const lib = AE.Libration(date);
  const ms = date.getTime();
  return {
    dateUTC: isoZ(ms), dateTR: isoTR(ms),
    distanceKm: round1(lib.dist_km), distanceAu: round(lib.dist_km / AU_KM, 8),
    apparentDiameterDeg: round(lib.diam_deg, 5),
    distanceType: DISTANCE_TYPE,
    source: SOURCE, validationStatus: "harness-verified", confidence: "high",
  };
}

/** [start, end) aralığındaki apsisler (perigee/apogee), kronolojik. */
export function getLunarApsisEvents(start: Date, end: Date): LunarApsisEvent[] {
  const startMs = start.getTime(), endMs = end.getTime();
  if (!(endMs > startMs)) return [];
  const key = `${startMs}|${endMs}`;
  const cached = _apsisCache.get(key);
  if (cached) return cached;
  const events = enumerateRawApsides(startMs, endMs).filter(r => r.timeMs >= startMs).map(buildApsis);
  _apsisCache.set(key, events);
  return events;
}

/** `from`tan sonraki ilk `count` apsis. */
export function getUpcomingLunarApsisEvents(from: Date, count = 6): LunarApsisEvent[] {
  const end = new Date(from.getTime() + (count + 2) * 15 * DAY_MS);
  return getLunarApsisEvents(from, end).slice(0, count);
}

/** [start, end) aralığındaki syzygy'ler (yeniay/dolunay) + supermoon/micromoon sınıflandırması. */
export function getLunarSyzygyEvents(start: Date, end: Date): LunarSyzygyEvent[] {
  const startMs = start.getTime(), endMs = end.getTime();
  if (!(endMs > startMs)) return [];
  const key = `${startMs}|${endMs}`;
  const cached = _syzygyCache.get(key);
  if (cached) return cached;
  const apsidesWide = enumerateRawApsides(startMs - 20 * DAY_MS, endMs + 20 * DAY_MS);
  const events = enumerateRawSyzygies(startMs, endMs).map(s => buildSyzygy(s.timeMs, s.kind, apsidesWide));
  _syzygyCache.set(key, events);
  return events;
}

/** `from`tan sonraki ilk `count` syzygy. */
export function getUpcomingLunarSyzygyEvents(from: Date, count = 6): LunarSyzygyEvent[] {
  const end = new Date(from.getTime() + (count + 2) * 15 * DAY_MS);
  return getLunarSyzygyEvents(from, end).slice(0, count);
}

/** [start, end) aralığındaki supermoon olayları. */
export function getSupermoonEvents(start: Date, end: Date): LunarSyzygyEvent[] {
  return getLunarSyzygyEvents(start, end).filter(s => s.isSupermoon);
}

/** [start, end) aralığındaki micromoon olayları. */
export function getMicromoonEvents(start: Date, end: Date): LunarSyzygyEvent[] {
  return getLunarSyzygyEvents(start, end).filter(s => s.isMicromoon);
}

/** Kullanılan tanım metası (UI'da açıkça gösterilmek üzere). */
export function getLunarOrbitDefinition(): {
  definition: string;
  distanceType: DistanceType;
  nollePercent: number;
  fixedSuperKm: number;
  fixedMicroKm: number;
  source: string;
} {
  return {
    definition: DEFINITION,
    distanceType: DISTANCE_TYPE,
    nollePercent: NOLLE * 100,
    fixedSuperKm: FIXED_SUPER_KM,
    fixedMicroKm: FIXED_MICRO_KM,
    source: SOURCE,
  };
}
