export type FootSide = "left" | "right";

/**
 * Canonical anatomik görünüm — EKOLE BAĞIMSIZ. Uzman manuel seçer; organ adı
 * görünümü ASLA belirlemez. Depolama bucket'ı = region.view = grup (tek kaynak).
 * `AtlasBackgroundGroup` (lib/refleksoloji/atlasRegionsCore) bunun ALIAS'ıdır.
 */
export type FootView = "taban" | "yan_ic" | "yan_dis" | "el_avuc" | "el_sirt";

/** Canonical görünüm sırası (TEK kaynak): 3 ayak + 2 el yüzeyi. Sol/Sağ seçimi el için de geçerli. */
export const ALL_FOOT_VIEWS: readonly FootView[] = ["taban", "yan_ic", "yan_dis", "el_avuc", "el_sirt"];

/**
 * Eski depolama görünümü — YALNIZ legacy belge normalizasyonu (converter) girdisi.
 * Runtime canonical `FootView` içinde "yan" YOKTUR; yeni kayıt asla "yan" yazmaz.
 */
export type LegacyFootView = "taban" | "yan";

export type RegionShapeType = "oval" | "rect" | "free_draw" | "thick_line" | "point";

/** Toolbar çizim tipi */
export type RegionDrawShape = "oval" | "rect" | "free_draw" | "thick_line" | "point";

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
  /** Yalnız shape "point": nokta boyutu. Eski kayıtlarda yok → DEFAULT_POINT_SIZE. */
  pointSize?: PointSize;
};

/** Nokta boyutu — veri yalnız etiket taşır; ekran çapı render'da sabit px'tir. */
export type PointSize = "xs" | "sm" | "md" | "lg";

export const POINT_SIZES: readonly PointSize[] = ["xs", "sm", "md", "lg"];

export const POINT_SIZE_LABEL: Record<PointSize, string> = {
  xs: "Çok küçük",
  sm: "Küçük",
  md: "Orta",
  lg: "Büyük",
};

/** Varsayılan = Orta = boyut özelliği öncesindeki tek sabit çap (eski kayıtlar aynen görünür). */
export const DEFAULT_POINT_SIZE: PointSize = "md";

/** Nokta ekran çapı (px) — Orta. */
export const POINT_RENDER_DIAMETER_PX = 14;

export const POINT_SIZE_DIAMETER_PX: Record<PointSize, number> = {
  xs: 5,
  sm: 9,
  md: POINT_RENDER_DIAMETER_PX,
  lg: 22,
};

/** Bilinmeyen/eksik değer → güvenli varsayılan. */
export function resolvePointSize(value: unknown): PointSize {
  return typeof value === "string" && (POINT_SIZES as readonly string[]).includes(value)
    ? (value as PointSize)
    : DEFAULT_POINT_SIZE;
}

export function pointDiameterPx(value: unknown): number {
  return POINT_SIZE_DIAMETER_PX[resolvePointSize(value)];
}

/** Beyaz halka kalınlığı (px) — çok küçük noktada halka noktayı yutmasın. */
export function pointRingPx(value: unknown): number {
  return resolvePointSize(value) === "xs" ? 1 : 2;
}

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
