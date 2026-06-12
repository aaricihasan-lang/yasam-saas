/**
 * Shared Word document builder utilities for Yaşam Sistemi reports.
 * Used by all three dogaltas report routes.
 */

import {
  AlignmentType,
  BorderStyle,
  Footer,
  HeadingLevel,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// ─── Constants ────────────────────────────────────────────────────────────────

export const REPORT_FONT = "Calibri";
export const C_DARK = "1e293b";
export const C_MID = "475569";
export const C_LIGHT = "94a3b8";

// Union that covers all docx children types used in these reports
export type ReportChild = Paragraph | Table | TableOfContents;

// ─── Heading builders ─────────────────────────────────────────────────────────

export function coverLine(text: string, size: number, bold = false, color = C_MID): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: REPORT_FONT, color })],
    spacing: { after: 180 },
  });
}

/** Section heading — appears in TOC and Navigation Panel */
export function h1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
    pageBreakBefore: pageBreak,
  });
}

/** Item heading (stone/mineral/article name) — appears in TOC and Navigation Panel */
export function h2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 200 },
  });
}

/** Field section heading — appears in Navigation Panel only (TOC depth 1-2) */
export function h3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
  });
}

// ─── Content builders ─────────────────────────────────────────────────────────

/** Short one-line metadata: "Label: value" — NOT a heading */
export function fieldInline(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: REPORT_FONT, color: C_DARK }),
      new TextRun({ text: value, size: 22, font: REPORT_FONT, color: C_MID }),
    ],
    spacing: { after: 100 },
  });
}

/** Body paragraph with left indent */
export function bodyText(text: string, size = 22): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size, font: REPORT_FONT, color: C_MID })],
    indent: { left: 360 },
    spacing: { after: 140 },
  });
}

/** Italic muted caption line */
export function muted(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: REPORT_FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 220 },
  });
}

/** Thin horizontal rule between items */
export function divider(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
    spacing: { before: 280, after: 280 },
  });
}

/** Empty spacing paragraph */
export function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 200 } });
}

/**
 * Array field section: H3 heading + bulleted list.
 * Skipped entirely if arr is null/empty.
 */
export function arraySection(label: string, arr: string[] | null): Paragraph[] {
  const items = arr?.filter(Boolean) ?? [];
  if (!items.length) return [];
  return [
    h3(label),
    ...items.map((item) =>
      new Paragraph({
        children: [
          new TextRun({ text: "·  ", size: 20, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ text: item.trim(), size: 20, font: REPORT_FONT, color: C_MID }),
        ],
        indent: { left: 360 },
        spacing: { after: 80 },
      })
    ),
  ];
}

// ─── Inline bold runs (^^ markers) ───────────────────────────────────────────

export function inlineRuns(text: string, size = 22): TextRun[] {
  return text.split("^^").flatMap((part, i) => {
    if (!part) return [];
    return [
      new TextRun({
        text: part,
        bold: i % 2 === 1,
        size,
        font: REPORT_FONT,
        color: i % 2 === 1 ? C_DARK : C_MID,
      }),
    ];
  });
}

// ─── Table builder ────────────────────────────────────────────────────────────

export function twoColTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [new TextRun({ text: label, bold: true, size: 22, font: REPORT_FONT, color: C_DARK })],
                spacing: { before: 100, after: 100 },
                indent: { left: 120 },
              }),
            ],
          }),
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [new TextRun({ text: value, size: 22, font: REPORT_FONT, color: C_MID })],
                spacing: { before: 100, after: 100 },
                indent: { left: 120 },
              }),
            ],
          }),
        ],
      })
    ),
  });
}

// ─── TOC page (real Word TOC field) ──────────────────────────────────────────

/**
 * Returns a page-break + bold title + real Word TOC field.
 * TOC includes H1 (sections) and H2 (items) — depth 1-2.
 * H3 field headings appear in Navigation Panel only, not in the TOC.
 *
 * After opening in Word: Başvurular → İçindekileri Güncelle
 * to populate page numbers.
 */
export function buildTOCPage(): ReportChild[] {
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: "İÇİNDEKİLER",
          bold: true,
          size: 40,
          font: REPORT_FONT,
          color: C_DARK,
        }),
      ],
      alignment: AlignmentType.CENTER,
      pageBreakBefore: true,
      spacing: { before: 800, after: 600 },
    }),
    new TableOfContents("İçindekiler", {
      hyperlink: true,
      headingStyleRange: "1-2",
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "ℹ  Word'de açtıktan sonra: Başvurular → İçindekileri Güncelle",
          size: 18,
          font: REPORT_FONT,
          color: C_LIGHT,
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 320, after: 0 },
    }),
  ];
}

// ─── Footer builder ───────────────────────────────────────────────────────────

export function buildFooter(reportName: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Sayfa ", size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ text: " / ", size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ text: `  ·  ${reportName}`, size: 18, font: REPORT_FONT, color: C_LIGHT }),
        ],
      }),
    ],
  });
}
