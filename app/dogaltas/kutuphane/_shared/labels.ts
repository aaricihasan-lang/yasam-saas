// Doğaltaş Kütüphanesi · arayüz etiketleri (SAF). Lisanslı içerik YOKTUR; yalnız sabit arayüz metinleri.
// Sağlayıcı adı hiçbir etikette geçmez.

import type { StoneLibraryDisplayField, StoneLibraryKeyedFacet } from "@/lib/stone-library/contract";

export const LIBRARY_TITLE = "Doğaltaş Kütüphanesi";
export const NOT_FOUND_TEXT = "Bu içerik bulunamadı veya erişim izniniz yok.";

export const FIELD_LABEL: Record<StoneLibraryDisplayField, string> = {
  description: "Açıklama",
  meaning_spiritual: "Ruhsal anlam",
  meaning_emotional: "Duygusal anlam",
  meaning_physical: "Fiziksel etki",
  affirmation: "Olumlama",
  keywords: "Anahtar kelimeler",
};

export const TEXT_FIELDS = ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const FACET_LABEL: Record<StoneLibraryKeyedFacet, string> = {
  chakra: "Çakra",
  zodiac: "Burç",
  element: "Element",
  color: "Renk",
  planet: "Gezegen",
};

/** Filtre / form sırası (prototip ile aynı). */
export const FACET_ORDER: StoneLibraryKeyedFacet[] = ["color", "chakra", "zodiac", "element", "planet"];

export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export const monthName = (m: number): string => MONTHS[m - 1] ?? String(m);

export const formatHardness = (h: { min: number; max: number } | null | undefined): string | null =>
  !h ? null : h.min === h.max ? String(h.min) : `${h.min}–${h.max}`;

/** "a | b | c" biçimindeki anahtar kelime metnini listeye çevirir. */
export const splitKeywords = (txt: string | null | undefined): string[] =>
  (txt ?? "")
    .split(/\s*\|\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
