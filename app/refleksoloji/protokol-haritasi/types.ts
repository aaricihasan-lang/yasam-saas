import type { FootView } from "../bolge-haritasi/types";

/** Canonical 3-görünüm ile TEK type kaynağı (ekole bağımsız). Legacy "yan" YOK. */
export type ProtocolFootView = FootView;

export type ProtocolRegionPoint = { x: number; y: number };

/**
 * Atlas önizleme bölgesi (salt okunur). Bölge Haritası'nın TÜM geçerli
 * şekillerini taşır: oval/rect (kutu), free_draw (points), thick_line (uç
 * koordinatları). Şekle göre yalnız ilgili geometri alanları dolu olur.
 */
export type ProtocolDisplayRegion = {
  id: string;
  organ: string;
  footSide: "left" | "right";
  view: ProtocolFootView;
  shape: "oval" | "rect" | "free_draw" | "thick_line";
  // oval / rect
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  angle?: number;
  // free_draw
  points?: ProtocolRegionPoint[];
  // thick_line
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  lineWidth?: number;
};

export type OrganColorStyle = {
  fill: string;
  stroke: string;
  chipClass: string;
};

export type ColoredDisplayRegion = ProtocolDisplayRegion & OrganColorStyle;

export type OrganAtlasStatus = {
  name: string;
  atlasKey: string | null;
  /** Organın HERHANGİ bir görünümde (Taban/Yan) kayıtlı atlas bölgesi var mı. */
  found: boolean;
  /** TÜM görünümlerdeki toplam geçerli bölge sayısı. */
  regionCount: number;
  /** Yalnız aktif görünümdeki geçerli bölge sayısı. */
  currentViewRegionCount: number;
  /** Bölgesi bulunan görünümler (ör. yalnız "yan"). */
  availableViews: ProtocolFootView[];
  color: OrganColorStyle;
};

/** localStorage — yasam-refleksoloji-protokoller-v1 */
export type SavedProtocol = {
  id: string;
  title: string;
  description: string;
  organs: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ProtocolFormDraft = {
  title: string;
  description: string;
  organs: string[];
  notes: string;
};

export const ORGAN_COLOR_PALETTE: OrganColorStyle[] = [
  {
    fill: "rgba(239, 68, 68, 0.32)",
    stroke: "rgb(220, 38, 38)",
    chipClass: "border-red-300/80 bg-red-50 text-red-900",
  },
  {
    fill: "rgba(249, 115, 22, 0.32)",
    stroke: "rgb(234, 88, 12)",
    chipClass: "border-orange-300/80 bg-orange-50 text-orange-950",
  },
  {
    fill: "rgba(168, 85, 247, 0.32)",
    stroke: "rgb(147, 51, 234)",
    chipClass: "border-violet-300/80 bg-violet-50 text-violet-950",
  },
  {
    fill: "rgba(34, 197, 94, 0.32)",
    stroke: "rgb(22, 163, 74)",
    chipClass: "border-emerald-300/80 bg-emerald-50 text-emerald-950",
  },
  {
    fill: "rgba(14, 165, 233, 0.32)",
    stroke: "rgb(2, 132, 199)",
    chipClass: "border-sky-300/80 bg-sky-50 text-sky-950",
  },
  {
    fill: "rgba(244, 63, 94, 0.32)",
    stroke: "rgb(225, 29, 72)",
    chipClass: "border-rose-300/80 bg-rose-50 text-rose-950",
  },
];

export function getOrganColor(index: number): OrganColorStyle {
  return ORGAN_COLOR_PALETTE[index % ORGAN_COLOR_PALETTE.length];
}
