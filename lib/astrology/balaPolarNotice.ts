// 24.10.2026 — Shadbala / Bhava Bala kutup günü / kutup gecesi UYARISI. YALNIZ sunum (ekran + Word/PDF); hesap, projeksiyon,
// teknik veri, önbellek anahtarı ve şema DEĞİŞMEZ. Karar kayıtlı doğum verisinden (tarih + saat + saat dilimi + konum) verilir →
// eski kayıtlar da aynı kuralla değerlendirilir.
// Gerekçe (QA 40-sekiz-teknik/bhava-bala, 51-kutup-upagraha/SHADBALA-KUTUP.md): Kala Bala'nın tribhaga / vara / hora bileşenleri
// gün doğumu ve batımına dayanır; güneşin doğmadığı ya da batmadığı durumda klasik tanımla hesaplanamaz, sağlayıcı yine değer verir
// (Tromsø 21.06.2024 gerçek yanıtı: gezegen başına ≤ ~60 virupa doğrulanamayan pay). Bhava Bala'nın Bhavadhipati bileşeni ev
// efendisinin Shadbala toplamıdır → aynı belirsizliği taşır.
// Kural: doğum anını çevreleyen gündüz ya da gece parçası (doğuş→batış ya da batış→doğuş) ve o Vedik günü başlatan doğuş TANIMLI
// değilse uyarı. Doğuş ve batışın VARLIĞI kulminasyon irtifasından (doğuş ⇔ önceki alt kulminasyonda ufkun altında, öğlede üstünde;
// batış simetrik), anları zaman denklemi + saat açısı ile (sapma olay anında yinelenir) hesaplanır; standart ufuk −0,8333°.
// Eşiğe 0,05°'den yakın günler `nearThreshold` ile işaretlenir (kırılma belirsizliği düzeyi; geçiş günleri ±1 gün kayabilir).
// Bağımsız doğrulama: DE440 + Skyfield, kulminasyon + ikiye bölme referansı (harness A).
import { resolveAstroBirthTime } from "./birth/timeResolution";

export const BALA_POLAR_TECHNIQUES: ReadonlySet<string> = new Set(["vedic.shadbala", "vedic.bhava_bala"]);

const COMMON =
  "Kutup günü / kutup gecesi: bu doğum anında bu yerde güneş doğmadığı ya da batmadığı için Kala Bala'nın gün doğumu ve batımına dayanan bileşenleri (tribhaga, vara, hora) klasik tanımla hesaplanamaz. Hesaplama servisinin bu durumda kullandığı kural belgelenmemiştir.";
export const BALA_POLAR_NOTICE: Record<"vedic.shadbala" | "vedic.bhava_bala", string> = {
  "vedic.shadbala": `${COMMON} Gösterilen Kala Bala, toplam güç ve sıralama bu nedenle kesinlik taşımaz; değerler değiştirilmeden gösterilir.`,
  "vedic.bhava_bala": `${COMMON} Bhava Bala'nın Bhavadhipati bileşeni ev efendisinin Shadbala toplamı olduğundan aynı belirsizlik ev güçlerine ve sıralamasına da yansır; değerler değiştirilmeden gösterilir.`,
};

const RAD = Math.PI / 180;
const H0 = -0.8333;
const HOUR = 3600000;
const norm = (x: number) => ((x % 360) + 360) % 360;
/** NOAA düşük hassasiyetli Güneş: sapma (°) ve zaman denklemi (dk). */
function sunAt(utcMs: number): { dec: number; eqMin: number } {
  const T = (utcMs / 86400000 + 2440587.5 - 2451545) / 36525;
  const L0 = norm(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const om = 125.04 - 1934.136 * T;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * RAD);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(om * RAD);
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const eq = y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD);
  return { dec: Math.asin(Math.sin(eps * RAD) * Math.sin(lam * RAD)) / RAD, eqMin: (4 * eq) / RAD };
}
/** Güneş öğlesi (UTC ms) — yerel gün + boylam; zaman denklemi iki kez yinelenir. */
function solarNoon(date: string, longitude: number): number {
  let n = Date.parse(`${date}T12:00:00Z`) - (longitude / 15) * HOUR;
  for (let i = 0; i < 2; i++) n = Date.parse(`${date}T12:00:00Z`) - (longitude / 15) * HOUR - sunAt(n).eqMin * 60000;
  return n;
}
const altUpper = (lat: number, dec: number) => 90 - Math.abs(lat - dec);
const altLower = (lat: number, dec: number) => Math.abs(lat + dec) - 90;

export type SunDay = { noonUtcMs: number; sunriseUtcMs: number | null; sunsetUtcMs: number | null; nearThreshold: boolean };
/** Yerel gün (YYYY-MM-DD) + konum → o günün öğlesini çevreleyen doğuş (öğleden önce) ve batış (öğleden sonra); yoksa null. */
export function sunDay(date: string, offsetHours: number, latitude: number, longitude: number): SunDay | null {
  const d0 = Date.parse(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(d0) || new Date(d0).toISOString().slice(0, 10) !== date) return null;
  if (![offsetHours, latitude, longitude].every(Number.isFinite) || Math.abs(offsetHours) > 15 || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const noon = solarNoon(date, longitude);
  const aN = altUpper(latitude, sunAt(noon).dec);
  const aB = altLower(latitude, sunAt(noon - 12 * HOUR).dec);
  const aA = altLower(latitude, sunAt(noon + 12 * HOUR).dec);
  const near = [aN, aB, aA].some((a) => Math.abs(a - H0) < 0.05);
  const event = (sign: -1 | 1): number | null => {
    let t = noon + sign * 6 * HOUR;
    for (let i = 0; i < 4; i++) {
      const dec = sunAt(t).dec;
      const cosH = (Math.sin(H0 * RAD) - Math.sin(latitude * RAD) * Math.sin(dec * RAD)) / (Math.cos(latitude * RAD) * Math.cos(dec * RAD));
      const h = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD / 15;
      t = noon + sign * h * HOUR;
    }
    return t;
  };
  const sunrise = aB < H0 && H0 < aN ? event(-1) : null;
  const sunset = aN > H0 && H0 > aA ? event(1) : null;
  return { noonUtcMs: noon, sunriseUtcMs: sunrise, sunsetUtcMs: sunset, nearThreshold: near };
}

export type BalaBirthMoment = { birthDate: string; birthTime: string | null; latitude: number; longitude: number; timezone?: string | null; utcOffsetSeconds?: number | null };

/** Doğum anının gündüz/gece parçası veya Vedik günü başlatan doğuş tanımsız mı? Veri eksik/geçersizse false (uyarı yok). */
export function balaPolarBirth(m: BalaBirthMoment | null | undefined): boolean {
  if (!m || typeof m.birthDate !== "string" || typeof m.birthTime !== "string" || !m.birthTime) return false;
  let offsetSec = typeof m.utcOffsetSeconds === "number" && Number.isFinite(m.utcOffsetSeconds) ? m.utcOffsetSeconds : null;
  if (offsetSec === null) {
    if (typeof m.timezone !== "string" || !m.timezone) return false;
    const r = resolveAstroBirthTime(m.birthDate, m.birthTime, m.timezone, "earlier");
    if (r.kind !== "ok") return false;
    offsetSec = r.offsetSeconds;
  }
  const hms = m.birthTime.length === 5 ? `${m.birthTime}:00` : m.birthTime;
  const birthUtc = Date.parse(`${m.birthDate}T${hms}Z`) - offsetSec * 1000;
  if (!Number.isFinite(birthUtc)) return false;
  const day = (k: number) => new Date(Date.parse(`${m.birthDate}T12:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
  const ev: { t: number; rise: boolean }[] = [];
  for (const k of [-2, -1, 0, 1, 2]) {
    const s = sunDay(day(k), offsetSec / 3600, m.latitude, m.longitude);
    if (!s) return false;
    if (s.sunriseUtcMs !== null) ev.push({ t: s.sunriseUtcMs, rise: true });
    if (s.sunsetUtcMs !== null) ev.push({ t: s.sunsetUtcMs, rise: false });
  }
  ev.sort((a, b) => a.t - b.t);
  const prev = [...ev].reverse().find((e) => e.t <= birthUtc);
  const next = ev.find((e) => e.t > birthUtc);
  if (!prev || !next || prev.rise === next.rise) return true; // parça kapanmıyor (ör. doğuş var, batış yok)
  if (next.t - prev.t > 24 * HOUR) return true;
  if (prev.rise) return false; // gündüz: Vedik gün bu doğuşla başlar
  const dayStart = [...ev].reverse().find((e) => e.rise && e.t < prev.t); // gece: Vedik gün önceki doğuşla başlar
  return !dayStart || prev.t - dayStart.t > 24 * HOUR;
}

/** Ekran ve rapor için TEK kaynak: ilgili teknik + kutup koşulu → uyarı metni; değilse null. */
export function balaPolarNotice(technique: string, m: BalaBirthMoment | null | undefined): string | null {
  if (!BALA_POLAR_TECHNIQUES.has(technique)) return null;
  return balaPolarBirth(m) ? BALA_POLAR_NOTICE[technique as "vedic.shadbala" | "vedic.bhava_bala"] : null;
}
