// FAZ 10B / ADIM 1 — Gezegen sütunları için izole sunum sabitleri.
//
// SALT SUNUM VERİSİ. Hesaplama YOK, motor bağımlılığı YOK (yalnız PlanetName tipi).
// BodyGraph.tsx / layout.ts / engine / compute / API — HİÇBİRİNE dokunmaz.
//
// Kapsam (onaylı): yalnızca gezegen glifi + Gate.Line hizalama sırası.
//   color / tone / base BU FAZDA YOK (motor işi, kapsam dışı).

import type { PlanetName } from "@/lib/human-design/engine/types";

/**
 * HD BodyGraph gezegen sütunu görüntüleme sırası (onaylı — FAZ 10B).
 * Design ve Personality sütunları AYNI sırayı kullanır → satırlar yatay hizalanır.
 *
 * Not: motorun emisyon sırası (Sun, Moon, Mercury… Earth/SouthNode sonda) DEĞİL;
 * bu, klasik HD sütun konvansiyonudur ve yalnız sunumda kullanılır.
 */
export const HD_PLANET_ORDER: readonly PlanetName[] = [
  "Sun",
  "Earth",
  "NorthNode",
  "SouthNode",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
] as const;

/**
 * PlanetName → astronomik Unicode glif.
 * Symbol font-stack ile eşleştirilmeli (Segoe UI Symbol / Noto Sans Symbols2)
 * çünkü ⊕ (Earth), ☊/☋ (Nodes) bazı fontlarda eksik olabilir.
 */
export const PLANET_GLYPH: Record<PlanetName, string> = {
  Sun: "☉",
  Earth: "⊕",
  NorthNode: "☊",
  SouthNode: "☋",
  Moon: "☽",
  Mercury: "☿",
  Venus: "♀",
  Mars: "♂",
  Jupiter: "♃",
  Saturn: "♄",
  Uranus: "♅",
  Neptune: "♆",
  Pluto: "♇",
};

/** PlanetName → Türkçe etiket (a11y / tooltip / ekran okuyucu). */
export const PLANET_LABEL_TR: Record<PlanetName, string> = {
  Sun: "Güneş",
  Earth: "Dünya",
  NorthNode: "Kuzey Ay Düğümü",
  SouthNode: "Güney Ay Düğümü",
  Moon: "Ay",
  Mercury: "Merkür",
  Venus: "Venüs",
  Mars: "Mars",
  Jupiter: "Jüpiter",
  Saturn: "Satürn",
  Uranus: "Uranüs",
  Neptune: "Neptün",
  Pluto: "Plüton",
};
