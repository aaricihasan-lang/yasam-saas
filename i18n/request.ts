import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, type ActiveLocale } from "@/lib/i18n/locales";
import { effectiveLocale } from "@/lib/i18n/gate";
import { defaultCatalogOptions, getCatalogMessages } from "@/lib/i18n/catalog";

// Kataloglar i18n/catalog.generated.ts'ten gelir (npm run i18n:catalog). Yeni namespace dosyası
// eklemek bu dosyada değişiklik GEREKTİRMEZ.

// Production'da eksik anahtar için tek seferlik sunucu günlüğü (yalnız anahtar yolu; kullanıcı verisi yok).
const reportedMissing = new Set<string>();

export default getRequestConfig(async () => {
  // Locale NEXT_LOCALE cookie'sinden çözülür; yayın kapısı (lib/i18n/gate.ts) kapalıysa çerez
  // yok sayılır ve kaynak dil (tr) kullanılır. resolveLocale yalnız AKTİF bir locale kabul eder.
  // NOT: cookie okuması bu route'ları dynamic render'a çeker (URL-prefix'siz i18n — beklenen).
  const cookieStore = await cookies();
  const locale: ActiveLocale = effectiveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const options = defaultCatalogOptions();

  return {
    locale,
    messages: getCatalogMessages(locale, options),
    // Saat dilimi sabit: sunucu (UTC) ile tarayıcı arasında next-intl biçimlendirme farkı oluşmaz.
    timeZone: "Europe/Istanbul",
    onError(error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[i18n]", error.message);
        return;
      }
      const key = `${error.code}:${error.message}`;
      if (!reportedMissing.has(key) && reportedMissing.size < 200) {
        reportedMissing.add(key);
        console.error("[i18n]", error.code, error.message);
      }
    },
    // DEV: eksik anahtar açıkça tespit edilebilsin. PROD: ham anahtar (ör.
    // "clients.detail.someMissingKey") KULLANICIYA GÖSTERİLMEZ (kaynak dil yedeği catalog.ts'te).
    getMessageFallback({ namespace, key }) {
      const path = [namespace, key].filter(Boolean).join(".");
      return process.env.NODE_ENV === "development" ? `⟦${path}⟧` : "";
    },
  };
});
