// Premium BodyGraph V3 — iskelet kaynağı (skeleton-driven mimari).
//
// V3-0: yalnız viewBox (480×800, H:W≈1.67 — referans tall/slim figür).
// Omurga ritmi + orbital bantlar + silüet profili knob'ları V3-1'de eklenecek;
// merkez/anchor/kanal/aura hepsi buradan türeyecek (tek oransal kaynak).

export const VIEWBOX_V3 = { width: 480, height: 800 } as const;

export type PointV3 = { x: number; y: number };
