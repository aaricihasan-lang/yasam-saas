// Gökyüzü Atlası — DE440 kaynağı: IAU 2006 presesyon (P03, Fukushima–Williams açıları, çerçeve sapması dahil) + IAU 2000A nütasyon
// (IAU 2006 düzeltmeli, "IAU 2000A_R06") → GCRS'den GERÇEK ekliptik ve ekinoks (tarih) dönüşümü. SAF; bağımlılık YOK.
//
// Algoritmalar ERFA'nın (BSD-3-Clause; SOFA türevi) eraNut00a / eraNut06a / eraPfw06 / eraObl06 / eraFw2m işlevlerinin TypeScript
// aktarımıdır; katsayılar ./nutationData.ts (ERFA nut00a.c'den birebir), lisans ./LICENSE-ERFA.txt. Bu dosya SOFA/ERFA değildir.
// Tanım (IERS Conventions 2010, Bölüm 5): GCRS → gerçek ekvator = R1(−ε_A−Δε)·R3(−ψ̄−Δψ)·R1(φ̄)·R3(γ̄); gerçek ekliptik için sola
// R1(ε_A+Δε) çarpılır → R3(−ψ̄−Δψ)·R1(φ̄)·R3(γ̄). Zaman argümanı TT (Jülyen yüzyılı, J2000'den).

import { XLS, XPL } from "./nutationData";

const DAS2R = Math.PI / 180 / 3600;
const TURNAS = 1_296_000;
const D2PI = 2 * Math.PI;
const U2R = DAS2R / 1e7;
const fmod = (a: number, b: number) => a % b;

type Mat = [[number, number, number], [number, number, number], [number, number, number]];

/** IAU 2000A nütasyon (Δψ, Δε; radyan) — eraNut00a aktarımı. t: TT Jülyen yüzyılı. */
export function nutation2000A(t: number): { dpsi: number; deps: number } {
  // Luni-solar (Delaunay) argümanlar: IERS 2003 / MHB2000 (ERFA'daki gibi karışık).
  const el = fmod(485868.249036 + t * (1717915923.2178 + t * (31.8792 + t * (0.051635 + t * -0.0002447))), TURNAS) * DAS2R;
  const elp = fmod(1287104.79305 + t * (129596581.0481 + t * (-0.5532 + t * (0.000136 + t * -0.00001149))), TURNAS) * DAS2R;
  const f = fmod(335779.526232 + t * (1739527262.8478 + t * (-12.7512 + t * (-0.001037 + t * 0.00000417))), TURNAS) * DAS2R;
  const d = fmod(1072260.70369 + t * (1602961601.209 + t * (-6.3706 + t * (0.006593 + t * -0.00003169))), TURNAS) * DAS2R;
  const om = fmod(450160.398036 + t * (-6962890.5431 + t * (7.4722 + t * (0.007702 + t * -0.00005939))), TURNAS) * DAS2R;
  let dp = 0;
  let de = 0;
  for (let i = XLS.length / 11 - 1; i >= 0; i--) {
    const o = i * 11;
    const arg = fmod(XLS[o] * el + XLS[o + 1] * elp + XLS[o + 2] * f + XLS[o + 3] * d + XLS[o + 4] * om, D2PI);
    const s = Math.sin(arg);
    const c = Math.cos(arg);
    dp += (XLS[o + 5] + XLS[o + 6] * t) * s + XLS[o + 7] * c;
    de += (XLS[o + 8] + XLS[o + 9] * t) * c + XLS[o + 10] * s;
  }
  const dpsils = dp * U2R;
  const depsls = de * U2R;

  // Gezegen nütasyonu (MHB2000 Delaunay argümanları + IERS 2003 gezegen boylamları).
  const al = fmod(2.35555598 + 8328.6914269554 * t, D2PI);
  const af = fmod(1.627905234 + 8433.466158131 * t, D2PI);
  const ad = fmod(5.198466741 + 7771.3771468121 * t, D2PI);
  const aom = fmod(2.1824392 - 33.757045 * t, D2PI);
  const apa = (0.02438175 + 0.00000538691 * t) * t;
  const alme = fmod(4.402608842 + 2608.7903141574 * t, D2PI);
  const alve = fmod(3.176146697 + 1021.3285546211 * t, D2PI);
  const alea = fmod(1.753470314 + 628.3075849991 * t, D2PI);
  const alma = fmod(6.203480913 + 334.06124267 * t, D2PI);
  const alju = fmod(0.599546497 + 52.9690962641 * t, D2PI);
  const alsa = fmod(0.874016757 + 21.329910496 * t, D2PI);
  const alur = fmod(5.481293872 + 7.4781598567 * t, D2PI);
  const alne = fmod(5.321159 + 3.8127774 * t, D2PI);
  dp = 0;
  de = 0;
  for (let i = XPL.length / 17 - 1; i >= 0; i--) {
    const o = i * 17;
    const arg = fmod(
      XPL[o] * al + XPL[o + 1] * af + XPL[o + 2] * ad + XPL[o + 3] * aom + XPL[o + 4] * alme + XPL[o + 5] * alve + XPL[o + 6] * alea + XPL[o + 7] * alma +
        XPL[o + 8] * alju + XPL[o + 9] * alsa + XPL[o + 10] * alur + XPL[o + 11] * alne + XPL[o + 12] * apa,
      D2PI,
    );
    const s = Math.sin(arg);
    const c = Math.cos(arg);
    dp += XPL[o + 13] * s + XPL[o + 14] * c;
    de += XPL[o + 15] * s + XPL[o + 16] * c;
  }
  return { dpsi: dpsils + dp * U2R, deps: depsls + de * U2R };
}

/** IAU 2006 düzeltmeli IAU 2000A nütasyon (eraNut06a). */
export function nutation2006A(t: number): { dpsi: number; deps: number } {
  const fj2 = -2.7774e-6 * t;
  const { dpsi, deps } = nutation2000A(t);
  return { dpsi: dpsi + dpsi * (0.4697e-6 + fj2), deps: deps + deps * fj2 };
}

// ─── Hızlı nütasyon: 8 günlük bloklarda Chebyshev ara değeri ────────────────────────────────────────────
// Tarama yüzlerce/binlerce ardışık an ister; 1.365 terimlik seri her çağrıda ~70 µs. Seri, 8 günlük her blokta 16 Chebyshev düğümünde
// TAM hesaplanır (yukarıdaki nutation2006A) ve blok içinde Chebyshev polinomuyla değerlendirilir. En kısa önemli dönem ≈ 4,7 gün olduğundan
// 15. derece ara değer hatası < 1 µas (harness ölçer). Önbellek süreç içi, sınırlı (en çok 4.096 blok).
const NUT_BLOCK_DAYS = 8;
const NUT_NODES = 16;
const NUT_CACHE_MAX = 4096;
const nutCache = new Map<number, Float64Array>();
const chebNodes = Array.from({ length: NUT_NODES }, (_, k) => Math.cos((Math.PI * (k + 0.5)) / NUT_NODES));

function nutBlock(idx: number): Float64Array {
  const hit = nutCache.get(idx);
  if (hit) return hit;
  const mid = (idx + 0.5) * NUT_BLOCK_DAYS;
  const half = NUT_BLOCK_DAYS / 2;
  const fp = new Float64Array(NUT_NODES);
  const fe = new Float64Array(NUT_NODES);
  for (let k = 0; k < NUT_NODES; k++) {
    const n = nutation2006A((mid + half * chebNodes[k]) / 36525);
    fp[k] = n.dpsi;
    fe[k] = n.deps;
  }
  // c_j = (2/N) Σ f(x_k) T_j(x_k); c_0 yarıya bölünür.
  const c = new Float64Array(2 * NUT_NODES);
  for (let j = 0; j < NUT_NODES; j++) {
    let sp = 0;
    let se = 0;
    for (let k = 0; k < NUT_NODES; k++) {
      const tj = Math.cos((Math.PI * j * (k + 0.5)) / NUT_NODES);
      sp += fp[k] * tj;
      se += fe[k] * tj;
    }
    const f = (j === 0 ? 1 : 2) / NUT_NODES;
    c[j] = sp * f;
    c[NUT_NODES + j] = se * f;
  }
  if (nutCache.size >= NUT_CACHE_MAX) nutCache.clear();
  nutCache.set(idx, c);
  return c;
}

/** IAU 2000A_R06 nütasyon (Δψ, Δε; radyan) — blok Chebyshev ara değeriyle (hata < 1 µas). t: TT Jülyen yüzyılı. */
export function nutationFast(t: number): { dpsi: number; deps: number } {
  const days = t * 36525;
  const idx = Math.floor(days / NUT_BLOCK_DAYS);
  const c = nutBlock(idx);
  const x = (days - (idx + 0.5) * NUT_BLOCK_DAYS) / (NUT_BLOCK_DAYS / 2);
  let t0 = 1;
  let t1 = x;
  let dp = c[0] + c[1] * x;
  let de = c[NUT_NODES] + c[NUT_NODES + 1] * x;
  for (let j = 2; j < NUT_NODES; j++) {
    const t2 = 2 * x * t1 - t0;
    dp += c[j] * t2;
    de += c[NUT_NODES + j] * t2;
    t0 = t1;
    t1 = t2;
  }
  return { dpsi: dp, deps: de };
}

/** IAU 2006 ortalama eğiklik (radyan) — eraObl06. */
export const meanObliquity2006 = (t: number) => (84381.406 + t * (-46.836769 + t * (-0.0001831 + t * (0.0020034 + t * (-0.000000576 + t * -0.0000000434))))) * DAS2R;

/** P03 Fukushima–Williams açıları (radyan) — eraPfw06 (çerçeve sapması dahil). */
function fwAngles(t: number) {
  const gamb = (-0.052928 + t * (10.556378 + t * (0.4932044 + t * (-0.00031238 + t * (-0.000002788 + t * 0.000000026))))) * DAS2R;
  const phib = (84381.412819 + t * (-46.811016 + t * (0.0511268 + t * (0.00053289 + t * (-0.00000044 + t * -0.0000000176))))) * DAS2R;
  const psib = (-0.041775 + t * (5038.481484 + t * (1.5584175 + t * (-0.00018522 + t * (-0.000026452 + t * -0.0000000148))))) * DAS2R;
  return { gamb, phib, psib };
}

const rz = (a: number): Mat => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [[c, s, 0], [-s, c, 0], [0, 0, 1]];
};
const rx = (a: number): Mat => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [[1, 0, 0], [0, c, s], [0, -s, c]];
};
const mm = (A: Mat, B: Mat): Mat =>
  [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j])) as Mat;
export const mv = (M: Mat, v: readonly number[]): [number, number, number] => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];

export type FrameOfDate = {
  /** GCRS → gerçek ekliptik ve ekinoks (tarih). */
  toTrueEcliptic: Mat;
  /** GCRS → gerçek ekvator ve ekinoks (tarih). */
  toTrueEquator: Mat;
  /** Gerçek eğiklik (derece), Δψ ve Δε (yay saniyesi). */
  trueObliquityDeg: number;
  dpsiArcsec: number;
  depsArcsec: number;
};

let memo: { t: number; f: FrameOfDate } | null = null;

/** Tarih çerçevesi (tek girişlik bellek: aynı anda çok cisim hesaplanır). t: TT Jülyen yüzyılı. */
export function frameOfDate(t: number): FrameOfDate {
  if (memo && memo.t === t) return memo.f;
  const { gamb, phib, psib } = fwAngles(t);
  const { dpsi, deps } = nutationFast(t);
  const eps = meanObliquity2006(t) + deps;
  const ecl = mm(rz(-(psib + dpsi)), mm(rx(phib), rz(gamb)));
  const equ = mm(rx(-eps), ecl);
  const f: FrameOfDate = { toTrueEcliptic: ecl, toTrueEquator: equ, trueObliquityDeg: eps / (Math.PI / 180), dpsiArcsec: dpsi / DAS2R, depsArcsec: deps / DAS2R };
  memo = { t, f };
  return f;
}
