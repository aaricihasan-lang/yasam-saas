/**
 * Sunucu yanıtlarındaki kullanıcıya görünen metinler için İSTEK DİLİNDE çeviri (I18N-F1-R1).
 *
 * Dil = ekranla aynı kaynak (NEXT_LOCALE çerezi + yayın kapısı; lib/i18n/output.ts resolveOutputLocale).
 * Yayın kapısı kapalıyken (production varsayılanı) her istek kaynak dilde (tr) yanıt alır → Türkçe metinler
 * bugünküyle BAYT-BİREBİR aynıdır (katalogdaki tr değerleri eski sabitlerin kopyasıdır).
 * Kontrol akışı ASLA bu metinlere bağlanmaz; durum kodu ve `code` alanları dil-bağımsız kalır.
 *
 * F1-R2 — HİÇBİR KOŞULDA İSTİSNA FIRLATMAZ (güvenlik rotalarında çevirici try bloğu dışında da kurulabilir):
 *   1. Dil çözümü / çevirici kurulumu hata verirse → kaynak dil (tr) çeviricisi.
 *   2. Çeviri çağrısı hata verirse ya da anahtar bulunamazsa (next-intl ham "namespace.anahtar" döndürür) →
 *      önce kaynak dil metni, o da yoksa genel ve iç ayrıntı içermeyen hata metni (common.apiErrors.generic).
 * Böylece çeviri hatası ne JSON sözleşmesini (durum kodu / code) bozar ne kullanıcıya ham anahtar / iç ayrıntı gösterir.
 */
import type { NextRequest } from "next/server";
import { getCatalogMessages } from "./catalog";
import { getOutputTranslator, resolveOutputLocale } from "./output";
import { DEFAULT_LOCALE, type ActiveLocale } from "./locales";

type MarkupValues = Record<string, string | number | ((chunks: string) => string)>;
export type ServerTranslator = ((key: string, values?: Record<string, string | number>) => string) & {
  /** Ham katalog değeri (ör. e-posta satır dizileri); bulunamazsa / hata olursa kaynak dil, o da yoksa undefined. */
  raw: (key: string) => unknown;
  /** Etiketli metin (e-posta HTML'i; next-intl markup). Aynı güvenli geri dönüş zinciri. */
  markup: (key: string, values?: MarkupValues) => string;
  /** Anahtar hedef ya da kaynak dilde var mı. */
  has: (key: string) => boolean;
};
type RawTranslator = ((key: string, values?: Record<string, string | number>) => string) & {
  raw?: (key: string) => unknown;
  markup?: (key: string, values?: MarkupValues) => string;
  has?: (key: string) => boolean;
};

/** Son çare metni: katalogdan düz nesne erişimi (ICU biçimleme yok → istisna üretmez). */
function genericText(locale: ActiveLocale): string {
  const pick = (l: ActiveLocale) => {
    const common = (getCatalogMessages(l) as { common?: { apiErrors?: { generic?: unknown } } }).common;
    const v = common?.apiErrors?.generic;
    return typeof v === "string" ? v : "";
  };
  try {
    return pick(locale) || pick(DEFAULT_LOCALE);
  } catch {
    return "";
  }
}

function safeTranslator(primary: RawTranslator | null, source: RawTranslator | null, namespace: string, locale: ActiveLocale): ServerTranslator {
  const rawKey = (key: string) => `${namespace}.${key}`;
  const attempt = (tr: RawTranslator | null, key: string, values?: Record<string, string | number>): string | null => {
    if (!tr) return null;
    try {
      const out = tr(key, values);
      return typeof out === "string" && out !== "" && out !== rawKey(key) && out !== key ? out : null;
    } catch {
      return null;
    }
  };
  const attemptRaw = (tr: RawTranslator | null, key: string): unknown => {
    if (!tr || typeof tr.raw !== "function") return undefined;
    try {
      const out = tr.raw(key);
      return out === rawKey(key) || out === key ? undefined : out;
    } catch {
      return undefined;
    }
  };
  const fn = ((key: string, values?: Record<string, string | number>) =>
    attempt(primary, key, values) ?? attempt(source, key, values) ?? genericText(locale)) as ServerTranslator;
  fn.raw = (key: string) => attemptRaw(primary, key) ?? attemptRaw(source, key);
  const attemptMarkup = (tr: RawTranslator | null, key: string, values?: MarkupValues): string | null => {
    if (!tr || typeof tr.markup !== "function") return null;
    try {
      const out = tr.markup(key, values);
      return typeof out === "string" && out !== "" && out !== rawKey(key) && out !== key ? out : null;
    } catch {
      return null;
    }
  };
  fn.markup = (key: string, values?: MarkupValues) =>
    attemptMarkup(primary, key, values) ?? attemptMarkup(source, key, values) ?? genericText(locale);
  fn.has = (key: string) => {
    for (const tr of [primary, source]) {
      try {
        if (tr && typeof tr.has === "function" && tr.has(key)) return true;
      } catch {
        /* yok say */
      }
    }
    return false;
  };
  return fn;
}

function build(locale: ActiveLocale, namespace: string): RawTranslator | null {
  try {
    return getOutputTranslator(locale, namespace) as unknown as RawTranslator;
  } catch {
    return null;
  }
}

/** İsteğin etkin dilinde, verilen namespace için çeviri fonksiyonu (istisna fırlatmaz). */
export function requestTranslator(req: Pick<NextRequest, "cookies"> | null | undefined, namespace: string): ServerTranslator {
  let locale: ActiveLocale = DEFAULT_LOCALE;
  try {
    // Savunmacı: çerez erişimi olmayan istek nesnesi (test sahtesi, Android başlık yolu) yanıtı ASLA bozmaz → kaynak dil.
    const cookies = (req as { cookies?: { get?: unknown } } | null | undefined)?.cookies;
    const safeReq = cookies && typeof cookies.get === "function" ? req : null;
    locale = resolveOutputLocale(safeReq).locale;
  } catch {
    locale = DEFAULT_LOCALE;
  }
  const source = build(DEFAULT_LOCALE, namespace);
  const primary = locale === DEFAULT_LOCALE ? source : build(locale, namespace);
  return safeTranslator(primary, source, namespace, locale);
}

/** Belirli bir dil için çeviri fonksiyonu (istek bağlamı olmayan yardımcılar ve e-posta şablonları; istisna fırlatmaz). */
export function localeTranslator(locale: ActiveLocale, namespace: string): ServerTranslator {
  const source = build(DEFAULT_LOCALE, namespace);
  const primary = locale === DEFAULT_LOCALE ? source : build(locale, namespace);
  return safeTranslator(primary, source, namespace, locale);
}
