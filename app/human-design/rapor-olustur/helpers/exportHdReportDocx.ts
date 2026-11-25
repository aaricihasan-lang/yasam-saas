import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
} from "docx";
import { reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import { hdXmlSafeLine, hdXmlSafeMultiline } from "@/lib/human-design/reporting/xmlSafeText";
import trReportBuilder from "@/messages/tr/hd.reportBuilder.json";
import enReportBuilder from "@/messages/en/hd.reportBuilder.json";

/**
 * I18N (HD-B, P32) — çıktı dili = EKRAN dili (çağıran `useLocale()` ile verir; parametresiz = tr = bugünkü çıktı).
 * Sistem metinleri ekranla AYNI katalogdan (`hd.reportBuilder.docx`); TR değerleri eski sabitlerle bayt-bayt aynı
 * (golden: scripts/hd-i18n/reports-golden-p32.harness.ts). Kullanıcı içeriği (başlık, danışan adı, rapor metni)
 * ÇEVRİLMEZ. Belge dili (`w:lang`) yalnız TR dışında eklenir → TR belgesi bayt-eşit.
 * Ortak motorlar (reportDisclaimer.wellnessNote, reportTime) bu dalda dil almıyor: TR'de ortak motor çıktısı AYNEN,
 * EN'de HD katalogundaki karşılık. #855 birleşince: `wellnessNote` yerine `output.common.wellness.human_design.full`,
 * "Bilgilendirme" yerine `output.common.information` (tek satır geçiş).
 */
export type HdReportDocxLocale = "tr" | "en";
const DOCX_TEXT = {
  tr: trReportBuilder.hd.reportBuilder.docx,
  en: enReportBuilder.hd.reportBuilder.docx,
} as const;
const DOCUMENT_LANG: Record<HdReportDocxLocale, string> = { tr: "tr-TR", en: "en-GB" };

/** Tek geçişli {ad} yer tutucu doldurma (değerler yeniden taranmaz → kullanıcı metnindeki "{…}" korunur). */
function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

function toSafeFilename(name: string): string {
  return name
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// Satır içi **kalın** ve *italik* markdown'ı TextRun dizisine çevirir.
function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Önce **bold** sonra *italic* — sıra önemli
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }
    if (match[1] !== undefined) {
      runs.push(new TextRun({ text: match[1], bold: true }));
    } else if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], italics: true }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

function parseMarkdownLine(line: string): Paragraph | null {
  // --- ayraç
  if (/^-{3,}$/.test(line.trim())) {
    return new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      },
      spacing: { before: 200, after: 200 },
      children: [],
    });
  }

  // ### Başlık (heading 3)
  const h3 = line.match(/^###\s+(.+)$/);
  if (h3) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: h3[1].trim(), bold: true })],
      spacing: { before: 320, after: 100 },
    });
  }

  // ## Başlık (heading 2)
  const h2 = line.match(/^##\s+(.+)$/);
  if (h2) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: h2[1].trim(), bold: true })],
      spacing: { before: 400, after: 120 },
    });
  }

  // # Başlık (heading 1)
  const h1 = line.match(/^#\s+(.+)$/);
  if (h1) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: h1[1].trim(), bold: true })],
      spacing: { before: 480, after: 160 },
    });
  }

  // - veya * ile başlayan liste öğesi → madde imi
  const bullet = line.match(/^[-*]\s+(.+)$/);
  if (bullet) {
    return new Paragraph({
      children: [
        new TextRun({ text: "• " }),
        ...parseInlineMarkdown(bullet[1].trim()),
      ],
      indent: { left: 240 },
      spacing: { after: 60 },
    });
  }

  // Boş satır → boşluk paragrafı
  if (line.trim() === "") {
    return new Paragraph({ children: [], spacing: { after: 80 } });
  }

  // Normal satır — inline markdown işle
  return new Paragraph({
    children: parseInlineMarkdown(line),
    spacing: { after: 80 },
  });
}

export async function exportHdReportDocx(params: {
  reportTitle: string;
  clientName: string;
  reportText: string;
  /** Ekran dili; verilmezse kaynak dil (tr). */
  locale?: HdReportDocxLocale;
}): Promise<void> {
  const locale: HdReportDocxLocale = params.locale === "en" ? "en" : "tr";
  const isSource = locale === "tr";
  const T = DOCX_TEXT[locale];
  // HD-09: bu (eski) istemci hattında da hiçbir metin XML 1.0'da geçersiz karakter taşımaz.
  const reportTitle = hdXmlSafeLine(params.reportTitle);
  const clientName = hdXmlSafeLine(params.clientName);
  const reportText = hdXmlSafeMultiline(params.reportText);

  // FA-02: tarih + dosya adı Europe/Istanbul günü (UTC dilimi 00:00–03:00 arası "dün" üretmez).
  const now = new Date();
  const today = isSource ? reportGeneratedLabel(undefined, now) : reportGeneratedLabel({ locale: DOCUMENT_LANG[locale] }, now);
  const dateStr = reportFileDate(undefined, now); // "2026-06-23"

  const headerParagraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: T.title, bold: true })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: fill(T.client, { name: clientName }), size: 26 })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: fill(T.createdAt, { date: today }), size: 22, color: "555555" })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: reportTitle, size: 24, italics: true, color: "444488" })],
      spacing: { after: 400 },
    }),
    // ayraç
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "AAAACC" },
      },
      children: [],
      spacing: { after: 400 },
    }),
  ];

  const bodyParagraphs: Paragraph[] = reportText
    .split("\n")
    .map(parseMarkdownLine)
    .filter((p): p is Paragraph => p !== null);

  const doc = new Document({
    ...(isSource ? {} : { styles: { default: { document: { run: { language: { value: DOCUMENT_LANG[locale] } } } } } }),
    sections: [
      {
        children: [
          ...headerParagraphs,
          ...bodyParagraphs,
          // FA-16: sade bilgilendirme notu (küçük, gri; uyarı kutusu değil).
          new Paragraph({
            spacing: { before: 360, after: 60 },
            children: [new TextRun({ text: T.information, bold: true, size: 18, color: "475569" })],
          }),
          new Paragraph({
            children: [new TextRun({ text: isSource ? wellnessNote("human_design").full : T.wellnessFull, italics: true, size: 16, color: "94a3b8" })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);

  const safeName = toSafeFilename(clientName) || T.clientFallback;
  const filename = `${T.fileStem}-${safeName}-${dateStr}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
