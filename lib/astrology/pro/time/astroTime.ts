// Gökyüzü Atlası — ORTAK ZAMAN KATMANI: astronomy-engine (MIT, 2.1.19) ile GÜVENLİ zaman nesneleri (yalnız yeni profesyonel motorlar).
//
// Neden iki ayrı yol (kaynak kodla doğrulandı, astronomy.js):
//   • Kütüphanenin `AstroTime` nesnesi { ut, tt } taşır; `tt`, `ut`'den GLOBAL ΔT fonksiyonuyla (varsayılan Espenak–Meeus) türetilir.
//   • Işık zamanı düzeltmesi (`CorrectLightTravel` → `time.AddDays(-lt)` → `new AstroTime(ut − lt)`) geri tarihlenen anın TT'sini
//     YENİDEN global ΔT ile kurar. Bu yüzden `ut` gerçek UT1 yapılıp `tt` elle ezilirse, ışık zamanı uygulanmış gezegen konumu yine
//     global (yanlış) ΔT ile hesaplanır.
//   • `AstroTime.FromTerrestrialTime(tt)` ise `ut`'yi global ΔT'nin TERSİNDEN seçer: nesnenin `tt`'si doğru, `ut`'si kütüphane-içi
//     tutarlı ama GERÇEK UT1 DEĞİLDİR (2026'da ≈ −5,9 s; 2100'de ≈ −107 s).
// Sonuç ve kural:
//   (1) KONUM (GeoVector, Ecliptic, e_tilt, Rotation_EQJ_*): `ephemerisTime(s)` = FromTerrestrialTime(TT). Bu nesnenin `.ut` alanı
//       Dünya dönüşü için KULLANILMAZ (SiderealTime, Horizon, Observer'lı Equator, Search* fonksiyonları YASAK).
//   (2) DÜNYA DÖNÜŞÜ: `gastDegrees(s)` — kütüphanenin GAST formülü (astronomy.js `era` + `sidereal_time`) GERÇEK UT1 ile ERA'ya,
//       TT ile presesyon/nütasyona uygulanarak burada hesaplanır. Kütüphanenin `sidereal_time` önbelleği YALNIZ `tt` ile anahtarlandığı
//       için (aynı tt, farklı ut → bayat değer) `SiderealTime` çağrılmaz.
//   (3) Arama: kütüphanenin Search* fonksiyonları zamanı `ut`'den global ΔT ile kurar → yeni motorlar kendi kök çözümünü
//       `scalesFromUtc` üzerinden yapar.

import * as Astronomy from "astronomy-engine";
import type { TimeScales } from "./scales";

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;

declare const EPHEMERIS_ONLY: unique symbol;
/** Yalnız konum hesabına verilecek zaman nesnesi (`.ut` gerçek UT1 değildir). */
export type EphemerisTime = Astronomy.AstroTime & { readonly [EPHEMERIS_ONLY]: true };

export const ttDaysOf = (s: Pick<TimeScales, "ttMs">) => (s.ttMs - J2000_MS) / DAY_MS;
export const ut1DaysOf = (s: Pick<TimeScales, "ut1Ms">) => (s.ut1Ms - J2000_MS) / DAY_MS;

/** Konum hesabı için TT'si kesin, kütüphane-içi tutarlı zaman nesnesi. */
export function ephemerisTime(s: Pick<TimeScales, "ttMs">): EphemerisTime {
  return Astronomy.AstroTime.FromTerrestrialTime(ttDaysOf(s)) as EphemerisTime;
}

/** Dünya Dönüş Açısı (derece), UT1 gün sayısından (IERS 2003; astronomy.js `era` ile aynı ifade). */
export function earthRotationAngleDeg(ut1Days: number): number {
  const thet1 = 0.779057273264 + 0.00273781191135448 * ut1Days;
  const thet3 = ut1Days % 1;
  const theta = 360 * ((thet1 + thet3) % 1);
  return theta < 0 ? theta + 360 : theta;
}

/** Greenwich GÖRÜNÜR yıldız zamanı (derece): ERA(UT1) + presesyon polinomu(TT) + ekinoks denklemi(TT, IAU 2000B).
 *  astronomy-engine `SiderealTime` ile aynı formül; tek fark ERA'nın GERÇEK UT1'den, kalanın TT'den alınması. */
export function gastDegrees(s: Pick<TimeScales, "ttMs" | "ut1Ms">): number {
  const t = ttDaysOf(s) / 36525;
  const eqeq = 15 * Astronomy.e_tilt(ephemerisTime(s)).ee;
  const st = eqeq + 0.014506 + ((((-0.0000000368 * t - 0.000029956) * t - 0.00000044) * t + 1.3915817) * t + 4612.156534) * t;
  const g = (st / 3600 + earthRotationAngleDeg(ut1DaysOf(s))) % 360;
  return g < 0 ? g + 360 : g;
}

/** Yerel görünür yıldız zamanı × 15 = RAMC (derece); doğu boylamı pozitif. */
export const ramcDegrees = (s: Pick<TimeScales, "ttMs" | "ut1Ms">, eastLongitude: number) => (((gastDegrees(s) + eastLongitude) % 360) + 360) % 360;

/** Gerçek eğiklik (derece), TT'den. */
export const trueObliquityDeg = (s: Pick<TimeScales, "ttMs">) => Astronomy.e_tilt(ephemerisTime(s)).tobl;
