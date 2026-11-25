"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

/**
 * I18N (2026-11-25) — Çakra çalışma alanı sistem etiketlerinin GÖSTERİMİ.
 *
 * lib/bioenergy/chakraSections.ts / chakraWorkspace.ts / chakrasListFetch.ts TR kaynak olarak kalır:
 * bölüm kimlikleri (genel-bakis…), blok başlıkları ("Renk" karşılaştırması dahil) ve hızlı-bilgi anahtarları
 * kanoniktir, testler (chakraSections/chakraWorkspace harness) onları kilitler. Burada yalnız bilinen sistem
 * etiketleri ekran dilinde eşlenir; bilinmeyen başlık (DB'den gelen zengin blok başlığı = içerik) aynen gösterilir.
 * Sanskrit çakra adları ve kaynakça başlıkları içerik olarak çevrilmez.
 */
const SECTION_IDS = new Set([
  "genel-bakis",
  "enerji-anatomisi",
  "nedenler-blokajlar",
  "beden-sistem",
  "duygusal-zihinsel",
  "uygulamalar",
  "taslar-destekleyiciler",
  "notlar-kaynaklar",
]);

/** chakraSections.ts sistem blok başlıkları (TR kanonik) → katalog anahtarı. */
const BLOCK_TITLE_KEYS: Record<string, string> = {
  // i18n-ignore: chakraSections.ts kanonik blok başlığı (eşleme anahtarı)
  "Renk": "color",
  // i18n-ignore: chakraSections.ts kanonik blok başlığı (eşleme anahtarı)
  "Blokajlı Olmasının Nedenleri": "causes",
  // i18n-ignore: chakraSections.ts kanonik blok başlığı (eşleme anahtarı)
  "Fiziksel Etkiler": "physical",
  // i18n-ignore: chakraSections.ts kanonik blok başlığı (eşleme anahtarı)
  "Organlar": "organs",
  // i18n-ignore: chakraSections.ts kanonik blok başlığı (eşleme anahtarı)
  "Bezler": "glands",
  // i18n-ignore: chakraSections.ts kanonik blok başlığı (eşleme anahtarı)
  "Zihinsel Etkiler": "mental",
};

const QUICK_KEYS = new Set(["sanskritName", "element", "location", "bijaMantra", "sanskrit", "mantra"]);

export function useChakraLabels() {
  const t = useTranslations("bioenergy.chakraLabels");
  return useMemo(
    () => ({
      sectionTitle: (id: string | undefined, fallback: string) =>
        id && SECTION_IDS.has(id) ? t(`sections.${id}`) : fallback,
      blockTitle: (title: string) => {
        const k = Object.prototype.hasOwnProperty.call(BLOCK_TITLE_KEYS, title) ? BLOCK_TITLE_KEYS[title] : null;
        return k ? t(`blocks.${k}`) : title;
      },
      quickLabel: (key: string, fallback: string) => (QUICK_KEYS.has(key) ? t(`quick.${key}`) : fallback),
    }),
    [t],
  );
}
