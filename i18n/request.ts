import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, type ActiveLocale } from "@/lib/i18n/locales";

import trCommon from "@/messages/tr/common.json";
import trNavigation from "@/messages/tr/navigation.json";
import trClients from "@/messages/tr/clients.json";
import trClientsList from "@/messages/tr/clients.list.json";
import trClientsNotes from "@/messages/tr/clients.notes.json";
import trClientsSessions from "@/messages/tr/clients.sessions.json";
import trClientsHomework from "@/messages/tr/clients.homework.json";
import trClientsMemory from "@/messages/tr/clients.memory.json";
import trClientsCombinations from "@/messages/tr/clients.combinations.json";
import trClientsStones from "@/messages/tr/clients.stones.json";
import trClientsYolculuk from "@/messages/tr/clients.yolculuk.json";
import trClientsDetail from "@/messages/tr/clients.detail.json";

type Messages = Record<string, unknown>;

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Namespace dosyalarını (aynı kök altında) derinlemesine birleştirir. */
function deepMerge(target: Messages, source: Messages): Messages {
  const out: Messages = { ...target };
  for (const key of Object.keys(source)) {
    const nextValue = source[key];
    const prevValue = out[key];
    out[key] =
      isPlainObject(nextValue) && isPlainObject(prevValue)
        ? deepMerge(prevValue, nextValue)
        : nextValue;
  }
  return out;
}

function buildMessages(parts: Messages[]): Messages {
  return parts.reduce<Messages>((acc, part) => deepMerge(acc, part), {});
}

const MESSAGES_BY_LOCALE: Record<ActiveLocale, Messages> = {
  tr: buildMessages([
    trCommon,
    trNavigation,
    trClients,
    trClientsList,
    trClientsNotes,
    trClientsSessions,
    trClientsHomework,
    trClientsMemory,
    trClientsCombinations,
    trClientsStones,
    trClientsYolculuk,
    trClientsDetail,
  ]),
};

export default getRequestConfig(async () => {
  // FAZ 1 / AŞAMA 2A — Yalnız Türkçe (tr) AKTİF.
  // Rendering davranışını (static ↔ dynamic) değiştirmemek için burada
  // cookies()/headers() OKUNMAZ; locale sabit source locale'dir. İkinci dil
  // (EN) açıldığında cookie tabanlı çözüm `resolveLocale()` ile buraya
  // eklenecek (ayrı onay turu — bkz. lib/i18n/locales.ts).
  const locale: ActiveLocale = DEFAULT_LOCALE;

  return {
    locale,
    messages: MESSAGES_BY_LOCALE[locale] ?? MESSAGES_BY_LOCALE[DEFAULT_LOCALE],
    // Eksik anahtar / format hatası: DEV'de görünür logla, PROD'da sessiz.
    onError(error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[i18n]", error.message);
      }
    },
    // DEV: eksik anahtar açıkça tespit edilebilsin. PROD: ham anahtar (ör.
    // "clients.detail.someMissingKey") KULLANICIYA GÖSTERİLMEZ.
    getMessageFallback({ namespace, key }) {
      const path = [namespace, key].filter(Boolean).join(".");
      return process.env.NODE_ENV === "development" ? `⟦${path}⟧` : "";
    },
  };
});
