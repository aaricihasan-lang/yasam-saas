// Gökyüzü Atlası — AY EVRELERİ (yeniay · ilk dördün · dolunay · son dördün). SAF; sağlayıcı çağrısı YOK; ürüne bağlı DEĞİL.
//
// Tanım (bağımsız referansla aynı — JPL DE440 / skyfield almanac.moon_phases): Ay'ın ve Güneş'in yer merkezli GÖRÜNÜR (ışık zamanı +
// yıllık sapma) GERÇEK ekliptik boylamları farkı E = λ☾ − λ☉; evre anı E = 0° / 90° / 180° / 270° olduğu andır.
// Konum: astronomy-engine 2.1.19 (MIT) GeoVector(aberration=true) → Ecliptic (gerçek ekliptik/ekinoks) — #645 efemerisiyle aynı tanım.
// Zaman: ortak zaman katmanı (lib/astrology/pro/time). Arama ekseni UTC ms; konum zamanı ephemerisTime (TT kesin). astronomy-engine'in
// SearchMoonPhase'i KULLANILMAZ (yıllık sapmayı uygulamaz — ölçülmüş tuzak) ve global ΔT işlevi DEĞİŞTİRİLMEZ.
//
// Kök bulma: E(t) Ay'ın Güneş'e göre hızıyla her zaman ARTAR (≈ 10–15,5°/gün; asla geri gitmez) → 1 günlük ızgarada açılmış (unwrap) E
// bir hedefi en fazla bir kez geçer; kesişim ikiye bölme ile ≤ 50 ms'ye daraltılır. Birden fazla kök sorunu yoktur (monoton).
//
// Desteklenen aralık: 1920-01-01 – 2150-12-31 (ürün hedefi; bağımsız doğrulama bu aralıkta yapıldı). Dışı: açık hata.

import * as Astronomy from "astronomy-engine";
import { ephemerisTime, isTimeScalesError, scalesFromUtc, type TimeScales } from "../time";

export const LUNATIONS_ENGINE_VERSION = "pro-lunations-1" as const;
export const LUNATION_MIN_MS = Date.UTC(1920, 0, 1);
export const LUNATION_MAX_MS = Date.UTC(2151, 0, 1);
/** Tek istekte en fazla aralık (gün) — 2 yıl ≈ 99 evre. */
export const LUNATION_MAX_RANGE_DAYS = 3660;

export const PHASES = ["new_moon", "first_quarter", "full_moon", "last_quarter"] as const;
export type LunarPhase = (typeof PHASES)[number];

const DAY = 86_400_000;
/** Ortalama sinodik hız (°/gün) — yalnız kök aramasının BAŞLANGIÇ tahmini (sonuç bu sabite bağlı değil). */
const SYNODIC_DEG_PER_DAY = 360 / 29.530588853;
const n360 = (x: number) => ((x % 360) + 360) % 360;
const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

export type LunationError = { ok: false; code: "invalid_input" | "out_of_range" | "range_too_large"; error: string };

export type LunarPhaseEvent = {
  phase: LunarPhase;
  /** Olay anı UTC (ms) — 1961 öncesi UT kabul edilir (ortak katman `civil_as_ut`). */
  ms: number;
  /** Aynı anın TT karşılığı (ms ekseni; astronomik olay zamanı — ΔT modelinden bağımsız karşılaştırma için). */
  ttMs: number;
  /** Olay anında Ay'ın görünür tropikal boylamı (°). */
  moonLon: number;
  /** Zaman belirsizliği (s): konum hata sınırı / o andaki göreli hız (+ 2025 sonrası ΔT öngörüsü UT'de AYRICA belirsizdir). */
  uncertaintySec: number;
  deltaT: TimeScales["deltaTClass"];
};

function scalesOf(ms: number): TimeScales {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(s)) throw new RangeError(`lunations: ${s.error}`);
  return s;
}

/** Görünür, gerçek ekliptik boylam (°) — #645 efemerisiyle aynı tanım. */
export function apparentLon(body: Astronomy.Body, ms: number): number {
  return n360(Astronomy.Ecliptic(Astronomy.GeoVector(body, ephemerisTime(scalesOf(ms)), true)).elon);
}

/** Ay − Güneş elongasyonu (°, [0, 360)). */
export function elongation(ms: number): number {
  return n360(apparentLon(Astronomy.Body.Moon, ms) - apparentLon(Astronomy.Body.Sun, ms));
}

/**
 * Konum hata üst sınırları (yay saniyesi) — #646 ölçümü (3.000 rastgele an, 1900–2100, DE440): Ay 9″, Güneş 4″. 2101 sonrası Ay için
 * ölçüm YOK → temkinli 150″ (#646 ile aynı kural). Testin toleransları bu sınırlardan ÖNCEDEN türetildi (bkz. harness başlığı).
 */
export function positionErrorArcsec(ms: number): { moon: number; sun: number } {
  return { moon: new Date(ms).getUTCFullYear() > 2100 ? 150 : 9, sun: 4 };
}

function relSpeedDegPerDay(ms: number): number {
  return wrap180(elongation(ms + 3_600_000) - elongation(ms - 3_600_000)) * 12;
}

function validateRange(t0: number, t1: number): LunationError | null {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return { ok: false, code: "invalid_input", error: "Geçersiz tarih aralığı." };
  if (t0 < LUNATION_MIN_MS || t1 > LUNATION_MAX_MS) return { ok: false, code: "out_of_range", error: "Desteklenen aralık 1920–2150." };
  if ((t1 - t0) / DAY > LUNATION_MAX_RANGE_DAYS) return { ok: false, code: "range_too_large", error: `En fazla ${LUNATION_MAX_RANGE_DAYS} gün.` };
  return null;
}

/** [t0, t1) aralığındaki evreler, kronolojik. `phases` verilmezse dördü. */
export function findLunarPhases(t0: number, t1: number, phases: readonly LunarPhase[] = PHASES): { ok: true; events: LunarPhaseEvent[] } | LunationError {
  const bad = validateRange(t0, t1);
  if (bad) return bad;
  if (!phases.length || phases.some((p) => !(PHASES as readonly string[]).includes(p))) return { ok: false, code: "invalid_input", error: "Geçersiz evre." };
  const want = new Set(phases);
  const events: LunarPhaseEvent[] = [];
  // Sıradaki hedef (90°'nin katı) için ortalama sinodik hızla başlangıç tahmini → ±2 gün aralık (gerçek göreli hız 10–15,5°/gün →
  // aralık uçlarında fark ±20°'den büyük, ±180°'den küçük: işaret kesin) → aralık korumalı regula falsi (Illinois) ≤ 50 ms.
  // E monoton arttığı için her hedefin TEK kökü vardır; ardışık hedefler 90° (≈ 6–9 gün) arayla gelir → kök kaçırılmaz.
  let tPrev = t0;
  let ePrev = elongation(t0);
  let k = Math.floor(ePrev / 90) + 1;
  for (let guard = 0; guard < 10_000; guard++) {
    const targetUnwrapped = k * 90;
    const target = targetUnwrapped % 360;
    const guess = tPrev + ((targetUnwrapped - ePrev) / SYNODIC_DEG_PER_DAY) * DAY;
    const f = (ms: number) => wrap180(elongation(ms) - target);
    let lo = guess - 2 * DAY;
    let hi = guess + 2 * DAY;
    let flo = f(lo);
    let fhi = f(hi);
    if (!(flo < 0 && fhi > 0)) throw new Error(`lunations: kök aralığı kurulamadı (${new Date(guess).toISOString()})`);
    let side = 0;
    let root = guess;
    for (let i = 0; i < 80; i++) {
      root = hi - (fhi * (hi - lo)) / (fhi - flo);
      if (!(root > lo && root < hi)) root = (lo + hi) / 2;
      const fr = f(root);
      // 1e-8° ≈ 0,7 ms (göreli hız ≥ 10°/gün) — kök 50 ms hedefinin çok altında; aralık 50 ms'ye inerse de durur.
      if (Math.abs(fr) < 1e-8 || hi - lo < 50) break;
      if (fr < 0) {
        lo = root;
        flo = fr;
        if (side === -1) fhi /= 2;
        side = -1;
      } else {
        hi = root;
        fhi = fr;
        if (side === 1) flo /= 2;
        side = 1;
      }
    }
    const ms = Math.round(root);
    tPrev = ms;
    ePrev = targetUnwrapped;
    k++;
    if (ms >= t1) break;
    const phase = PHASES[target / 90];
    {
      if (ms < t0 || !want.has(phase)) continue;
      const s = scalesOf(ms);
      const err = positionErrorArcsec(ms);
      const rel = Math.max(1e-6, relSpeedDegPerDay(ms));
      events.push({
        phase,
        ms,
        ttMs: s.ttMs,
        moonLon: apparentLon(Astronomy.Body.Moon, ms),
        uncertaintySec: Math.ceil(((err.moon + err.sun) / 3600 / rel) * 86400),
        deltaT: s.deltaTClass,
      });
    }
  }
  events.sort((x, y) => x.ms - y.ms);
  return { ok: true, events };
}
