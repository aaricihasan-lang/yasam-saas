"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

/** Sunucu REF_* kodları (app/api/refleksoloji/**) — katalog: reflexology.errors.codes.<KOD>. */
export const REF_ERROR_CODES = [
  "REF_INVALID_BODY",
  "REF_DEMO_FORBIDDEN",
  "REF_BODY_TOO_LARGE",
  "REF_VALIDATION",
  "REF_INVALID_EXPORT_SCOPE",
  "REF_TOO_MANY_SELECTED",
  "REF_REPORT_TOO_LARGE",
  "REF_ORGAN_REQUIRED",
  "REF_INVALID_ORGAN",
  "REF_ATLAS_READ_FAILED",
  "REF_ATLAS_NOT_FOUND",
  "REF_PROTOCOL_ID_REQUIRED",
  "REF_INVALID_PROTOCOL_ID",
  "REF_PROTOCOLS_READ_FAILED",
  "REF_PROTOCOL_NOT_FOUND",
  "REF_PROTOCOL_NOT_OWNED",
  "REF_CLIENT_FORBIDDEN",
  "REF_SOURCE_UID_REQUIRED",
  "REF_RENAME_NAMES_REQUIRED",
  "REF_SERVER_ERROR",
] as const;

/**
 * I18N-F1-R3 — Refleksoloji API hata KODU → ekran metni (YALNIZ kaynak dil DIŞINDA kullanılır).
 *
 * Çağıranlar kaynak dilde (tr) bugünkü ifadelerini AYNEN korur (sunucunun Türkçe `error` metni). Diğer dillerde
 * sunucunun Türkçe metni yerine bu yardımcı çağrılır: yanıttaki dil-bağımsız `code` önce
 * `reflexology.errors.codes.<KOD>`, sonra ortak `common.apiErrors.codes.<KOD>` (ör. DEMO_READONLY) ile
 * çevrilir; eşlenemezse çağıranın (zaten çevrilmiş) fallback'i döner. Kontrol akışı bu metne bağlanmaz.
 */
export function useRefCodeText(): (payload: unknown, fallback: string) => string {
  const t = useTranslations("reflexology.errors");
  const tCommon = useTranslations("common.apiErrors");
  return useCallback(
    (payload: unknown, fallback: string) => {
      const code =
        payload && typeof payload === "object" && typeof (payload as { code?: unknown }).code === "string"
          ? (payload as { code: string }).code
          : null;
      if (code && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
        if (t.has(`codes.${code}`)) return t(`codes.${code}`);
        if (tCommon.has(`codes.${code}`)) return tCommon(`codes.${code}`);
      }
      return fallback;
    },
    [t, tCommon],
  );
}
