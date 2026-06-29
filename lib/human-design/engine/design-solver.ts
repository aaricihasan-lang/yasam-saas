// FAZ 2B — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// 88° DESIGN SOLVER.
//
// Human Design'daki "Design" anı, doğumdan 88 TAKVİM GÜNÜ önce DEĞİLDİR.
// Güneş'in ekliptik boylamının, doğum anındaki boylamından tam 88° GERİDE
// olduğu UTC anıdır (solar arc). Bu süre Kepler nedeniyle yıl içinde değişir
// (perihel ~Ocak: hızlı Güneş → daha az gün; afel ~Temmuz: yavaş → daha çok gün).
//
// Bu dosya YALNIZCA design UTC anını + Güneş boylamını çözer.
//   Gate / line / type / authority / profile / center / channel YOK.
//   Mandala eşleme YOK.
// "production-validated" — design anı boylamları pyswisseph'e karşı ~arcsec ve
// 3 gerçek golden case'in design tarafı (13×3) birebir doğrulandı (FAZ 2D).

import { dateToJulianDay } from "./julian";
import type { PlanetLongitudeProvider } from "./types";

const DAY_MS = 86_400_000;
const DESIGN_ARC_DEG = 88;

/** Boylamı [0, 360) aralığına normalize eder. */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** İki boylam arasındaki işaretli fark, (−180, 180] aralığında (derece). */
function angularDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/** Verilen Date için sağlayıcıdan Güneş boylamını çeker. */
function sunLongitudeAt(date: Date, provider: PlanetLongitudeProvider): number {
  const sun = provider
    .getLongitudes(dateToJulianDay(date))
    .find((p) => p.planet === "Sun");
  if (!sun) {
    throw new Error("Sağlayıcı Güneş (Sun) boylamı döndürmedi.");
  }
  return sun.longitude;
}

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type DesignSolverParams = {
  /** Doğum anı (UTC). */
  birthUtc: Date;
  /** Güneş boylamını sağlayan kaynak (mock veya AE). */
  provider: PlanetLongitudeProvider;
  /** Kabul edilen artık (yay-saniye). Varsayılan 1. */
  toleranceArcsec?: number;
  /** Maksimum bisection iterasyonu. Varsayılan 60. */
  maxIterations?: number;
};

export type DesignSolveResult = {
  /** Çözülen design anı (UTC). */
  designUtc: Date;
  /** Doğum anındaki Güneş boylamı (derece). */
  birthSunLongitude: number;
  /** Hedef boylam = birthSun − 88°, normalize (derece). */
  targetSunLongitude: number;
  /** Çözüm anındaki gerçek Güneş boylamı (derece). */
  designSunLongitude: number;
  /** Çözümün hedefe artığı (yay-saniye); ~0 olmalı. */
  deltaArcsec: number;
  /** Kullanılan iterasyon sayısı. */
  iterations: number;
  /** Doğumdan kaç gün önce (88 GÜN DEĞİL; solar-arc'a bağlı değişir). */
  daysBeforeBirth: number;
  /** Yöntem etiketi. */
  method: "bisection-88deg-solar-arc";
  /** Doğruluk durumu notu. */
  disclaimer: string;
};

// ─── Çözücü ─────────────────────────────────────────────────────────────────

/**
 * Design UTC anını 88° solar-arc kök bulmasıyla çözer.
 *
 * f(t) = angularDiff(sun(t), target) ; target = birthSun − 88°.
 * Güneş boylamı <1 yıl pencerede monoton arttığından, doğumdan geriye doğru
 * tek bir sıfır geçişi vardır. Bracket [erken, doğum] kurulup bisection ile
 * tolerans yay-saniyesine indirilir. 360° sarması angularDiff ile güvenli.
 */
export function solveDesignTimeUtc(params: DesignSolverParams): DesignSolveResult {
  const {
    birthUtc,
    provider,
    toleranceArcsec = 1,
    maxIterations = 60,
  } = params;

  const birthSunLongitude = sunLongitudeAt(birthUtc, provider);
  const targetSunLongitude = norm360(birthSunLongitude - DESIGN_ARC_DEG);

  const g = (tMs: number): number =>
    angularDiff(sunLongitudeAt(new Date(tMs), provider), targetSunLongitude);

  // Bracket: hi = doğum (g ≈ +88 > 0); lo = doğum − 95 gün (g < 0).
  // 95 günde Güneş en yavaşken bile >90° ilerler → lo tarafı negatif garanti.
  // Yine de güvenlik için lo'yu gerekirse geriye doğru genişlet.
  let hi = birthUtc.getTime();
  let lo = hi - 95 * DAY_MS;
  let guard = 0;
  while (g(lo) > 0 && guard < 12) {
    hi = lo;
    lo -= 30 * DAY_MS;
    guard += 1;
  }

  let mid = hi;
  let iterations = 0;
  let deltaArcsec = Number.POSITIVE_INFINITY;
  let designSunLongitude = birthSunLongitude;

  for (let i = 0; i < maxIterations; i += 1) {
    iterations = i + 1;
    mid = (lo + hi) / 2;
    designSunLongitude = sunLongitudeAt(new Date(mid), provider);
    const gm = angularDiff(designSunLongitude, targetSunLongitude);
    deltaArcsec = Math.abs(gm) * 3600;
    if (deltaArcsec <= toleranceArcsec) break;
    // g, t ile artar (lo'da negatif, hi'da pozitif): gm>0 → kök solda.
    if (gm > 0) hi = mid;
    else lo = mid;
  }

  return {
    designUtc: new Date(mid),
    birthSunLongitude,
    targetSunLongitude,
    designSunLongitude,
    deltaArcsec,
    iterations,
    daysBeforeBirth: (birthUtc.getTime() - mid) / DAY_MS,
    method: "bisection-88deg-solar-arc",
    disclaimer:
      "FAZ 2D doğrulandı: 88° solar-arc design anı (88 takvim günü DEĞİL); " +
      "design boylamları pyswisseph ile ~arcsec, 3 golden case ile birebir. " +
      "type/authority/profile/center/channel henüz hesaplanmıyor (sonraki katman).",
  };
}
