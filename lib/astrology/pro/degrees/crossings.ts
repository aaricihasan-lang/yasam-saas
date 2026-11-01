// Gökyüzü Atlası — DERECE GEÇİŞLERİ (kullanıcı seçimli / kritik dereceler). SAF; sağlayıcı çağrısı YOK; ürüne bağlı DEĞİL.
//
// Soru: bir cisim, verilen ekliptik boylam derecesini [t0, t1) aralığında hangi anlarda, hangi yönde geçiyor? Retro döngüsünde aynı
// derece 3 kez (direkt → retro → direkt) geçilebilir; bu tekrarlar `pass` alanıyla gruplanır.
//
// Konum: #645 profesyonel efemerisinin yerel kaynağı (zodiacLon: görünür, gerçek ekliptik; tropikal ya da Lahiri sidereal) — tanım ve
// hata sınırları (accuracy.ts LOCAL_LIMITS) AYNEN kullanılır; bu modül #645 dosyalarını DEĞİŞTİRMEZ, yalnız içe aktarır.
//
// Kök bulma (çoklu kök güvenli):
//   1. Zaman ekseni cisme göre seçilen adımla taranır (Ay 3 sa, gerçek düğüm 6 sa, Güneş/Merkür/Venüs/Mars 12 sa, diğerleri 1 gün —
//      #645 burç girişi taramasıyla aynı; tek adımda hareket < 180° → açılmış fark wrap180 ile kesin).
//   2. Her adımın iki ucunda hız işareti ölçülür; işaret değişirse istasyon ikiye bölme ile bulunur ve adım iki MONOTON parçaya ayrılır
//      (istasyon yakınında derecenin bir adım içinde ileri-geri iki kez geçilmesi bu sayede kaçırılmaz).
//   3. Monoton parçada her derece en fazla bir kez geçilir; geçiş varsa ikiye bölme ile ≤ 100 ms.
// 0°/360°: tüm karşılaştırmalar wrap180 ile yapılır (359,9° → 0,1° hareketi 0°'yi geçer).
// Zaman: arama ekseni UTC ms (1961 öncesi UT); konum zamanı ortak katman (#647). Yerel saat gösterimi entegrasyonda yapılır.
// Desteklenen aralık: 1920-01-01 – 2150-12-31 (bağımsız doğrulama aralığı). Dışı: açık hata.

import { eraOf, ingressUncertaintySec } from "../ephemeris/accuracy";
import { zodiacLon } from "../ephemeris/events";
import { n360, wrap180 } from "../ephemeris/local";
import { EPHEMERIS_BODIES, type EphemerisBody, type Zodiac } from "../ephemeris/types";

export const DEGREE_CROSSINGS_ENGINE_VERSION = "pro-degree-crossings-1" as const;
export const CROSSING_MIN_MS = Date.UTC(1920, 0, 1);
export const CROSSING_MAX_MS = Date.UTC(2151, 0, 1);
/** Tek istekte en fazla aralık (gün) ve derece sayısı. */
export const CROSSING_MAX_RANGE_DAYS = 3660;
export const CROSSING_MAX_DEGREES = 36;

const HOUR = 3_600_000;
const DAY = 86_400_000;

export type CrossingError = { ok: false; code: "invalid_input" | "out_of_range" | "range_too_large"; error: string };

export type DegreeCrossing = {
  kind: "degree_crossing";
  body: EphemerisBody;
  /** Geçilen ekliptik boylam (°, [0, 360); seçili zodyakta). */
  degree: number;
  /** Burç (0 = Koç … 11 = Balık) ve burç içi derece. */
  sign: number;
  degreeInSign: number;
  ms: number;
  ut: string;
  /** Geçiş yönü: boylam artıyorsa direkt, azalıyorsa retro. */
  direction: "direct" | "retrograde";
  /** Geçiş anındaki hız (°/gün). */
  speedDegPerDay: number;
  /**
   * Aynı derecenin ardışık geçişleri yön değiştiriyorsa (araya tam tur girmeden geri dönüş) aynı gruptadır: pass = gruptaki sıra (1..),
   * passCount = grup büyüklüğü. Grup yalnız İSTENEN ARALIK içinde sayılır (aralık kenarı bir döngüyü bölebilir).
   */
  pass: number;
  passCount: number;
  /** Zaman belirsizliği (s) = 2 × boylam hata sınırı / |hız| (#645 olay belirsizliği kuralı). İstasyon yakınında büyür. */
  uncertaintySec: number;
};

const iso = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
const scanStep = (b: EphemerisBody) => (b === "moon" ? 3 * HOUR : b === "true_node" ? 6 * HOUR : b === "mercury" || b === "venus" || b === "sun" || b === "mars" ? 12 * HOUR : DAY);

/** Seçili zodyakta boylam hızı (°/gün, ±1 sa merkezi fark). Yalnız yön ve belirsizlik için. */
function zSpeed(body: EphemerisBody, ms: number, zodiac: Zodiac): number {
  return wrap180(zodiacLon(body, ms + HOUR, zodiac) - zodiacLon(body, ms - HOUR, zodiac)) * 12;
}

function bisect(f: (ms: number) => number, lo: number, hi: number, tolMs: number): number {
  let flo = f(lo);
  for (let i = 0; i < 80 && hi - lo > tolMs; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

/** Her burçta aynı burç-içi derece (ör. 29 → 29°, 59°, …, 359°). */
export function degreesInEverySign(degreeInSign: number): number[] {
  return Array.from({ length: 12 }, (_, i) => i * 30 + degreeInSign);
}

function validate(body: EphemerisBody, degrees: readonly number[], t0: number, t1: number): CrossingError | null {
  if (!(EPHEMERIS_BODIES as readonly string[]).includes(body)) return { ok: false, code: "invalid_input", error: "Geçersiz cisim." };
  if (!degrees.length || degrees.length > CROSSING_MAX_DEGREES) return { ok: false, code: "invalid_input", error: `1–${CROSSING_MAX_DEGREES} derece seçilmeli.` };
  if (degrees.some((d) => !Number.isFinite(d) || d < 0 || d >= 360)) return { ok: false, code: "invalid_input", error: "Derece 0 ile 360 arasında olmalı (360 hariç)." };
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return { ok: false, code: "invalid_input", error: "Geçersiz tarih aralığı." };
  if (t0 < CROSSING_MIN_MS || t1 > CROSSING_MAX_MS) return { ok: false, code: "out_of_range", error: "Desteklenen aralık 1920–2150." };
  if ((t1 - t0) / DAY > CROSSING_MAX_RANGE_DAYS) return { ok: false, code: "range_too_large", error: `En fazla ${CROSSING_MAX_RANGE_DAYS} gün.` };
  return null;
}

/** [t0, t1) aralığında `body`'nin `degrees` boylamlarını geçişleri, kronolojik. */
export function findDegreeCrossings(
  body: EphemerisBody,
  degrees: readonly number[],
  t0: number,
  t1: number,
  zodiac: Zodiac = "tropical",
): { ok: true; events: DegreeCrossing[] } | CrossingError {
  const bad = validate(body, degrees, t0, t1);
  if (bad) return bad;
  const targets = [...new Set(degrees.map((d) => Math.round(d * 1e6) / 1e6))];
  const lon = (ms: number) => zodiacLon(body, ms, zodiac);
  const raw: Omit<DegreeCrossing, "pass" | "passCount">[] = [];

  // Monoton parça [a, b] (boylamlar la, lb): her hedef en fazla bir kez; yarı açık (a, b] — uçtaki tam eşitlik bir kez sayılır.
  const scanMonotone = (a: number, la: number, b: number, lb: number) => {
    const d = wrap180(lb - la);
    if (d === 0) return;
    for (const D of targets) {
      const x = d > 0 ? n360(D - la) : n360(la - D);
      if (!(x > 0 && x <= Math.abs(d))) continue;
      const ms = Math.round(bisect((m) => wrap180(lon(m) - D), a, b, 100));
      if (ms < t0 || ms >= t1) continue;
      const sp = zSpeed(body, ms, zodiac);
      raw.push({
        kind: "degree_crossing",
        body,
        degree: D,
        sign: Math.floor(D / 30),
        degreeInSign: Math.round((D % 30) * 1e6) / 1e6,
        ms,
        ut: iso(ms),
        direction: d > 0 ? "direct" : "retrograde",
        speedDegPerDay: sp,
        uncertaintySec: ingressUncertaintySec(body, eraOf(new Date(ms).getUTCFullYear()), sp, "local"),
      });
    }
  };

  const step = scanStep(body);
  let pa = t0;
  let la = lon(pa);
  let sa = Math.sign(zSpeed(body, pa, zodiac));
  while (pa < t1) {
    const pz = Math.min(pa + step, t1);
    const lz = lon(pz);
    const sz = Math.sign(zSpeed(body, pz, zodiac));
    if (sa !== 0 && sz !== 0 && sa !== sz) {
      // İstasyon bu adımda → iki monoton parça.
      const st = bisect((m) => zSpeed(body, m, zodiac), pa, pz, 1000);
      const ls = lon(st);
      scanMonotone(pa, la, st, ls);
      scanMonotone(st, ls, pz, lz);
    } else scanMonotone(pa, la, pz, lz);
    pa = pz;
    la = lz;
    sa = sz;
  }

  raw.sort((x, y) => x.ms - y.ms);
  // Retro tekrarı grupları: aynı derecede ardışık geçişler yön değiştiriyorsa aynı grup.
  const events: DegreeCrossing[] = raw.map((e) => ({ ...e, pass: 1, passCount: 1 }));
  const byDeg = new Map<number, DegreeCrossing[]>();
  for (const e of events) byDeg.set(e.degree, [...(byDeg.get(e.degree) ?? []), e]);
  for (const list of byDeg.values()) {
    let group: DegreeCrossing[] = [];
    const close = () => group.forEach((g, i) => ((g.pass = i + 1), (g.passCount = group.length)));
    for (const e of list) {
      if (group.length && group[group.length - 1].direction === e.direction) {
        close();
        group = [];
      }
      group.push(e);
    }
    close();
  }
  return { ok: true, events };
}
