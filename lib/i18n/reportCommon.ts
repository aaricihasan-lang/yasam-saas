/**
 * RAPOR ORTAK METİNLERİ — tip sözleşmesi (SAF; katalog/sunucu bağımlılığı YOK → istemci paketine de girebilir).
 *
 * Ortak rapor motorları (lib/docx/reportHelpers, premiumToc, reportDisclaimer, expertBranding) bu tipte
 * İSTEĞE BAĞLI bir `common` parametresi alır:
 *   - verilmezse → motorun bugünkü Türkçe sabitleri (çıktı bayt-bayt aynı; golden: scripts/i18n/golden),
 *   - verilirse  → katalogdan (messages/<dil>/reports.common.json) gelen metinler.
 * Değerler sunucuda `reportLocaleFor(locale).common` ile üretilir (lib/i18n/reportLocale.ts). Katalogdaki TR
 * değerleri motor sabitlerinin birebir kopyasıdır (golden harness "TR katalog = taban" koşusuyla kilitli).
 */
import type { WellnessNoteKind } from "@/lib/docx/reportDisclaimer";

export type ReportNoteText = { short: string; full: string };

export type ReportCommonStrings = {
  /** Büyük özet sayfası başlığı (reportHelpers; allCaps). */
  reportSummary: string;
  /** Ortalı büyük İçindekiler başlığı (reportHelpers / premiumToc). */
  tocHeading: string;
  /** Word TOC alanı başlığı. */
  tocField: string;
  /** Word TOC alanı alt notu. */
  tocFieldNote: string;
  /** Kompakt özet başlığı (premiumToc). */
  summaryTitle: string;
  /** Statik İçindekiler başlığı (premiumToc). */
  staticTocTitle: string;
  /** Statik İçindekiler ipucu (premiumToc). */
  staticTocHint: string;
  /** Alt bilgi sayfa etiketi ("Sayfa" → "Sayfa 3 / 9"). */
  page: string;
  /** Rapor sonu bilgilendirme bölümü başlığı. */
  information: string;
  /** "Hazırlayan" etiketi (imza kartı / "Hazırlayan: Ad"). */
  preparedBy: string;
  /** Kapak uzman bloğu etiketi. */
  preparedByExpert: string;
  /** Uzman dipnotu başlığı. */
  expertNote: string;
  /** İmza çizgisi etiketi. */
  signature: string;
  /** Rapor oluşturulma tarihi etiketi (yeni üreticiler için; bugünkü TR çıktılarda kullanılmıyor). */
  generatedOn: string;
  /** Bilgilendirme / yasal not metinleri (tür başına kısa + tam). */
  wellness: Record<WellnessNoteKind, ReportNoteText>;
};
