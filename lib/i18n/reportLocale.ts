/**
 * ORTAK ÇIKTI DİLİ SÖZLEŞMESİ — rapor üreticileri için `ReportLocale` (I18N geniş geliştirme, Ajan C2).
 *
 * Akış (tek yön):  route ──resolveReportLocale(req, hesap)──▶ ReportLocale ──▶ üretici (lib) ──▶ ortak motorlar
 *
 *   1. DİL TEK YERDE, ROUTE GİRİŞİNDE çözülür. Öncelik: yayın kapısı (kapalı → daima tr) > HESAP tercihi
 *      (public.user_locale_prefs) > NEXT_LOCALE çerezi > tr. İstemcinin gönderdiği `?locale=` / gövde `locale`
 *      KABUL EDİLMEZ. Kapı kapalıyken hesap tercihi için DB'ye hiç gidilmez.
 *   2. Üreticiye bu nesne geçer; üretici dil, Intl etiketi, tarih/saat (24 saat), sayı/para (TRY sabit),
 *      katalog çevirmeni ve terim sözlüğünü YALNIZ buradan alır. Hesaplama/eşleşme/snapshot fonksiyonlarına
 *      ReportLocale GEÇİRİLMEZ (hesap dilden bağımsız; kanonik sayısal sonuç her dilde aynı).
 *   3. Parametresiz üretici çağrısı = kaynak dil (tr) = bugünkü çıktı. TR'de belge dil işareti EKLENMEZ
 *      (`docxStyles()` → undefined) → mevcut Türkçe belgeler bayt-bayt aynı kalır (golden: scripts/i18n/golden).
 *   4. Kullanıcı içeriği (danışan adı, notlar, plan adı, uzman metni) ASLA çevrilmez; olduğu gibi yerleşir.
 *   5. Tarih kararı (25.11.2026): rapor mutlak tarihi Intl sayısal biçimidir — tr-TR `25.11.2026`, en-GB
 *      `25/11/2026`; saat her dilde 24 saat. (Ekran `formatDateAbsolute` sözleşmesi ayrı; bkz. format.ts notu.)
 */
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { formatInstantDate, formatInstantTime, formatDateOnly, type DateStyle } from "@/lib/time/reportTime";
import type { WellnessNoteKind } from "@/lib/docx/reportDisclaimer";
import { isLocaleSwitchingEnabled } from "./gate";
import { DEFAULT_LOCALE, type ActiveLocale } from "./locales";
import { outputLocaleFor, resolveOutputLocale, type OutputLocale } from "./output";
import { localeTranslator, type ServerTranslator } from "./serverMessages";
import { PRODUCT_CURRENCY } from "./format";
import type { ReportCommonStrings, ReportNoteText } from "./reportCommon";

assertServerOnly("lib/i18n/reportLocale");

export type ReportLocale = OutputLocale & {
  /** Kaynak dil (tr) mi — TR yolunda bugünkü çıktı birebir korunur. */
  isSource: boolean;
  /** Katalog çevirmeni (asla istisna fırlatmaz; eksik anahtar → kaynak dil metni). */
  t: (namespace: string) => ServerTranslator;
  /** Terim sözlüğü (`terms` namespace'i — burç, gezegen, ay evresi…). */
  term: ServerTranslator;
  /** Ortak rapor metinleri (reports.common) — ortak motorların `common` parametresine verilir. */
  common: ReportCommonStrings;
  /** Görüntü metni büyük harf (dilin kuralıyla: tr "i→İ", en "i→I"). Arama/normalizasyon için KULLANILMAZ. */
  upper: (text: string) => string;
  /** Anlık zaman (timestamptz) → tarih; varsayılan sayısal (tr 25.11.2026 · en 25/11/2026). */
  date: (value: string | number | Date | null | undefined, opts?: { style?: DateStyle; timeZone?: string; fallback?: string }) => string;
  /** Takvim günü (DATE "YYYY-MM-DD") → tarih; ASLA kaydırılmaz. */
  dateOnly: (value: unknown, opts?: { style?: DateStyle; fallback?: string }) => string;
  /** 24 saat HH:mm. */
  time: (value: string | number | Date | null | undefined, opts?: { timeZone?: string; fallback?: string }) => string;
  /** Sayı (ayraçlar dile göre). */
  number: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  /** Para — birim kayıtlı veriden (varsayılan TRY); kur dönüşümü YOK, yalnız biçim dile göre. */
  currency: (amount: number | null | undefined, currency?: string) => string;
  /**
   * docx `Document({ styles })` için belge dili. TR → undefined (belgeye dil işareti eklenmez; golden aynı).
   * Diğer dillerde `w:lang` = documentLang (en-GB).
   */
  docxStyles: () => { default: { document: { run: { language: { value: string } } } } } | undefined;
};

const cache = new Map<ActiveLocale, ReportLocale>();

function readString(t: ServerTranslator, key: string): string {
  const v = t.raw(key);
  return typeof v === "string" ? v : "";
}

function buildCommon(t: ServerTranslator): ReportCommonStrings {
  const wellnessRaw = (t.raw("wellness") ?? {}) as Record<string, Partial<ReportNoteText> | undefined>;
  const wellness = {} as Record<WellnessNoteKind, ReportNoteText>;
  for (const [k, v] of Object.entries(wellnessRaw)) {
    wellness[k as WellnessNoteKind] = { short: String(v?.short ?? ""), full: String(v?.full ?? "") };
  }
  return {
    reportSummary: readString(t, "reportSummary"),
    tocHeading: readString(t, "tocHeading"),
    tocField: readString(t, "tocField"),
    tocFieldNote: readString(t, "tocFieldNote"),
    summaryTitle: readString(t, "summaryTitle"),
    staticTocTitle: readString(t, "staticTocTitle"),
    staticTocHint: readString(t, "staticTocHint"),
    page: readString(t, "page"),
    information: readString(t, "information"),
    preparedBy: readString(t, "preparedBy"),
    preparedByExpert: readString(t, "preparedByExpert"),
    expertNote: readString(t, "expertNote"),
    signature: readString(t, "signature"),
    generatedOn: readString(t, "generatedOn"),
    wellness,
  };
}

/** Belirli bir dil için ReportLocale (istek bağlamı olmayan üretim, testler, arka plan işleri). */
export function reportLocaleFor(locale: ActiveLocale | OutputLocale = DEFAULT_LOCALE): ReportLocale {
  const base = typeof locale === "string" ? outputLocaleFor(locale) : locale;
  const hit = cache.get(base.locale);
  if (hit) return hit;
  const isSource = base.locale === DEFAULT_LOCALE;
  const tag = base.intlTag;
  const rl: ReportLocale = {
    ...base,
    isSource,
    t: (namespace: string) => localeTranslator(base.locale, namespace),
    term: localeTranslator(base.locale, "terms"),
    common: buildCommon(localeTranslator(base.locale, "reports.common")),
    upper: (text: string) => text.toLocaleUpperCase(tag),
    date: (value, opts) => formatInstantDate(value, { locale: tag, style: opts?.style, timeZone: opts?.timeZone, fallback: opts?.fallback }),
    dateOnly: (value, opts) => formatDateOnly(value, { locale: tag, style: opts?.style, fallback: opts?.fallback }),
    time: (value, opts) => formatInstantTime(value, { locale: tag, timeZone: opts?.timeZone, fallback: opts?.fallback }),
    number: (value, options) => (value == null || !Number.isFinite(value) ? "" : new Intl.NumberFormat(tag, options).format(value)),
    currency: (amount, currency = PRODUCT_CURRENCY) =>
      amount == null || !Number.isFinite(amount) ? "" : new Intl.NumberFormat(tag, { style: "currency", currency }).format(amount),
    docxStyles: () => (isSource ? undefined : { default: { document: { run: { language: { value: base.documentLang } } } } }),
  };
  cache.set(base.locale, rl);
  return rl;
}

/** Kaynak dil (tr) ReportLocale — parametresiz üretici çağrılarının eşdeğeri. */
export function sourceReportLocale(): ReportLocale {
  return reportLocaleFor(DEFAULT_LOCALE);
}

export type ReportAccount = { db: SupabaseClient; tenantId: string; userId: string | null | undefined };

/**
 * Route girişinde TEK çağrı: istekten (çerez + yayın kapısı) ve varsa HESAP tercihinden rapor dili.
 * - Kapı kapalı → tr (DB'ye gidilmez).
 * - Hesap tercihi "set" → o dil; okunamazsa / "unset" → çerez (ekranla aynı kaynak) → tr.
 * - Hiçbir koşulda istisna fırlatmaz; hata → çerez kararı.
 * İstemcinin `?locale=` sorgu parametresi ya da gövde alanı OKUNMAZ.
 */
export async function resolveReportLocale(req: Pick<NextRequest, "cookies"> | null | undefined, account?: ReportAccount | null): Promise<ReportLocale> {
  let fromCookie: OutputLocale;
  try {
    const cookies = (req as { cookies?: { get?: unknown } } | null | undefined)?.cookies;
    fromCookie = resolveOutputLocale(cookies && typeof cookies.get === "function" ? req : null);
  } catch {
    fromCookie = outputLocaleFor(DEFAULT_LOCALE);
  }
  if (!isLocaleSwitchingEnabled() || !account?.userId) return reportLocaleFor(fromCookie);
  try {
    const { readLocalePreference } = await import("./localePreferenceStore");
    const pref = await readLocalePreference(account.db, { tenantId: account.tenantId, userId: account.userId });
    if (pref.status === "set") return reportLocaleFor(pref.locale);
  } catch {
    /* tercih okunamadı → çerez */
  }
  return reportLocaleFor(fromCookie);
}
