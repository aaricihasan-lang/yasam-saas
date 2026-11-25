/**
 * Numeroloji harness'ları — next-intl sağlayıcılı sunucu çizimi (I18N mod-n, R5 25.11.2026). Yalnız test.
 *
 * Numeroloji bileşenleri metinlerini `useTranslations` ile katalogdan alır; sağlayıcı olmadan next-intl hata fırlatır. Bileşen
 * çizen harness'lar `react-dom/server` yerine bu modülden `renderToStaticMarkup` içe aktarır: çizim ürünle AYNI katalogla
 * (varsayılan TR) yapılır, bu yüzden harness'ların Türkçe metin beklentileri DEĞİŞMEDEN geçerli kalır (TR katalog = önceki
 * kaynak metin). Eksik / hatalı mesaj sessiz geçmez: hata fırlatılır. Desen: Atlas `scripts/astrology/intlRender.ts`
 * (children props içinde — TS2769 dersi).
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup as baseRender } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";

export type TestLocale = "tr" | "en";

/**
 * Varsayılan çizim dili. Yalnız EN gizlilik tekrarı için `NUM_INTL_LOCALE=en` (ör. P0 sızıntı senaryolarını İngilizce
 * ekranda da koşmak); belirtilmezse kaynak dil (tr) → mevcut TR beklentiler aynen.
 */
const DEFAULT_TEST_LOCALE: TestLocale = process.env.NUM_INTL_LOCALE === "en" ? "en" : "tr";

export function withIntl(el: ReactElement, locale: TestLocale = DEFAULT_TEST_LOCALE): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale,
    messages: getCatalogMessages(locale),
    timeZone: "Europe/Istanbul",
    onError: (e: Error) => {
      throw e;
    },
    children: el,
  });
}

/** react-dom/server ile aynı imza; varsayılan TR katalog. */
export function renderToStaticMarkup(el: ReactElement, locale: TestLocale = DEFAULT_TEST_LOCALE): string {
  return baseRender(withIntl(el, locale));
}
