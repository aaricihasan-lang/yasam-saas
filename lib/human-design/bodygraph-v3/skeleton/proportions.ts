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
    Head: { hw: 44, hh: 30 }, // V3-2C it-2: küçük/zarif baş için zon küçültüldü
    Ajna: { hw: 42, hh: 26 }, // (silüet başı da küçülüp yuvarlanabilir)
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
    // V3-2C iterasyon-3 (2'nin üstüne): omuz üst köşe yuvarlandı · boyun→omuz geçişi daha doğal ·
    // alt taper'da küçük anatomik rötuş. (baş/yüz/columnar torso it-2'den değişmedi.)
    crownY: 62,
    headCenterY: 135, // widest Head–Ajna arasında → ikisini de kapsar, baş küçük/yuvarlak
    headHalfW: 50,
    brow: { y: 158, project: 36 },
    nose: { y: 182, project: 46 }, // burun dışa (sol) — belirgin ama zarif
    lip: { y: 198, project: 38 },
    chin: { y: 214, project: 30 },
    neck: { y: 256, halfW: 33 }, // it-3: hafif kalınlaştı → boyun→omuz geçişi daha yumuşak/doğal + trap dolgunlaştı
    shoulder: { y: 316, halfW: 148 }, // it-3: aşırı tepe köşesi yumuşatıldı (yuvarlak omuz kepi), hâlâ EN GENİŞ, Throat'ı kapsar
    waist: { y: 462, halfW: 110 }, // columnar (G'yi kapsar)
    hip: { y: 590, halfW: 118 }, // omuzdan dar (Sacral'ı kapsar)
    taperY: 770,
    footHalfW: 46, // it-3: bilek/ayak hafif daraldı → alt taper daha doğal
    bottomY: 800, // insan taper'ı → Root içeride, abartısız taban, sivri uç yok
    tension: 0.7,
  },
};
