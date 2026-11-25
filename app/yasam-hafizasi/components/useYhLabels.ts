"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { clientResultDisplayTitle } from "@/lib/yasam-hafizasi/client/clientSources";

/**
 * I18N — Yaşam Hafızası modül etiketi / yedek başlık GÖSTERİMİ.
 *
 * Sunucu (`moduleLabel`) Türkçe kanonik etiketi gönderir; filtre ve karşılaştırma modül KİMLİĞİYLE
 * (`f.module`) yapılır, etikete BAĞLANMAZ. Kaynak dilde (tr) sunucu etiketi AYNEN gösterilir (TR birebir);
 * diğer dillerde `memory.modules` sözlüğü kullanılır, eşleşme yoksa sunucu etiketi gösterilir.
 */
export function useYhModuleLabel() {
  const t = useTranslations("memory.modules");
  const locale = useLocale();
  const professional = useCallback(
    (module: string, serverLabel: string) =>
      locale === DEFAULT_LOCALE || !t.has(`professional.${module}`) ? serverLabel : t(`professional.${module}`),
    [locale, t],
  );
  const client = useCallback(
    (module: string, serverLabel: string) =>
      locale === DEFAULT_LOCALE || !t.has(`client.${module}`) ? serverLabel : t(`client.${module}`),
    [locale, t],
  );
  /** Danışan kaydı başlığı: gerçek başlık KORUNUR (kullanıcı içeriği); yoksa modül tipine göre yedek başlık. */
  const clientTitle = useCallback(
    (module: string, title: string | null | undefined) => {
      if (locale === DEFAULT_LOCALE || (typeof title === "string" && title.trim().length > 0)) {
        return clientResultDisplayTitle(module, title);
      }
      return t.has(`clientFallbackTitle.${module}`) ? t(`clientFallbackTitle.${module}`) : t("clientFallbackTitle.default");
    },
    [locale, t],
  );
  return { professional, client, clientTitle };
}
