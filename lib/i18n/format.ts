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
 * yerleri değişmeyecek. Mutlak sayısal tarih (formatDateAbsolute*) ekran dilini
 * isteğe bağlı `locale` argümanıyla alır (A13); argümansız çağrı bugünkü `DD.MM.YYYY`.
 */
import { DEFAULT_LOCALE, type ActiveLocale, type PlannedLocale } from "./locales";

/**
 * Owner kararı A8 (I18N-F1): Türkçe tr-TR · İngilizce en-GB · Almanca de-DE; saat 24 saat.
 * en → en-GB: gün/ay/yıl sırası TR'ye yakın ve ay konumu belirsiz değil
 * (en-US MM/DD/YYYY karışıklığından kaçınmak için).
 */
const BCP47: Record<PlannedLocale, string> = {
  tr: "tr-TR",
  en: "en-GB",
  de: "de-DE",
};

export function localeTag(locale: ActiveLocale | PlannedLocale = DEFAULT_LOCALE): string {
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
 * Owner kararı A13 (I18N-F1-R5, Owner §19): mutlak sayısal tarihte ayraç dile göre.
 * tr (ve de) → `DD.MM.YYYY` (bugünkü sözleşme, BAYT-BAYT aynı) · en → en-GB `DD/MM/YYYY`.
 * Sıra her dilde gün/ay/yıl (en-US MM/DD/YYYY YOK); saat her dilde 24 saat.
 * Yalnız GÖSTERİM: doğum saati / astronomik girdi / tarih giriş sözleşmesi / ISO saklama / DB değeri DEĞİŞMEZ.
 * Bilinmeyen / verilmeyen dil → kaynak dil (tr) biçimi (geriye uyumlu: eski çağrılar aynen `DD.MM.YYYY`).
 */
export function absoluteDateSeparator(locale?: ActiveLocale | PlannedLocale | string): "." | "/" {
  return locale === "en" ? "/" : ".";
}

/**
 * MUTLAK (absolute) TARİH — gün.ay.yıl sırası her dilde sabit; ayraç dile göre (A13):
 * tr `DD.MM.YYYY` · en `DD/MM/YYYY`. `locale` verilmezse `DD.MM.YYYY` (bugünkü çıktı, TR regresyonu yok).
 * Danışan doğum/görüşme/randevu gibi absolute tarih alanlarında kullanılır. Açıklayıcı /
 * relative tarihler ve takvim ay/gün adları locale'e göre kalır (bu helper DEĞİL).
 * Tarih bileşenleri tarayıcı yerel saat diliminden okunur (mevcut tr-TR
 * `toLocaleDateString` davranışıyla BYTE-AYNI → TR regresyonu yok).
 */
export function formatDateAbsolute(value: DateInput, locale?: ActiveLocale | PlannedLocale): string {
  const d = toDate(value);
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const sep = absoluteDateSeparator(locale);
  return `${dd}${sep}${mm}${sep}${yyyy}`;
}

/** Mutlak tarih + 24 saat biçiminde saat: tr `DD.MM.YYYY HH:mm` · en `DD/MM/YYYY HH:mm`. */
export function formatDateTimeAbsolute(value: DateInput, locale?: ActiveLocale | PlannedLocale): string {
  const d = toDate(value);
  if (!d) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatDateAbsolute(d, locale)} ${hh}:${min}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// I18N-F1 — SAYI / PARA / SAAT (merkezî; çağrı yerleri modül fazlarında buraya taşınır).
// Yukarıdaki mevcut fonksiyonlar DEĞİŞMEDİ (TR çıktıları byte-aynı).
// ─────────────────────────────────────────────────────────────────────────────

/** Ürünün para birimi. Dil değişimi tutarı ve para birimini DEĞİŞTİRMEZ; yalnız gösterim biçimi değişir. */
export const PRODUCT_CURRENCY = "TRY" as const;

/** Sayı gösterimi (ayraçlar locale'e göre: tr 1.234,5 · en 1,234.5 · de 1.234,5). */
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  locale: ActiveLocale | PlannedLocale = DEFAULT_LOCALE,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}

/**
 * Para gösterimi. Para birimi kayıtlı veriden gelir (varsayılan TRY) ve ASLA locale'den türetilmez;
 * kur dönüşümü YOKTUR. Örn. 1250 TRY → tr "₺1.250,00", en "TRY 1,250.00" / "₺1,250.00" (Intl'e göre).
 */
export function formatCurrency(
  amount: number | null | undefined,
  locale: ActiveLocale | PlannedLocale = DEFAULT_LOCALE,
  currency: string = PRODUCT_CURRENCY,
  options?: Omit<Intl.NumberFormatOptions, "style" | "currency">,
): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency, ...options }).format(amount);
}

/** 24 saat biçiminde saat (HH:mm), tüm dillerde. timeZone verilirse o bölgeye göre (sunucu render'ı için). */
export function formatTime24(value: DateInput, locale: ActiveLocale | PlannedLocale = DEFAULT_LOCALE, timeZone?: string): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeTag(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) }).format(d);
}

/**
 * MUTLAK TARİH — belirli bir saat diliminde (sunucu render'ı / rapor üretimi için). formatDateAbsolute çalışma
 * ortamının yerel saat dilimini kullanır; sunucu UTC iken gün kayabilir. Bu sürüm gün/ay/yıl sözleşmesini
 * korur (tr `DD.MM.YYYY`, en `DD/MM/YYYY`; locale verilmezse `DD.MM.YYYY`) ve bileşenleri verilen saat
 * diliminden okur (varsayılan Europe/Istanbul).
 */
export function formatDateAbsoluteInZone(
  value: DateInput,
  timeZone = "Europe/Istanbul",
  locale?: ActiveLocale | PlannedLocale,
): string {
  const d = toDate(value);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const sep = absoluteDateSeparator(locale);
  return `${get("day")}${sep}${get("month")}${sep}${get("year")}`;
}
