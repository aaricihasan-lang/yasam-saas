/**
 * SİSTEM ÇIKTILARI İÇİN DİL SÖZLEŞMESİ — Word / PDF / PNG / grafik / görsel başlıkları (I18N-F1, Owner kararı A3).
 *
 * Kural:
 *   1. Çıktı dili = seçili EKRAN dili. Sunucu tarafında `resolveOutputLocale(req)` ile, ekranla AYNI kaynaktan
 *      (NEXT_LOCALE çerezi + yayın kapısı) çözülür; istemcinin gönderdiği keyfi bir dil kabul edilmez.
 *   2. Metinler ekranla AYNI katalogdan gelir: `getOutputTranslator(locale, "namespace")` → rapor ve ekran
 *      terminolojisi ayrışamaz. Biçimler lib/i18n/format.ts (localeTag) ile üretilir.
 *   3. Kullanıcı içeriği (danışan kaydı, uzman notu, serbest metin) ÇEVRİLMEZ; olduğu gibi yerleştirilir.
 *   4. Hesaplama DİLDEN BAĞIMSIZDIR: rapor üreticisi hesap motorunu kanonik girdilerle çağırır, yalnız
 *      görünen etiketleri `OutputLocale` ile seçer. Dil parametresi hesap fonksiyonuna GEÇİRİLMEZ.
 *   5. Belge meta dili (docx `w:lang`, PDF `/Lang`, SVG/HTML `lang`) `OutputLocale.documentLang`'tir.
 *
 * Modül fazlarında her rapor üreticisi imzasına `output: OutputLocale` alır; bugün yalnız anamnez PDF'i dil
 * taşıyor (normalizeLocale). Yeni üreticiler bu sözleşmeyi kullanmak zorundadır.
 */
import type { NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { defaultCatalogOptions, getCatalogMessages } from "./catalog";
import { effectiveLocale } from "./gate";
import { localeTag } from "./format";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type ActiveLocale } from "./locales";

assertServerOnly("lib/i18n/output");

export type OutputLocale = {
  locale: ActiveLocale;
  /** Intl biçimleri için BCP 47 etiketi (tr-TR, en-GB, de-DE). */
  intlTag: string;
  /** Belge meta dili (docx w:lang, PDF /Lang, HTML lang). */
  documentLang: string;
};

export function outputLocaleFor(locale: ActiveLocale): OutputLocale {
  const tag = localeTag(locale);
  return { locale, intlTag: tag, documentLang: tag };
}

/** İstekten çıktı dili: ekranla aynı çerez + yayın kapısı. Kapı kapalıysa daima kaynak dil. */
export function resolveOutputLocale(req: Pick<NextRequest, "cookies"> | null | undefined): OutputLocale {
  const raw = req?.cookies.get(LOCALE_COOKIE)?.value;
  return outputLocaleFor(effectiveLocale(raw));
}

export const SOURCE_OUTPUT_LOCALE: OutputLocale = outputLocaleFor(DEFAULT_LOCALE);

/** Ekranla aynı katalogdan, belirli namespace için çeviri fonksiyonu (sunucu tarafı rapor üreticileri). */
export function getOutputTranslator(output: OutputLocale | ActiveLocale, namespace: string) {
  const locale = typeof output === "string" ? output : output.locale;
  return createTranslator({
    locale,
    messages: getCatalogMessages(locale, defaultCatalogOptions()) as Record<string, never>,
    namespace: namespace as never,
  });
}
