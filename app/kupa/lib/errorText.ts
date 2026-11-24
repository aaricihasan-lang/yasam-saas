"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { KUPA_NETWORK_ERROR } from "./api";

/**
 * I18N (2026-11-25) — Kupa & Hacamat istemci hata metni.
 *
 * Kaynak dilde (tr) davranış BİREBİR bugünkü gibidir: `e instanceof Error ? e.message : fallback` (string → aynen)
 * (sunucunun Türkçe güvenli mesajı aynen gösterilir). Kaynak dil dışında sunucu/ağ katmanının Türkçe
 * metni ASLA ekrana yapıştırılmaz (karışık dil yok): ağ hatası kendi çevirisiyle, diğerleri çağıranın
 * (zaten çevrilmiş) fallback metniyle gösterilir. Kontrol akışı bu metne bağlanmaz.
 */
export function useKupaErrorText(): (e: unknown, fallback: string) => string {
  const locale = useLocale();
  const t = useTranslations("cupping.errors");
  return useCallback(
    (e: unknown, fallback: string) => {
      // Hook'ların state'te sakladığı ham mesaj (string) da kabul edilir.
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : null;
      if (locale === DEFAULT_LOCALE) return msg ?? fallback;
      if (msg === KUPA_NETWORK_ERROR) return t("network");
      return fallback;
    },
    [locale, t],
  );
}
