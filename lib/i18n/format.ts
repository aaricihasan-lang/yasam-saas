/**
 * Yaşam Sistemi — i18n merkezî TARİH/SAAT görüntüleme yardımcıları.
 *
 * KAPSAM: Yalnız DISPLAY (görüntüleme) formatı. Bu tur için çıktı, mevcut
 * `toLocale*("tr-TR", …)` çağrılarıyla BYTE-AYNI kalacak şekilde tr-TR'ye
 * sabitlenmiştir → TR regresyonu yok.
 *
 * ⚠️ Bu dosya VERİ NORMALİZASYONU DEĞİLDİR. Arama/karşılaştırma davranışları
 * (turkishSearch, localeCompare(…, "tr"), toLocaleUpperCase("tr-TR")) locale
 * anahtarına BAĞLANMAZ ve bu helper ile DEĞİŞTİRİLMEZ. Kullanıcı Türkçe/İngilizce
 * veri girebilir; normalizasyon ayrı bir konudur.
 *
 * İleride EN/DE/FR açıldığında yalnız `BCP47` tablosu genişletilecek; çağrı
 * yerleri değişmeyecek.
 */
import { DEFAULT_LOCALE, type ActiveLocale } from "./locales";

const BCP47: Record<ActiveLocale, string> = {
  tr: "tr-TR",
  // en → en-GB: gün/ay/yıl sırası TR'ye yakın ve ay konumu belirsiz değil
  // (en-US MM/DD/YYYY karışıklığından kaçınmak için).
  en: "en-GB",
};

export function localeTag(locale: ActiveLocale = DEFAULT_LOCALE): string {
  return BCP47[locale] ?? BCP47[DEFAULT_LOCALE];
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale: ActiveLocale = DEFAULT_LOCALE,
): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(localeTag(locale), options) : "";
}

export function formatDateTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale: ActiveLocale = DEFAULT_LOCALE,
): string {
  const d = toDate(value);
  return d ? d.toLocaleString(localeTag(locale), options) : "";
}

export function formatTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale: ActiveLocale = DEFAULT_LOCALE,
): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(localeTag(locale), options) : "";
}

/**
 * MUTLAK (absolute) TARİH — global ürün sözleşmesi: TÜM locale'lerde `DD.MM.YYYY`.
 * Locale'e BAĞLI DEĞİLDİR (tr-TR de en-GB de → noktalı, sıra gün.ay.yıl). Danışan
 * doğum/görüşme/randevu gibi absolute tarih alanlarında kullanılır. Açıklayıcı /
 * relative tarihler ve takvim ay/gün adları locale'e göre kalır (bu helper DEĞİL).
 * Tarih bileşenleri tarayıcı yerel saat diliminden okunur (mevcut tr-TR
 * `toLocaleDateString` davranışıyla BYTE-AYNI → TR regresyonu yok).
 */
export function formatDateAbsolute(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** Mutlak tarih + 24 saat biçiminde saat: `DD.MM.YYYY HH:mm` (tüm locale). */
export function formatDateTimeAbsolute(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatDateAbsolute(d)} ${hh}:${min}`;
}
