"use client";

// I18N (HD) — BodyGraph SVG'sindeki merkez başlıkları (BAŞ, BOĞAZ, SOLAR / PLEKSUS …) için GÖSTERİM eşlemesi.
//
// Geometri (lib/human-design/relations/connectionBodygraphGeometry.ts) Türkçe büyük harf satırları taşır ve DEĞİŞMEZ
// (Word/PNG yakalama ve ilişki çizimleri de aynı sahneyi kullanır). TR'de sahne AYNEN döner (bayt-eşit); diğer dillerde
// yalnız role === "center" metin primitifleri hd.chart.svgCenter sözlüğünden değiştirilir. Satır sayısı korunur
// (yazı boyutu satır sayısından hesaplandığı için yerleşim değişmez). Bilinmeyen satır → aynen (uydurma yok).

import { useLocale, useTranslations } from "next-intl";
import type { CbgPrim } from "@/lib/human-design/relations/connectionBodygraphScene";

const KEY: Readonly<Record<string, string>> = {
  "BAŞ": "head",
  AJNA: "ajna",
  "BOĞAZ": "throat",
  G: "g",
  KALP: "heart",
  SAKRAL: "sacral",
  "KÖK": "root",
  DALAK: "spleen",
  SOLAR: "solar",
  PLEKSUS: "plexus",
};

export function useLocalizedCenterText(): (prims: CbgPrim[]) => CbgPrim[] {
  const isTr = useLocale() === "tr";
  const t = useTranslations("hd.chart.svgCenter");
  return (prims) =>
    isTr
      ? prims
      : prims.map((p) => (p.k === "text" && p.role === "center" && KEY[p.text] ? { ...p, text: t(KEY[p.text]) } : p));
}
