/**
 * Yaşam Sistemi — mesaj kataloğu birleştirici (I18N-F1).
 *
 * Namespace dosyaları (i18n/catalog.generated.ts) dil başına derinlemesine birleştirilir.
 * Hem istek yapılandırması (i18n/request.ts) hem sistem çıktıları (Word/PDF/PNG — lib/i18n/output.ts)
 * AYNI kataloğu kullanır → ekran ve rapor dili aynı kaynaktan gelir.
 *
 * EKSİK ANAHTAR POLİTİKASI (F0 bulgu: sunucuda boş metin, istemcide ham anahtar yolu görünüyordu):
 *   - production: hedef dil kataloğu KAYNAK dil (tr) üzerine birleştirilir. Hedef dilde eksik kalan bir
 *     anahtar boş metin ya da "clients.detail.x" gibi ham anahtar yerine kaynak dildeki metni gösterir.
 *     (CI kapısı eksik anahtarı merge öncesi zaten FAIL eder; bu yalnız son savunma hattıdır.)
 *   - geliştirme/test: birleştirme YAPILMAZ → eksik anahtar görünür kalır (sunucu ⟦anahtar⟧, istemci
 *     next-intl varsayılanı "namespace.anahtar") ve geliştirici fark eder.
 */
import { CATALOG_PARTS } from "@/i18n/catalog.generated";
import { DEFAULT_LOCALE, type ActiveLocale } from "./locales";
import { pseudoLocalizeMessages } from "./pseudo";

export type Messages = Record<string, unknown>;

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Namespace dosyalarını (aynı kök altında) derinlemesine birleştirir. */
export function deepMerge(target: Messages, source: Messages): Messages {
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

const RAW: Record<ActiveLocale, Messages> = {
  tr: buildMessages(CATALOG_PARTS.tr),
  en: buildMessages(CATALOG_PARTS.en),
};

export type CatalogOptions = {
  /** Hedef dilde eksik anahtar → kaynak dil metni (production varsayılanı). */
  sourceFallback?: boolean;
  /** Yalnız geliştirme: hedef dil metinlerini sözde-yerelleştir (sabit metin / taşma tespiti). */
  pseudo?: boolean;
};

const cache = new Map<string, Messages>();

export function getCatalogMessages(locale: ActiveLocale, options: CatalogOptions = {}): Messages {
  const sourceFallback = options.sourceFallback === true && locale !== DEFAULT_LOCALE;
  const pseudo = options.pseudo === true && locale !== DEFAULT_LOCALE;
  const key = `${locale}|${sourceFallback ? 1 : 0}|${pseudo ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let messages = RAW[locale] ?? RAW[DEFAULT_LOCALE];
  if (pseudo) messages = pseudoLocalizeMessages(messages);
  if (sourceFallback) messages = deepMerge(RAW[DEFAULT_LOCALE], messages);
  cache.set(key, messages);
  return messages;
}

/** Ortama göre varsayılan seçenekler (request.ts ve çıktı katmanı aynı politikayı kullanır). */
export function defaultCatalogOptions(): CatalogOptions {
  const production = process.env.NODE_ENV === "production";
  return {
    sourceFallback: production,
    // Sözde-yerelleştirme production derlemesinde ASLA açılmaz.
    pseudo: !production && process.env.I18N_PSEUDO === "on",
  };
}
