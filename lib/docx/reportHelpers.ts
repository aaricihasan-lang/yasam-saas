/**
 * Shared Word document builder utilities for Yaşam Sistemi reports.
 * All three dogaltas report routes import from here.
 */

import {
  AlignmentType,
  BorderStyle,
  Footer,
  HeadingLevel,
  ImageRun,
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
export const C_MID  = "475569";
export const C_LIGHT = "94a3b8";

/** Accent colors per report section — corporate, not garish */
export const SECTION_COLORS = {
  stones:       "1e3a5f",  // deep navy blue
  minerals:     "064e3b",  // deep forest green
  combinations: "3b0764",  // deep violet
  knowledge:    "7c2d12",  // deep terracotta
  analytics:    "1e293b",  // dark slate
  summary:      "1e293b",
} as const;

export type SectionKey = keyof typeof SECTION_COLORS;

// ReportChild — union of all docx element types placed in section children
export type ReportChild = Paragraph | Table | TableOfContents;

// ─── Heading builders ─────────────────────────────────────────────────────────

/** Section heading — appears in TOC (depth 1) and Navigation Panel */
export function h1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
    pageBreakBefore: pageBreak,
    children: [new TextRun({ text, font: REPORT_FONT })],
  });
}

/**
 * Colored H1 — keeps Heading 1 style (TOC + Nav Panel) but overrides accent color.
 * Character-level color wins over paragraph style color in Word.
 */
export function h1Colored(text: string, color: string, pageBreak = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
    pageBreakBefore: pageBreak,
    children: [new TextRun({ text, bold: true, size: 32, font: REPORT_FONT, color })],
  });
}

/** Item heading — appears in TOC (depth 2) and Navigation Panel */
export function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: REPORT_FONT })],
  });
}

/** Field section heading — Navigation Panel only (TOC limited to depth 1-2) */
export function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, font: REPORT_FONT })],
  });
}

// ─── Content builders ─────────────────────────────────────────────────────────

/** Cover or display line — centered, configurable size/bold/color */
export function coverLine(text: string, size: number, bold = false, color = C_MID): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: REPORT_FONT, color })],
    spacing: { after: 180 },
  });
}

/** Short one-line "Label: value" metadata — NOT a heading */
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

/** Italic muted caption */
export function muted(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: REPORT_FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 220 },
  });
}

/** Thin horizontal rule */
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
 * Profile label — e.g. "DOĞALTAŞ #001" — small-caps style above item H2.
 * Not a heading.
 */
export function profileLabel(text: string, color: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: REPORT_FONT, color, bold: true, allCaps: true })],
    spacing: { before: 360, after: 60 },
  });
}

/**
 * Array field section: H3 heading + bulleted list.
 * Returns [] if arr is null/empty — caller can spread directly.
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

/** Inline runs supporting ^^bold^^ markers */
export function inlineRuns(text: string, size = 22): TextRun[] {
  return text.split("^^").flatMap((part, i) => {
    if (!part) return [];
    return [new TextRun({ text: part, bold: i % 2 === 1, size, font: REPORT_FONT, color: i % 2 === 1 ? C_DARK : C_MID })];
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
            children: [new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 22, font: REPORT_FONT, color: C_DARK })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
            })],
          }),
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: value, size: 22, font: REPORT_FONT, color: C_MID })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
            })],
          }),
        ],
      })
    ),
  });
}

// ─── Premium cover ────────────────────────────────────────────────────────────

export interface PremiumCoverOptions {
  title1: string;        // e.g. "YAŞAM SİSTEMİ"
  title2: string;        // e.g. "DOĞALTAŞ ANSİKLOPEDİSİ"
  subtitle: string;      // e.g. "Profesyonel Bilgi ve Referans Kataloğu"
  date: string;
  stats: { label: string; value: string }[];
}

export function buildPremiumCover(opts: PremiumCoverOptions): ReportChild[] {
  return [
    new Paragraph({ spacing: { before: 1200 } }),
    // Top accent rule
    new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: "cbd5e1" } },
      spacing: { before: 0, after: 0 },
    }),
    new Paragraph({ spacing: { after: 320 } }),
    // YAŞAM SİSTEMİ
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.title1, bold: true, size: 76, font: REPORT_FONT, color: C_DARK, allCaps: true })],
      spacing: { after: 160 },
    }),
    // Main title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.title2, size: 52, font: REPORT_FONT, color: C_MID })],
      spacing: { after: 180 },
    }),
    // Subtitle
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.subtitle, size: 26, font: REPORT_FONT, color: C_LIGHT, italics: true })],
      spacing: { after: 640 },
    }),
    // Mid rule
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
      spacing: { before: 0, after: 560 },
    }),
    // Date
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.date, size: 22, font: REPORT_FONT, color: C_LIGHT })],
      spacing: { after: 320 },
    }),
    // Stats (each on its own line, centered)
    ...opts.stats.map(({ label, value }) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: label + ":  ", size: 22, font: REPORT_FONT, color: C_MID }),
          new TextRun({ text: value, bold: true, size: 22, font: REPORT_FONT, color: C_DARK }),
        ],
        spacing: { after: 120 },
      })
    ),
    // Bottom rule
    new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: "cbd5e1" } },
      spacing: { before: 400, after: 0 },
    }),
  ];
}

// ─── Stats page ───────────────────────────────────────────────────────────────

/**
 * "SİSTEM ÖZETİ" page — appears between cover and TOC.
 * rows: [label, value] pairs for the summary table.
 * extras: optional additional lines below the table.
 */
export function buildStatsPage(rows: [string, string][], extras?: string[]): ReportChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "SİSTEM ÖZETİ", bold: true, size: 44, font: REPORT_FONT, color: C_DARK, allCaps: true })],
      pageBreakBefore: true,
      spacing: { before: 800, after: 640 },
    }),
    twoColTable(rows),
    ...(extras?.length ? [
      spacer(),
      ...extras.map((line) => new Paragraph({
        children: [new TextRun({ text: line, size: 20, font: REPORT_FONT, color: C_MID })],
        spacing: { after: 80 },
      })),
    ] : []),
  ];
}

// ─── Section divider page ─────────────────────────────────────────────────────

/**
 * Full-page visual separator before a main section.
 * Starts a new page; the subsequent h1Colored(…, true) starts yet another page.
 * Result: divider page → section content page.
 */
export function buildSectionDivider(title: string, subtitle: string, color: string): ReportChild[] {
  return [
    // New page: divider content
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "", size: 4 })],
      pageBreakBefore: true,
      spacing: { before: 2400 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 84, font: REPORT_FONT, color, allCaps: true })],
      spacing: { after: 320 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: subtitle, size: 30, font: REPORT_FONT, color: C_LIGHT, italics: true })],
      spacing: { after: 480 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color } },
      spacing: { before: 0, after: 0 },
    }),
  ];
}

// ─── TOC page ─────────────────────────────────────────────────────────────────

/**
 * Real Word TOC field (depth 1-2: H1 sections + H2 items).
 * H3 field headings appear only in Navigation Panel.
 * User must run: Başvurular → İçindekileri Güncelle for page numbers.
 */
export function buildTOCPage(): ReportChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "İÇİNDEKİLER", bold: true, size: 40, font: REPORT_FONT, color: C_DARK })],
      pageBreakBefore: true,
      spacing: { before: 800, after: 600 },
    }),
    new TableOfContents("İçindekiler", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: "ℹ  Word'de açtıktan sonra: Başvurular → İçindekileri Güncelle",
        size: 18, font: REPORT_FONT, color: C_LIGHT, italics: true,
      })],
      spacing: { before: 320, after: 0 },
    }),
  ];
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function buildFooter(reportName: string): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Sayfa ", size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: " / ", size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: `  ·  ${reportName}`, size: 18, font: REPORT_FONT, color: C_LIGHT }),
      ],
    })],
  });
}

// ─── Image support ────────────────────────────────────────────────────────────

/** Extract first image URL from stones.images Array<{url:string}> field */
export function extractFirstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || !images.length) return null;
  const first = images[0];
  if (!first || typeof first !== "object") return null;
  const url = (first as Record<string, unknown>).url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/** Fetch image bytes from URL with 5s timeout. Returns null on any error. */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/** Batch-fetch images (15 concurrent at a time). Returns null for failed fetches. */
export async function fetchImagesBatch(urls: (string | null)[]): Promise<(Buffer | null)[]> {
  const BATCH = 15;
  const out: (Buffer | null)[] = new Array(urls.length).fill(null);
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map((u) => (u ? fetchImageBuffer(u) : Promise.resolve(null)))
    );
    settled.forEach((r, j) => {
      out[i + j] = r.status === "fulfilled" ? r.value : null;
    });
  }
  return out;
}

/** Detect natural dimensions from PNG / JPEG buffer. Returns null if unknown. */
export function getImgDimensions(buf: Buffer): { w: number; h: number } | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      // PNG
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      // JPEG — scan for SOF0/SOF2 markers
      for (let i = 2; i < buf.length - 8; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

function detectImgType(buf: Buffer): "jpg" | "png" | "gif" | "bmp" {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "gif";
  return "jpg";
}

/**
 * Creates a centered image paragraph scaled to maxWidth (default 400px).
 * Falls back to 400×300 if natural dimensions can't be detected.
 */
export function embedImageParagraph(buf: Buffer, maxWidth = 400): Paragraph {
  const dims = getImgDimensions(buf);
  const naturalW = dims?.w ?? 400;
  const naturalH = dims?.h ?? 300;
  const scale = Math.min(1, maxWidth / naturalW);
  const w = Math.round(naturalW * scale);
  const h = Math.round(naturalH * scale);

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: detectImgType(buf) })],
    spacing: { after: 200 },
  });
}
