// Astroloji AŞAMA 2.1 / 2.2 (2026-10-21) — İLERLETİLMİŞ (secondary progression) ve SOLAR ARC → NATAL açıları (SAF;
// istemci + sunucu + rapor aynı fonksiyonu kullanır → ekran = rapor).
//
// YENİ HESAP MOTORU DEĞİLDİR: yalnız kayıtlı teknik katmandaki boylamlar arasında aritmetik açı farkı. Konumlar
// hesaplama hizmetinden aynen gelir (ilerletilmiş gezegenler + ilerletilmiş ASC/MC; Solar Arc directed noktaları);
// natal taraf, ilerletilmiş haritada önbellekteki natal çerçevedir (natalFrame), Solar Arc'ta yanıtın kendi natal
// boylamlarıdır (mevcut adaptör aritmetiği, SOLAR_ARC_ASPECT_METHOD — değiştirilmedi).
//
// Kural (owner talimatı): yalnız majör açılar (kavuşum, altmışlık, kare, üçgen, karşıt); orb ≤ 1°. Bir noktanın KENDİ
// natal konumuyla eşleşmesi ve düğüm ekseninin kendi karşı ucu listelenmez (ilerletilmiş düğüm natal düğümden ancak
// birkaç dakika ayrılır → "K.Düğüm karşıt natal G.Düğüm" her zaman çıkar, bilgi taşımaz).
// Yaklaşan/ayrılan: hareketli noktanın yönüne göre orb azalıyorsa "yaklaşan", artıyorsa "ayrılan". İlerletilmiş
// gezegende yön = ilerletilmiş hızın işareti (retro → geri); ilerletilmiş ASC/MC ve Solar Arc yayı zamanla hep ileri.

import type { AspectType, BodyId } from "./model/western";
import type { PointId, ProgressionTechnical, SolarArcAspect, SolarArcTechnical, TransitNatalFrame } from "./model/westernTiming";

export const DIRECTION_ASPECT_ORB = 1;
export const DIRECTION_MAJOR_ASPECTS: readonly AspectType[] = ["conjunction", "sextile", "square", "trine", "opposition"];
const EXACT: Partial<Record<AspectType, number>> = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };
const NATURE: Partial<Record<AspectType, "harmonious" | "challenging" | "neutral">> = {
  conjunction: "neutral",
  sextile: "harmonious",
  trine: "harmonious",
  square: "challenging",
  opposition: "challenging",
};

export type AspectMotion = "applying" | "separating";
export type DirectionAspect = {
  /** Hareketli nokta (ilerletilmiş / Solar Arc). */
  moving: PointId;
  natal: PointId;
  type: AspectType;
  exactAngle: number;
  orb: number;
  motion: AspectMotion | null;
  nature: "harmonious" | "challenging" | "neutral";
};

/** Ekran ve raporda AYNI metin (orb + yöntem açıkça yazılır). */
export const PROGRESSION_ASPECT_RULE =
  "Açı kuralı: yalnız majör açılar (kavuşum, altmışlık, kare, üçgen, karşıt), orb ≤ 1°. İlerletilmiş konumlar ile natal konumlar arasındaki boylam farkından hesaplanır. Bir noktanın kendi natal konumu ve düğüm ekseninin karşı ucu listelenmez. Yaklaşan/ayrılan: ilerletilmiş noktanın hareket yönüne göre (retro gezegen geri hareket eder).";
export const SOLAR_ARC_ASPECT_RULE =
  "Açı kuralı: yalnız majör açılar (kavuşum, altmışlık, kare, üçgen, karşıt), orb ≤ 1°. Solar Arc noktaları ile natal konumlar arasındaki boylam farkından hesaplanır. Bir noktanın kendi natal konumu listelenmez. Yaklaşan/ayrılan: Solar Arc yayı zamanla hep ileri gider.";
export const PROGRESSION_METHOD_NOTE =
  "Yöntem: ikincil ilerletme (doğumdan sonraki her gün = bir yaşam yılı). İlerletilmiş gezegenler ile ilerletilmiş Yükselen/MC hesaplama hizmetinden hazır gelir; hizmet Yükselen/MC yönteminin adını vermez — değerler ilerletilmiş günün doğum saati ve doğum yerindeki haritasıyla uyumludur. Evler: ilerletilmiş Yükselen'in burcundan sayılan tam burç evleri.";
export const SOLAR_ARC_METHOD_NOTE =
  "Yöntem: gerçek Solar Arc (boylamda) — yay = ilerletilmiş Güneş − natal Güneş; aynı yay bütün natal noktalara (Yükselen/MC dahil) eklenir. Konumlar hesaplama hizmetinden hazır gelir.";

const norm = (d: number) => ((d % 360) + 360) % 360;
/** İki boylam arasındaki en kısa açı (0–180). */
export function separation(a: number, b: number): number {
  const d = norm(a - b);
  return d > 180 ? 360 - d : d;
}
/** Hareketli boylam `dir` yönünde ilerlerken orb azalıyor mu? dir 0 → bilinmiyor. */
export function aspectMotion(movingLon: number, natalLon: number, type: AspectType, dir: number): AspectMotion | null {
  const exact = EXACT[type];
  if (exact === undefined || !Number.isFinite(dir) || dir === 0) return null;
  const eps = 1e-4 * Math.sign(dir);
  const now = Math.abs(separation(movingLon, natalLon) - exact);
  const next = Math.abs(separation(movingLon + eps, natalLon) - exact);
  if (next === now) return null;
  return next < now ? "applying" : "separating";
}

type Pt = { id: PointId; longitude: number; dir: number };
const isNodeAxisPair = (a: PointId, b: PointId) => (a === "north_node" && b === "south_node") || (a === "south_node" && b === "north_node");

/** Saf eşleştirici: hareketli × natal, majör + orb ≤ 1°, orb'a göre sıralı. */
export function directionAspects(moving: Pt[], natal: { id: PointId; longitude: number }[], opts: { skipNodeAxis: boolean }): DirectionAspect[] {
  const out: DirectionAspect[] = [];
  for (const m of moving) {
    for (const n of natal) {
      if (m.id === n.id) continue;
      if (opts.skipNodeAxis && isNodeAxisPair(m.id, n.id)) continue;
      for (const type of DIRECTION_MAJOR_ASPECTS) {
        const exact = EXACT[type]!;
        const orb = Math.abs(separation(m.longitude, n.longitude) - exact);
        if (orb <= DIRECTION_ASPECT_ORB + 1e-9) {
          out.push({ moving: m.id, natal: n.id, type, exactAngle: exact, orb: Math.round(orb * 1e4) / 1e4, motion: aspectMotion(m.longitude, n.longitude, type, m.dir), nature: NATURE[type]! });
        }
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb || a.moving.localeCompare(b.moving) || a.natal.localeCompare(b.natal));
}

/** Natal çerçevenin noktaları (gezegenler + ASC/MC). */
export function natalFramePoints(f: TransitNatalFrame): { id: PointId; longitude: number }[] {
  return [...f.bodies.map((b) => ({ id: b.id as PointId, longitude: b.longitude })), { id: "ascendant", longitude: f.angles.ascendant.longitude }, { id: "midheaven", longitude: f.angles.midheaven.longitude }];
}

/**
 * İlerletilmiş → natal açılar. Natal çerçeve yoksa null (natal karşılaştırma yapılamaz; neden ekranda yazılır).
 * Saat bilinmiyorsa (angles maskeli) ilerletilmiş ASC/MC listeye girmez; maske natal çerçeveyi de kaldırır.
 */
export function progressedToNatalAspects(t: Pick<ProgressionTechnical, "bodies" | "angles" | "natalFrame">): DirectionAspect[] | null {
  const f = t.natalFrame;
  if (!f) return null;
  const moving: Pt[] = t.bodies.map((b) => ({ id: b.id as BodyId as PointId, longitude: b.longitude, dir: Math.sign(b.speed) }));
  if (t.angles) moving.push({ id: "ascendant", longitude: t.angles.ascendant.longitude, dir: 1 }, { id: "midheaven", longitude: t.angles.midheaven.longitude, dir: 1 });
  return directionAspects(moving, natalFramePoints(f), { skipNodeAxis: true });
}

/** Kayıtlı Solar Arc açılarına (adaptör aritmetiği, aynen) yaklaşan/ayrılan bilgisi ekler. Değerler değişmez. */
export function solarArcAspectsWithMotion(t: Pick<SolarArcTechnical, "directed" | "aspects">): (SolarArcAspect & { motion: AspectMotion | null; exactAngle: number; nature: DirectionAspect["nature"] })[] {
  const byId = new Map(t.directed.map((d) => [d.id, d]));
  return [...t.aspects]
    .sort((a, b) => a.orb - b.orb)
    .map((a) => {
      const d = byId.get(a.directed);
      const n = byId.get(a.natal);
      return { ...a, exactAngle: EXACT[a.type] ?? 0, nature: NATURE[a.type] ?? "neutral", motion: d && n ? aspectMotion(d.directedLongitude, n.natalLongitude, a.type, 1) : null };
    });
}

export const MOTION_LABEL: Record<AspectMotion, string> = { applying: "Yaklaşan", separating: "Ayrılan" };
