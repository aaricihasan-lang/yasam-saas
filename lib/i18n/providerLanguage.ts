/**
 * Dış içerik sağlayıcıları (Roxy) için DİL HAZIRLIĞI (I18N-F1, Owner kararı A4) — henüz hiçbir modüle BAĞLI DEĞİL.
 *
 * Kural: seçili ekran dili İngilizce ise sağlayıcının ürettiği YORUM metinleri de İngilizce istenir; diğer
 * dillerde aynı davranış. Hesap girdileri, sayısal sonuçlar ve kanonik kimlikler dile göre DEĞİŞMEZ.
 *
 * Bugünkü durum (kod kanıtı, 2026-11-24):
 *   - Astroloji  : lib/astrology/config.ts ASTRO_PROVIDER_LANG="tr" (sabit); önbellek kimliği CalcIdentity.lang
 *                  alanını İÇERİYOR → dil eklenince Türkçe ve İngilizce yanıtlar ayrı önbelleklenir (doğru).
 *   - Numeroloji : lib/numeroloji-klasik/server/providerClient.ts CLASSIC_PROVIDER_LANG="tr"; önbellek anahtarı
 *   (klasik)       lang İÇERİYOR (server/cache.ts:74).
 *   - Human Design: lib/human-design/providers/roxy/config.ts lang="tr"; istemci opts.lang kabul ediyor; normalize
 *                  çıktısı lang'ı provenance olarak saklıyor. Transit çağrısı yalnız sayısal alan için lang=en.
 * Sağlayıcının hangi dilleri desteklediği ÜCRETSİZ olarak doğrulanamadı (çağrılar ücretli; F1'de Roxy çağrısı yok).
 * Bu yüzden `PROVIDER_LANGUAGE_SUPPORT` yalnız kodda kanıtlanan dilleri "doğrulanmış" sayar; diğerleri
 * doğrulanana kadar kaynak dile düşer ve çağıran bunu `fallback: true` ile bilir (sessiz karışık dil yok).
 */
import { DEFAULT_LOCALE, type ActiveLocale, type PlannedLocale } from "./locales";

export type ContentProvider = "roxy_astrology" | "roxy_human_design" | "roxy_numerology";

/** Kodda/sözleşmede kanıtlanmış sağlayıcı dilleri. Yeni dil ancak ücretli doğrulama testinden sonra eklenir. */
export const PROVIDER_LANGUAGE_SUPPORT: Record<ContentProvider, { verified: readonly string[]; pending: readonly string[] }> = {
  roxy_astrology: { verified: ["tr"], pending: ["en", "de"] },
  roxy_human_design: { verified: ["tr", "en"], pending: ["de"] },
  roxy_numerology: { verified: ["tr"], pending: ["en", "de"] },
};

export type ProviderLanguage = { lang: string; fallback: boolean };

/**
 * Ekran diline karşılık gelen sağlayıcı dili. Doğrulanmamış dil istenirse kaynak dil (tr) döner ve
 * `fallback: true` işaretlenir; çağıran arayüzde "içerik Türkçe" notunu gösterebilir.
 * `allowPending` yalnız ücretli doğrulama testinde (Owner bütçe onayıyla) true verilir.
 */
export function providerLanguageFor(
  provider: ContentProvider,
  locale: ActiveLocale | PlannedLocale,
  allowPending = false,
): ProviderLanguage {
  const s = PROVIDER_LANGUAGE_SUPPORT[provider];
  if (s.verified.includes(locale)) return { lang: locale, fallback: false };
  if (allowPending && s.pending.includes(locale)) return { lang: locale, fallback: false };
  return { lang: DEFAULT_LOCALE, fallback: locale !== DEFAULT_LOCALE };
}

/**
 * Önbellek kimliğine dil eklemek için tek yardımcı: aynı girdinin farklı dildeki yorumları ASLA aynı önbellek
 * kaydını paylaşmaz. (Astroloji ve klasik numeroloji bunu zaten yapıyor; yeni önbellekler bunu kullanmalı.)
 */
export function withLanguageInCacheKey(parts: readonly string[], lang: string): string {
  if (!/^[a-z]{2}$/.test(lang)) throw new Error("withLanguageInCacheKey: invalid language code");
  return [...parts, `lang=${lang}`].join("|");
}
