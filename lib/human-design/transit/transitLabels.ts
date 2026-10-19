// Human Design transit — Türkçe ekran etiketleri (SAF sunum; hesap yok). Mevcut HD terminolojisi yeniden kullanılır.

import { hdCenterLabelFromCode, hdChannelLabelFromCode } from "../codeHelpers";
import { PLANET_LABEL_TR } from "../bodygraph/planetGlyphs";
import type { CenterName } from "../engine/channels";
import type { PlanetName } from "../engine/types";

export { PLANET_LABEL_TR };

const ENGINE_TO_APP_CENTER: Record<CenterName, string> = {
  Head: "head",
  Ajna: "ajna",
  Throat: "throat",
  G: "g_identity",
  Heart: "heart_ego",
  Spleen: "spleen",
  SolarPlexus: "solar_plexus",
  Sacral: "sacral",
  Root: "root",
};

/** Kısa merkez adı: "Sakral Merkez (Sacral)" → "Sakral". */
export function transitCenterLabel(c: CenterName): string {
  const full = hdCenterLabelFromCode(ENGINE_TO_APP_CENTER[c]);
  return full.replace(/\s*\(.*\)\s*$/, "").replace(/\s+Merkez(i)?$/, "").trim() || c;
}

/** Kanal etiketi (mevcut HD sözlüğü; yoksa "id ad"). */
export function transitChannelLabel(id: string, fallbackName: string): string {
  const l = hdChannelLabelFromCode(id);
  return l && l !== id ? l : `${id} ${fallbackName}`;
}

export const bodyLabel = (b: PlanetName) => PLANET_LABEL_TR[b];

export const GENERAL_TRANSIT_NOTE =
  "Bu bir doğum haritası değildir: seçilen andaki gezegen konumlarının genel Human Design aktivasyonlarıdır. Kişiye tip, otorite veya profil atanmaz. Gezegenler sürekli hareket eder; özellikle Ay birkaç saatte kapı değiştirebilir, bu yüzden sonuç yalnız gösterilen an içindir.";
export const UNCERTAIN_NOTE =
  "Kesinleştirilemedi: bu gezegen çizgi sınırına, hesaplama yönteminin ölçülmüş hassasiyetinden daha yakın. İki olası kapı.çizgi gösterilir; bu aktivasyona bağlı kanal ve merkezler kesin sunulmaz. Birkaç dakika önceki veya sonraki anı seçerek netleştirebilirsiniz.";
export const NEAR_BOUNDARY_NOTE = "Sınıra yakın: konum çizgi sınırına çok yakın; birkaç dakikalık fark kapıyı veya çizgiyi değiştirebilir.";
