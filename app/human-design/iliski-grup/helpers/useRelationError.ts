"use client";

// İlişki ve Grup — istemci hata metni ekran dilinde (I18N-F1-R5 HD). Kontrol akışı metne BAĞLANMAZ.
//   • Ağ hatası (relationsClient, code HD_REL_NETWORK*): TR'de istemcinin Türkçe metni AYNEN; diğer dillerde katalog.
//   • Sunucu hatası: lib/i18n/apiError.localizeApiError — TR'de sunucu metni BİREBİR (bugünkü davranış); diğer dillerde
//     kod eşlemesi, yoksa genel metin (Türkçe metin İngilizce ekrana yapıştırılmaz).

import { useLocale, useTranslations } from "next-intl";
import { localizeApiError } from "@/lib/i18n/apiError";

export function useRelationError(): (f: { error: string; code?: string }) => string {
  const locale = useLocale();
  const tRel = useTranslations("hd.relations.errors");
  const tApi = useTranslations("common.apiErrors");
  return (f) => {
    if (f.code && f.code.startsWith("HD_REL_NETWORK")) return locale === "tr" || !tRel.has(f.code) ? f.error : tRel(f.code);
    return localizeApiError(tApi, locale, f);
  };
}
