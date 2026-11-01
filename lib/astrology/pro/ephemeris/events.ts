// Gökyüzü Atlası — PROFESYONEL EFEMERİS: burç girişleri ve istasyonlar (SAF; yerel motor).
//
// Neden Lilly `timeline.ts` bulucuları doğrudan kullanılmıyor: (1) onlar astronomy-engine'in global ΔT'siyle (Espenak–Meeus) çalışır,
// efemeris ise kendi ΔT tablosunu kullanır (2026'da ~6 s, 2100'de ~107 s fark → olay anı aynı miktarda kayar); (2) sidereal zodyak ve
// ay düğümleri gerekir. Yöntem aynıdır (işaret değişimi taraması + ikiye bölme, ≤1 s) ve testte Lilly bulucularıyla çapraz sınanır.
//
// Tarama adımı her cismin bu adımda bir burcu ya da bir istasyonu iki kez geçemeyeceği şekilde seçilir: Ay 3 sa (≤ 2,1°), Merkür/Venüs/
// Güneş/Mars 12 sa, diğerleri 1 gün; istasyon: Merkür/Venüs 12 sa, diğerleri 1 gün; gerçek düğüm 6 sa (salınım). Ortalama düğüm
// her zaman geri gider (istasyonu yoktur).

import { eraOf, EVENT_UNCERTAINTY_FACTOR, ingressUncertaintySec, LOCAL_LIMITS } from "./accuracy";
import { lahiriTrueAyanamsa, localSpeed, n360, rawLon, wrap180 } from "./local";
import type { EphemerisBody, EphemerisEvent, EphemerisSource, Zodiac } from "./types";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

function bisect(f: (ms: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  for (let i = 0; i < 64 && hi - lo > 1000; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

const ingressStep = (b: EphemerisBody) => (b === "moon" ? 3 * HOUR : b === "true_node" ? 6 * HOUR : b === "mercury" || b === "venus" || b === "sun" || b === "mars" ? 12 * HOUR : DAY);
const stationStep = (b: EphemerisBody) => (b === "mercury" || b === "venus" ? 12 * HOUR : DAY);

export function zodiacLon(body: EphemerisBody, ms: number, zodiac: Zodiac): number {
  const p = rawLon(body, ms);
  return zodiac === "sidereal_lahiri" ? n360(p - lahiriTrueAyanamsa(ms)) : p;
}

/** [t0, t1) aralığındaki burç girişleri. */
export function findIngresses(body: EphemerisBody, t0: number, t1: number, zodiac: Zodiac = "tropical"): EphemerisEvent[] {
  const step = ingressStep(body);
  const out: EphemerisEvent[] = [];
  let pa = t0;
  let sa = Math.floor(zodiacLon(body, pa, zodiac) / 30);
  while (pa < t1) {
    const pz = Math.min(pa + step, t1);
    const sz = Math.floor(zodiacLon(body, pz, zodiac) / 30);
    if (sz !== sa) {
      const forward = (sz - sa + 12) % 12 === 1;
      const boundary = n360((forward ? sz : sa) * 30);
      const ms = bisect((m) => wrap180(zodiacLon(body, m, zodiac) - boundary), pa, pz);
      if (ms >= t0 && ms < t1) {
        const sp = localSpeed(body, ms);
        out.push({ kind: "ingress", body, ut: iso(ms), ms, fromSign: sa, toSign: sz, retrograde: sp < 0, uncertaintySec: ingressUncertaintySec(body, eraOf(new Date(ms).getUTCFullYear()), sp, "local") });
      }
    }
    pa = pz;
    sa = sz;
  }
  return out;
}

/** [t0, t1) aralığındaki istasyonlar (boylam hızının işaret değişimi). Güneş, Ay ve ortalama düğüm için boş. */
export function findStations(body: EphemerisBody, t0: number, t1: number, zodiac: Zodiac = "tropical"): EphemerisEvent[] {
  if (body === "sun" || body === "moon" || body === "mean_node" || body === "true_node") return [];
  const step = stationStep(body);
  const out: EphemerisEvent[] = [];
  let pa = t0;
  let fa = localSpeed(body, pa);
  while (pa < t1) {
    const pz = Math.min(pa + step, t1);
    const fz = localSpeed(body, pz);
    if (Math.sign(fa) !== Math.sign(fz)) {
      const ms = bisect((m) => localSpeed(body, m), pa, pz);
      if (ms >= t0 && ms < t1) {
        const acc = Math.abs(localSpeed(body, ms + DAY / 2) - localSpeed(body, ms - DAY / 2)); // °/gün²
        const spLim = LOCAL_LIMITS[eraOf(new Date(ms).getUTCFullYear())][body]?.speed ?? 2;
        const unc = acc < 1e-12 ? Infinity : EVENT_UNCERTAINTY_FACTOR * (spLim / 3600 / acc) * 86_400;
        out.push({ kind: "station", body, ut: iso(ms), ms, direction: fz < 0 ? "retrograde" : "direct", lon: zodiacLon(body, ms, zodiac), uncertaintySec: unc });
      }
    }
    pa = pz;
    fa = fz;
  }
  return out;
}

export function findEvents(bodies: readonly EphemerisBody[], t0: number, t1: number, zodiac: Zodiac, _source: EphemerisSource): EphemerisEvent[] {
  const all: EphemerisEvent[] = [];
  for (const b of bodies) {
    all.push(...findIngresses(b, t0, t1, zodiac));
    all.push(...findStations(b, t0, t1, zodiac));
  }
  return all.sort((a, b) => a.ms - b.ms);
}
