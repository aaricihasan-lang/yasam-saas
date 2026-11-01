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
  // 2026-10-15 owner terminoloji kararı: profesyonel gösterim "⚹ Sekstil (60°)" (eski "Altmışlık"); yalnız gösterim.
  sextile: "Sekstil (60°)",
  semi_sextile: "Yarım sekstil (30°)",
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

/** Natal'ın 8 ev sistemi (Aşama 2, #643): mevcut 4 + klasik 4 — yalnız etiket (rapor/arşiv yöntem satırı ham kimlik göstermesin). */
export const NATAL_HOUSE_SYSTEM_LABELS: Record<string, string> = {
  placidus: "Placidus",
  "whole-sign": "Tam Burç (Whole Sign)",
  equal: "Eşit Ev",
  koch: "Koch",
  regiomontanus: "Regiomontanus",
  campanus: "Campanus",
  porphyry: "Porphyry",
  alcabitius: "Alcabitius",
};

export const HOUSE_SYSTEM_LABELS: Record<HouseSystem, string> = {
  placidus: "Placidus",
  "whole-sign": "Tam Burç (Whole Sign)",
  equal: "Eşit Ev",
  koch: "Koch",
};

export const NODE_TYPE_LABELS: Record<"true" | "mean", string> = { true: "Gerçek düğüm (true)", mean: "Ortalama düğüm (mean)" };

/** 123.456 → "3°27′" (burç içi derece). */
export function formatDegree(deg: number): string {
  // Aşama 5: efemeris geleneği — dakika YUVARLANMAZ, kesilir (29°59.9′ asla "30°00′" / sonraki burç görünmez).
  // 1e-9 payı yalnız kayan nokta artığı içindir (ör. 12.5 → 12°30′).
  const d = Math.floor(deg + 1e-9);
  const m = Math.min(59, Math.floor((deg - d) * 60 + 1e-9));
  return `${d}°${String(m).padStart(2, "0")}′`;
}

export function formatOrb(orb: number): string {
  return formatDegree(orb);
}
