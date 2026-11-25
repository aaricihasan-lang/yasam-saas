/**
 * Dijital İçerik Merkezi Word çıktıları — ÇIKTI DİLİ metin katmanı (I18N-F1-R5 RAPOR-CD: P38 OCR→Word, P39 Ders notu
 * Word, P40 Video çeviri Word).
 *
 * Bu üreticilerde belge GÖVDESİ %100 kullanıcı / OCR / AI metnidir (çevrilmez). Sistem kısmı yalnız: video raporu
 * başlıkları + "Kaynak:" satırı, dosya adı sistem parçası ve belge dili (w:lang yalnız EN).
 * "Türkçe Çeviri" ürün özelliğidir (hedef dil Türkçe) → EN çıktıda dilin ADI İngilizce yazılır ("Turkish Translation");
 * hedef dil ekran diline BAĞLANMAZ. TR'de bütün metinler eski sabitlerle birebir (golden: reports-cd-tr.golden.json).
 */
import { reportLocaleFor, type ReportLocale } from "@/lib/i18n/reportLocale";
import type { ExportMode } from "./exportHelpers";

const NS = "reports.documents";

function tr(output?: ReportLocale | null) {
  return (output ?? reportLocaleFor("tr")).t(NS);
}

/** Video çeviri Word metinleri (başlık, kaynak satırı, karşılaştırma bölüm başlıkları, dosya adı soneki). */
export function videoExportText(output?: ReportLocale | null) {
  const t = tr(output);
  return {
    title: (mode: ExportMode): string => t(`video.title.${mode}`),
    source: (fileName: string): string => t("video.source", { fileName }),
    originalHeading: t("video.originalHeading"),
    translationHeading: t("video.translationHeading"),
    fileSuffix: (mode: ExportMode): string => t(`video.fileSuffix.${mode}`).replace(/[^A-Za-z0-9_-]/g, "") || mode,
  };
}

/** Ders notu Word dosya adı (EN: lecture-notes.docx). */
export function lectureNotesFileName(output?: ReportLocale | null): string {
  return tr(output)("lectureNotes.fileName").replace(/[^A-Za-z0-9._-]/g, "") || "ders-notu.docx";
}

/** OCR metni Word dosya adı (EN: ocr-text.docx). */
export function ocrWordFileName(output?: ReportLocale | null): string {
  return tr(output)("ocr.wordFileName").replace(/[^A-Za-z0-9._-]/g, "") || "ocr-metin.docx";
}

/** docx `Document` seçeneklerine eklenecek belge dili (TR'de boş → bugünkü çıktı birebir). */
export function documentLangOptions(output?: ReportLocale | null): { styles?: NonNullable<ReturnType<ReportLocale["docxStyles"]>> } {
  const styles = output?.docxStyles();
  return styles ? { styles } : {};
}
