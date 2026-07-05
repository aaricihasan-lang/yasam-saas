// Premium BodyGraph V2 — design token'ları (TÜM görsel sabitler tek yerde).
//
// İlke: component'lerde inline sihirli sayı YOK; renk/kalınlık/opasite/tipografi
// yalnız buradan okunur. Kalınlık/opasite değerleri V2-3/V2-4'te yeni geometriye
// göre kalibre edilecek (şimdilik başlangıç; V2-0'da hiçbir yerde kullanılmıyor).

import type { CenterName } from "@/lib/human-design/engine/channels";

export const COLORS = {
  red: "#dc2626",
  black: "#111827",
  centerFill: {
    Head: "#34d399",
    Ajna: "#10b981",
    Throat: "#6366f1",
    G: "#f59e0b",
    Heart: "#f43f5e",
    Spleen: "#14b8a6",
    SolarPlexus: "#fb923c",
    Sacral: "#ef4444",
    Root: "#78716c",
  } as Record<CenterName, string>,
  auraFill: "#aeb8d8",
} as const;

// Kanal katman kalınlıkları/opasiteleri (V2-3'te kalibre — placeholder).
export const CHANNEL = {
  bodyW: 5.6,
  shadowW: 9.0,
  shadowOpacity: 0.85,
  casingW: 7.0,
  sheenW: 1.8,
  sheenOpacity: 0.5,
  undefinedEdgeW: 6.6,
  undefinedCoreW: 4.6,
  undefinedOpacity: 0.8,
} as const;

// Gate rozet/etiket (V2-4'te kalibre — placeholder).
export const GATE = {
  badgeR: 7.2,
  badgeStrokeW: 1.0,
  activeFont: 7,
  passiveFont: 6,
} as const;

// Aura yüzey (V2-4'te gerçek silüet path'i ile — placeholder).
export const AURA = {
  peak: 0.1,
  mid: 0.068,
  edge: 0.032,
  blur: 2.0,
} as const;

export const TYPO = {
  family: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;
