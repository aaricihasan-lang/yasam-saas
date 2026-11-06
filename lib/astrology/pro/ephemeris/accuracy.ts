// Gökyüzü Atlası — PROFESYONEL EFEMERİS: ÖLÇÜLMÜŞ doğruluk sınırları + alan kaynak matrisi + gösterim hassasiyeti (SAF).
//
// Değerler TAHMİN DEĞİL, 2026-10-31 ölçümüdür (bağımsız referans skyfield 1.55 + JPL DE440, 188 an × 12 cisim; sağlayıcı için 160 gerçek
// çağrı). Ayrıntı ve yeniden üretim: docs/astrology/pro/profesyonel-efemeris.md §4, QA kanıtı kanit/wt03/. Sınırlar ölçülen en büyük
// farkın üstüne yuvarlanmış güvenli üst sınırdır (yay saniyesi). Gösterim kuralı (`precisionFor`):
//   üst sınır ≤ 1″  → saniye ("arcsec");  ≤ 3″ → 0,1′ ("tenth_arcmin");  aksi → dakika ("arcmin", yuvarlama sınırında ±1′).

import { proEphemerisEngine, type PositionEngine } from "./flags";
import type { DisplayPrecision, EphemerisBody, EphemerisField, EphemerisSource } from "./types";

export type EraBand = "1600-1799" | "1800-2100" | "2101-2600";
export const eraOf = (year: number): EraBand => (year < 1800 ? "1600-1799" : year <= 2100 ? "1800-2100" : "2101-2600");

type Lim = { lon: number; lat: number; radec: number; speed: number };
const L = (lon: number, lat: number, radec: number, speed: number): Lim => ({ lon, lat, radec, speed });

/** Gerçek düğüm hız sınırı (″/gün) — DE440 oskülasyon düğümünün ±1 sa farkına göre ölçülür (harness). */
const NODE_SPEED = { a: 7, b: 7, c: 7 } as const; // ölçü: 5,8 / 5,4 / 5,0 ″/gün

/** YEREL (astronomy-engine + bu modülün ΔT tablosu) — ölçülen en büyük fark (DE440) + 1″ (konum) / ×1,2 (hız), yukarı yuvarlak. */
export const LOCAL_LIMITS: Readonly<Record<EraBand, Partial<Record<EphemerisBody, Lim>>>> = {
  "1600-1799": {
    sun: L(3, 8, 8, 0.2), moon: L(37, 3, 33, 1.2), mercury: L(9, 16, 16, 1.8), venus: L(7, 22, 22, 0.7), mars: L(4, 8, 7, 0.2), jupiter: L(7, 6, 7, 3.1),
    saturn: L(6, 10, 9, 0.2), uranus: L(13, 7, 14, 0.1), neptune: L(4, 14, 14, 0.1), pluto: L(31, 10, 31, 0.1), mean_node: L(1, 0, 0, 0.1), true_node: L(23, 0, 0, NODE_SPEED.a),
  },
  "1800-2100": {
    sun: L(3, 3, 3, 0.3), moon: L(11, 3, 11, 1.8), mercury: L(8, 10, 9, 1.8), venus: L(22, 9, 22, 0.9), mars: L(9, 14, 13, 0.3), jupiter: L(8, 10, 10, 0.2),
    saturn: L(12, 23, 20, 0.3), uranus: L(13, 19, 19, 0.2), neptune: L(19, 11, 17, 0.6), pluto: L(21, 5, 20, 0.2), mean_node: L(1, 0, 0, 0.1), true_node: L(18, 0, 0, NODE_SPEED.b),
  },
  "2101-2600": {
    sun: L(3, 13, 13, 0.3), moon: L(53, 9, 53, 2.0), mercury: L(14, 27, 28, 3.7), venus: L(9, 25, 21, 0.4), mars: L(12, 11, 13, 0.4), jupiter: L(7, 17, 16, 0.2),
    saturn: L(13, 19, 19, 0.2), uranus: L(18, 17, 16, 9.3), neptune: L(17, 10, 16, 0.2), pluto: L(44, 10, 39, 0.2), mean_node: L(1, 0, 0, 0.1), true_node: L(44, 0, 0, NODE_SPEED.c),
  },
};

/** YEREL — JPL DE440 konum motoru (03.11.2026): VERİLEN TT ANINDA konum hatası üst sınırı (yay saniyesi; hız ″/gün).
 *  Ölçü (scripts/astrology/pro-ephemeris-de440.harness.ts; docs/astrology/pro/de440-konum-motoru.md): bağımsız Swiss Ephemeris
 *  SWIEPH (DE431 tabanlı dosyalar, ayrı indirgeme kodu), JPL Horizons astrometrik α/δ (DE441, JPL yazılımı) ve skyfield 1.55
 *  (DE440, ayrı kod) — en büyük fark güvenli üst sınıra yuvarlandı. ΔT (UT ↔ TT) belirsizliği BU SINIRA DAHİL DEĞİLDİR; ayrı
 *  terimdir (`deltaTUncertaintySec`) ve gösterim hassasiyeti ile olay belirsizliğine AYRICA eklenir. */
// Ölçülen en büyük farklar (″; 384 an, 1600–2600): gezegen/Güneş boylam ≤0,006, enlem ≤0,015 (2101+), hız ≤0,06″/gün (Güneş'e <2°
// yakın kavuşum anı hariç: orada referansın hız tanımı ışık bükülmesi türevini içermez); Ay boylam 0,016 (1800–2100), 0,049 (2101+),
// 0,171 (1600–1799: DE440 ↔ DE431/DE441 Ay farkı — veri kaynakları arası GERÇEK belirsizlik), Ay hızı ≤0,35″/gün (±1 sa merkezi fark);
// ortalama düğüm (Meeus formülü, DE440'tan bağımsız) 0,23 / 0,16 / 1,24; gerçek düğüm ≤0,11.
const de440Band = (moon: number, meanNode: number): Partial<Record<EphemerisBody, Lim>> => ({
  sun: L(0.1, 0.1, 0.1, 0.1), moon: L(moon, 0.1, moon, 0.5), mercury: L(0.1, 0.1, 0.1, 0.1), venus: L(0.1, 0.1, 0.1, 0.1), mars: L(0.1, 0.1, 0.1, 0.1),
  jupiter: L(0.1, 0.1, 0.1, 0.1), saturn: L(0.1, 0.1, 0.1, 0.1), uranus: L(0.1, 0.1, 0.1, 0.1), neptune: L(0.1, 0.1, 0.1, 0.1), pluto: L(0.1, 0.1, 0.1, 0.1),
  mean_node: L(meanNode, 0, 0, 0.1), true_node: L(0.5, 0, 0, 1),
});
export const DE440_LIMITS: Readonly<Record<EraBand, Partial<Record<EphemerisBody, Lim>>>> = {
  "1600-1799": de440Band(0.3, 1),
  "1800-2100": de440Band(0.1, 1),
  "2101-2600": de440Band(0.1, 1.5),
};

/** Etkin yerel konum motorunun sınırları (eski motor: LOCAL_LIMITS — değerleri DEĞİŞMEDİ). */
export const localLimits = (era: EraBand, engine: PositionEngine = proEphemerisEngine()) => (engine === "de440" ? DE440_LIMITS[era] : LOCAL_LIMITS[era]);

// ─── ΔT (TT − UT) belirsizliği — konum hatasından AYRI terim ──────────────────────────────────────────
// Satır ve olay anları UTC/UT ile verilir; konum TT'de hesaplanır. 1961-01-01 – 2027-06-28: TT, UTC'den KESİN (artık saniye tablosu)
// → 0 s. Öncesi ve sonrası ΔT modelden (lib/astrology/time/deltaT.ts) gelir; belirsizlik bilinçli olarak GENİŞ tutulmuş bir üst sınırdır:
//   • 1955–1961: 1 s (ΔT gözlemsel; sivil saat = UT kabulü).
//   • 1955 öncesi: 1 + 1,6·((1955 − yıl)/100)² s — Morrison & Stephenson (2004, JHA 35:327) uzun dönem biçimi (0,8·t² s) iki katına
//     çıkarılmış ve 1955'ten başlatılmış: ΔT tablosu ↔ Swiss Ephemeris ΔT farkı (1600: 18,8 s) kapsansın (1600 ≈ 21 s, 1800 ≈ 4,8 s).
//   • 2027-06-28 sonrası (öngörü): 1 + 0,5·Δy + 0,01·Δy² s, Δy = 2027-06-28'den yıl (2055 ≈ 22 s, 2100 ≈ 90 s, 2150 ≈ 213 s,
//     2600 ≈ 1 sa). Gerekçe: Yer dönüş hızındaki on yıllık dalgalanma ΔT eğiminde ±0,5 s/yıl mertebesinde belirsizlik bırakır; geçmiş
//     uzun dönem öngörüleri 25 yılda 5–45 s saptı.
const MS_1955 = Date.UTC(1955, 0, 1);
const MS_1961 = Date.UTC(1961, 0, 1);
const MS_2027_06_28 = Date.UTC(2027, 5, 28);
const YEAR_MS = 365.25 * 86_400_000;
export function deltaTUncertaintySec(ms: number): number {
  if (ms >= MS_1961 && ms < MS_2027_06_28) return 0;
  if (ms >= MS_1955 && ms < MS_1961) return 1;
  if (ms < MS_1955) {
    const c = (MS_1955 - ms) / YEAR_MS / 100;
    return 1 + 1.6 * c * c;
  }
  const dy = (ms - MS_2027_06_28) / YEAR_MS;
  return 1 + 0.5 * dy + 0.01 * dy * dy;
}

/** ΔT belirsizliğinin konuma yansıması: cisim başına en büyük hız (″/s) ve hız değişimi (″/gün bölü s; hız sütunu için). */
const MAX_SPEED_ARCSEC_PER_SEC: Readonly<Record<EphemerisBody, number>> = {
  sun: 0.043, moon: 0.65, mercury: 0.093, venus: 0.053, mars: 0.034, jupiter: 0.011, saturn: 0.0056, uranus: 0.003, neptune: 0.0018, pluto: 0.0018, mean_node: 0.0023, true_node: 0.072,
};
const MAX_ACC_ARCSEC_PER_DAY_PER_SEC: Readonly<Record<EphemerisBody, number>> = {
  sun: 0.0001, moon: 0.026, mercury: 0.0085, venus: 0.0021, mars: 0.0013, jupiter: 0.0002, saturn: 0.0001, uranus: 0.0001, neptune: 0.0001, pluto: 0.0001, mean_node: 0, true_node: 0.013,
};
/** UT ile verilen bir anda ΔT belirsizliğinin alan hatasına katkısı (″ ya da hız için ″/gün). */
export function deltaTPositionArcsec(body: EphemerisBody, field: EphemerisField, sigmaSec: number): number {
  if (sigmaSec <= 0) return 0;
  return field === "speed" ? MAX_ACC_ARCSEC_PER_DAY_PER_SEC[body] * sigmaSec : MAX_SPEED_ARCSEC_PER_SEC[body] * sigmaSec;
}

/** SAĞLAYICI (/astrology/planets, 00:00 UT) — boylam ve enlem, DE440'a göre (düğüm: DE440 oskülasyon / ortalama düğüm formülü).
 *  Hız sağlayıcıdan ALINMAZ (sağlayıcı hızı ±1 GÜN merkezi farktır, anlık hız değil; Ay'da 117″/gün) → yerel anlık hız kullanılır.
 *  RA/dek sağlayıcı boylam+enleminden yerel kesin dönüşümle türetilir (eğiklik hatası <0,1″ → sınır boylam sınırına eşit alınır). */
export const PROVIDER_LIMITS: Readonly<Record<EraBand, Partial<Record<EphemerisBody, { lon: number; lat: number }>>>> = {
  "1600-1799": { sun: { lon: 1, lat: 0.1 }, moon: { lon: 13, lat: 1 }, mercury: { lon: 1.4, lat: 0.2 }, venus: { lon: 1.1, lat: 0.2 }, mars: { lon: 0.7, lat: 0.1 }, jupiter: { lon: 0.2, lat: 0.1 }, saturn: { lon: 0.1, lat: 0.1 }, uranus: { lon: 0.1, lat: 0.1 }, neptune: { lon: 0.1, lat: 0.1 }, pluto: { lon: 0.1, lat: 0.1 }, mean_node: { lon: 0.3, lat: 0 }, true_node: { lon: 0.2, lat: 0 } },
  "1800-2100": { sun: { lon: 0.2, lat: 0.1 }, moon: { lon: 2.1, lat: 0.2 }, mercury: { lon: 0.4, lat: 0.1 }, venus: { lon: 0.2, lat: 0.1 }, mars: { lon: 0.2, lat: 0.1 }, jupiter: { lon: 0.1, lat: 0.1 }, saturn: { lon: 0.1, lat: 0.1 }, uranus: { lon: 0.1, lat: 0.1 }, neptune: { lon: 0.1, lat: 0.1 }, pluto: { lon: 0.1, lat: 0.1 }, mean_node: { lon: 0.2, lat: 0 }, true_node: { lon: 0.1, lat: 0 } },
  "2101-2600": { sun: { lon: 18, lat: 0.1 }, moon: { lon: 234, lat: 18 }, mercury: { lon: 28, lat: 3.5 }, venus: { lon: 22, lat: 1.3 }, mars: { lon: 14, lat: 0.3 }, jupiter: { lon: 4, lat: 0.1 }, saturn: { lon: 2, lat: 0.1 }, uranus: { lon: 1, lat: 0.1 }, neptune: { lon: 0.7, lat: 0.1 }, pluto: { lon: 0.3, lat: 0.1 }, mean_node: { lon: 0.7, lat: 0 }, true_node: { lon: 3, lat: 0 } },
};

/** Ortalama ayanamsa ≤0,18″; gerçek ayanamsa (+Δψ, IAU 2000B ↔ SE nütasyonu) ≤0,35″ ölçüldü. Sidereal boylama eklenen sınır gerçek değerdir. */
export const AYANAMSA_LIMIT_ARCSEC = 0.4;
export const AYANAMSA_MEAN_LIMIT_ARCSEC = 0.2;
/** Olay anı belirsizliğine güvenlik payı: ölçülen fark/bildirilen-belirsizlik oranı 982 DE440 olayında en çok 1,21 (Merkür, istasyon
 *  yakını) çıktı; ×2 pay ile hepsi kapsanır. */
export const EVENT_UNCERTAINTY_FACTOR = 2;
/** DE440 motorunda olay anı belirsizliğine eklenen sayısal çözünürlük (ikiye bölme ≤1 s + saniyeye yuvarlama). */
export const EVENT_RESOLUTION_SEC = 1;

export const precisionFrom = (limitArcsec: number): DisplayPrecision => (limitArcsec <= 1 ? "arcsec" : limitArcsec <= 3 ? "tenth_arcmin" : "arcmin");

/** Bir alan için (kaynak, dönem, seçili cisimler) en kötü sınıra göre TEK sütun hassasiyeti. DE440 motorunda sayfadaki en büyük ΔT
 *  belirsizliğinin (s) konuma yansıması da eklenir (gereğinden ince basamak gösterilmez). */
export function precisionFor(field: EphemerisField, source: EphemerisSource, era: EraBand, bodies: readonly EphemerisBody[], sidereal: boolean, deltaTSigmaSec = 0): DisplayPrecision {
  if (field === "retro") return "arcmin";
  const engine = proEphemerisEngine();
  let worst = 0;
  for (const b of bodies) {
    const loc = localLimits(era, engine)[b];
    if (!loc) continue;
    let v: number;
    if (field === "speed") v = loc.speed;
    else if (source === "provider") {
      const p = PROVIDER_LIMITS[era][b] ?? { lon: Infinity, lat: Infinity };
      v = field === "lon" ? p.lon : field === "lat" ? p.lat : Math.max(p.lon, p.lat) + 0.1;
    } else v = field === "lon" ? loc.lon : field === "lat" ? loc.lat : loc.radec;
    if (field === "lon" && sidereal) v += AYANAMSA_LIMIT_ARCSEC;
    if (engine === "de440") v += deltaTPositionArcsec(b, field, deltaTSigmaSec);
    worst = Math.max(worst, v);
  }
  return precisionFrom(worst);
}

/** Olay anı belirsizliği (s): ingress = 2 × boylam sınırı / |hız|; istasyon = hız sınırı / |ivme|. DE440 motorunda `ms` verilirse
 *  ΔT belirsizliği (olay anı UT/UTC ile verildiği için) AYRI terim olarak eklenir. */
export function ingressUncertaintySec(body: EphemerisBody, era: EraBand, speedDegPerDay: number, source: EphemerisSource, ms?: number): number {
  const engine = proEphemerisEngine();
  const lim = source === "provider" ? PROVIDER_LIMITS[era][body]?.lon : localLimits(era, engine)[body]?.lon;
  if (lim === undefined || Math.abs(speedDegPerDay) < 1e-9) return Infinity;
  const pos = EVENT_UNCERTAINTY_FACTOR * (lim / 3600 / Math.abs(speedDegPerDay)) * 86_400;
  return engine === "de440" ? pos + EVENT_RESOLUTION_SEC + (ms === undefined ? 0 : deltaTUncertaintySec(ms)) : pos;
}

/** Alan kaynak matrisi (UI'daki "Kaynak ve zaman standardı" kutusu ve rapor bununla üretilir). */
export const FIELD_SOURCES: Readonly<Record<EphemerisSource, Readonly<Record<EphemerisField | "events" | "nodes" | "sidereal", string>>>> = {
  local: {
    lon: "Yerel astronomik motor: görünür geosantrik, gerçek ekliptik ve ekinoks",
    lat: "Yerel astronomik motor: ekliptik enlem",
    ra: "Yerel: boylam/enlemden gerçek eğiklikle kesin dönüşüm",
    dec: "Yerel: boylam/enlemden gerçek eğiklikle kesin dönüşüm",
    speed: "Yerel: ±1 saat merkezi fark (anlık hız)",
    retro: "Yerel: hızın işareti; |hız| < 2″/gün → durağan",
    events: "Yerel: işaret değişimi taraması + ikiye bölme (≤1 s); belirsizlik ölçülü konum hatasından",
    nodes: "Ortalama düğüm: Meeus 47.7 + nütasyon; gerçek düğüm: Ay durum vektöründen oskülasyon düğümü",
    sidereal: "Lahiri: 1956-03-21 tanım değeri + IAU 2006 presesyon; sidereal = tropikal − (ayanamsa + Δψ)",
  },
  provider: {
    lon: "Hesaplama altyapısı (sunucu): 00:00 UT tek an konum ucu",
    lat: "Hesaplama altyapısı (sunucu): ekliptik enlem",
    ra: "Yerel: sağlayıcı boylam/enleminden gerçek eğiklikle kesin dönüşüm",
    dec: "Yerel: sağlayıcı boylam/enleminden gerçek eğiklikle kesin dönüşüm",
    speed: "Yerel: ±1 saat merkezi fark (sağlayıcı hızı ±1 gün ortalaması olduğundan KULLANILMAZ)",
    retro: "Yerel hızın işareti",
    events: "Yerel motor (sağlayıcıda doğum verisiz istasyon ucu yok)",
    nodes: "Hesaplama altyapısı: seçilen düğüm türü (ortalama/gerçek)",
    sidereal: "Sağlayıcı tropikal boylam − yerel Lahiri gerçek ayanamsa",
  },
};
