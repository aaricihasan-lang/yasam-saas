// Gökyüzü Atlası — ORTAK ZAMAN KATMANI: TAI − UTC (SAF; yalnız yeni profesyonel motorlar).
//
// Tanımlar (SOFA "Time Scale and Calendar Tools"; IERS Conventions): TT = TAI + 32,184 s; UTC artık saniyelerle TAI'den
// adım adım ayrılır; TAI − UTC SOFA'da `iauDat` rutininin verdiği büyüklüktür (1960–1971 eğimli formüller dahil).
//
// Kaynaklar (31.10.2026'da çevrimiçi okundu):
//   • 1972 →: IERS Leap_Second.dat — "Updated through IERS Bulletin 72 issued in July 2026", "File expires on 28 June 2027".
//     Bülten C 72: Aralık 2026 sonunda artık saniye YOK; 2017-01-01'den beri TAI − UTC = 37 s.
//   • 1961-01-01 → 1971-12-31: USNO tai-utc.dat: TAI − UTC = taban + (MJD − MJD₀) × oran (UTC'nin "lastik saniye" dönemi).
//   • 1961 öncesi: UTC TANIMLI DEĞİL → null (çağıran açık politika seçmelidir; scales.ts).
// Geçerlilik sonu sonrası (2027-06-28 →) gelecekteki artık saniyeler BİLİNMEZ → null (scales.ts öngörü yoluna geçer).

const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/** IERS Leap_Second.dat (Bülten C 72). [UTC başlangıç ms, TAI − UTC s]. */
export const LEAP_SECONDS: readonly (readonly [number, number])[] = [
  [D(1972, 1, 1), 10], [D(1972, 7, 1), 11], [D(1973, 1, 1), 12], [D(1974, 1, 1), 13], [D(1975, 1, 1), 14], [D(1976, 1, 1), 15],
  [D(1977, 1, 1), 16], [D(1978, 1, 1), 17], [D(1979, 1, 1), 18], [D(1980, 1, 1), 19], [D(1981, 7, 1), 20], [D(1982, 7, 1), 21],
  [D(1983, 7, 1), 22], [D(1985, 7, 1), 23], [D(1988, 1, 1), 24], [D(1990, 1, 1), 25], [D(1991, 1, 1), 26], [D(1992, 7, 1), 27],
  [D(1993, 7, 1), 28], [D(1994, 7, 1), 29], [D(1996, 1, 1), 30], [D(1997, 7, 1), 31], [D(1999, 1, 1), 32], [D(2006, 1, 1), 33],
  [D(2009, 1, 1), 34], [D(2012, 7, 1), 35], [D(2015, 7, 1), 36], [D(2017, 1, 1), 37],
];
export const LEAP_TABLE_SOURCE = "IERS Leap_Second.dat (Bülten C 72, Temmuz 2026)";
/** Tablonun geçerlilik sonu (IERS: "File expires on 28 June 2027"). Bu andan itibaren TAI − UTC bilinmez kabul edilir. */
export const LEAP_TABLE_VALID_UNTIL_MS = D(2027, 6, 28);
export const UTC_LEAP_ERA_START_MS = D(1972, 1, 1);
export const UTC_DRIFT_ERA_START_MS = D(1961, 1, 1);

/** USNO tai-utc.dat 1961–1971: [UTC başlangıç ms, taban s, MJD₀, oran s/gün]. */
export const DRIFT_1961_1971: readonly (readonly [number, number, number, number])[] = [
  [D(1961, 1, 1), 1.422818, 37300, 0.001296], [D(1961, 8, 1), 1.372818, 37300, 0.001296],
  [D(1962, 1, 1), 1.845858, 37665, 0.0011232], [D(1963, 11, 1), 1.945858, 37665, 0.0011232],
  [D(1964, 1, 1), 3.24013, 38761, 0.001296], [D(1964, 4, 1), 3.34013, 38761, 0.001296], [D(1964, 9, 1), 3.44013, 38761, 0.001296],
  [D(1965, 1, 1), 3.54013, 38761, 0.001296], [D(1965, 3, 1), 3.64013, 38761, 0.001296], [D(1965, 7, 1), 3.74013, 38761, 0.001296],
  [D(1965, 9, 1), 3.84013, 38761, 0.001296], [D(1966, 1, 1), 4.31317, 39126, 0.002592], [D(1968, 2, 1), 4.21317, 39126, 0.002592],
];
export const DRIFT_TABLE_SOURCE = "USNO tai-utc.dat (1961–1971)";

export type TaiMinusUtc = { seconds: number; basis: "leap_table" | "drift_1961_1971" };

/** MJD (UTC) — 1970-01-01 = MJD 40587. */
export const mjdOfUtcMs = (utcMs: number) => utcMs / 86_400_000 + 40587;

/** TAI − UTC (s). 1961 öncesi ve IERS geçerlilik sonu sonrası → null (bilinmez; tahmin ÜRETİLMEZ). */
export function taiMinusUtc(utcMs: number): TaiMinusUtc | null {
  if (!Number.isFinite(utcMs) || utcMs < UTC_DRIFT_ERA_START_MS || utcMs >= LEAP_TABLE_VALID_UNTIL_MS) return null;
  if (utcMs < UTC_LEAP_ERA_START_MS) {
    let row = DRIFT_1961_1971[0];
    for (const r of DRIFT_1961_1971) if (utcMs >= r[0]) row = r;
    return { seconds: row[1] + (mjdOfUtcMs(utcMs) - row[2]) * row[3], basis: "drift_1961_1971" };
  }
  let s = LEAP_SECONDS[0][1];
  for (const [start, off] of LEAP_SECONDS) if (utcMs >= start) s = off;
  return { seconds: s, basis: "leap_table" };
}
