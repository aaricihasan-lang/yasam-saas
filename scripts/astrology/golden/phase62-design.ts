/**
 * ASTROLOJİ AŞAMA 6.2 — golden TASARIM aracı (gerçek çağrı YAPMAZ; yalnız yerel astronomi).
 *
 * Amaç: Roxy düğüm (Rahu/Ketu) ajan kuralındaki kalan belirsizlikleri AYIRT EDEBİLEN sentetik doğum + an aramak.
 * Konumlar astronomy-engine (tropikal) − yaklaşık KP-Newcomb ayanamsa (1990 golden değeri + Newcomb presesyonu),
 * ortalama düğüm (Meeus), Placidus (yarı-yay) — tasarım için ±0.02°; adaylar sınırlardan ≥ 0.75° uzak seçilir.
 * Hipotez ızgarası: kavuşma {burç, orb≤10°} × karşıt {7. burç, orb≤10°, yok} × Jüpiter 5/9 {var, yok} × Satürn 3/10 {var, yok}.
 * Bir aday, her soru için yalnız o boyutta farklı iki hipotezin FARKLI tahmin vermesiyle (ayırt edicilik) puanlanır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase62-design.ts
 */
import * as Astronomy from "astronomy-engine";
import { NAKSHATRA_LORDS, type VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_LORDS } from "@/lib/astrology/model/kp";
import { SIGN_IDS } from "@/lib/astrology/model/western";

const D2R = Math.PI / 180;
export const n360 = (x: number) => ((x % 360) + 360) % 360;
const NAK = 360 / 27;
const BODY: Partial<Record<VedicGrahaId, Astronomy.Body>> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mars: Astronomy.Body.Mars, mercury: Astronomy.Body.Mercury, jupiter: Astronomy.Body.Jupiter, venus: Astronomy.Body.Venus, saturn: Astronomy.Body.Saturn };
export const GRAHAS: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];
const VISIBLE: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

/** Yaklaşık KP-Newcomb ayanamsa: 1990-07-15 golden değeri 23.632° + 50.2564″/yıl. */
export function kpAyanamsaApprox(ms: number): number {
  const ref = Date.parse("1990-07-15T11:30:00Z");
  return 23.6319 + ((ms - ref) / (365.2425 * 86400000)) * (50.2564 / 3600);
}
export function placidusTropical(tm: Astronomy.AstroTime, lat: number, lonE: number): number[] {
  const ramc = n360(Astronomy.SiderealTime(tm) * 15 + lonE);
  const eps = Astronomy.e_tilt(tm).tobl * D2R;
  const phi = lat * D2R;
  const R = ramc * D2R;
  const mc = n360(Math.atan2(Math.sin(R), Math.cos(R) * Math.cos(eps)) / D2R);
  const asc = n360(Math.atan2(Math.cos(R), -(Math.sin(R) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / D2R);
  const raToLon = (ra: number) => n360(Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps)) / D2R);
  const cusp = (f: number, above: boolean) => {
    let lam = raToLon(above ? ramc + 90 * f : ramc + 180 - 90 * f);
    for (let i = 0; i < 60; i++) {
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam * D2R));
      const ad = Math.asin(Math.max(-1, Math.min(1, Math.tan(phi) * Math.tan(dec)))) / D2R;
      lam = raToLon(above ? ramc + f * (90 + ad) : ramc + 180 - f * (90 - ad));
    }
    return lam;
  };
  const c11 = cusp(1 / 3, true), c12 = cusp(2 / 3, true), c2 = cusp(2 / 3, false), c3 = cusp(1 / 3, false);
  const c = [asc, c2, c3, n360(mc + 180), 0, 0, 0, 0, 0, mc, c11, c12];
  for (const h of [4, 5, 6, 7, 8]) c[h] = n360(c[h - 6 < 0 ? h + 6 : h - 6] + 180);
  c[4] = n360(c11 + 180);
  c[5] = n360(c12 + 180);
  c[6] = n360(asc + 180);
  c[7] = n360(c2 + 180);
  c[8] = n360(c3 + 180);
  return c;
}
export type Chart = { lon: Record<VedicGrahaId, number>; cusps: number[]; ay: number };
export function chartAt(utcMs: number, lat: number, lonE: number): Chart {
  const tm = Astronomy.MakeTime(new Date(utcMs));
  const ay = kpAyanamsaApprox(utcMs);
  const T = tm.tt / 36525;
  const node = n360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);
  const lon = {} as Record<VedicGrahaId, number>;
  for (const g of VISIBLE) lon[g] = n360(Astronomy.Ecliptic(Astronomy.GeoVector(BODY[g]!, tm, true)).elon - ay);
  lon.rahu = n360(node - ay);
  lon.ketu = n360(node + 180 - ay);
  return { lon, cusps: placidusTropical(tm, lat, lonE).map((x) => n360(x - ay)), ay };
}
export const signOf = (l: number) => Math.floor(n360(l) / 30);
export const starOf = (l: number): VedicGrahaId => NAKSHATRA_LORDS[Math.floor(n360(l) / NAK) % 9];
export function houseOf(l: number, cusps: number[]): number {
  for (let h = 0; h < 12; h++) {
    const a = cusps[h], b = cusps[(h + 1) % 12];
    if (n360(l - a) < n360(b - a)) return h + 1;
  }
  return 12;
}
export type Levels = Record<1 | 2 | 3 | 4, number[]>;
export function model(c: Chart) {
  const house = (g: VedicGrahaId) => houseOf(c.lon[g], c.cusps);
  const owner = (h: number) => SIGN_LORDS[SIGN_IDS[signOf(c.cusps[h - 1])]];
  const owned = (g: VedicGrahaId) => (g === "rahu" || g === "ketu" ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => owner(h) === g));
  const plain = (g: VedicGrahaId): Levels => ({ 1: [house(starOf(c.lon[g]))], 2: [house(g)], 3: owned(starOf(c.lon[g])), 4: owned(g) });
  return { house, owner, owned, plain };
}
export type Hyp = { conj: "sign" | "orb"; opp: "sign" | "orb" | "none"; jup: boolean; sat: boolean; orb?: number };
const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** Hipoteze göre düğümün ajanları (burç lordu her zaman). */
export function agents(c: Chart, node: "rahu" | "ketu", h: Hyp): VedicGrahaId[] {
  const orb = h.orb ?? 10;
  const n = c.lon[node];
  const out = new Set<VedicGrahaId>([SIGN_LORDS[SIGN_IDS[signOf(n)]]]);
  for (const g of VISIBLE) {
    const d = (signOf(c.lon[g]) - signOf(n) + 12) % 12;
    if (h.conj === "sign" ? d === 0 : sep(c.lon[g], n) <= orb) out.add(g);
    if (h.opp === "sign" ? d === 6 : h.opp === "orb" ? sep(c.lon[g], n + 180) <= orb : false) out.add(g);
    const fromG = (signOf(n) - signOf(c.lon[g]) + 12) % 12; // düğüm, grahadan kaçıncı burç (0 = aynı)
    if (h.jup && g === "jupiter" && (fromG === 4 || fromG === 8)) out.add(g);
    if (h.sat && g === "saturn" && (fromG === 2 || fromG === 9)) out.add(g);
  }
  return [...out];
}
export function agentLevels(c: Chart, node: "rahu" | "ketu", h: Hyp): Levels {
  const m = model(c);
  const all = [node, ...agents(c, node, h)];
  const lv = (l: 1 | 2 | 3 | 4) => [...new Set(all.flatMap((g) => m.plain(g)[l]))].sort((a, b) => a - b);
  return { 1: lv(1), 2: lv(2), 3: lv(3), 4: lv(4) };
}
export const HYPS: Hyp[] = [];
for (const conj of ["sign", "orb"] as const) for (const opp of ["sign", "orb", "none"] as const) for (const jup of [true, false]) for (const sat of [true, false]) HYPS.push({ conj, opp, jup, sat });
const key = (c: Chart, h: Hyp) => JSON.stringify([agentLevels(c, "rahu", h), agentLevels(c, "ketu", h)]);
/** Her soru boyutu için: yalnız o boyutta farklı hipotez çiftlerinin tamamı farklı tahmin veriyor mu. */
export function identifiable(c: Chart): { conj: boolean; opp: boolean; jup: boolean; sat: boolean; distinct: number } {
  const res = { conj: false, opp: false, jup: false, sat: false };
  const dims: (keyof Hyp)[] = ["conj", "opp", "jup", "sat"];
  for (const d of dims) {
    let ok = true;
    for (const a of HYPS) for (const b of HYPS) {
      const diffOnly = dims.every((x) => (x === d ? a[x] !== b[x] : a[x] === b[x]));
      if (diffOnly && key(c, a) === key(c, b)) ok = false;
    }
    res[d as keyof typeof res] = ok;
  }
  const distinct = new Set(HYPS.map((h) => key(c, h))).size;
  return { ...res, distinct };
}
/** Sınır güvenliği: graha boylamları burç / nakshatra sınırlarından ve cusp'lardan uzak mı. */
export function margin(c: Chart): number {
  let m = 99;
  for (const g of GRAHAS) {
    const l = c.lon[g];
    m = Math.min(m, l % 30, 30 - (l % 30), l % NAK, NAK - (l % NAK));
    for (const cu of c.cusps) m = Math.min(m, sep(l, cu));
  }
  for (const cu of c.cusps) m = Math.min(m, cu % 30, 30 - (cu % 30));
  return m;
}

const LAT = 41.0082, LON = 28.9784; // İstanbul (sentetik kişiler: yer yalnız ev hesabı için)

/**
 * Bölünmüş arama (Aşama 6.2'de kullanılan): aynı haritada A + B + Jüpiter + Satürn bulunamadığı (1955–2015) için
 *   X1 = Jüpiter 5/9 bakışı + A tipi (düğüm burcunda, düğümden 18–28° uzak hızlı graha)
 *   X2 = Satürn 3/10 bakışı + B tipi (komşu burçta, düğüme 0.8–3° hızlı graha)
 * Hızlı graha = Güneş / Ay / Merkür / Venüs / Mars, düğüm burç lordları hariç. Kavuşma + karşıt her iki haritada da ayırt edilebilir olmalı.
 */
function searchSplit() {
  const x1: string[] = [], x2: string[] = [];
  for (let day = Date.parse("1955-01-01T09:00:00Z"); day < Date.parse("2015-12-31T00:00:00Z"); day += 86400000) {
    const c0 = chartAt(day, LAT, LON);
    const R = signOf(c0.lon.rahu), K = signOf(c0.lon.ketu);
    const J = signOf(c0.lon.jupiter), S = signOf(c0.lon.saturn);
    const lords = [SIGN_LORDS[SIGN_IDS[R]], SIGN_LORDS[SIGN_IDS[K]]];
    const jClean = [R, K].some((n) => (n - J + 12) % 12 === 4 || (n - J + 12) % 12 === 8) && !lords.includes("jupiter") && ![R, K].includes(J);
    const sClean = [R, K].some((n) => (n - S + 12) % 12 === 2 || (n - S + 12) % 12 === 9) && !lords.includes("saturn") && ![R, K].includes(S);
    if (!jClean && !sClean) continue;
    for (let mins = 0; mins < 1440; mins += 30) {
      const ms = day - 9 * 3600000 + mins * 60000;
      const c = chartAt(ms, LAT, LON);
      const fast = (["sun", "moon", "mars", "mercury", "venus"] as VedicGrahaId[]).filter((g) => !lords.includes(g));
      let A: string | null = null, B: string | null = null;
      for (const node of ["rahu", "ketu"] as const) {
        for (const g of fast) {
          const d = sep(c.lon[g], c.lon[node]);
          if (signOf(c.lon[g]) === signOf(c.lon[node]) && d >= 18 && d <= 28) A = `${g}~${node} ${d.toFixed(1)}°`;
          if (signOf(c.lon[g]) !== signOf(c.lon[node]) && d <= 3 && d >= 0.8) B = `${g}~${node} ${d.toFixed(1)}°`;
        }
      }
      if (!(jClean && A) && !(sClean && B)) continue;
      const id = identifiable(c);
      const m = margin(c);
      if (m < 0.75 || !id.conj || !id.opp) continue;
      const tag = `UTC ${new Date(ms).toISOString().slice(0, 16)} m=${m.toFixed(2)}`;
      if (jClean && A && id.jup) x1.push(`${tag} A=${A}`);
      if (sClean && B && id.sat) x2.push(`${tag} B=${B}`);
    }
  }
  const bym = (a: string, b: string) => Number(b.split("m=")[1].split(" ")[0]) - Number(a.split("m=")[1].split(" ")[0]);
  return { x1: x1.sort(bym), x2: x2.sort(bym) };
}

if (require.main === module) {
  const { x1, x2 } = searchSplit();
  console.log(`X1 aday ${x1.length}`, x1.slice(0, 6));
  console.log(`X2 aday ${x2.length}`, x2.slice(0, 6));
}
