/**
 * lib/cosmic/aspectMotion.ts
 * FAZ 2C / Adım 2 — Production APPLYING / SEPARATING + RETRO İSTASYON + ÜÇLÜ GEÇİŞ motoru.
 *
 * Eski yöntem (aspects.ts içindeki getApplyingSeparating) TEK İLERİ ÖRNEKLEME (heuristic)
 * kullanıyordu; retro civarında yanılabiliyordu. Bu motor TÜREV tabanlıdır:
 *   r(t)        = wrapTo180( lonA(t) − lonB(t) − hedefAçı )   (en yakın hedef seçilir)
 *   orb(t)      = |r(t)|
 *   signedSpeed = vA − vB           (göreli açısal hız, işaretli)
 *   orb'(t)     = sign(r) · signedSpeed   →  <0 applying, >0 separating
 * Böylece yön, tek bir andaki türevden KESİN belirlenir; istasyon civarında doğru kalır.
 *
 * KISITLAR:
 *   - UI'da kullanılmaz, kartlar değişmez (FAZ 2C Adım 3'te bağlanacak).
 *   - Exact çözücü (exactAspects.ts) ve aspects.ts'in çalışan davranışı DEĞİŞMEZ; yalnız import edilir.
 *   - Doğruluk > performans. Gerekirse yavaş çalışır ama yanlış çalışmaz.
 *
 * Saf/deterministik: yalnız dışarıdan verilen Date'lerle çalışır (SSR↔client tutarlı).
 */

import {
  type AspectBody,
  type AspectName,
  ASPECTS,
  BODY_ORDER,
  BODY_SYMBOL,
  BODY_SLUG,
  getPlanetLongitude,
} from "./aspects";
import { findExactAspectsInWindow, type DisplayPrecision, type ExactConfidence } from "./exactAspects";

// ─── Tipler ─────────────────────────────────────────────────────────────────────

export type MotionDirection = "applying" | "separating" | "exact";
export type RelativeMotion = "direct" | "retrograde";

/** Belirli bir andaki anlık açı-hareket durumu (heuristic'in production yerine geçer). */
export type AspectMotionState = {
  bodyA:        AspectBody;
  bodyB:        AspectBody;
  aspect:       AspectName;
  aspectAngle:  number;
  at:           Date;
  atISO:        string;

  orbDeg:               number;          // hedefe uzaklık (derece)
  direction:            MotionDirection; // türev tabanlı
  relativeAngularSpeed: number;          // |vA − vB|, derece/gün
  signedSpeed:          number;          // vA − vB, derece/gün (yön)
  orbDerivative:        number;          // d|orb|/dt, derece/gün (<0 applying)
  relativeMotion:       RelativeMotion;  // göreli hareket yönü (signedSpeed işareti)

  retroA:          boolean;
  retroB:          boolean;
  isStationNearby: boolean;
  stationBody:     AspectBody | null;    // istasyona yakın cisim (varsa)
};

/** Tek bir EXACT geçiş (pass) + üçlü-geçiş bağlamı. */
export type AspectPass = {
  id:           string;
  bodyA:        AspectBody;
  bodyB:        AspectBody;
  bodyASymbol:  string;
  bodyBSymbol:  string;
  aspect:       AspectName;
  aspectSymbol: string;
  aspectAngle:  number;

  exactAt:    Date;
  exactAtISO: string;

  passNumber:     number;        // 1..N (üçlü geçişte 1/2/3)
  totalPassCount: number;        // bu epizottaki toplam geçiş (1 veya 3…)

  displayPrecision: DisplayPrecision; // "minute" | "date" (exact çözücüden taşınır)
  confidence:       ExactConfidence;  // "high" | "medium" | "position-only"
  precisionPolicy:  string;           // hassasiyet gerekçesi (exact çözücüden)
  residualArcsec:   number;           // çözümdeki artık (sağlık kontrolü)

  signedSpeed:          number;  // exact anındaki vA − vB
  relativeAngularSpeed: number;
  relativeMotion:       RelativeMotion;
  directionBefore:      MotionDirection; // exact öncesi (tanım gereği "applying")
  directionAfter:       MotionDirection; // exact sonrası (tanım gereği "separating")

  retroA:          boolean;
  retroB:          boolean;
  isStationNearby: boolean;
  stationBody:     AspectBody | null;
};

export type MotionOptions = {
  /** İstasyon "yakınlık" penceresi (gün, ±). Varsayılan 12. */
  stationWindowDays?: number;
  /** Pencere tarama adımı (gün). exactAspects varsayılanlarıyla uyumlu. */
  stepDays?: number;
  /** getNearestPass için arama yarı-penceresi (gün, ±). Verilmezse çifte göre otomatik. */
  windowDays?: number;
};

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const VEL_H_MS = 0.01 * DAY_MS;          // hız için merkezi fark adımı (~14.4 dk)
const EXACT_ORB_DEG = 0.05;              // anlık "exact" eşiği (~3′)
const STATION_WINDOW_DAYS = 12;          // istasyon yakınlık penceresi
const STATION_SCAN_STEP_DAYS = 1;        // istasyon taraması adımı
const MAX_EPISODE_GAP_DAYS = 300;        // bir üçlü-geçiş epizodunun azami süresi
const OUTER_BODIES = new Set<AspectBody>(["Jüpiter", "Satürn", "Uranüs", "Neptün", "Plüton"]);

const ASPECT_BY_NAME: Record<AspectName, typeof ASPECTS[number]> = Object.fromEntries(
  ASPECTS.map(a => [a.name, a]),
) as Record<AspectName, typeof ASPECTS[number]>;

// ─── Açı/hız yardımcıları ───────────────────────────────────────────────────────

function wrap180(x: number): number { return ((x % 360) + 540) % 360 - 180; }

function targetsFor(angle: number): number[] {
  if (angle === 0) return [0];
  if (angle === 180) return [180];
  return [angle, 360 - angle];
}

/** Tek cismin işaretli açısal hızı (derece/gün); + ileri, − retro. */
function velocity(body: AspectBody, ms: number): number {
  let d = getPlanetLongitude(body, new Date(ms + VEL_H_MS))
        - getPlanetLongitude(body, new Date(ms - VEL_H_MS));
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d / (2 * VEL_H_MS / DAY_MS);
}

/** Çift için en yakın hedef + o hedefe işaretli artık r. */
function nearestTarget(angle: number, rawDiff: number): { target: number; r: number } {
  let best = 0, bestR = Infinity, bestAbs = Infinity;
  for (const t of targetsFor(angle)) {
    const r = wrap180(rawDiff - t);
    if (Math.abs(r) < bestAbs) { bestAbs = Math.abs(r); bestR = r; best = t; }
  }
  return { target: best, r: bestR };
}

/** Bir cisim ±window içinde retro istasyonu yapıyor mu (hız işareti değişimi). Ay: asla. */
function stationNearby(body: AspectBody, ms: number, windowDays: number): boolean {
  if (body === "Ay") return false;
  const stepMs = STATION_SCAN_STEP_DAYS * DAY_MS;
  const startMs = ms - windowDays * DAY_MS;
  const endMs = ms + windowDays * DAY_MS;
  let prev = velocity(body, startMs);
  for (let t = startMs + stepMs; t <= endMs; t += stepMs) {
    const v = velocity(body, t);
    if (prev !== 0 && Math.sign(v) !== Math.sign(prev)) return true;
    prev = v;
  }
  return false;
}

function canonical(bodyA: AspectBody, bodyB: AspectBody): [AspectBody, AspectBody] {
  return BODY_ORDER.indexOf(bodyA) <= BODY_ORDER.indexOf(bodyB) ? [bodyA, bodyB] : [bodyB, bodyA];
}

// ─── Public: anlık hareket durumu ───────────────────────────────────────────────

/**
 * Belirli bir anda bodyA–bodyB çiftinin verilen açıya göre applying/separating durumu.
 * Türev tabanlı (tek-ileri-adım heuristic'i DEĞİL). bodyA/bodyB kanonik sıraya alınır.
 */
export function getAspectMotion(
  bodyA: AspectBody, bodyB: AspectBody, aspect: AspectName, date: Date, opts: MotionOptions = {},
): AspectMotionState | null {
  if (bodyA === bodyB) return null;
  const def = ASPECT_BY_NAME[aspect];
  if (!def) return null;
  const [a, b] = canonical(bodyA, bodyB);
  const ms = date.getTime();

  const lonA = getPlanetLongitude(a, date);
  const lonB = getPlanetLongitude(b, date);
  if (Number.isNaN(lonA) || Number.isNaN(lonB)) return null;

  const { r } = nearestTarget(def.angle, lonA - lonB);
  const orbDeg = Math.abs(r);

  const vA = velocity(a, ms);
  const vB = velocity(b, ms);
  const signedSpeed = vA - vB;
  const relativeAngularSpeed = Math.abs(signedSpeed);
  const orbDerivative = Math.sign(r) * signedSpeed;

  const direction: MotionDirection =
    orbDeg < EXACT_ORB_DEG ? "exact" : (orbDerivative < 0 ? "applying" : "separating");

  const w = opts.stationWindowDays ?? STATION_WINDOW_DAYS;
  const aStation = stationNearby(a, ms, w);
  const bStation = stationNearby(b, ms, w);

  return {
    bodyA: a, bodyB: b,
    aspect: def.name, aspectAngle: def.angle,
    at: date, atISO: date.toISOString(),
    orbDeg: Math.round(orbDeg * 1e6) / 1e6,
    direction,
    relativeAngularSpeed: Math.round(relativeAngularSpeed * 1e6) / 1e6,
    signedSpeed: Math.round(signedSpeed * 1e6) / 1e6,
    orbDerivative: Math.round(orbDerivative * 1e6) / 1e6,
    relativeMotion: signedSpeed < 0 ? "retrograde" : "direct",
    retroA: vA < 0,
    retroB: vB < 0,
    isStationNearby: aStation || bStation,
    stationBody: aStation ? a : (bStation ? b : null),
  };
}

// ─── Public: exact geçişler + üçlü-geçiş gruplaması ─────────────────────────────

/**
 * [start, end] aralığında bodyA–bodyB için verilen açının TÜM exact geçişlerini,
 * üçlü-geçiş epizotlarına gruplayıp passNumber/totalPassCount ile döner.
 *
 * Gruplama kuralı (astronomik): aynı hedefe ait ardışık geçişler, aralarında göreli
 * hız İŞARET DEĞİŞTİRDİYSE (retro dönüşü) aynı epizoda aittir → 1 veya 3 (nadiren 5).
 * İşaret aynıysa (monoton hareket) ayrı epizot.
 */
export function getAspectPasses(
  bodyA: AspectBody, bodyB: AspectBody, aspect: AspectName, start: Date, end: Date, opts: MotionOptions = {},
): AspectPass[] {
  const def = ASPECT_BY_NAME[aspect];
  if (!def || bodyA === bodyB) return [];
  const [a, b] = canonical(bodyA, bodyB);
  const w = opts.stationWindowDays ?? STATION_WINDOW_DAYS;

  const hits = findExactAspectsInWindow(
    a, b, start, end,
    opts.stepDays != null ? { aspects: [aspect], stepDays: opts.stepDays } : { aspects: [aspect] },
  );

  // Her exact için: hedef (üçlü-geçiş gruplaması hedef-bazlı), signedSpeed, istasyon.
  type Raw = {
    ms: number; target: number; signedSpeed: number; relSpeed: number;
    retroA: boolean; retroB: boolean; isStationNearby: boolean; stationBody: AspectBody | null;
    displayPrecision: DisplayPrecision; confidence: ExactConfidence;
    precisionPolicy: string; residualArcsec: number;
  };
  const raws: Raw[] = hits.map(h => {
    const ms = h.exactAt.getTime();
    const lonA = getPlanetLongitude(a, h.exactAt);
    const lonB = getPlanetLongitude(b, h.exactAt);
    const { target } = nearestTarget(def.angle, lonA - lonB);
    const vA = velocity(a, ms);
    const vB = velocity(b, ms);
    const aStation = stationNearby(a, ms, w);
    const bStation = stationNearby(b, ms, w);
    return {
      ms, target, signedSpeed: vA - vB, relSpeed: Math.abs(vA - vB),
      retroA: vA < 0, retroB: vB < 0,
      isStationNearby: aStation || bStation, stationBody: aStation ? a : (bStation ? b : null),
      displayPrecision: h.displayPrecision, confidence: h.confidence,
      precisionPolicy: h.precisionPolicy, residualArcsec: h.residualArcsec,
    };
  });

  // Hedefe göre ayır, zaman sırala, işaret-değişimi kuralıyla grupla.
  const byTarget = new Map<number, Raw[]>();
  for (const r of raws) {
    if (!byTarget.has(r.target)) byTarget.set(r.target, []);
    byTarget.get(r.target)!.push(r);
  }

  const out: AspectPass[] = [];
  for (const list of byTarget.values()) {
    list.sort((x, y) => x.ms - y.ms);
    // gruplara böl
    const groups: Raw[][] = [];
    let cur: Raw[] = [];
    for (const r of list) {
      if (cur.length === 0) { cur = [r]; continue; }
      const prev = cur[cur.length - 1]!;
      const gapDays = (r.ms - prev.ms) / DAY_MS;
      const reversal = Math.sign(r.signedSpeed) !== Math.sign(prev.signedSpeed);
      if (reversal && gapDays < MAX_EPISODE_GAP_DAYS) cur.push(r);
      else { groups.push(cur); cur = [r]; }
    }
    if (cur.length) groups.push(cur);

    for (const g of groups) {
      const total = g.length;
      g.forEach((r, idx) => {
        const at = new Date(r.ms);
        out.push({
          id:           `${BODY_SLUG[a]}-${BODY_SLUG[b]}-${def.slug}-${at.toISOString()}`,
          bodyA: a, bodyB: b,
          bodyASymbol: BODY_SYMBOL[a], bodyBSymbol: BODY_SYMBOL[b],
          aspect: def.name, aspectSymbol: def.symbol, aspectAngle: def.angle,
          exactAt: at, exactAtISO: at.toISOString(),
          passNumber: idx + 1, totalPassCount: total,
          displayPrecision: r.displayPrecision, confidence: r.confidence,
          precisionPolicy: r.precisionPolicy, residualArcsec: r.residualArcsec,
          signedSpeed: Math.round(r.signedSpeed * 1e6) / 1e6,
          relativeAngularSpeed: Math.round(r.relSpeed * 1e6) / 1e6,
          relativeMotion: r.signedSpeed < 0 ? "retrograde" : "direct",
          directionBefore: "applying",
          directionAfter: "separating",
          retroA: r.retroA, retroB: r.retroB,
          isStationNearby: r.isStationNearby, stationBody: r.stationBody,
        });
      });
    }
  }

  out.sort((x, y) => x.exactAt.getTime() - y.exactAt.getTime());
  return out;
}

/**
 * `date`a en yakın exact geçişi (pass) döner — UI'da o günkü açının exact saatini/precision'ını
 * ve üçlü-geçiş bağlamını göstermek için. Pencere, üçlü-geçişin doğru sayılabilmesi için
 * çifte göre seçilir (dış gezegen epizotları aylarca sürebilir). Bulunamazsa null.
 */
export function getNearestPass(
  bodyA: AspectBody, bodyB: AspectBody, aspect: AspectName, date: Date, opts: MotionOptions = {},
): AspectPass | null {
  const involvesMoon = bodyA === "Ay" || bodyB === "Ay";
  const involvesOuter = OUTER_BODIES.has(bodyA) || OUTER_BODIES.has(bodyB);
  const windowDays = opts.windowDays ?? (involvesMoon ? 10 : involvesOuter ? 240 : 120);
  const start = new Date(date.getTime() - windowDays * DAY_MS);
  const end = new Date(date.getTime() + windowDays * DAY_MS);
  const passes = getAspectPasses(bodyA, bodyB, aspect, start, end, opts);
  if (!passes.length) return null;
  const t = date.getTime();
  return passes.reduce((best, p) =>
    Math.abs(p.exactAt.getTime() - t) < Math.abs(best.exactAt.getTime() - t) ? p : best);
}
