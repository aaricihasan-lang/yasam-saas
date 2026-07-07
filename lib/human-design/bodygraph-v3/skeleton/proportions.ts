// Premium BodyGraph V3 — iskelet kaynağı (skeleton-driven mimari, TEK parametrik kaynak).
//
// BODY_PROPORTIONS = tasarımın tek kontrol paneli. Merkez/anchor/kanal/aura hepsi buradan
// türer (V3-2..5). Kompozisyonu ayarlamak = bu ~12 knob'u ayarlamak; 200 koordinat değil.
// viewBox 480×800 SABİT (H:W≈1.67 — referans tall/slim figür).

import type { CenterName } from "@/lib/human-design/engine/channels";

export const VIEWBOX_V3 = { width: 480, height: 800 } as const;

export type PointV3 = { x: number; y: number };

export type CentralName = "Head" | "Ajna" | "Throat" | "G" | "Sacral" | "Root";
export type SideName = "Spleen" | "SolarPlexus" | "Heart";

export const BODY_PROPORTIONS = {
  viewBox: VIEWBOX_V3,
  axisX: 240,
  // Dikey omurga ritmi (uzun beden, uzun boyun Ajna→Throat).
  spineY: { Head: 100, Ajna: 180, Throat: 330, G: 475, Sacral: 610, Root: 720 } as Record<
    CentralName,
    number
  >,
  // Merkez zonu (node etrafı halfW/halfH). İnce kolon; G orta; Heart küçük; Root kompakt.
  centerZone: {
    Head: { hw: 54, hh: 34 },
    Ajna: { hw: 52, hh: 30 },
    Throat: { hw: 50, hh: 46 },
    G: { hw: 56, hh: 62 },
    Heart: { hw: 28, hh: 24 },
    Spleen: { hw: 44, hh: 50 },
    SolarPlexus: { hw: 44, hh: 50 },
    Sacral: { hw: 48, hh: 44 },
    Root: { hw: 46, hh: 40 },
  } as Record<CenterName, { hw: number; hh: number }>,
  // Yan merkez slotları (torso yanları).
  sideSlot: {
    Spleen: { x: 92, y: 600 },
    SolarPlexus: { x: 388, y: 600 },
    Heart: { x: 330, y: 500 },
  } as Record<SideName, PointV3>,
  // Orbital kaburga bantları (konsantrik; geniş sweep).
  orbital: { center: { x: 240, y: 560 }, radii: [150, 195, 235] as number[] },
  // Silüet knob'ları — aura (V3-2) tamamen buradan türer. Baş + YÜZ PROFİLİ (sola bakan) +
  // gövde (omuz/bel/kalça/taper). Yüz profili sol tarafta: çene→dudak→burun(dışa)→alın.
  silhouette: {
    crownY: 58,
    headCenterY: 116,
    headHalfW: 46,
    brow: { y: 150, project: 33 },
    nose: { y: 176, project: 44 }, // burun dışa çıkar (sol) — belirgin ama zarif
    lip: { y: 194, project: 35 },
    chin: { y: 212, project: 29 },
    neck: { y: 250, halfW: 26 }, // zarif boyun (omuz geçişi yumuşasın)
    shoulder: { y: 322, halfW: 128 }, // güçlü ama yumuşak omuz
    waist: { y: 466, halfW: 104 }, // ince ama abartısız bel
    hip: { y: 604, halfW: 146 }, // doğal kalça (yan merkez hizası)
    taperY: 772,
    footHalfW: 40,
    bottomY: 790,
    tension: 0.7, // daha az overshoot → pürüzsüz omuz/tepe
  },
};
