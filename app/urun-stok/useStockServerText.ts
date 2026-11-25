"use client";

/**
 * Ürün & Stok — lib/sunucu kaynaklı Türkçe metinlerin ekran dilinde gösterimi (QA K3-03, Ajan B).
 *
 * lib/urun-stok ve API'ler bugün Türkçe metin döndürüyor (testlerce kilitli; lib DEĞİŞMEZ).
 *  - Kaynak dilde (tr) metin BUGÜNKÜ GİBİ birebir gösterilir → Türkçe regresyonu yok.
 *  - Diğer dillerde Türkçe metin ekrana yapıştırılmaz: çağıranın çevrilmiş yedeği ya da genel metin.
 * canli-stok'taki `isSourceLocale` kalıbının ortak hâli. Kontrol akışı bu metne bağlanmaz.
 */
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export function useStockServerText() {
  const locale = useLocale();
  const t = useTranslations("stock.common.msg");
  return useMemo(() => {
    const isSourceLocale = locale === DEFAULT_LOCALE;
    return {
      isSourceLocale,
      /** `{error}` olarak gömülen ayrıntı: TR'de `String(error ?? "")` ile birebir; diğer dillerde genel ayrıntı. */
      detail: (error: unknown): string => (isSourceLocale ? String(error ?? "") : t("serverDetail")),
      /** `error ?? fallback` kalıbı: TR'de birebir; diğer dillerde yalnız çevrilmiş yedek. */
      text: (error: string | null | undefined, fallback: string): string => (isSourceLocale ? (error ?? fallback) : fallback),
      /** `e instanceof Error ? e.message : fallback` kalıbı: TR'de birebir; diğer dillerde yedek. */
      exception: (e: unknown, fallback: string): string => (isSourceLocale && e instanceof Error ? e.message : fallback),
      /** Lib'deki Türkçe sabit (ör. DUPLICATE_SALE_MESSAGE): TR'de sabitin kendisi, diğer dillerde katalog karşılığı. */
      constant: (trText: string, translated: string): string => (isSourceLocale ? trText : translated),
    };
  }, [locale, t]);
}
