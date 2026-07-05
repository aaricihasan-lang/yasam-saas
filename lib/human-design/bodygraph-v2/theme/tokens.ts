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

// Kanal katman kalınlıkları/renkleri/opasiteleri (V2-4'te 460×600'e kalibre — 10H kilitli
// değerleri başlangıç). Tanımlı = gölge/casing/gövde[glow]/sheen; tanımsız = knockout/edge/core.
// V2-6A token polish: kanal ayrımı (madde 4: kalınlık AZALT → aralar açılır) + kesişim
// (madde 5: shadowOpacity↑ net dış hat) + glow/cam (madde 7). Yapı/renk sabit.
export const CHANNEL = {
  bodyW: 4.6,
  shadowW: 7.4,
  shadowOpacity: 0.92,
  shadowColor: "#0b1220",
  casingW: 5.6,
  casingColor: "#dbe2ee",
  sheenW: 1.4,
  sheenOpacity: 0.55,
  sheenColors: { red: "#fecaca", black: "#cbd5e1" } as Record<"red" | "black", string>,
  glowStd: 0.85,
  glowOpacity: 0.5,
  undefinedEdgeW: 5.2,
  undefinedCoreW: 3.6,
  undefinedOpacity: 0.8,
  undefinedEdge: "#c3ccda",
  undefinedCore: "#f6f8fc",
  knockoutW: 6.2,
  knockoutColor: "#0b1220",
} as const;

// Gate rozet/etiket (V2-4'te kalibre — placeholder).
export const GATE = {
  badgeR: 7.0, // V2-6A: büyük rakamı taşır
  badgeStrokeW: 1.0,
  activeFont: 8.0, // V2-6A: +%25 okunabilirlik (madde 1)
  passiveFont: 6.4, // V2-6A: ölçülü (+%14); V2-6B'de merkez büyüyünce tekrar değerlendirilecek
  // Merkez stroke (tanımlı/açık) + pasif gate iki-ton kontrast (V2-2).
  centerStrokeOn: "#1e293b",
  centerStrokeOff: "#d5dce6",
  passiveFillLight: "#f8fafc", // renkli(tanımlı) merkez → açık numara
  passiveFillDark: "#334155", // beyaz(tanımsız) merkez → koyu numara
  passiveStrokeLight: "#ffffff", // koyu numara outline (beyaz merkez)
  passiveStrokeDark: "#0f172a", // açık numara outline (renkli merkez)
} as const;

// Aura yüzey + rim (V2-4A: gerçek silüet). Figür artık silüeti tanımlıyor → biraz daha var,
// ama destekleyici (BodyGraph yıldız). Ton soğuk lavanta; rim = ışıyan beden kenarı.
export const AURA = {
  fill: "#aeb8d8",
  peak: 0.14,
  mid: 0.09,
  edge: 0.04,
  blur: 2.4, // V2-6C: daha yumuşak organik kenar
  rimColor: "#c7cfe8",
  rimW: 1.7,
  rimOpacity: 0.42, // belirgin ışıyan kenar (yüz profili okunsun) — dolgu düşük kalır
} as const;

export const TYPO = {
  family: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;
