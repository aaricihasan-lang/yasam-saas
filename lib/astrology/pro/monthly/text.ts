// Gökyüzü Atlası — AYLIK EFEMERİS: gösterim METİNLERİ (SAF; istemci de import edebilir). I18N-F1-R5 / ATLAS-E.
//
// Ekran, Word/PDF ve sunucu yanıtlarındaki her kullanıcı metni katalogdan gelir: messages/<dil>/atlas.monthly.json (`atlas.monthly.*`)
// + ortak terim kataloğu messages/<dil>/terms.json (`terms.*`: burç, gök cismi, graha). Kod Türkçe metin TAŞIMAZ.
// Bu modül dil katmanına (next-intl, çerez, yayın kapısı) BAĞLI DEĞİLDİR — atlas-locale-invariance statik kapısı gereği lib/astrology/pro
// dizini dil katmanını bilmez. Dil, çağıran katmandan `MonthlyText` olarak verilir:
//   • ekran (MonthlyEphemerisDesk): next-intl `useTranslations` → `monthlyTextFrom(...)`,
//   • sunucu (rota / rapor): istek dili (lib/i18n/output.resolveOutputLocale) → `monthlyText(locale)`,
//   • verilmezse kaynak dil (tr) → Türkçe çıktı çeviri öncesiyle bayt-bayt aynı (fixtures/i18n/monthly-ephemeris-tr-taban.json).
// Önbelleğe / kayda yazılan teknik metinler (bağımsız kontrol yöntemi ve nedeni) HER ZAMAN kaynak dilde (tr) üretilir: önbellek dil-bağımsız
// paylaşılır ve kayıtlı anlık görüntü değişmez. Ekran/rapor bu metinleri gösterirken `checkMethodText` / `checkReasonText` ile çevirir.
import trMonthly from "@/messages/tr/atlas.monthly.json";
import enMonthly from "@/messages/en/atlas.monthly.json";
import trTerms from "@/messages/tr/terms.json";
import enTerms from "@/messages/en/terms.json";
import type { MonthlyKind } from "./types";

export type MonthlyLocale = "tr" | "en";
export type MonthlyValues = Record<string, string | number>;
export type MonthlyText = {
  locale: MonthlyLocale;
  /** `atlas.monthly.<key>` */
  t: (key: string, values?: MonthlyValues) => string;
  /** `terms.<key>` (ör. "zodiac.aries", "body.sun", "graha.rahu") */
  term: (key: string) => string;
};

type Tree = { [k: string]: string | Tree };
const pick = (tree: Tree, key: string): string | undefined => {
  let cur: string | Tree | undefined = tree;
  for (const p of key.split(".")) cur = cur && typeof cur === "object" ? cur[p] : undefined;
  return typeof cur === "string" ? cur : undefined;
};
/**
 * Yalnız düz `{ad}` yer tutucuları (katalogdaki bu ad alanı ICU çoğul/seçim/etiket KULLANMAZ; atlas-monthly-i18n harness'ı her anahtarın
 * next-intl ICU çıktısıyla bu biçimleyicinin çıktısını iki dilde karşılaştırır). Değer verilmeyen yer tutucu olduğu gibi kalır.
 */
export function fill(msg: string, values?: MonthlyValues): string {
  if (!values) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

function build(locale: MonthlyLocale, monthly: Tree, terms: Tree): MonthlyText {
  const fallbackMonthly = (trMonthly as unknown as { atlas: { monthly: Tree } }).atlas.monthly;
  const fallbackTerms = (trTerms as unknown as { terms: Tree }).terms;
  return {
    locale,
    // Hedef dilde eksik anahtar → kaynak dil (tr) metni (lib/i18n/catalog üretim politikasıyla aynı); o da yoksa anahtarın kendisi
    // (CI kapısı C2 eksik anahtarı zaten FAIL eder; harness ham anahtar arar).
    t: (key, values) => fill(pick(monthly, key) ?? pick(fallbackMonthly, key) ?? `atlas.monthly.${key}`, values),
    term: (key) => pick(terms, key) ?? pick(fallbackTerms, key) ?? `terms.${key}`,
  };
}

const CACHE = new Map<MonthlyLocale, MonthlyText>();
/** Dil kodu → metin kaynağı. "en" dışındaki her değer kaynak dil (tr). */
export function monthlyText(locale?: string | null): MonthlyText {
  const l: MonthlyLocale = locale === "en" ? "en" : "tr";
  let x = CACHE.get(l);
  if (!x) {
    x =
      l === "en"
        ? build("en", (enMonthly as unknown as { atlas: { monthly: Tree } }).atlas.monthly, (enTerms as unknown as { terms: Tree }).terms)
        : build("tr", (trMonthly as unknown as { atlas: { monthly: Tree } }).atlas.monthly, (trTerms as unknown as { terms: Tree }).terms);
    CACHE.set(l, x);
  }
  return x;
}

/** Kaynak dil (tr) metni — önbelleğe/kayda giden teknik metinler ve dil verilmeyen çağrılar için. */
export const SOURCE_TEXT: MonthlyText = monthlyText("tr");

/** İstemci: next-intl çeviricilerinden (aynı katalog) metin kaynağı. */
export function monthlyTextFrom(locale: string, t: (key: string, values?: MonthlyValues) => string, term: (key: string) => string): MonthlyText {
  return { locale: locale === "en" ? "en" : "tr", t, term };
}

// ─── Kayda / önbelleğe yazılan kaynak-dil teknik metinlerinin gösterim çevirisi ──────────────────────────────────────────────────────
const CHECK_REASON_KEYS = ["reasonNotDe440", "reasonNoData", "reasonInvalid", "reasonError", "reasonIncomplete"] as const;
export type CheckReasonKey = (typeof CHECK_REASON_KEYS)[number];
export const checkReasonSource = (k: CheckReasonKey) => SOURCE_TEXT.t(`check.${k}`);
export const checkMethodSource = (kind: MonthlyKind) => SOURCE_TEXT.t(kind === "western" ? "check.methodWestern" : "check.methodVedic");

/** Saklanan (tr) bağımsız kontrol nedeni → seçili dil. Bilinmeyen metin (eski kayıt) olduğu gibi gösterilir. */
export function checkReasonText(reason: string, L: MonthlyText): string {
  if (L.locale === "tr") return reason;
  const k = CHECK_REASON_KEYS.find((x) => checkReasonSource(x) === reason);
  return k ? L.t(`check.${k}`) : reason;
}
/** Saklanan (tr) bağımsız kontrol yöntemi → seçili dil (türüne göre; bilinmeyen/boş metin olduğu gibi). */
export function checkMethodText(kind: MonthlyKind, stored: string, L: MonthlyText): string {
  if (L.locale === "tr" || stored !== checkMethodSource(kind)) return stored;
  return L.t(kind === "western" ? "check.methodWestern" : "check.methodVedic");
}

// ─── Sunucu hata gövdesi (code + error) → seçili dil ─────────────────────────────────────────────────────────────────────────────────
// Kütüphane katmanı hata metnini kaynak dilde üretir (servis/kayıt fonksiyonları dil bilmez); rota sınırında istek diline çevrilir.
// Kaynak dilde (tr) gövde HİÇ değişmez (aynı nesne) → Türkçe yanıt bayt-bayt aynı. Bilinmeyen metin olduğu gibi kalır.
const ERROR_KEYS = [
  "kindInvalid", "yearInvalid", "monthInvalid", "crossUnavailable", "crossFailed", "providerDisabled", "providerRate", "providerFailed",
  "providerInconsistent", "notCached", "tableRate", "notFound", "storeUnavailable", "dbError", "writeRate", "titleTooLong", "saveRequestIdInvalid",
  "notCachedSave", "pageInvalid", "kindFilterInvalid", "yearFilterInvalid", "formatInvalid", "reportRate",
] as const;
let errorIndex: Map<string, { key: string; values?: MonthlyValues }> | null = null;
function errorSourceIndex(param: { minYear: number; maxYear: number; recordCap: number }) {
  if (errorIndex) return errorIndex;
  const m = new Map<string, { key: string; values?: MonthlyValues }>();
  for (const k of ERROR_KEYS) m.set(SOURCE_TEXT.t(`errors.${k}`), { key: `errors.${k}` });
  const yr = { min: String(param.minYear), max: String(param.maxYear) };
  m.set(SOURCE_TEXT.t("errors.yearRange", yr), { key: "errors.yearRange", values: yr });
  const cap = { cap: String(param.recordCap) };
  m.set(SOURCE_TEXT.t("errors.recordCap", cap), { key: "errors.recordCap", values: cap });
  errorIndex = m;
  return m;
}
export function localizeErrorBody<B extends Record<string, unknown>>(body: B, L: MonthlyText, param: { minYear: number; maxYear: number; recordCap: number }): B {
  if (L.locale === "tr" || typeof body.error !== "string") return body;
  const hit = errorSourceIndex(param).get(body.error);
  return hit ? { ...body, error: L.t(hit.key, hit.values) } : body;
}
