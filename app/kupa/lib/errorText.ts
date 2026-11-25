"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { KUPA_NETWORK_ERROR, KupaApiError } from "./api";

/**
 * I18N (2026-11-25) — Kupa & Hacamat istemci hata metni.
 *
 * Kaynak dilde (tr) davranış BİREBİR bugünkü gibidir: `e instanceof Error ? e.message : fallback` (string → aynen)
 * (sunucunun Türkçe güvenli mesajı aynen gösterilir). Kaynak dil dışında sunucu/ağ katmanının Türkçe
 * metni ASLA ekrana yapıştırılmaz (karışık dil yok): ağ hatası kendi çevirisiyle; sunucu hatası dil-bağımsız
 * `code`'u varsa `cupping.errors.codes.<KOD>` (yoksa ortak `common.apiErrors.codes.<KOD>`, ör. DEMO_READONLY)
 * ile; eşlenemeyen her şey çağıranın (zaten çevrilmiş) fallback metniyle gösterilir. Kontrol akışı bu metne
 * bağlanmaz (I18N-F1-R3: 404 tespiti `isKupaNotFound` ile koda bağlı).
 */
export function useKupaErrorText(): (e: unknown, fallback: string) => string {
  const locale = useLocale();
  const t = useTranslations("cupping.errors");
  const tCommon = useTranslations("common.apiErrors");
  return useCallback(
    (e: unknown, fallback: string) => {
      // Hook'ların state'te sakladığı ham mesaj (string) da kabul edilir.
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : null;
      if (locale === DEFAULT_LOCALE) return msg ?? fallback;
      if (msg === KUPA_NETWORK_ERROR) return t("network");
      const code = e instanceof KupaApiError ? e.code : null;
      if (code) {
        if (t.has(`codes.${code}`)) return t(`codes.${code}`);
        if (tCommon.has(`codes.${code}`)) return tCommon(`codes.${code}`);
      }
      return fallback;
    },
    [locale, t, tCommon],
  );
}
