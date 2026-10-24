import type { FootSide, FootView } from "../types";

/**
 * Bölge Haritası görsellerinde İKİ taraf da aynı görselde yan yana durur; taraf (footSide) çizimin görseldeki
 * konumundan belirlenir (2026-10-24: ayrı "Sol/Sağ" seçici kaldırıldı — veri modeli ve kayıt biçimi aynı).
 *  - Ayak görselleri (taban, yan iç, yan dış): görselin kendi etiketi — SOL yarı "Sağ", SAĞ yarı "Sol".
 *  - El görselleri (avuç içi, el sırtı): uygulamanın mevcut etiketi (HandSideLabels) — SOL yarı "Sol", SAĞ yarı "Sağ".
 * `x` görsele göre normalize (0..1) yatay konumdur (bölge merkezi).
 */
export function footSideFromX(x: number, view: FootView): FootSide {
  const leftHalf = x < 0.5;
  const isHand = view === "el_avuc" || view === "el_sirt";
  if (isHand) return leftHalf ? "left" : "right";
  return leftHalf ? "right" : "left";
}

/** Noktalar listesinin yatay ortalaması (serbest çizim). */
export function meanX(points: { x: number }[]): number {
  if (points.length === 0) return 0.5;
  return points.reduce((acc, p) => acc + p.x, 0) / points.length;
}
