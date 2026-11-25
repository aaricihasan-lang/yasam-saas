/**
 * Biyoenerji Word raporları (6 rota: çakra, enerji bedeni, imajinasyon, bilinçaltı, sembol, seans) — ÇIKTI DİLİ
 * metin katmanı (I18N-F1-R5 RAPOR-E, P22). Önceden 6 rotaya kopyalanmış ortak kalıp (kapsam etiketi, tarih,
 * kayıt sayacı, dosya adı) tek yerde.
 *
 * Sistem metinleri `messages/{tr,en}/reports.bioenergy.json`; TR değerleri eski sabitlerle BİREBİR (golden kilitli).
 * Kayıt içeriği (çakra adı/blokları, enerji bedeni, imajinasyon, bilinçaltı, sembol, seans metni, kategori, kaynak)
 * uzmanın kütüphanesidir → ÇEVRİLMEZ (sistem kütüphanesinden aktarılan standart içerik dahil DB'de yalnız TR).
 * Kanonik bölüm anahtarları (section_key) ve export kipleri değişmez; yalnız görüntü etiketi çıktı dilinde.
 */
import { reportLocaleFor, type ReportLocale } from "@/lib/i18n/reportLocale";
import type { ServerTranslator } from "@/lib/i18n/serverMessages";
import type { ReportCommonStrings } from "@/lib/i18n/reportCommon";
import { formatInstantDateTime } from "@/lib/time/reportTime";
import { EXPORT_TRUNCATED_NOTE } from "@/lib/biyoenerji/reportSecurity";

export type BioReportKind = "chakra" | "energyBody" | "imagination" | "subconscious" | "symbol" | "session";

export type BioText = {
  output: ReportLocale;
  /** `reports.bioenergy` çevirmeni (anahtar: `common.*`, `<kind>.*`). */
  t: ServerTranslator;
  /** Ortak motorlar için — yalnız kaynak dil dışında (TR'de motor varsayılanı; çıktı birebir). */
  common: ReportCommonStrings | undefined;
  /** "Oluşturulma Tarihi" değeri (uzun tarih). */
  generated: (now?: Date) => string;
  /** Kayıt tarihi (uzun; Europe/Istanbul). */
  dateLong: (value: string) => string;
  /** Seans tarihi + saati. */
  dateTime: (value: string) => string;
  /** "N kayıt" sayacı (gruplamasız gösterim). */
  records: (n: number) => string;
  /** Kayıt kartı etiketi (KAYIT #001). */
  recordNo: (i: number) => string;
  /** Kırpma notu (reportSecurity.EXPORT_TRUNCATED_NOTE ile TR birebir). */
  truncated: (n: number) => string;
  /** Kapsam etiketi: tek / seçili / tümü. */
  scope: (kind: BioReportKind, mode: "single" | "selected" | "all", count: number, name: string) => string;
  /** Dosya adı: `<önek>-<kip|slug>-<gün>.docx`. */
  fileName: (kind: BioReportKind, singleSlug: string | null, exportMode: string, dateSlug: string) => string;
  /** docx `styles` (yalnız EN'de belge dili). */
  styles: () => { styles?: NonNullable<ReturnType<ReportLocale["docxStyles"]>> };
};

const cache = new Map<string, BioText>();

export function bioTextFor(output?: ReportLocale | null): BioText {
  const o = output ?? reportLocaleFor("tr");
  const hit = cache.get(o.locale);
  if (hit) return hit;
  const t = o.t("reports.bioenergy");
  const x: BioText = {
    output: o,
    t,
    common: o.isSource ? undefined : o.common,
    generated: (now = new Date()) => o.date(now, { style: "long" }),
    dateLong: (value) => o.date(value, { style: "long", fallback: value }),
    dateTime: (value) => formatInstantDateTime(value, { locale: o.intlTag, fallback: value }),
    records: (n) => t("common.records", { count: n, shown: String(n) }),
    recordNo: (i) => t("common.recordNo", { no: String(i + 1).padStart(3, "0") }),
    // TR: tek kaynak reportSecurity.EXPORT_TRUNCATED_NOTE (katalog TR değeri onunla birebir; harness kilitler).
    truncated: (n) => (o.isSource ? EXPORT_TRUNCATED_NOTE(n) : t("common.truncated", { shown: String(n) })),
    scope: (kind, mode, count, name) => {
      const own = kind === "chakra" || kind === "session";
      if (mode === "single") return t(own ? `${kind}.scopeSingle` : "common.scopeSingle", { name });
      if (mode === "selected") return t(own ? `${kind}.scopeSelected` : "common.scopeSelected", { shown: String(count) });
      return t(`${kind}.scopeAll`, { shown: String(count) });
    },
    fileName: (kind, singleSlug, exportMode, dateSlug) => {
      const mode = singleSlug ?? (exportMode === "selected" ? t("common.fileSelected") : t("common.fileAll"));
      return `${t(`${kind}.file`)}-${mode}-${dateSlug}.docx`;
    },
    styles: () => {
      const s = o.docxStyles();
      return s ? { styles: s } : {};
    },
  };
  cache.set(o.locale, x);
  return x;
}
