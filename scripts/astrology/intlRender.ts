/**
 * Astroloji harness'ları — next-intl sağlayıcılı sunucu çizimi (I18N mod-g, 25.11.2026). Yalnız test.
 *
 * Atlas bileşenleri metinlerini `useTranslations` ile katalogdan alır; sağlayıcı olmadan next-intl hata fırlatır. Bileşen çizen
 * harness'lar `react-dom/server` yerine bu modülden `renderToStaticMarkup` içe aktarır: çizim ürünle AYNI katalogla (varsayılan
 * TR) yapılır, bu yüzden harness'ların Türkçe metin beklentileri DEĞİŞMEDEN geçerli kalır (TR katalog = önceki kaynak metin).
 * Eksik / hatalı mesaj sessiz geçmez: hata fırlatılır.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup as baseRender } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";

export type TestLocale = "tr" | "en";

export function withIntl(el: ReactElement, locale: TestLocale = "tr"): ReactElement {
  return createElement(
    NextIntlClientProvider,
    {
      locale,
      messages: getCatalogMessages(locale),
      timeZone: "Europe/Istanbul",
      onError: (e: Error) => {
        throw e;
      },
      children: el,
    },
  );
}

/** react-dom/server ile aynı imza; varsayılan TR katalog. */
export function renderToStaticMarkup(el: ReactElement, locale: TestLocale = "tr"): string {
  return baseRender(withIntl(el, locale));
}
