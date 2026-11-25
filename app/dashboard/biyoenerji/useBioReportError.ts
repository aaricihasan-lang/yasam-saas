"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { BIO_REPORT_NETWORK_ERROR, bioReportErrorMessage } from "@/lib/biyoenerji/reportDownloadError";

/**
 * I18N-F1-R3 — Biyoenerji Word indirme hata metni (detay ekranları).
 *
 * Kaynak dilde (tr) BİREBİR bugünkü gibidir: `bioReportErrorMessage(res)` / `BIO_REPORT_NETWORK_ERROR`
 * (lib dosyası değişmedi). Kaynak dil dışında Türkçe sunucu metni ekrana yapıştırılmaz: 429 → "çok fazla
 * istek", kodlu yanıt → `bioenergy.errors.codes.<KOD>` ayrıntısıyla, diğerleri → genel "Word raporu
 * oluşturulamadı" metni. (Word ÇIKTISININ dili ayrı tur — burada yalnız ekrandaki hata bildirimi.)
 */
export function useBioReportError() {
  const locale = useLocale();
  const t = useTranslations("bioenergy.errors");
  return useMemo(
    () => ({
      fromResponse: async (res: Response): Promise<string> => {
        if (locale === DEFAULT_LOCALE) return bioReportErrorMessage(res);
        if (res.status === 429) return t("report.rateLimited");
        let code: unknown = null;
        try {
          code = ((await res.clone().json()) as { code?: unknown })?.code ?? null;
        } catch {
          /* gövde JSON değil */
        }
        if (typeof code === "string" && t.has(`codes.${code}`)) {
          return t("report.failedWithDetail", { detail: t(`codes.${code}`) });
        }
        return t("report.failed");
      },
      network: (): string => (locale === DEFAULT_LOCALE ? BIO_REPORT_NETWORK_ERROR : t("report.network")),
    }),
    [locale, t],
  );
}
