// Gökyüzü Atlası — DE440 kaynağı: geosantrik GÖRÜNÜR konum (SAF sunucu kodu; ağ YOK).
//
// Tanım (bağımsız referanslarla aynı; skyfield `observe().apparent()` ve JPL Horizons "apparent"):
//   1. Barisentrik durumlar JPL DE440'tan (TDB). Gezegenler: sistem barisentri (1–9; Swiss Ephemeris ve Horizons varsayılanı gibi);
//      Ay: 301, Yer: 399, Güneş: 10.
//   2. Işık zamanı yinelemesi (Yer'in TDB anındaki konumundan).
//   3. Kütleçekimsel ışık bükülmesi: Güneş, Jüpiter, Satürn (IERS Conventions 2010 Bl. 7 / Kaplan vd. USNO Circ. 179 bağıntısı).
//   4. Yıllık sapma: göreli (Lorentz) formül, Yer'in barisentrik hızıyla.
//   5. GCRS → gerçek ekliptik ve ekinoks (IAU 2006 presesyon + IAU 2000A_R06 nütasyon; ./frames.ts).
// Zaman: girdi TT (Jülyen günü). TDB − TT ≤ 1,7 ms (Fairhead–Bretagnon iki terim) eklenir.

import { frameOfDate, mv } from "./frames";
import type { SpkFile } from "./spk";

const AU = 149_597_870.7; // km
const C = 299_792.458; // km/s
const DAY = 86_400;
const GM_SUN = 1.32712440017987e20; // m³/s² (DE440 GM☉; deflection katsayısı için)
const AU_M = 149_597_870_700;
const C_M = 299_792_458;
/** Bükülme yapan cisimler ve kütle oranı (Güneş / cisim). */
const DEFLECTORS: readonly [number, number][] = [[10, 1], [5, 1047.3486], [6, 3497.898]];

export type De440Body = "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto";
const CODE: Readonly<Record<De440Body, number>> = { sun: 10, moon: 301, mercury: 1, venus: 2, mars: 4, jupiter: 5, saturn: 6, uranus: 7, neptune: 8, pluto: 9 };

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));

/** TT Jülyen günü → TDB saniye (J2000'den). */
export function tdbSecondsFromTtJd(ttJd: number): number {
  const g = ((357.53 + 0.98560028 * (ttJd - 2451545.0)) * Math.PI) / 180;
  return (ttJd - 2451545.0) * DAY + 0.001657 * Math.sin(g) + 0.000014 * Math.sin(2 * g);
}

function bary(spk: SpkFile, code: number, et: number): { p: V3; v: V3 } {
  if (code === 399 || code === 301) {
    const e = spk.state(0, 3, et);
    const m = spk.state(3, code, et);
    return { p: add(e.p, m.p), v: add(e.v, m.v) };
  }
  return spk.state(0, code, et);
}

/** GCRS'te görünür birim-yön vektörü (au ölçeğinde) + ışık zamanı. */
function apparentGcrs(spk: SpkFile, code: number, et: number): { app: V3; distKm: number } {
  const E = bary(spk, 399, et);
  let lt = 0;
  let P: V3 = bary(spk, code, et).p;
  for (let i = 0; i < 10; i++) {
    const nlt = len(sub(P, E.p)) / C;
    const done = Math.abs(nlt - lt) < 1e-12;
    lt = nlt;
    P = bary(spk, code, et - lt).p;
    if (done) break;
  }
  const pos = sub(P, E.p);
  let t = mul(pos, 1 / AU);
  const obs = mul(E.p, 1 / AU);
  const cAuDay = (C * DAY) / AU;
  const tlt = len(t) / cAuDay; // gün
  for (const [d, rmass] of DEFLECTORS) {
    let b = mul(bary(spk, d, et).p, 1 / AU);
    const dlt = dot(mul(t, 1 / len(t)), sub(b, obs)) / cAuDay;
    const tclose = Math.min(Math.max(dlt, 0), tlt);
    b = mul(bary(spk, d, et - tclose * DAY).p, 1 / AU);
    const pe = sub(obs, b);
    const pq = add(t, pe);
    const pmag = len(t);
    const qmag = len(pq);
    const emag = len(pe);
    const ph = mul(t, 1 / pmag);
    const qh = mul(pq, 1 / qmag);
    const eh = mul(pe, 1 / emag);
    const pdotq = dot(ph, qh);
    const qdote = dot(qh, eh);
    const edotp = dot(eh, ph);
    if (Math.abs(edotp) > 0.99999999999) continue;
    const fac1 = (2 * GM_SUN) / (C_M * C_M * emag * AU_M * rmass);
    const fac2 = 1 + qdote;
    t = add(t, mul(sub(mul(eh, pdotq), mul(qh, edotp)), (fac1 / fac2) * pmag));
  }
  // Göreli yıllık sapma.
  const vel = mul(E.v, DAY / AU); // au/gün
  const ltd = lt / DAY;
  const p1 = ltd * cAuDay;
  const ve = len(vel);
  const beta = ve / cAuDay;
  const cosd = dot(t, vel) / (p1 * ve);
  const gi = Math.sqrt(1 - beta * beta);
  const p = beta * cosd;
  const q = (1 + p / (1 + gi)) * ltd;
  const r = 1 + p;
  return { app: mul(add(mul(t, gi), mul(vel, q)), 1 / r), distKm: len(pos) };
}

const R2D = 180 / Math.PI;
const n360 = (x: number) => ((x % 360) + 360) % 360;

export type ApparentPosition = { lon: number; lat: number; ra: number; dec: number; distKm: number };

/** Görünür geosantrik konum: gerçek ekliptik (λ, β) ve gerçek ekvator (α, δ), tarih; derece. */
export function apparentPosition(spk: SpkFile, body: De440Body, ttJd: number): ApparentPosition {
  const et = tdbSecondsFromTtJd(ttJd);
  const { app, distKm } = apparentGcrs(spk, CODE[body], et);
  const f = frameOfDate((ttJd - 2451545.0) / 36525);
  const e = mv(f.toTrueEcliptic, app);
  const q = mv(f.toTrueEquator, app);
  const re = len(e);
  const rq = len(q);
  return { lon: n360(Math.atan2(e[1], e[0]) * R2D), lat: Math.asin(e[2] / re) * R2D, ra: n360(Math.atan2(q[1], q[0]) * R2D), dec: Math.asin(q[2] / rq) * R2D, distKm };
}

/** Ay'ın yer merkezli GEOMETRİK durum vektörü (ışık zamanı/sapma yok), gerçek ekliptik ve ekinoks (tarih); km, km/gün.
 *  Gerçek (oskülasyon) düğüm için — yerel motorun eski tanımıyla aynı (konum ve hız aynı dönüşümle döndürülür). */
export function moonGeometricEclipticState(spk: SpkFile, ttJd: number): { r: V3; v: V3 } {
  const et = tdbSecondsFromTtJd(ttJd);
  const m = spk.state(3, 301, et);
  const e = spk.state(3, 399, et);
  const f = frameOfDate((ttJd - 2451545.0) / 36525);
  return { r: mv(f.toTrueEcliptic, sub(m.p, e.p)), v: mv(f.toTrueEcliptic, mul(sub(m.v, e.v), DAY)) };
}

/** Astrometrik (yalnız ışık zamanı; bükülme/sapma YOK) ICRF α, δ — bağımsız JPL Horizons "astrometric RA/DEC" sağlaması için. */
export function astrometricRaDec(spk: SpkFile, body: De440Body, ttJd: number): { ra: number; dec: number } {
  const et = tdbSecondsFromTtJd(ttJd);
  const E = bary(spk, 399, et);
  let lt = 0;
  let P: V3 = bary(spk, CODE[body], et).p;
  for (let i = 0; i < 10; i++) {
    const nlt = len(sub(P, E.p)) / C;
    const done = Math.abs(nlt - lt) < 1e-12;
    lt = nlt;
    P = bary(spk, CODE[body], et - lt).p;
    if (done) break;
  }
  const v = sub(P, E.p);
  return { ra: n360(Math.atan2(v[1], v[0]) * R2D), dec: Math.asin(v[2] / len(v)) * R2D };
}
