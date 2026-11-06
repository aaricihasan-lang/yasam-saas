// Gökyüzü Atlası — PROFESYONEL EV SİSTEMLERİ: İKİNCİ, BAĞIMSIZ uygulama (SAF; yalnız doğrulama).
//
// engine.ts ile KOD PAYLAŞMAZ (yalnız `risingLongitude` — Lilly motorundaki kutup-yüksekliği formülü — ve n360 ortak):
//   • Campanus: kapalı formül (kutup yüksekliği + ekvator kaydırması), engine.ts'teki vektör kesişiminin yerine.
//   • Alcabitius: ASC ufuk ∩ ekliptik VEKTÖR kesişiminden, saat daireleri düzlem kesişiminden (engine.ts formüllerle yapar).
//   • Porphyry: ASC/MC'yi engine'den bağımsız vektörle bulur ve kadranı ara noktalarla böler.
//   • Regiomontanus: Lilly motorundaki `regiomontanusCuspsGeometric` (houses.ts'te zaten bağımsız ikinci uygulama).
// Testler (scripts/astrology/pro-houses.harness.ts) iki uygulamayı ve depo dışı pyswisseph referansını karşılaştırır.

import { n360, regiomontanusCuspsGeometric, risingLongitude } from "../../horary/western/houses";
import type { HouseFrameInput, ProHouseSystem } from "../../houses/engine";

const R = Math.PI / 180;
type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fromRaDec = (ra: number, dec: number): V3 => [Math.cos(dec * R) * Math.cos(ra * R), Math.cos(dec * R) * Math.sin(ra * R), Math.sin(dec * R)];

function eclLonOf(v: V3, e: number): number {
  return n360(Math.atan2(v[1] * Math.cos(e) + v[2] * Math.sin(e), v[0]) / R);
}
const eclVec = (lon: number, e: number): V3 => [Math.cos(lon * R), Math.sin(lon * R) * Math.cos(e), Math.sin(lon * R) * Math.sin(e)];

/** Vektörle ASC (ufuk ∩ ekliptik, doğu yarısı) ve MC (meridyen ∩ ekliptik, RAMC yarısı). */
export function anglesGeometric(f: HouseFrameInput): { asc: number; mc: number } {
  const e = f.obliquity * R;
  const nE: V3 = [0, -Math.sin(e), Math.cos(e)];
  const zen = fromRaDec(f.ramc, f.latitude);
  const east = fromRaDec(f.ramc + 90, 0);
  let a = cross(zen, nE);
  if (dot(a, east) < 0) a = [-a[0], -a[1], -a[2]];
  const meridianNormal = east; // meridyen düzlemi doğu noktasına diktir
  let m = cross(meridianNormal, nE);
  const ref = fromRaDec(f.ramc, 0);
  if (dot(m, ref) < 0) m = [-m[0], -m[1], -m[2]];
  return { asc: eclLonOf(a, e), mc: eclLonOf(m, e) };
}

function campanusClosed(f: HouseFrameInput): number[] {
  const { ramc, obliquity: eps, latitude: phi } = f;
  const out: number[] = new Array(12);
  const { asc, mc } = anglesGeometric(f);
  out[0] = asc;
  out[9] = mc;
  for (const [h, alt] of [[11, 60], [12, 30], [2, -30], [3, -60]] as const) {
    const a = Math.abs(alt) * R;
    const pole = Math.asin(Math.cos(a) * Math.sin(phi * R)) / R;
    const x = Math.atan(Math.tan(a) / Math.cos(phi * R)) / R;
    const offset = alt > 0 ? 90 - x : 90 + x;
    out[h - 1] = risingLongitude(ramc + offset - 90, pole, eps);
  }
  return out;
}

function alcabitiusGeometric(f: HouseFrameInput): number[] {
  const e = f.obliquity * R;
  const nE: V3 = [0, -Math.sin(e), Math.cos(e)];
  const { asc, mc } = anglesGeometric(f);
  const v = eclVec(asc, e);
  const dec = Math.asin(v[2]);
  const dsa = Math.acos(-Math.tan(f.latitude * R) * Math.tan(dec)) / R;
  const nsa = 180 - dsa;
  const onHour = (ra: number) => {
    const q = fromRaDec(ra, 0);
    let d = cross(cross([0, 0, 1], q), nE);
    if (dot(d, q) < 0) d = [-d[0], -d[1], -d[2]];
    return eclLonOf(d, e);
  };
  const out: number[] = new Array(12);
  out[0] = asc;
  out[9] = mc;
  out[10] = onHour(f.ramc + dsa / 3);
  out[11] = onHour(f.ramc + (2 * dsa) / 3);
  out[1] = onHour(f.ramc + dsa + nsa / 3);
  out[2] = onHour(f.ramc + dsa + (2 * nsa) / 3);
  return out;
}

function porphyryGeometric(f: HouseFrameInput): number[] {
  const { asc, mc } = anglesGeometric(f);
  const out: number[] = new Array(12);
  out[0] = asc;
  out[9] = mc;
  // Kadranı 3 eşit parçaya: MC→ASC yayı boyunca ilerle (saat yönünün tersi).
  let arc = asc - mc;
  while (arc < 0) arc += 360;
  while (arc >= 360) arc -= 360;
  out[10] = mc + arc / 3;
  out[11] = asc - arc / 3;
  const ic = mc + 180;
  let arc2 = ic - asc;
  while (arc2 < 0) arc2 += 360;
  while (arc2 >= 360) arc2 -= 360;
  out[1] = asc + arc2 / 3;
  out[2] = ic - arc2 / 3;
  return out;
}

/** İkinci uygulama — kutup kontrolü YOK (çağıran engine.ts ile aynı geçerlilik bölgesinde kullanır). */
export function crosscheckCusps(system: ProHouseSystem, f: HouseFrameInput): number[] {
  let c: number[];
  if (system === "regiomontanus") {
    const r = regiomontanusCuspsGeometric(f.ramc, f.latitude, f.obliquity);
    if (!Array.isArray(r)) throw new Error(r.detail);
    return r.map(n360);
  }
  if (system === "campanus") c = campanusClosed(f);
  else if (system === "alcabitius") c = alcabitiusGeometric(f);
  else c = porphyryGeometric(f);
  for (const h of [4, 5, 6, 7, 8, 9]) c[h - 1] = c[(h + 5) % 12] + 180;
  return c.map(n360);
}
