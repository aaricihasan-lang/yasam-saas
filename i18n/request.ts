import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type ActiveLocale } from "@/lib/i18n/locales";

import trCommon from "@/messages/tr/common.json";
import trNavigation from "@/messages/tr/navigation.json";
import trHome from "@/messages/tr/home.json";
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
import trClientsAnalizler from "@/messages/tr/clients.analizler.json";

import enCommon from "@/messages/en/common.json";
import enNavigation from "@/messages/en/navigation.json";
import enHome from "@/messages/en/home.json";
import enClients from "@/messages/en/clients.json";
import enClientsList from "@/messages/en/clients.list.json";
import enClientsNotes from "@/messages/en/clients.notes.json";
import enClientsSessions from "@/messages/en/clients.sessions.json";
import enClientsHomework from "@/messages/en/clients.homework.json";
import enClientsMemory from "@/messages/en/clients.memory.json";
import enClientsCombinations from "@/messages/en/clients.combinations.json";
import enClientsStones from "@/messages/en/clients.stones.json";
import enClientsYolculuk from "@/messages/en/clients.yolculuk.json";
import enClientsDetail from "@/messages/en/clients.detail.json";
import enClientsAnalizler from "@/messages/en/clients.analizler.json";

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
    trHome,
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
    trClientsAnalizler,
  ]),
  en: buildMessages([
    enCommon,
    enNavigation,
    enHome,
    enClients,
    enClientsList,
    enClientsNotes,
    enClientsSessions,
    enClientsHomework,
    enClientsMemory,
    enClientsCombinations,
    enClientsStones,
    enClientsYolculuk,
    enClientsDetail,
    enClientsAnalizler,
  ]),
};

export default getRequestConfig(async () => {
  // FAZ 1 / AŞAMA 3 — TR + EN AKTİF. Locale NEXT_LOCALE cookie'sinden çözülür.
  // resolveLocale yalnız AKTİF bir locale kabul eder (aksi → source tr).
  // NOT: cookie okuması bu route'ları dynamic render'a çeker (locale
  // seçimi per-request'tir) — beklenen davranış (URL-prefix'siz i18n).
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: ActiveLocale = resolveLocale(cookieLocale);

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
