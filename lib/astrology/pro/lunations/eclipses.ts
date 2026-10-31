// Gökyüzü Atlası — AY ve GÜNEŞ TUTULMALARI (yer merkezli/global olay listesi). SAF; sağlayıcı çağrısı YOK; ürüne bağlı DEĞİL.
//
// Kaynak: astronomy-engine 2.1.19 (MIT) SearchLunarEclipse / NextLunarEclipse ve SearchGlobalSolarEclipse / NextGlobalSolarEclipse.
// Bu aramaların sonucu (tepe anı) kütüphanenin KENDİ TT ölçeğinde tutarlıdır (geometri TT ile hesaplanır). Tepe anı TT olarak alınır ve
// UTC'ye ORTAK ZAMAN KATMANI ile çevrilir (ttToUtcMs) → global ΔT işlevi (Espenak–Meeus) yalnız arama başlangıcını etkiler, sonucu değil.
//
// Kapsam ve sınırlar (açık beyan):
//   • Ay tutulması: tür (yarı gölge / parçalı / tam) ve tepe anı. TEMAS ANLARI VE ÖRTÜLME VERİLMEZ: bağımsız referansa (Swiss Ephemeris)
//     göre yarı süreler sistematik olarak daha uzun (ortalama yarı gölge %0,85, tam %4,8; en büyük fark 414 s) — gölge büyütme kuralı
//     farkı; önceden tanımlı 180 s toleransını aştığı için çıktıdan çıkarıldı (QA 04/05 raporu). Kural seçimi Owner kararıdır.
//   • Güneş tutulması: GLOBAL tür (parçalı / halkalı / tam) ve global tepe anı. Melez (hybrid) tür kütüphanede yok → "total" ya da
//     "annular" olarak gelir; bağımsız referans (Swiss Ephemeris) melez derse MODEL FARKI olarak işaretlenir. Global tepe noktasının
//     coğrafi konumu Dünya dönüşüne (UT1) bağlıdır ve kütüphane bunu kendi ΔT'siyle hesaplar → bu modülde VERİLMEZ.
//   • Yerel görünürlük (bir şehirden tutulma) bu modülde YOK.
// Desteklenen aralık: 1920–2150 (bağımsız doğrulama aralığı).

import * as Astronomy from "astronomy-engine";
import { isTimeScalesError, scalesFromUtc } from "../time";
import { LUNATION_MAX_MS, LUNATION_MIN_MS, LUNATION_MAX_RANGE_DAYS, type LunationError } from "./phases";

const DAY = 86_400_000;
/** J2000.0 = 2000-01-01 12:00 TT (ortak katmanla aynı ms ekseni). */
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export type LunarEclipseKind = "penumbral" | "partial" | "total";
export type SolarEclipseKind = "partial" | "annular" | "total";

export type LunarEclipseEvent = {
  kind: LunarEclipseKind;
  /** Tepe anı UTC (ms) ve TT (ms). */
  peakMs: number;
  peakTtMs: number;
};

export type SolarEclipseEvent = {
  kind: SolarEclipseKind;
  /**
   * central: gölge ekseni Dünya'yı keser · non_central: eksen Dünya'yı ıskalar ama tam/halkalı gölge kenarı Dünya'ya değer
   * (kütüphane bunları "partial" bildirir; tür gölge konisi geometrisinden düzeltilir) · none: yalnız parçalı.
   */
  centrality: "central" | "non_central" | "none";
  peakMs: number;
  peakTtMs: number;
  /** Tepe anında gölge ekseninin Dünya merkezine en yakın uzaklığı (km). */
  axisDistanceKm: number;
};

/** Yarıçaplar (km): Güneş IAU 2015 nominal, Ay IAU, Dünya ekvator (WGS-84). AU (km) IAU 2012. */
const R_SUN_KM = 695_700;
const R_MOON_KM = 1_737.4;
const R_EARTH_KM = 6_378.137;
const AU_KM = 149_597_870.7;

/**
 * Tepe anında tam (umbra, >0) ya da halkalı (antumbra, <0) gölge konisinin, eksenin Dünya'ya en yakın noktasındaki yarıçapı (km).
 * Geometri (geometrik konumlar, ışık sapması yok): eksen yönü s = (Ay − Güneş)/|Ay − Güneş|; Ay'dan eksen boyunca en yakın noktaya
 * uzaklık t = −(Ay · s); yarıçap = R☾ − (R☉ − R☾) · t / |Ay − Güneş|.
 */
export function shadowRadiusAtEarthKm(peak: Astronomy.AstroTime): number {
  return shadowGeometry(peak).radiusKm;
}

/** WGS-84 basıklığı. */
const EARTH_FLATTENING = 1 / 298.257223563;

/**
 * Gölge geometrisi: koni yarıçapı (km; >0 tam gölge, <0 halkalı) ve eksenin Dünya merkezine en yakın noktasının yer merkezli enlemi
 * (°; J2000 ekvatoru — tarih ekvatoruna göre ≤ 0,5° fark, yarıçapta < 0,5 km etki).
 */
export function shadowGeometry(peak: Astronomy.AstroTime): { radiusKm: number; axisLatitudeDeg: number } {
  const sun = Astronomy.GeoVector(Astronomy.Body.Sun, peak, false);
  const moon = Astronomy.GeoVector(Astronomy.Body.Moon, peak, false);
  const m = [moon.x * AU_KM, moon.y * AU_KM, moon.z * AU_KM];
  const d = [m[0] - sun.x * AU_KM, m[1] - sun.y * AU_KM, m[2] - sun.z * AU_KM];
  const dsm = Math.hypot(d[0], d[1], d[2]);
  const s = [d[0] / dsm, d[1] / dsm, d[2] / dsm];
  const t = -(m[0] * s[0] + m[1] * s[1] + m[2] * s[2]);
  const p = [m[0] + s[0] * t, m[1] + s[1] * t, m[2] + s[2] * t];
  return { radiusKm: R_MOON_KM - ((R_SUN_KM - R_MOON_KM) * t) / dsm, axisLatitudeDeg: (Math.asin(p[2] / Math.hypot(p[0], p[1], p[2])) * 180) / Math.PI };
}

/** Elipsoidin verilen yer merkezli enlemdeki yarıçapı (km) — birinci dereceden basıklık yaklaşımı (hata < 0,1 km). */
export const earthRadiusAtKm = (latDeg: number) => R_EARTH_KM * (1 - EARTH_FLATTENING * Math.sin((latDeg * Math.PI) / 180) ** 2);

/** TT (ms) → UTC (ms): ortak katmanın UTC→TT dönüşümünün ters çevrilmesi (sabit nokta; 1 ms'ye yakınsar). */
export function ttToUtcMs(ttMs: number): number {
  let u = ttMs - 69_000;
  for (let i = 0; i < 6; i++) {
    const s = scalesFromUtc(u, { pre1961: "civil_as_ut" });
    if (isTimeScalesError(s)) throw new RangeError(`eclipses: ${s.error}`);
    const d = ttMs - s.ttMs;
    u += d;
    if (Math.abs(d) < 0.5) break;
  }
  return Math.round(u);
}

const ttMsOf = (t: Astronomy.AstroTime) => J2000_MS + t.tt * DAY;

function checkRange(t0: number, t1: number): LunationError | null {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return { ok: false, code: "invalid_input", error: "Geçersiz tarih aralığı." };
  if (t0 < LUNATION_MIN_MS || t1 > LUNATION_MAX_MS) return { ok: false, code: "out_of_range", error: "Desteklenen aralık 1920–2150." };
  if ((t1 - t0) / DAY > LUNATION_MAX_RANGE_DAYS * 25) return { ok: false, code: "range_too_large", error: "Aralık çok büyük." };
  return null;
}

const LUNAR_KIND: Readonly<Record<string, LunarEclipseKind>> = { penumbral: "penumbral", partial: "partial", total: "total" };
const SOLAR_KIND: Readonly<Record<string, SolarEclipseKind>> = { partial: "partial", annular: "annular", total: "total" };

/** [t0, t1) aralığındaki Ay tutulmaları (tepe anına göre), kronolojik. */
export function findLunarEclipses(t0: number, t1: number): { ok: true; events: LunarEclipseEvent[] } | LunationError {
  const bad = checkRange(t0, t1);
  if (bad) return bad;
  const out: LunarEclipseEvent[] = [];
  let e = Astronomy.SearchLunarEclipse(new Date(t0 - 2 * DAY));
  for (let guard = 0; guard < 2000; guard++) {
    const peakTt = ttMsOf(e.peak);
    const peak = ttToUtcMs(peakTt);
    if (peak >= t1) break;
    if (peak >= t0) {
      const kind = LUNAR_KIND[String(e.kind)];
      if (!kind) throw new Error(`eclipses: bilinmeyen tür ${String(e.kind)}`);
      out.push({ kind, peakMs: peak, peakTtMs: Math.round(peakTt) });
    }
    e = Astronomy.NextLunarEclipse(e.peak);
  }
  return { ok: true, events: out };
}

/** [t0, t1) aralığındaki Güneş tutulmaları (global tür + global tepe anı), kronolojik. */
export function findSolarEclipses(t0: number, t1: number): { ok: true; events: SolarEclipseEvent[] } | LunationError {
  const bad = checkRange(t0, t1);
  if (bad) return bad;
  const out: SolarEclipseEvent[] = [];
  let e = Astronomy.SearchGlobalSolarEclipse(new Date(t0 - 2 * DAY));
  for (let guard = 0; guard < 2000; guard++) {
    const peakTt = ttMsOf(e.peak);
    const peak = ttToUtcMs(peakTt);
    if (peak >= t1) break;
    if (peak >= t0) {
      let kind = SOLAR_KIND[String(e.kind)];
      if (!kind) throw new Error(`eclipses: bilinmeyen tür ${String(e.kind)}`);
      let centrality: SolarEclipseEvent["centrality"] = kind === "partial" ? "none" : "central";
      if (kind === "partial") {
        // Merkezi olmayan tam/halkalı: eksen Dünya'yı ıskalar ama gölge kenarı yüzeye değer → tür gölge konisinden.
        // Yüzey, eksenin en yakın noktasının enleminde elipsoid yarıçapıyla alınır (kutup bölgelerinde ≈ 20 km daha kısa).
        const g = shadowGeometry(e.peak);
        if (e.distance - earthRadiusAtKm(g.axisLatitudeDeg) < Math.abs(g.radiusKm)) {
          kind = g.radiusKm > 0 ? "total" : "annular";
          centrality = "non_central";
        }
      }
      out.push({
        kind,
        centrality,
        peakMs: peak,
        peakTtMs: Math.round(peakTt),
        axisDistanceKm: Math.round(e.distance),
      });
    }
    e = Astronomy.NextGlobalSolarEclipse(e.peak);
  }
  return { ok: true, events: out };
}
