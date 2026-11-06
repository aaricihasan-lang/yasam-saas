// Gökyüzü Atlası — TUTULMA TEMAS ANLARI (Ay: P1 · U1 · U2 · U3 · U4 · P4; Güneş: global başlangıç / bitiş). SAF; sağlayıcı çağrısı YOK.
//
// Owner kararı (02.11.2026): temas anları "bağımsız referansla (Swiss Ephemeris) uyumlu" gölge kuralıyla verilir; 180 s tolerans, 1920–2150.
// Tepe anı ve tür eclipses.ts'te DEĞİŞMEZ; bu modül yalnız o tepe anının çevresinde temas anlarını arar.
//
// Ay (yer merkezli açısal model): Ay merkezinin Güneş karşıtı noktaya açısal uzaklığı d(t), gölge yarıçapları
//   yarı gölge = 1,01·π☾ + π☉ + s☉ · tam gölge = 1,01·π☾ + π☉ − s☉   (π: yatay paralaks, s: görünür yarıçap)
// Gölge büyütme: Dünya yarıçapı %1 büyütülür (Danjon tipi). Temas koşulları: P1/P4 d = yarı gölge + s☾; U1/U4 d = tam gölge + s☾;
// U2/U3 d = tam gölge − s☾. Güneş GÖRÜNÜR konumdan (ışık sapması dahil) alınır.
// Kural seçimi ölçümle yapıldı (532 tutulma, Swiss 2.10.03 Moshier): %1 büyütme + görünür Güneş en küçük farkı verdi (ort. ≈ 0 s,
// en büyük ≤ 100 s); Chauvenet 1/50 ve büyütmesiz model 180 s'yi aştı.
//
// Güneş (global): yarı gölge konisinin Dünya elipsoidine ilk/son değdiği an. Koordinatlar tarih ekvatoruna döndürülür ve z ekseni
// 1/(1−f) ile ölçeklenir (WGS-84 elipsoidi → ekvator yarıçaplı küre); koşul: eksenin Dünya merkezine en yakın uzaklığı = R⊕ + yarı gölge
// yarıçapı (o noktada). Şehirden görünürlük bu modülde YOK.

import * as Astronomy from "astronomy-engine";
import { ttToUtcMs } from "./eclipses";

const DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const AU_KM = 149_597_870.7;
const R_SUN_KM = 695_700;
const R_MOON_KM = 1_737.4;
const R_EARTH_KM = 6_378.137;
const EARTH_FLATTENING = 1 / 298.257223563;
/** Gölge büyütme: Dünya yarıçapı × 1,01. */
export const LUNAR_SHADOW_ENLARGEMENT = 1.01;

export type ContactTime = { utcMs: number; ttMs: number };
export type LunarEclipseContacts = {
  rule: "earth_radius_plus_1pct";
  /** Yarı gölge başlangıç / bitiş (her tutulmada var). */
  p1: ContactTime;
  p4: ContactTime;
  /** Tam gölgeye (umbra) giriş / çıkış: parçalı ve tam tutulmada. */
  u1: ContactTime | null;
  u4: ContactTime | null;
  /** Tamlık başlangıç / bitiş: yalnız tam tutulmada. */
  u2: ContactTime | null;
  u3: ContactTime | null;
};
export type SolarEclipseGlobalContacts = { begin: ContactTime; end: ContactTime };

const timeOfTt = (ttMs: number) => Astronomy.AstroTime.FromTerrestrialTime((ttMs - J2000_MS) / DAY);
const contactOf = (ttMs: number): ContactTime => {
  const tt = Math.round(ttMs);
  return { ttMs: tt, utcMs: ttToUtcMs(tt) };
};

/** f(a) ve f(b) zıt işaretli olmalı; ikiye bölme, ≈ 1 ms. */
function bisect(f: (ttMs: number) => number, a: number, b: number): number {
  let fa = f(a);
  for (let i = 0; i < 60 && b - a > 1; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm < 0 === fa < 0) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

const angle = (a: Astronomy.Vector, b: { x: number; y: number; z: number }) =>
  Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)))));

function lunarGeometry(ttMs: number) {
  const t = timeOfTt(ttMs);
  const moon = Astronomy.GeoMoon(t);
  const sun = Astronomy.GeoVector(Astronomy.Body.Sun, t, true);
  const dm = Math.hypot(moon.x, moon.y, moon.z) * AU_KM;
  const ds = Math.hypot(sun.x, sun.y, sun.z) * AU_KM;
  const piMoon = Math.asin(R_EARTH_KM / dm) * LUNAR_SHADOW_ENLARGEMENT;
  const piSun = Math.asin(R_EARTH_KM / ds);
  const sSun = Math.asin(R_SUN_KM / ds);
  return {
    d: angle(moon, { x: -sun.x, y: -sun.y, z: -sun.z }),
    penumbra: piMoon + piSun + sSun,
    umbra: piMoon + piSun - sSun,
    sMoon: Math.asin(R_MOON_KM / dm),
  };
}

/** Kenar arama penceresi (tepe ± 6 saat): en uzun yarı gölge evresi ≈ 6 saat (yarısı ≈ 3 saat). */
const HALF_WINDOW_MS = 6 * 3_600_000;

function contactPair(peakTtMs: number, f: (ttMs: number) => number): [ContactTime, ContactTime] | null {
  if (f(peakTtMs) >= 0) return null;
  const a = bisect(f, peakTtMs - HALF_WINDOW_MS, peakTtMs);
  const b = bisect(f, peakTtMs, peakTtMs + HALF_WINDOW_MS);
  return [contactOf(a), contactOf(b)];
}

/** Ay tutulması temas anları; peakTtMs = findLunarEclipses tepe anı (TT ms). Yarı gölge teması bulunamazsa null. */
export function lunarEclipseContacts(peakTtMs: number): LunarEclipseContacts | null {
  const p = contactPair(peakTtMs, (x) => {
    const g = lunarGeometry(x);
    return g.d - (g.penumbra + g.sMoon);
  });
  if (!p) return null;
  const u = contactPair(peakTtMs, (x) => {
    const g = lunarGeometry(x);
    return g.d - (g.umbra + g.sMoon);
  });
  const tot = contactPair(peakTtMs, (x) => {
    const g = lunarGeometry(x);
    return g.d - (g.umbra - g.sMoon);
  });
  return { rule: "earth_radius_plus_1pct", p1: p[0], p4: p[1], u1: u?.[0] ?? null, u4: u?.[1] ?? null, u2: tot?.[0] ?? null, u3: tot?.[1] ?? null };
}

/** Yarı gölge konisi ile elipsoid arasındaki boşluk (km; < 0 → gölge Dünya'ya değiyor). */
function solarGap(ttMs: number): number {
  const t = timeOfTt(ttMs);
  const rot = Astronomy.Rotation_EQJ_EQD(t);
  const sun = Astronomy.RotateVector(rot, Astronomy.GeoVector(Astronomy.Body.Sun, t, true));
  const moon = Astronomy.RotateVector(rot, Astronomy.GeoMoon(t));
  const k = 1 / (1 - EARTH_FLATTENING);
  const m = [moon.x * AU_KM, moon.y * AU_KM, moon.z * AU_KM * k];
  const dv = [m[0] - sun.x * AU_KM, m[1] - sun.y * AU_KM, m[2] - sun.z * AU_KM * k];
  const dsm = Math.hypot(dv[0], dv[1], dv[2]);
  const s = [dv[0] / dsm, dv[1] / dsm, dv[2] / dsm];
  const along = -(m[0] * s[0] + m[1] * s[1] + m[2] * s[2]);
  const axis = Math.hypot(m[0] + s[0] * along, m[1] + s[1] * along, m[2] + s[2] * along);
  return axis - (R_EARTH_KM + R_MOON_KM + ((R_SUN_KM + R_MOON_KM) * along) / dsm);
}

/**
 * Güneş tutulması global başlangıç/bitiş; peakTtMs = findSolarEclipses tepe anı (TT ms).
 * null: yarı gölge bu modele göre Dünya'ya değmiyor (çok sınırda parçalı tutulma; 1920–2150'de 1 vaka, 1935-01-05 — Swiss de temas vermez).
 */
export function solarEclipseGlobalContacts(peakTtMs: number): SolarEclipseGlobalContacts | null {
  const p = contactPair(peakTtMs, solarGap);
  return p ? { begin: p[0], end: p[1] } : null;
}
