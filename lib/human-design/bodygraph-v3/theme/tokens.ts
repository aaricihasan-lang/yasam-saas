// Premium BodyGraph V3 — design token'ları (V2'DEN BAĞIMSIZ; V3 kendi evrimi).
//
// V3-0: yalnız renk paleti iskeleti. CHANNEL_V3 / GATE_V3 / AURA_V3 render başlayınca
// (V3-2+) eklenecek. Inline sihirli sayı YOK; tüm görsel sabitler buradan.

import type { CenterName } from "@/lib/human-design/engine/channels";

export const COLORS_V3 = {
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

// Ambient derinlik glow (V3-2 yeniden) — insan silueti KALDIRILDI (tasarim karari). Yalniz hafif
// radial isik -> BodyGraph'in arkasinda premium derinlik. Dikkat cekmemeli; kanallar/merkezler her
// zaman ustte. Notr-soguk indigo, edge tam seffaf. (deriveAura/silhouette lib'de kalir, render kullanmaz.)
export const AURA_V3 = {
  glow: "#6366f1", // nötr-soğuk indigo
  peak: 0.1,
  mid: 0.05,
  edge: 0.0, // kenarlarda tamamen kaybolur
} as const;

// Kanal (V3-3) — SADE track (renk/casing/yarım-renk YOK; routing anatomisi). Premium sonra.
export const CHANNEL_V3 = {
  track: "#94a3b8",
  trackW: 2.5,
  trackOpacity: 0.55,
} as const;

// Merkez (V3-4) — SADE gri sekil (ici bos). Renk/defined/gate/numara YOK; yalniz dogru sekil+konum.
export const CENTER_V3 = {
  fill: "none",
  stroke: "#94a3b8",
  strokeW: 1.6,
} as const;

export const TYPO_V3 = {
  family: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;
