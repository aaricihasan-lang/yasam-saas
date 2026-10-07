// Astroloji — Yaşam Sistemi'nin KENDİ Türkçe etiket sözlüğü (SAF; istemci güvenli).
// Teknik katmandaki kanonik kimlikler burada etikete çevrilir; sağlayıcı metni kullanılmaz.

import type { AspectNature, AspectType, BodyId, Dignity, Element, HouseSystem, Modality, PatternKind, SignId } from "../model/western";

const VS = "︎"; // metin sunumu (emoji değil)

export const BODY_LABELS: Record<BodyId, string> = {
  sun: "Güneş",
  moon: "Ay",
  mercury: "Merkür",
  venus: "Venüs",
  mars: "Mars",
  jupiter: "Jüpiter",
  saturn: "Satürn",
  uranus: "Uranüs",
  neptune: "Neptün",
  pluto: "Plüton",
  north_node: "Kuzey Ay Düğümü",
  south_node: "Güney Ay Düğümü",
  chiron: "Kiron",
  lilith: "Kara Ay Lilith",
};

export const BODY_GLYPHS: Record<BodyId, string> = {
  sun: `☉${VS}`,
  moon: `☽${VS}`,
  mercury: `☿${VS}`,
  venus: `♀${VS}`,
  mars: `♂${VS}`,
  jupiter: `♃${VS}`,
  saturn: `♄${VS}`,
  uranus: `♅${VS}`,
  neptune: `♆${VS}`,
  pluto: `♇${VS}`,
  north_node: `☊${VS}`,
  south_node: `☋${VS}`,
  chiron: `⚷${VS}`,
  lilith: `⚸${VS}`,
};

export const SIGN_LABELS: Record<SignId, string> = {
  aries: "Koç",
  taurus: "Boğa",
  gemini: "İkizler",
  cancer: "Yengeç",
  leo: "Aslan",
  virgo: "Başak",
  libra: "Terazi",
  scorpio: "Akrep",
  sagittarius: "Yay",
  capricorn: "Oğlak",
  aquarius: "Kova",
  pisces: "Balık",
};

export const SIGN_GLYPHS: Record<SignId, string> = {
  aries: `♈${VS}`,
  taurus: `♉${VS}`,
  gemini: `♊${VS}`,
  cancer: `♋${VS}`,
  leo: `♌${VS}`,
  virgo: `♍${VS}`,
  libra: `♎${VS}`,
  scorpio: `♏${VS}`,
  sagittarius: `♐${VS}`,
  capricorn: `♑${VS}`,
  aquarius: `♒${VS}`,
  pisces: `♓${VS}`,
};

export const SIGN_ELEMENT: Record<SignId, Element> = {
  aries: "fire",
  leo: "fire",
  sagittarius: "fire",
  taurus: "earth",
  virgo: "earth",
  capricorn: "earth",
  gemini: "air",
  libra: "air",
  aquarius: "air",
  cancer: "water",
  scorpio: "water",
  pisces: "water",
};

export const ASPECT_LABELS: Record<AspectType, string> = {
  conjunction: "Kavuşum",
  opposition: "Karşıt",
  trine: "Üçgen",
  square: "Kare",
  sextile: "Altmışlık",
  semi_sextile: "Yarım altmışlık",
  semi_square: "Yarım kare",
  sesquiquadrate: "Bir buçuk kare",
  quincunx: "Quincunx (150°)",
};

export const ASPECT_GLYPHS: Record<AspectType, string> = {
  conjunction: "☌",
  opposition: "☍",
  trine: "△",
  square: "□",
  sextile: "⚹",
  semi_sextile: "⚺",
  semi_square: "∠",
  sesquiquadrate: "⚼",
  quincunx: "⚻",
};

export const NATURE_LABELS: Record<AspectNature, string> = {
  harmonious: "Uyumlu",
  challenging: "Zorlayıcı",
  neutral: "Nötr",
};

export const DIGNITY_LABELS: Record<Dignity, string> = {
  domicile: "Yönetici (domicile)",
  exaltation: "Yücelim (exaltation)",
  detriment: "Zarar (detriment)",
  fall: "Düşüş (fall)",
  peregrine: "Peregrine",
};

export const PATTERN_LABELS: Record<PatternKind, string> = {
  grand_trine: "Büyük Üçgen",
  kite: "Uçurtma",
  t_square: "T-Kare",
  grand_cross: "Büyük Haç",
  yod: "Yod",
  mystic_rectangle: "Mistik Dikdörtgen",
  stellium: "Stelyum",
};

export const ELEMENT_LABELS: Record<Element, string> = { fire: "Ateş", earth: "Toprak", air: "Hava", water: "Su" };
export const MODALITY_LABELS: Record<Modality, string> = { cardinal: "Öncü", fixed: "Sabit", mutable: "Değişken" };

export const HOUSE_SYSTEM_LABELS: Record<HouseSystem, string> = {
  placidus: "Placidus",
  "whole-sign": "Tam Burç (Whole Sign)",
  equal: "Eşit Ev",
  koch: "Koch",
};

export const NODE_TYPE_LABELS: Record<"true" | "mean", string> = { true: "Gerçek düğüm (true)", mean: "Ortalama düğüm (mean)" };

/** 123.456 → "3°27′" (burç içi derece). */
export function formatDegree(deg: number): string {
  const d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  let dd = d;
  if (m === 60) {
    m = 0;
    dd += 1;
  }
  return `${dd}°${String(m).padStart(2, "0")}′`;
}

export function formatOrb(orb: number): string {
  return formatDegree(orb);
}
