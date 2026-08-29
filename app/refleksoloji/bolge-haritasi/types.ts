export type FootSide = "left" | "right";

/**
 * Canonical anatomik görünüm — EKOLE BAĞIMSIZ. Uzman manuel seçer; organ adı
 * görünümü ASLA belirlemez. Depolama bucket'ı = region.view = grup (tek kaynak).
 * `AtlasBackgroundGroup` (lib/refleksoloji/atlasRegionsCore) bunun ALIAS'ıdır.
 */
export type FootView = "taban" | "yan_ic" | "yan_dis";

/**
 * Eski depolama görünümü — YALNIZ legacy belge normalizasyonu (converter) girdisi.
 * Runtime canonical `FootView` içinde "yan" YOKTUR; yeni kayıt asla "yan" yazmaz.
 */
export type LegacyFootView = "taban" | "yan";

export type RegionShapeType = "oval" | "rect" | "free_draw" | "thick_line";

/** Toolbar çizim tipi */
export type RegionDrawShape = "oval" | "rect" | "free_draw" | "thick_line";

export type RegionToolMode = "select" | "add" | "move";

export type RegionPoint = { x: number; y: number };

/** Normalize koordinatlar (0..1) — görsel alanına göre. Masaüstü RegionN ile uyumlu. */
export type Region = {
  id: string;
  organ: string;
  footSide: FootSide;
  view: FootView;
  shape: RegionShapeType;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  angle?: number;
  points?: RegionPoint[];
  /** Kalın çizgi — normalize 0..1 */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  lineWidth?: number;
  color?: string;
};

/** Eski kayıtlar ve fallback render için varsayılan kalın çizgi genişliği (normalize) */
/** Kalın çizgi veri modeli — görsel kalınlık render’da sabit px kullanır */
export const FALLBACK_THICK_LINE_WIDTH = 0.003;

/** thick_line ekran stroke kalınlığı (px) */
export const THICK_LINE_RENDER_STROKE_PX = 3;

/** @deprecated Yeni çizimler FootCanvas içindeki THICK_LINE_WIDTH kullanır */
export const DEFAULT_THICK_LINE_WIDTH = FALLBACK_THICK_LINE_WIDTH;

export function normalizeThickLineRegion(region: Region): Region {
  if (region.shape !== "thick_line") return region;
  if (region.lineWidth != null && Number.isFinite(region.lineWidth)) return region;
  return { ...region, lineWidth: FALLBACK_THICK_LINE_WIDTH };
}
