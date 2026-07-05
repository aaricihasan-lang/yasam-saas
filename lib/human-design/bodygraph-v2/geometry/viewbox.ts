// Premium BodyGraph V2 — koordinat uzayı (saf veri).
//
// Kompakt oran (V2-1'de merkez/gate/kanal geometrisi ile birlikte kalibre edilecek).
// Eski layout.ts (340×600, uzun-dar) ile İLİŞKİSİZ; V2 sıfırdan tuval.

export const VIEWBOX_V2 = { width: 460, height: 600 } as const;

export type PointV2 = { x: number; y: number };
