"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { BulkDeleteTexts } from "@/lib/ui/bulkDeleteGuard";

/**
 * I18N — 3 aşamalı toplu silme akışının ekran dili metinleri (common.deleteConfirm.bulk).
 * Türkçe katalog değerleri lib/ui/bulkDeleteGuard TR_BULK_DELETE_TEXTS ile BİREBİR aynıdır (birim testi);
 * yazılacak doğrulama ifadesi de katalogdan gelir (tr "4 KAYDI SİL" · en "DELETE 4 RECORDS"). Karşılaştırma
 * kuralı (bulkPhraseMatches) DEĞİŞMEZ.
 */
export function useBulkDeleteTexts(): BulkDeleteTexts {
  const t = useTranslations("common.deleteConfirm");
  return useMemo<BulkDeleteTexts>(
    () => ({
      phrase: (count) => t("bulk.phrase", { count }),
      deleteAllPhrase: t("bulk.deleteAllPhrase"),
      defaultNoun: t("bulk.defaultNoun"),
      scope: (count, noun, deleteAll) => (deleteAll ? t("bulk.scopeAll", { count, noun }) : t("bulk.scope", { count, noun })),
      verbDelete: t("bulk.verbDelete"),
      verbRemove: t("bulk.verbRemove"),
      warnIrreversible: t("bulk.warnIrreversible"),
      warnScope: t("bulk.warnScope"),
      stage1TitleAll: t("bulk.stage1TitleAll"),
      stage1Title: t("bulk.stage1Title"),
      continueText: t("bulk.continue"),
      stage2Title: t("bulk.stage2Title"),
      stage2Message: (phrase) => t("bulk.stage2Message", { phrase }),
      requireLabel: (phrase) => t("bulk.requireLabel", { phrase }),
      stage3TitleIrreversible: t("bulk.stage3TitleIrreversible"),
      stage3Title: t("bulk.stage3Title"),
      stage3MessageIrreversible: (scope) => t("bulk.stage3MessageIrreversible", { scope }),
      stage3Message: (scope) => t("bulk.stage3Message", { scope }),
      confirmIrreversible: (count) => t("bulk.confirmIrreversible", { count }),
      confirm: (count) => t("bulk.confirm", { count }),
      cancelText: t("cancel"),
    }),
    [t],
  );
}
