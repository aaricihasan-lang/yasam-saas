// Gökyüzü Atlası — PROFESYONEL EV SİSTEMLERİ motoru (SAF; ÜRÜNE BAĞLI DEĞİL — hiçbir route/ekran import etmez).
//
// Sistemler: Regiomontanus · Campanus · Porphyry · Alcabitius. Sağlayıcı (Roxy) yalnız placidus / whole-sign / equal / koch
// sunar (OpenAPI 2.0.0); bu dört sistem YEREL küresel trigonometriyle hesaplanır. Placidus/Koch ya da başka bir sistem
// SESSİZCE yerine konmaz; hesap tanımsızsa `ProHouseError` döner.
//
// Tanımlar (ayrıntı + kaynak: docs/astrology/pro/ev-sistemleri.md):
//   • Regiomontanus (Tabulae directionum, 1467): ev daireleri ufkun kuzey/güney noktalarından geçer ve GÖK EKVATORUNU
//     meridyenden başlayarak 30°'lik eşit yaylara böler. Mevcut Lilly motorundaki (lib/astrology/horary/western/houses.ts)
//     uygulama AYNEN yeniden kullanılır (tek kaynak; ayrı kopya YOK).
//   • Campanus (Campanus of Novara, 13. yy): aynı daire ailesi (kuzey/güney ufuk noktalarından geçen büyük daireler), ama eşit
//     bölünen daire İLK DİKEY'dir (prime vertical: doğu noktası–başucu–batı noktası). Ev 11 dairesi ilk dikeyde başucundan 30°
//     doğuda (irtifa 60°), ev 12 irtifa 30°, ev 1 doğu noktası (ufuk = ASC).
//     Uygulama: ev dairesi = span(ufkun kuzey–güney ekseni, ilk dikey noktası) düzlemi; ekliptik düzlemiyle kesişimi (vektör).
//     İkinci, bağımsız uygulama (crosscheck.ts): kapalı formül — kutup yüksekliği sin φₖ = cos α · sin φ, ekvator kesişiminin
//     meridyenden doğuya kaydırması 90° − atan(tan α / cos φ) (α = ilk dikeydeki irtifa) ve "kutup φₖ'de doğan nokta".
//   • Porphyry (Porphyrius, Eisagoge, 3. yy): ASC–MC (ve IC–DSC) kadranlarının EKLİPTİK boylamı üç eşit parçaya bölünür.
//   • Alcabitius (al-Qabīṣī, 10. yy): ASC derecesinin gündüz yarım yayı (DSA) ekvator üzerinde (sağ açıklıkta) üçe bölünür;
//     bölüm noktaları SAAT DAİRELERİYLE (gök kutbundan geçen daireler) ekliptiğe taşınır. Gece yarım yayı (180° − DSA) 2. ve 3.
//     ev için aynı biçimde.
//
// Geçerlilik: |φ| ≥ 90° − ε (kutup daireleri) bölgesinde ASC/MC sıçrar, MC ufkun altına inebilir ve Regiomontanus/Campanus'ta
// MC↔IC takası, saat yönünde ev düzeni gibi EKOL KARARI gerektiren durumlar oluşur (Swiss Ephemeris belgesi §6.4). Bu motor
// orada HİÇBİR sistemi hesaplamaz → { error: "polar_latitude" }. 60° üstünde evler aşırı eşitsizleşir → uyarı.
//
// Kaynak/lisans: yalnız küresel trigonometri + astronomy-engine 2.1.19 (MIT; mevcut bağımlılık) yıldız zamanı ve gerçek eğiklik.
// Swiss Ephemeris / AGPL kod YOK; pyswisseph yalnız TEST REFERANSI olarak depo dışında kullanıldı (fixture değerleri).

import { ascendantOf, houseOf as lillyHouseOf, midheavenOf, n360, polarLimit, regiomontanusCusps, skyFrameAt, type SkyFrame } from "../../horary/western/houses";

export const PRO_HOUSE_SYSTEMS = ["regiomontanus", "campanus", "porphyry", "alcabitius"] as const;
export type ProHouseSystem = (typeof PRO_HOUSE_SYSTEMS)[number];

export const PRO_HOUSES_ENGINE_VERSION = "pro-houses-1.0.0" as const;

/** Saf geometri girdisi: RAMC (derece), gerçek eğiklik ε (derece), coğrafi enlem φ (derece, kuzey +). */
export type HouseFrameInput = { ramc: number; obliquity: number; latitude: number };

export type ProHouseErrorCode = "invalid_input" | "polar_latitude";
export type ProHouseError = { ok: false; system: ProHouseSystem; error: ProHouseErrorCode; detail: string };
export type ProHouseWarning = "high_latitude" | "near_polar_limit";
export type ProHouses = {
  ok: true;
  system: ProHouseSystem;
  /** 12 cusp, indeks 0 = 1. ev; hepsi [0, 360). cusps[0] = ASC, cusps[9] = MC (dört sistemin hepsinde). */
  cusps: number[];
  asc: number;
  mc: number;
  frame: HouseFrameInput;
  warnings: ProHouseWarning[];
  engine: typeof PRO_HOUSES_ENGINE_VERSION;
};
export type ProHousesResult = ProHouses | ProHouseError;

const R = Math.PI / 180;
/** 60° üstü: kadranlar aşırı eşitsiz (ör. 65°'te bazı evler < 3°). Yalnız uyarı. */
export const HIGH_LATITUDE_WARN = 60;
/** Kutup sınırına 1°'den yakın: ASC zamanla çok hızlı değişir (saat belirsizliği büyür). */
export const NEAR_POLAR_MARGIN = 1;

/** Eklipikteki bir noktanın (boylam λ, enlem 0) sağ açıklığı ve dik açıklığı. */
export function eclToEq(lon: number, obliquity: number): { ra: number; dec: number } {
  const l = lon * R;
  const e = obliquity * R;
  return { ra: n360(Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) / R), dec: Math.asin(Math.sin(e) * Math.sin(l)) / R };
}
/** Saat dairesi izdüşümü: sağ açıklığı `ra` olan saat dairesinin ekliptiği kestiği (aynı yarıdaki) boylam. */
export const lonOnHourCircle = (ra: number, obliquity: number) => midheavenOf(ra, obliquity);

/** Kuzey/güney ufuk noktalarından geçen, ilk dikeyde irtifası `alt` (doğu yarısı) olan ev dairesinin ekliptik kesişimi.
 *  Ufuk koordinatları (D = doğu, K = kuzey, Y = başucu) → ekvator koordinatları. Dönüş: dairenin "doğu–başucu" yarısındaki
 *  (alt < 0 ise doğu–ayakucu) kesişim boylamı. */
function campanusCircle(alt: number, ramc: number, latitude: number, obliquity: number): number {
  const f = latitude * R;
  const t = ramc * R;
  const e = obliquity * R;
  // Ekvator kartezyen tabanında yerel eksenler: başucu Y = (RA = RAMC, dek = φ); doğu D = (RA = RAMC + 90°, dek = 0); K = Y × D yönü değil, K = D × Y.
  const Y = [Math.cos(f) * Math.cos(t), Math.cos(f) * Math.sin(t), Math.sin(f)];
  const D = [-Math.sin(t), Math.cos(t), 0];
  const K = [D[1] * Y[2] - D[2] * Y[1], D[2] * Y[0] - D[0] * Y[2], D[0] * Y[1] - D[1] * Y[0]];
  const a = alt * R;
  const P = [0, 1, 2].map((i) => Math.cos(a) * D[i] + Math.sin(a) * Y[i]);
  // Ev dairesi düzlemi = span(K, P) → normal = K × P. Ekliptik normali = (0, −sin ε, cos ε).
  const nH = [K[1] * P[2] - K[2] * P[1], K[2] * P[0] - K[0] * P[2], K[0] * P[1] - K[1] * P[0]];
  const nE = [0, -Math.sin(e), Math.cos(e)];
  const d = [nH[1] * nE[2] - nH[2] * nE[1], nH[2] * nE[0] - nH[0] * nE[2], nH[0] * nE[1] - nH[1] * nE[0]];
  // P, K'ye diktir → yarı seçimi doğrudan P yönüyle.
  const s = d[0] * P[0] + d[1] * P[1] + d[2] * P[2] >= 0 ? 1 : -1;
  const x = d[0] * s;
  const y = d[1] * s;
  const z = d[2] * s;
  return n360(Math.atan2(y * Math.cos(e) + z * Math.sin(e), x) / R);
}

function validate(system: ProHouseSystem, f: HouseFrameInput): ProHouseError | null {
  const bad = (detail: string): ProHouseError => ({ ok: false, system, error: "invalid_input", detail });
  if (!PRO_HOUSE_SYSTEMS.includes(system)) return bad("bilinmeyen ev sistemi");
  if (![f.ramc, f.obliquity, f.latitude].every(Number.isFinite)) return bad("RAMC/eğiklik/enlem sayı değil");
  if (Math.abs(f.latitude) > 90) return bad("enlem −90…+90 dışında");
  // −10.000…+10.000 yıl için ε ≈ 22,0°–24,6°; dışı hatalı girdi kabul edilir.
  if (f.obliquity < 21 || f.obliquity > 25) return bad("eğiklik 21°–25° dışında");
  if (Math.abs(f.latitude) >= polarLimit(f.obliquity)) {
    return { ok: false, system, error: "polar_latitude", detail: `|enlem| ${Math.abs(f.latitude).toFixed(4)}° ≥ ${polarLimit(f.obliquity).toFixed(4)}° (90° − ε): kutup bölgesinde ev sistemi tanımı ekol kararı gerektirir` };
  }
  return null;
}

function finish(system: ProHouseSystem, f: HouseFrameInput, cusps: number[]): ProHouses {
  const warnings: ProHouseWarning[] = [];
  if (Math.abs(f.latitude) > HIGH_LATITUDE_WARN) warnings.push("high_latitude");
  if (polarLimit(f.obliquity) - Math.abs(f.latitude) < NEAR_POLAR_MARGIN) warnings.push("near_polar_limit");
  const c = cusps.map(n360);
  return { ok: true, system, cusps: c, asc: c[0], mc: c[9], frame: { ...f, ramc: n360(f.ramc) }, warnings, engine: PRO_HOUSES_ENGINE_VERSION };
}

const fillOpposites = (c: number[]) => {
  for (const h of [4, 5, 6, 7, 8, 9]) c[h - 1] = n360(c[(h + 5) % 12] + 180);
  return c;
};

/** Ana giriş: saf geometriden 12 cusp. */
export function computeHousesFromFrame(system: ProHouseSystem, frame: HouseFrameInput): ProHousesResult {
  const err = validate(system, frame);
  if (err) return err;
  const { ramc, obliquity: eps, latitude: phi } = frame;
  const asc = ascendantOf(ramc, phi, eps);
  const mc = midheavenOf(ramc, eps);
  const c: number[] = new Array(12);
  c[0] = asc;
  c[9] = mc;
  switch (system) {
    case "regiomontanus": {
      const r = regiomontanusCusps(ramc, phi, eps);
      if (!Array.isArray(r)) return { ok: false, system, error: "polar_latitude", detail: r.detail };
      return finish(system, frame, r);
    }
    case "campanus": {
      c[10] = campanusCircle(60, ramc, phi, eps);
      c[11] = campanusCircle(30, ramc, phi, eps);
      c[1] = campanusCircle(-30, ramc, phi, eps);
      c[2] = campanusCircle(-60, ramc, phi, eps);
      break;
    }
    case "porphyry": {
      const q1 = n360(asc - mc); // MC → ASC (10 → 1)
      const q2 = 180 - q1; // ASC → IC (1 → 4)
      c[10] = mc + q1 / 3;
      c[11] = mc + (2 * q1) / 3;
      c[1] = asc + q2 / 3;
      c[2] = asc + (2 * q2) / 3;
      break;
    }
    case "alcabitius": {
      const { dec } = eclToEq(asc, eps);
      // DSA: dik açıklığı δ olan noktanın gündüz yarım yayı; |tan φ tan δ| < 1 kutup sınırı içinde garanti.
      const dsa = Math.acos(-Math.tan(phi * R) * Math.tan(dec * R)) / R;
      const nsa = 180 - dsa;
      c[10] = lonOnHourCircle(ramc + dsa / 3, eps);
      c[11] = lonOnHourCircle(ramc + (2 * dsa) / 3, eps);
      c[1] = lonOnHourCircle(ramc + dsa + nsa / 3, eps);
      c[2] = lonOnHourCircle(ramc + dsa + (2 * nsa) / 3, eps);
      break;
    }
  }
  return finish(system, frame, fillOpposites(c));
}

/** UTC an + coğrafi konum → çerçeve (astronomy-engine GAST + gerçek eğiklik; Lilly motoruyla AYNI `skyFrameAt`).
 *
 * ZAMAN ÖLÇEĞİ: astronomy-engine verilen anı UT1 kabul eder. Sivil saat (1972 sonrası) UTC'dir ve |UT1 − UTC| ≤ 0,9 sn →
 * RAMC'de en fazla ≈ 13,5″ (ASC'de enleme göre ≈ 40″'e kadar) fark. Bu fark doğum saatinin dakika çözünürlüğünün (15′ RAMC)
 * çok altındadır; yine de bilinen DUT1 (IERS Bülten A/B) `dut1Seconds` ile verilebilir: UT1 = UTC + DUT1. Verilmezse 0
 * (Lilly motorunun davranışı) ve sonuçta `timeScale: "utc_as_ut1"` işareti döner. */
export type HousesAtOptions = { dut1Seconds?: number };
export function computeHousesAt(system: ProHouseSystem, utcMs: number, latitude: number, longitude: number, opts: HousesAtOptions = {}): ProHousesResult & { sky?: SkyFrame; timeScale?: "utc_as_ut1" | "ut1_from_dut1" } {
  const dut1 = opts.dut1Seconds ?? 0;
  if (!Number.isFinite(dut1) || Math.abs(dut1) > 1) return { ok: false, system, error: "invalid_input", detail: "DUT1 |x| ≤ 1 sn olmalı" };
  const sky = skyFrameAt(utcMs + dut1 * 1000, latitude, longitude);
  if ("error" in sky) return { ok: false, system, error: "invalid_input", detail: sky.detail };
  const r = computeHousesFromFrame(system, { ramc: sky.ramc, obliquity: sky.obliquity, latitude });
  return { ...r, sky, timeScale: opts.dut1Seconds === undefined ? "utc_as_ut1" : "ut1_from_dut1" };
}

// ─── Gezegen ev yerleşimi ───────────────────────────────────────────────────────────────────────

export type HousePlacement = {
  id: string;
  lon: number;
  /** Geometrik ev (cusp kendi evine dahil; saat yönünün tersine). Lilly motoruyla aynı `houseOf`. */
  house: number;
  /** Evin başlangıç cusp'ından ileri uzaklık (derece). */
  fromCusp: number;
  /** Bir sonraki cusp'a kalan (derece). */
  toNextCusp: number;
  /** Cusp'a `tolerance` dereceden yakın → konum/zaman belirsizliği evi değiştirebilir. */
  nearCusp: boolean;
};

/** Varsayılan sınır toleransı: astronomy-engine konum hatası ~20″ (ölçülmüş, docs) → 30″ güvenlik payı. */
export const DEFAULT_CUSP_TOLERANCE_DEG = 30 / 3600;

export function placeBodies(cusps: readonly number[], bodies: readonly { id: string; lon: number }[], tolerance = DEFAULT_CUSP_TOLERANCE_DEG): HousePlacement[] {
  if (cusps.length !== 12 || !cusps.every(Number.isFinite)) throw new Error("12 sonlu cusp gerekli");
  return bodies.map((b) => {
    const lon = n360(b.lon);
    const house = lillyHouseOf(lon, cusps);
    const fromCusp = n360(lon - cusps[house - 1]);
    const toNextCusp = n360(cusps[house % 12] - lon);
    return { id: b.id, lon, house, fromCusp, toNextCusp, nearCusp: Math.min(fromCusp, toNextCusp) <= tolerance };
  });
}

// ─── Doğum saati belirsizliği (güven işareti) ───────────────────────────────────────────────────

export type TimeSensitivity = {
  minutes: number;
  /** Her cusp için [t − Δ, t + Δ] uç değerleri arasındaki en büyük kayma (derece). */
  maxCuspShift: number;
  /** Δ içinde evi değişen gövdeler. */
  unstableBodies: { id: string; houses: number[] }[];
  ok: boolean;
};

/** Doğum saati ±`minutes` belirsizken (yalnız RAMC değişir: 15,04°/saat), cusp kayması ve ev değiştiren gövdeler.
 *  Gövde boylamları sabit kabul edilir (Ay için 2 dk'da ~1′; nearCusp toleransı bu farkı kapsamaz → not docs'ta). */
export function timeSensitivity(system: ProHouseSystem, utcMs: number, latitude: number, longitude: number, bodies: readonly { id: string; lon: number }[], minutes: number): TimeSensitivity {
  const steps = 8;
  const results: ProHouses[] = [];
  for (let i = 0; i <= steps; i++) {
    const r = computeHousesAt(system, utcMs + ((i / steps) * 2 - 1) * minutes * 60_000, latitude, longitude);
    if (!r.ok) return { minutes, maxCuspShift: NaN, unstableBodies: [], ok: false };
    results.push(r);
  }
  let maxCuspShift = 0;
  for (let k = 0; k < 12; k++) {
    const a = results[0].cusps[k];
    for (const r of results) maxCuspShift = Math.max(maxCuspShift, Math.abs(((r.cusps[k] - a + 540) % 360) - 180));
  }
  const unstableBodies: { id: string; houses: number[] }[] = [];
  for (const b of bodies) {
    const hs = [...new Set(results.map((r) => lillyHouseOf(n360(b.lon), r.cusps)))];
    if (hs.length > 1) unstableBodies.push({ id: b.id, houses: hs.sort((x, y) => x - y) });
  }
  return { minutes, maxCuspShift, unstableBodies, ok: true };
}
