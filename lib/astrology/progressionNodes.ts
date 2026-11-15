// Astroloji — F1/F2 (14.11.2026, 1.000 vakalık doğrulama denetimi sonrası): secondary progression DÜĞÜM ve NATAL EV güvenliği (SAF).
//
// F1 — ORTALAMA DÜĞÜM. Kanıt (QA ATLAS-1000-DOGRULAMA-2026-11-14, 500 gerçek /astrology/progressions yanıtı): `nodeType: "mean"`
// istenen 10/10 yanıtta sağlayıcı GERÇEK (oskülasyon) düğümü döndürüyor — bağımsız true düğümle ≤ 0,04″, ortalama düğümle 1045–5805″
// fark; yanıtın birthDetails.nodeType yankısı yine "mean". Aynı sağlayıcının natal uç noktası ortalama düğümü doğru veriyor (30.10
// denetimi 60/60), yani hata bu uç noktaya özgü.
// Tanım: ortalama düğüm = Ay yörüngesinin ortalama çıkış düğümü, tarihin GERÇEK ekinoksundan ölçülen ekliptik boylamı (Ω ortalama
// polinomu + boylamda nütasyon Δψ) — Swiss Ephemeris SE_MEAN_NODE (varsayılan bayraklar) ve sağlayıcının natal "mean" tanımıyla aynı.
// Hesap (pro/** modülleri ürün kodundan import EDİLMEZ — astro-pro Z19/A14 statik kuralı): Meeus 47.7 Ω polinomu (pro/ephemeris
// meanNodeLon ile AYNI katsayılar) + Δψ (astronomy-engine e_tilt, IAU 2000B kısaltılmış seri; ölçülen 2000A farkı ≤ 0,25″); TT ortak zaman katmanından
// (lib/astrology/time; 1961 öncesi sivil an = UT, sağlayıcı sözleşmesi <1972 UT1 ile uyumlu). DE440 dosyası GEREKMEZ.
// İLERLETİLMİŞ ANDA: doğum anı (sağlayıcıya gönderilen gövdedeki yerel saat − ofset) + geçen yıl × 1 gün; geçen yıl = (hedef tarih −
// yerel doğum tarihi) / 365,2422 (sağlayıcı sözleşmesi; 500/500 yanıtta ≤ 1,4e-6 yıl). Doğrulama (500 ilerletilmiş an, 1940–2026):
// Swiss SE_MEAN_NODE ile ≤ 0,28″, Simon vd. 1994 + Skyfield IAU 2000A ile ≤ 0,32″ (tolerans 5″; fark Δψ serisinin kısaltılmasından). Gerçek düğüm DEĞİŞMEZ (sağlayıcı).
//
// F2 — KUTUP EVLERİ. Sağlayıcının `planets[].house` alanı natal Placidus evidir; doğum yeri kutup dairesi ötesindeyse (|enlem| > 66,5°;
// Placidus |φ| > 90° − ε'da tanımsız) sağlayıcı sessizce TAM BURÇ evlerine geçiyor (Tromsø 69,65°: 2/2 yanıtta 14/14 tam burç, Placidus
// hesaplanamaz). Bu enlemde natal ev sütunu sağlayıcı değerinden VERİLMEZ (house = null); natal ev ancak kayıtlı Tam burç / Eşit ev
// natal çerçevesinden gösterilir. Eşik ürünün natal kutup engeliyle AYNI (POLAR_HOUSE_LATITUDE = 66,5°).

import { SIGN_IDS, type SignId } from "./model/western";
import * as Astronomy from "astronomy-engine";
import { ephemerisTime, isTimeScalesError, scalesFromUtc } from "./time";
import { PROGRESSION_POLAR_LATITUDE } from "./progressionNodesText";

export const MEAN_NODE_METHOD = "meeus-47.7+dpsi" as const;
const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.2422;

/** Sağlayıcıya gönderilen /astrology/progressions gövdesinin hesapta kullanılan alanları. */
export type ProgressionRequestFrame = { date: string; time: string; timezone: number; latitude: number; targetDate: string };

export function progressionRequestFrame(body: Record<string, unknown> | null | undefined): ProgressionRequestFrame | null {
  if (!body) return null;
  const { date, time, timezone, latitude, targetDate } = body as Record<string, unknown>;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
  if (typeof targetDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  if (typeof timezone !== "number" || !Number.isFinite(timezone) || typeof latitude !== "number" || !Number.isFinite(latitude)) return null;
  return { date, time: time.length === 5 ? `${time}:00` : time, timezone, latitude, targetDate };
}

/** İlerletilmiş an (UTC ms) ve geçen yıl — doğum anı + (hedef − yerel doğum tarihi)/365,2422 gün. */
export function progressedInstant(f: ProgressionRequestFrame): { ms: number; elapsedYears: number } | null {
  const birthMs = Date.parse(`${f.date}T${f.time}Z`) - f.timezone * 3_600_000;
  const days = (Date.parse(`${f.targetDate}T00:00:00Z`) - Date.parse(`${f.date}T00:00:00Z`)) / DAY_MS;
  if (!Number.isFinite(birthMs) || !Number.isFinite(days)) return null;
  const elapsedYears = days / YEAR_DAYS;
  return { ms: birthMs + elapsedYears * DAY_MS, elapsedYears };
}

const norm = (x: number) => ((x % 360) + 360) % 360;
const HOUR_MS = 3_600_000;
const J2000_TT_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/** TT (ms) — ortak zaman katmanı; aralık dışında (ΔT tablosu) null. */
function ttMsOf(ms: number): number | null {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  return isTimeScalesError(s) ? null : s.ttMs;
}

/** Ortalama çıkış düğümü, tarihin GERÇEK ekinoksu: Meeus 47.7 Ω (T = TT Jülyen yüzyılı) + Δψ. */
export function meanNodeLongitude(ms: number): number | null {
  const ttMs = ttMsOf(ms);
  if (ttMs === null) return null;
  const T = (ttMs - J2000_TT_MS) / 86_400_000 / 36525;
  const om = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000;
  const dpsiArcsec = Astronomy.e_tilt(ephemerisTime({ ttMs })).dpsi;
  return norm(om + dpsiArcsec / 3600);
}

/** Boylam hızı (°/gün, TT): ±1 saat merkezi fark (pro/ephemeris localSpeed ile aynı tanım). */
function meanNodeSpeed(ms: number): number | null {
  const a = meanNodeLongitude(ms - HOUR_MS);
  const b = meanNodeLongitude(ms + HOUR_MS);
  const ta = ttMsOf(ms - HOUR_MS);
  const tb = ttMsOf(ms + HOUR_MS);
  if (a === null || b === null || ta === null || tb === null) return null;
  return ((((b - a + 540) % 360) - 180) / (tb - ta)) * 86_400_000;
}
const pointOf = (lon: number): { longitude: number; sign: SignId; degreeInSign: number } => {
  const l = norm(lon);
  return { longitude: l, sign: SIGN_IDS[Math.floor(l / 30) % 12] as SignId, degreeInSign: l % 30 };
};

export type LocalMeanNodes = {
  north: { longitude: number; sign: SignId; degreeInSign: number; speed: number; retrograde: boolean };
  south: { longitude: number; sign: SignId; degreeInSign: number; speed: number; retrograde: boolean };
  instantUtc: string;
};

/** İlerletilmiş anda ortalama Kuzey/Güney düğüm (tropikal, tarihin gerçek ekinoksu). Yerel efemeris aralığı dışında null. */
export function progressedMeanNodes(f: ProgressionRequestFrame): LocalMeanNodes | null {
  const p = progressedInstant(f);
  if (!p) return null;
  const lon = meanNodeLongitude(p.ms);
  const speed = meanNodeSpeed(p.ms);
  if (lon === null || speed === null || !Number.isFinite(lon) || !Number.isFinite(speed)) return null;
  const retrograde = speed < 0;
  return {
    north: { ...pointOf(lon), speed, retrograde },
    south: { ...pointOf(lon + 180), speed, retrograde },
    instantUtc: new Date(p.ms).toISOString(),
  };
}

export const isPolarProgressionLatitude = (latitude: number) => Math.abs(latitude) > PROGRESSION_POLAR_LATITUDE;

export { PROGRESSION_POLAR_LATITUDE };
