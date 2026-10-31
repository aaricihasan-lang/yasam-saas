// Gökyüzü Atlası — PROFESYONEL EFEMERİS: YEREL kaynak (astronomy-engine 2.1.19, MIT). SAF; sağlayıcı çağrısı YOK.
//
// Tanım (bağımsız referansla aynı): geosantrik GÖRÜNÜR konum = ışık zamanı + yıllık sapma (astronomy-engine GeoVector aberration=true),
// GERÇEK ekliptik ve ekinoks (Ecliptic → ECT, IAU 2000B nütasyon), GERÇEK ekvator (Rotation_EQJ_EQD). Işık bükülmesi yok (<0,05″,
// Güneş'e çok yakın gezegen hariç). Zaman (AŞAMA 2, ortak zaman katmanı lib/astrology/pro/time): girilen an UTC; TT = UTC + 32,184 s +
// (TAI − UTC) (1961–2027-06-28 kesin), 1961 öncesi satır anı UT kabul edilir (efemeris satırı tanım gereği UT anıdır) ve 2027-06-28
// sonrası TT = UT + ΔT_öngörü. Zaman nesnesi `ephemerisTime` ile kurulur (TT kesin; `.ut` Dünya dönüşünde KULLANILMAZ).
// astronomy-engine'in global ΔT işlevi (Espenak–Meeus) DEĞİŞTİRİLMEZ ve burada KULLANILMAZ (Lilly motoru varsayılanla devam eder).
//
// Düğümler:
//   • Ortalama düğüm: Meeus, Astronomical Algorithms 2. bs. (47.7) Ω polinomu + Δψ (gerçek ekinoksa göre).
//   • Gerçek düğüm: oskülasyon düğümü — Ay'ın yer merkezli durum vektöründen (GeoMoonState) h = r × v, gerçek ekliptik çerçevesinde
//     Ω = atan2(hₓ, −h_y). Swiss Ephemeris "true node" tanımı da oskülasyon düğümüdür (belge §2.2.2); yalnız TEST referansı olarak
//     kıyaslanır, kod/tablo alınmaz.
// Lahiri ayanamsa: Hindistan Takvim Reformu Komitesi (1955) tanımı — 1956-03-21 0h'de 23°15′00,658″ (≈ 23,250183°) olarak verilen
//   değerin genel presesyon (IAU 2006 p_A, Capitaine vd. 2003) ile ileri/geri taşınması: ayan(t) = A₀ + p_A(t) − p_A(t₀). Sidereal boylam
//   = gerçek boylam − (ayan + Δψ) (ortalama ayanamsa + nütasyon = "gerçek" ayanamsa). Doğruluk testle ölçülür; eşik aşılırsa KAPALI.

import * as Astronomy from "astronomy-engine";
import { deltaTSeconds } from "./deltaT";
import { ephemerisTime, isTimeScalesError, scalesFromUtc } from "../time";
import type { BodyPosition, EphemerisBody, PlanetBody } from "./types";

const R = Math.PI / 180;
export const n360 = (x: number) => ((x % 360) + 360) % 360;
export const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
const HOUR = 3_600_000;

const AE: Readonly<Record<PlanetBody, Astronomy.Body>> = {
  sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn, uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune, pluto: Astronomy.Body.Pluto,
};

/** Yerel kaynağın kabul ettiği aralık (ΔT tablosu 1600–2600). Dışı reddedilir. */
export const LOCAL_MIN_YEAR = 1600;
export const LOCAL_MAX_YEAR = 2600; // deltaT.ts tablosuyla aynı

/** İstasyon eşiği (°/gün): ölçülü hız hatası üst sınırının (bkz. ACCURACY.speedArcsecPerDay) iki katı. Altında yön kesin değildir. */
export const STATION_THRESHOLD_DEG_PER_DAY = 2 / 3600;

/** Satır/olay anı (UTC ms) → konum hesabı zamanı (ortak katman; global ΔT işlevi kullanılmaz). Aralık dışı: hata fırlatır
 *  (çağıranlar önce `inLocalRange` ile doğrular). DUT1 bilinmez → 0 kabul (ortak katman `dut1_assumed_zero` işaretler; Ay'da < 0,5″). */
export function timeOf(ms: number): Astronomy.AstroTime {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(s)) throw new RangeError(`ephemeris: ${s.error}`);
  return ephemerisTime(s);
}
export const inLocalRange = (ms: number) => deltaTSeconds(ms) !== null;
/** Ortak katmanın TT'si (ms ekseni); aralık dışı: hata fırlatır. */
function ttMsOf(ms: number): number {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(s)) throw new RangeError(`ephemeris: ${s.error}`);
  return s.ttMs;
}

/** Ekliptik (λ, β; gerçek, tarih) → ekvator (α, δ; gerçek, tarih). ε = gerçek eğiklik. Kesin küresel dönüşüm. */
export function eclipticToEquatorial(lon: number, lat: number, eps: number): { ra: number; dec: number } {
  const l = lon * R;
  const b = lat * R;
  const e = eps * R;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / R;
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / R;
  return { ra: n360(ra), dec };
}

/** Gerçek eğiklik (derece) ve Δψ (yay saniyesi). */
export function obliquityAt(ms: number): { trueObliquity: number; dpsiArcsec: number; tt: number } {
  const t = timeOf(ms);
  const et = Astronomy.e_tilt(t);
  return { trueObliquity: et.tobl, dpsiArcsec: et.dpsi, tt: t.tt };
}

function planetLonLat(body: PlanetBody, ms: number): { lon: number; lat: number; vec: Astronomy.Vector } {
  const vec = Astronomy.GeoVector(AE[body], timeOf(ms), true);
  const ec = Astronomy.Ecliptic(vec);
  return { lon: n360(ec.elon), lat: ec.elat, vec };
}

export function meanNodeLon(ms: number): number {
  const { tt, dpsiArcsec } = obliquityAt(ms);
  const T = tt / 36525;
  const om = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000;
  return n360(om + dpsiArcsec / 3600);
}

export function trueNodeLon(ms: number): number {
  const time = timeOf(ms);
  const s = Astronomy.GeoMoonState(time);
  const rot = Astronomy.Rotation_EQJ_ECT(time);
  const r = Astronomy.RotateVector(rot, new Astronomy.Vector(s.x, s.y, s.z, time));
  const v = Astronomy.RotateVector(rot, new Astronomy.Vector(s.vx, s.vy, s.vz, time));
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  return n360(Math.atan2(hx, -hy) / R);
}

// ─── Lahiri ayanamsa ─────────────────────────────────────────────────────────────────────────────────
/** t₀ = 1956-03-21 0h (JD 2435553.5); o andaki GERÇEK (nütasyonlu) ayanamsa 23°15′00,658″ (Komite tanımı; ikincil kaynak: Lahiri,
 *  Indian Ephemeris). Ortalama değer = gerçek − Δψ(t₀); Δψ(t₀) aynı nütasyon modeliyle (IAU 2000B) hesaplanır, sabit kopyalanmaz. */
export const LAHIRI_T0_JD = 2435553.5;
export const LAHIRI_TRUE_AT_T0_DEG = 23 + 15 / 60 + 0.658 / 3600;
const LAHIRI_T0_MS = (LAHIRI_T0_JD - 2440587.5) * 86_400_000;
let lahiriMeanA0: number | null = null;
const lahiriA0 = () => (lahiriMeanA0 ??= LAHIRI_TRUE_AT_T0_DEG - obliquityAt(LAHIRI_T0_MS).dpsiArcsec / 3600);
/** IAU 2006 genel presesyon (boylamda), yay saniyesi; T = TT Jülyen yüzyılı (J2000'den). */
export const precessionPA = (T: number) => 5028.796195 * T + 1.1054348 * T ** 2 + 0.00007964 * T ** 3 - 0.000023857 * T ** 4 - 0.0000000383 * T ** 5;
export function lahiriMeanAyanamsa(ms: number): number {
  const { tt } = obliquityAt(ms);
  const T = tt / 36525;
  const T0 = (LAHIRI_T0_JD - 2451545.0) / 36525;
  return lahiriA0() + (precessionPA(T) - precessionPA(T0)) / 3600;
}
/** Gerçek (nütasyonlu) ayanamsa = ortalama + Δψ. */
export function lahiriTrueAyanamsa(ms: number): number {
  return lahiriMeanAyanamsa(ms) + obliquityAt(ms).dpsiArcsec / 3600;
}

// ─── Konum ───────────────────────────────────────────────────────────────────────────────────────────
/** Yalnız tropikal boylam (hız hesabı yok; olay taramasında kullanılır). */
export function rawLon(body: EphemerisBody, ms: number): number {
  if (body === "mean_node") return meanNodeLon(ms);
  if (body === "true_node") return trueNodeLon(ms);
  return planetLonLat(body, ms).lon;
}

/** Boylam hızı (°/gün): ±1 saat merkezi fark (referansla aynı tanım). */
export function localSpeed(body: EphemerisBody, ms: number): number {
  // °/gün (TT). AŞAMA 2: payda GERÇEK geçen TT süresidir — UTC ms ekseni artık saniye anında 1 s "eksik" sayar (±1 sa penceresi bir
  // artık saniyeyi kapsarsa Ay hızında ≈ 6,6″/gün sahte hata doğardı).
  return (wrap180(rawLon(body, ms + HOUR) - rawLon(body, ms - HOUR)) / (ttMsOf(ms + HOUR) - ttMsOf(ms - HOUR))) * 86_400_000;
}

export function localPosition(body: EphemerisBody, ms: number, zodiac: "tropical" | "sidereal_lahiri" = "tropical"): BodyPosition {
  const { trueObliquity } = obliquityAt(ms);
  const speed = localSpeed(body, ms);
  const ayan = zodiac === "sidereal_lahiri" ? lahiriTrueAyanamsa(ms) : 0;
  if (body === "mean_node" || body === "true_node") {
    const lon = rawLon(body, ms);
    return { body, lon: n360(lon - ayan), lat: 0, ra: null, dec: null, speed, retro: speed < 0, stationary: Math.abs(speed) < STATION_THRESHOLD_DEG_PER_DAY };
  }
  const { lon, lat } = planetLonLat(body, ms);
  const { ra, dec } = eclipticToEquatorial(lon, lat, trueObliquity);
  return { body, lon: n360(lon - ayan), lat, ra, dec, speed, retro: speed < 0, stationary: Math.abs(speed) < STATION_THRESHOLD_DEG_PER_DAY };
}

/** Doğrudan ekvator vektöründen RA/dek (dönüşüm formülünün bağımsız sağlaması için; testte kullanılır). */
export function localEquatorialDirect(body: PlanetBody, ms: number): { ra: number; dec: number } {
  const time = timeOf(ms);
  const v = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), Astronomy.GeoVector(AE[body], time, true));
  const s = Astronomy.SphereFromVector(v);
  return { ra: n360(s.lon), dec: s.lat };
}
