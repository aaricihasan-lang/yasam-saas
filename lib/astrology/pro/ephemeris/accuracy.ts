// Gökyüzü Atlası — PROFESYONEL EFEMERİS: ÖLÇÜLMÜŞ doğruluk sınırları + alan kaynak matrisi + gösterim hassasiyeti (SAF).
//
// Değerler TAHMİN DEĞİL, 2026-10-31 ölçümüdür (bağımsız referans skyfield 1.55 + JPL DE440, 188 an × 12 cisim; sağlayıcı için 160 gerçek
// çağrı). Ayrıntı ve yeniden üretim: docs/astrology/pro/profesyonel-efemeris.md §4, QA kanıtı kanit/wt03/. Sınırlar ölçülen en büyük
// farkın üstüne yuvarlanmış güvenli üst sınırdır (yay saniyesi). Gösterim kuralı (`precisionFor`):
//   üst sınır ≤ 1″  → saniye ("arcsec");  ≤ 3″ → 0,1′ ("tenth_arcmin");  aksi → dakika ("arcmin", yuvarlama sınırında ±1′).

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

export const precisionFrom = (limitArcsec: number): DisplayPrecision => (limitArcsec <= 1 ? "arcsec" : limitArcsec <= 3 ? "tenth_arcmin" : "arcmin");

/** Bir alan için (kaynak, dönem, seçili cisimler) en kötü sınıra göre TEK sütun hassasiyeti. */
export function precisionFor(field: EphemerisField, source: EphemerisSource, era: EraBand, bodies: readonly EphemerisBody[], sidereal: boolean): DisplayPrecision {
  if (field === "retro") return "arcmin";
  let worst = 0;
  for (const b of bodies) {
    const loc = LOCAL_LIMITS[era][b];
    if (!loc) continue;
    let v: number;
    if (field === "speed") v = loc.speed;
    else if (source === "provider") {
      const p = PROVIDER_LIMITS[era][b] ?? { lon: Infinity, lat: Infinity };
      v = field === "lon" ? p.lon : field === "lat" ? p.lat : Math.max(p.lon, p.lat) + 0.1;
    } else v = field === "lon" ? loc.lon : field === "lat" ? loc.lat : loc.radec;
    if (field === "lon" && sidereal) v += AYANAMSA_LIMIT_ARCSEC;
    worst = Math.max(worst, v);
  }
  return precisionFrom(worst);
}

/** Olay anı belirsizliği (s): ingress = boylam sınırı / |hız|; istasyon = hız sınırı / |ivme|. */
export function ingressUncertaintySec(body: EphemerisBody, era: EraBand, speedDegPerDay: number, source: EphemerisSource): number {
  const lim = source === "provider" ? PROVIDER_LIMITS[era][body]?.lon : LOCAL_LIMITS[era][body]?.lon;
  if (lim === undefined || Math.abs(speedDegPerDay) < 1e-9) return Infinity;
  return EVENT_UNCERTAINTY_FACTOR * (lim / 3600 / Math.abs(speedDegPerDay)) * 86_400;
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
