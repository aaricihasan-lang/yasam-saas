/**
 * lib/backup/fileText.ts — Okunabilir yedek / arşiv DOSYALARININ sistem metinleri, çıktı dilinde (Owner §20, A16).
 *
 * Kapsam: "Okunabilir Arşiv" Word'ü (Ayarlar › Dışa Aktarım) ve Premium Word Arşivi "Kayıt Dökümü" parçaları
 * (başlık, notlar, bölüm/kayıt etiketleri, sütun adları, modül / tablo görünen adları, parça dosya adı).
 * KAPSAM DIŞI: teknik JSON yedeği (dil-bağımsız kalır; bu dosya oraya hiç bağlanmaz), kullanıcı içeriği (çevrilmez).
 *
 * Dil kararı route girişinde tek yerde verilir (`resolveOutputLocale` — ekranla aynı çerez + yayın kapısı; #855
 * birleştiğinde hesap tercihini de okuyan `resolveReportLocale` ile değiştirilebilir — imza `ActiveLocale` alır).
 * Kaynak dil (tr): kodun bugünkü Türkçe sabitleri döner (katalog OKUNMAZ) → TR çıktı bayt-bayt aynı. Katalogdaki TR
 * değerleri bu sabitlerin birebir kopyasıdır (harness: readable-locale "TR katalog = sabitler").
 */
import { getOutputTranslator } from "@/lib/i18n/output";
import { localeTag } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, type ActiveLocale } from "@/lib/i18n/locales";
import { MODULE_LABELS } from "./registry";
import type { RegistryEntry } from "./types";
import { WORD_TEXT_TR, type WordExportText } from "./wordExport";

export type BackupFileText = {
  locale: ActiveLocale;
  isSource: boolean;
  word: WordExportText;
  hidden: string;
  moduleLabel: (key: string) => string;
  tableLabel: (entry: RegistryEntry) => string;
  exportTitle: (moduleKey: string | "all") => string;
  dumpTitle: (moduleKey: string) => string;
  dumpFileName: (moduleKey: string, part: number) => string;
  continued: string;
  partNote: (part: number, more: boolean, rows: number) => string;
  clientFilterNote: (count: number) => string;
  dateRangeNote: (from: string | null, to: string | null) => string;
  noteNumerologyHidden: string;
  noteHdSystemReadingHidden: string;
};

/** Kaynak dil — bugünkü kod sabitleri (BİREBİR). */
export const SOURCE_FILE_TEXT: BackupFileText = {
  locale: DEFAULT_LOCALE,
  isSource: true,
  word: WORD_TEXT_TR,
  hidden: "gizli", // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  moduleLabel: (key) => MODULE_LABELS[key] ?? key,
  tableLabel: (entry) => entry.label,
  exportTitle: (key) => (key === "all" ? "Tüm Veriler — Okunabilir Arşiv" : `${MODULE_LABELS[key] ?? key} — Okunabilir Arşiv`), // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  dumpTitle: (key) => `${MODULE_LABELS[key] ?? key} — Kayıt Dökümü`, // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  dumpFileName: (key, part) => `${MODULE_LABELS[key] ?? key} — Kayıt Dökümü — Bölüm ${part}`, // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  continued: " (önceki bölümden devam)", // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  partNote: (part, more, rows) => `Bölüm ${part}${more ? " (devamı sonraki bölümde)" : " (son bölüm)"} · ${rows} kayıt`, // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  clientFilterNote: (count) => `Danışan seçimi: ${count} danışan (yalnız danışana bağlı kayıtlar).`, // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  dateRangeNote: (from, to) => `Kayıt tarihi aralığı: ${from ?? "başlangıç"} – ${to ?? "bugün"} (Europe/Istanbul).`, // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  noteNumerologyHidden:
    "Numeroloji: “Gelecek Yılları Göster” yetkisi olmadığı için başlamamış dönemler bu kopyada yer almaz (kayıtlar değişmedi; tam veri JSON Sistem Yedeği'ndedir).", // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
  noteHdSystemReadingHidden:
    "Human Design: Sistem Yorumu bölümü güncel yetki olmadığı için bu kopyadan çıkarıldı (kayıtlı rapor değişmedi).", // i18n-ignore: kaynak dil (TR) dosya sabiti; katalog TR değeriyle birebir (readable-view harness L1)
};

/**
 * Katalogdan (settings.backup.file.word + modules / tables) metin seti. Kaynak dil için de kurulabilir (yalnız
 * eşitlik denetimi için); üretimde kaynak dil `SOURCE_FILE_TEXT` kullanır.
 */
export function catalogFileText(locale: ActiveLocale): BackupFileText {
  const t = getOutputTranslator(locale, "settings.backup.file.word") as unknown as {
    (key: string, values?: Record<string, string | number>): string;
    raw: (key: string) => unknown;
  };
  const tb = getOutputTranslator(locale, "settings.backup") as unknown as {
    (key: string): string;
    has: (key: string) => boolean;
  };
  const tag = localeTag(locale);
  const isSource = locale === DEFAULT_LOCALE;
  const num = (n: number) => (isSource ? String(n) : new Intl.NumberFormat(tag).format(n));
  const cols = (t.raw("columns") ?? {}) as Record<string, string>;
  const moduleLabel = (key: string) => (tb.has(`modules.${key}`) ? tb(`modules.${key}`) : (MODULE_LABELS[key] ?? key));
  const word: WordExportText = {
    ...(isSource ? {} : { intlTag: tag, documentLang: tag }),
    upperTag: tag,
    yes: t("yes"),
    no: t("no"),
    linkedRecord: (ref) => t("linkedRecord", { ref }),
    embeddedImage: t("embeddedImage"),
    providerNeutral: t("providerNeutral"),
    column: (n) => t("column", { n: String(n) }),
    record: (n) => t("record", { n: String(n) }),
    generatedOn: (date) => t("generatedOn", { date }),
    intro: t("intro"),
    incompleteHeading: t("incompleteHeading"),
    incompleteLead: t("incompleteLead"),
    sectionIncomplete: (error) => (error ? t("sectionIncompleteDetail", { error }) : t("sectionIncomplete")),
    sectionEmpty: t("sectionEmpty"),
    count: (n, expected) =>
      n === 0
        ? t("countNone")
        : expected !== null && expected !== n
          ? t("countExpected", { count: n, n: num(n), expected: num(expected) })
          : t("count", { count: n, n: num(n) }),
    budgetRecords: (n) => t("budgetRecords", { n: num(n) }),
    budgetBytes: (mb) => t("budgetBytes", { mb }),
    colLabels: cols,
  };
  return {
    locale,
    isSource,
    word,
    hidden: t("hidden"),
    moduleLabel,
    tableLabel: (entry) => (tb.has(`tables.${entry.table}`) ? tb(`tables.${entry.table}`) : entry.label),
    exportTitle: (key) => (key === "all" ? t("exportTitleAll") : t("exportTitle", { module: moduleLabel(key) })),
    dumpTitle: (key) => t("dumpTitle", { module: moduleLabel(key) }),
    dumpFileName: (key, part) => t("dumpFileName", { module: moduleLabel(key), part: String(part) }),
    continued: t("continued"),
    partNote: (part, more, rows) => t(more ? "partNoteMore" : "partNote", { part: String(part), count: rows, n: num(rows) }),
    clientFilterNote: (count) => t("clientFilterNote", { count, n: num(count) }),
    dateRangeNote: (from, to) => t("dateRangeNote", { from: from ?? t("rangeStart"), to: to ?? t("rangeToday") }),
    noteNumerologyHidden: t("noteNumerologyHidden"),
    noteHdSystemReadingHidden: t("noteHdSystemReadingHidden"),
  };
}

const cache = new Map<ActiveLocale, BackupFileText>();

/** Çıktı dili → dosya metinleri. Kaynak dil → bugünkü sabitler (katalog okunmaz). */
export function backupFileText(locale: ActiveLocale = DEFAULT_LOCALE): BackupFileText {
  if (locale === DEFAULT_LOCALE) return SOURCE_FILE_TEXT;
  const hit = cache.get(locale);
  if (hit) return hit;
  const built = catalogFileText(locale);
  cache.set(locale, built);
  return built;
}
