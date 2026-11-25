// FAZ 6 / UAT PATCH 1 — "Bu ne demek?" KAVRAM TANIMI kataloğu.
//
// SADECE presentation metadata. FORMÜL MOTORU DEĞİLDİR; yeni numeroloji hesabı,
// yorum, skor veya öneri İÇERMEZ. Tanımlar mevcut canonical engine semantic identity'sine
// ve kaynak terminolojisine dayanır (kitap 1./2. seviye). Uzun interpretation metni tekrar
// EDİLMEZ — her giriş yalnızca kısa bir KAVRAM TANIMIDIR.
//
// I18N (R5, 25.11.2026): tanımlar `numerology.analysis.concept` kataloğundadır (TR değerleri önceki literal'lerle
// birebir). `CONCEPT_HELP` KAYNAK dil (tr) görünümüdür (harness + geriye uyum); ekran dilindeki metin için bileşen
// `useTranslations("numerology.analysis.concept")` ile aynı anahtarı okur.

import trAnalysis from "@/messages/tr/numerology.analysis.json";

export const CONCEPT_HELP: Record<string, string> = { ...trAnalysis.numerology.analysis.concept };

/** Kavram tanımı (yoksa undefined). Presentation metadata; yeni yorum üretmez. */
export function conceptHelp(key: string): string | undefined {
  return CONCEPT_HELP[key];
}
