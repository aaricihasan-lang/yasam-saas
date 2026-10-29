// Klasik Numeroloji · Doğaltaş eşleştirme — gezegen / element sözlüğü (SAF).
// Anahtarlar Doğaltaş Kütüphanesi facet anahtarlarıyla AYNIDIR (supabase/migrations/20271201000000_stone_library_core.sql
// stone_library_vocab: planet / element). Türkçe etiketler oradaki label_tr ile birebir.

import { foldStoneLibraryText } from "../../stone-library/fold";

export type PlanetKey =
  | "sun" | "moon" | "mercury" | "venus" | "earth" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto";
export type ElementKey = "earth" | "water" | "fire" | "air" | "storm";

export const PLANET_LABEL_TR: Readonly<Record<PlanetKey, string>> = Object.freeze({
  sun: "Güneş", moon: "Ay", mercury: "Merkür", venus: "Venüs", earth: "Dünya", mars: "Mars",
  jupiter: "Jüpiter", saturn: "Satürn", uranus: "Uranüs", neptune: "Neptün", pluto: "Plüton",
});

export const ELEMENT_LABEL_TR: Readonly<Record<ElementKey, string>> = Object.freeze({
  earth: "Toprak", water: "Su", fire: "Ateş", air: "Hava", storm: "Fırtına",
});

/** Katlanmış yazım → anahtar. EN + TR + geleneksel Türkçe adlar (Zühal, Müşteri, Utarit, Zühre, Merih, Şems, Kamer). */
const PLANET_WORDS: ReadonlyMap<string, PlanetKey> = new Map(
  ([
    ["sun", "sun"], ["gunes", "sun"], ["sems", "sun"],
    ["moon", "moon"], ["ay", "moon"], ["kamer", "moon"],
    ["mercury", "mercury"], ["merkur", "mercury"], ["utarit", "mercury"],
    ["venus", "venus"], ["zuhre", "venus"],
    ["earth", "earth"], ["dunya", "earth"],
    ["mars", "mars"], ["merih", "mars"],
    ["jupiter", "jupiter"], ["musteri", "jupiter"],
    ["saturn", "saturn"], ["zuhal", "saturn"],
    ["uranus", "uranus"],
    ["neptune", "neptune"], ["neptun", "neptune"],
    ["pluto", "pluto"], ["pluton", "pluto"],
  ] as [string, PlanetKey][]).map(([w, k]) => [foldStoneLibraryText(w), k]),
);

const ELEMENT_WORDS: ReadonlyMap<string, ElementKey> = new Map(
  ([
    ["earth", "earth"], ["toprak", "earth"],
    ["water", "water"], ["su", "water"],
    ["fire", "fire"], ["ates", "fire"],
    ["air", "air"], ["hava", "air"],
    ["storm", "storm"], ["firtina", "storm"],
  ] as [string, ElementKey][]).map(([w, k]) => [foldStoneLibraryText(w), k]),
);

/** Bileşik değerleri böler: "Venus & Neptune", "Fire / Earth", "Earth/Air/Fire", "All (Earth, Water)", "Venüs ve Neptün". */
export function splitCompoundValue(v: string): string[] {
  return v
    .split(/[\/&,()+]|\band\b|\bve\b/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Serbest metin → gezegen anahtarları (bileşikler açılır; bilinmeyen parça atlanır, tekrar yok). */
export function planetKeys(value: string | null | undefined): PlanetKey[] {
  if (!value) return [];
  const out: PlanetKey[] = [];
  for (const part of splitCompoundValue(value)) {
    const k = PLANET_WORDS.get(foldStoneLibraryText(part));
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/** Serbest metin → element anahtarları. "All" (belirsiz) AÇILMAZ — kütüphane içe aktarım kuralıyla aynı. */
export function elementKeys(value: string | null | undefined): ElementKey[] {
  if (!value) return [];
  const out: ElementKey[] = [];
  for (const part of splitCompoundValue(value)) {
    const f = foldStoneLibraryText(part);
    if (/^all\b/.test(f) || f === "hepsi" || f === "tumu") continue;
    const k = ELEMENT_WORDS.get(f);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

export function isCompoundValue(value: string): boolean {
  return splitCompoundValue(value).length > 1;
}
