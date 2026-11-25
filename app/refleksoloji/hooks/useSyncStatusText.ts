"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { ReflexologySyncStatus } from "@/lib/refleksoloji/syncStatus";
import { syncMessageKey } from "./syncStatusText";

/**
 * I18N-F1-R3 — senkron rozeti / atlas kayıt bildirimi metni. Kaynak dilde (tr) `status.message` AYNEN;
 * diğer dillerde ./syncStatusText tablosuyla `reflexology.errors.sync.<anahtar>`, eşlenemezse durum bazlı genel metin.
 */
export function useSyncStatusText(): (status: Pick<ReflexologySyncStatus, "state" | "message">) => string {
  const locale = useLocale();
  const t = useTranslations("reflexology.errors.sync");
  return useCallback(
    (status: Pick<ReflexologySyncStatus, "state" | "message">) => {
      if (locale === DEFAULT_LOCALE) return status.message;
      const k = syncMessageKey(status.message);
      if (k) return t(k.key, k.values);
      return status.state === "idle" ? "" : t(`state.${status.state}`);
    },
    [locale, t],
  );
}
