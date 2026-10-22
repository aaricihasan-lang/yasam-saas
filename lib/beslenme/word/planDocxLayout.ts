/**
 * Beslenme Plan Word — BESLENME'YE ÖZEL premium düzen yapı taşları (SAF; DB/ağ YOK).
 *
 * Danışan Yolculuğu Word standardı referans alınır (kapak + sabit düzen tablolar + doğal sayfa
 * akışı) ama Beslenme'nin açık, ferah, yeşil/doğal kimliği korunur. Ortak `lib/docx/reportHelpers`
 * DEĞİŞMEZ; yalnız sabitler / footer / XML temizleme okunur.
 *
 * GÖRSEL POLİTİKASI (SSRF-güvenli): bu dosyadaki TEK görsel, çağıranın PARAMETRE olarak verdiği
 * onaylı Yaşam Sistemi logosudur (sunucu paket içi asset'ten okunur). Uzak görsel getirme / URL
 * fetch kod-yolu YOKTUR. Logo yoksa yerine yazı ile marka basılır; yeni logo ÜRETİLMEZ.
 *
 * Sayfa: A4, 2 cm kenar → basılabilir genişlik 9638 twip. Zorunlu sayfa sonu YOK (kapak ayrı
 * bölümdür); başlıklar keepNext ile içeriğinden kopmaz, tablo satırları bölünmez, uzun tablolarda
 * başlık satırı yeni sayfada tekrarlanır.
 */
import {
  AlignmentType,
  BorderStyle,
  Header,
  HeadingLevel,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { C_DARK, C_LIGHT, C_MID, REPORT_FONT, getImgDimensions, sanitizeXmlText, type ReportChild } from "@/lib/docx/reportHelpers";

export const BPAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 567, footer: 567 },
} as const;
export const BCONTENT_W = 9638;

/** Beslenme yeşil/doğal paleti. */
export const BG = {
  deep: "065f46",
  green: "047857",
  leaf: "10b981",
  mint: "a7f3d0",
  fill: "ecfdf5",
  fillSoft: "f6fdf9",
  border: "d1fae5",
} as const;

const safe = (t: string | null | undefined) => sanitizeXmlText(String(t ?? "")).trim();

function runs(text: string, o: { size: number; color: string; bold?: boolean; italics?: boolean }): TextRun[] {
  return sanitizeXmlText(text).replace(/\r\n?/g, "\n").split("\n").map((line, i) =>
    new TextRun({ text: line, break: i > 0 ? 1 : undefined, size: o.size, font: REPORT_FONT, color: o.color, bold: o.bold, italics: o.italics }),
  );
}

// ─── Kapak ───────────────────────────────────────────────────────────────────

export type BCoverInput = {
  logo: Buffer | null;
  planTitle: string;
  range: string;
  meta: [string, string][];
};

function rule(color: string, size: number, after: number): Paragraph {
  return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size, color } }, spacing: { before: 0, after } });
}

/** Onaylı logo: yalnız oranlı ölçek (kırpma/renk/kompozisyon değişikliği YOK). */
function logoParagraph(logo: Buffer): Paragraph | null {
  const dims = getImgDimensions(logo);
  if (!dims) return null;
  const scale = Math.min(1, 220 / dims.w);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new ImageRun({ type: "png", data: logo, transformation: { width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) } })],
  });
}

/** Tek sayfalık premium kapak (ayrı bölüm → üst/alt bilgi taşımaz). */
export function bCover(c: BCoverInput): ReportChild[] {
  const out: ReportChild[] = [new Paragraph({ spacing: { before: 0, after: 760 } })];
  const logo = c.logo ? logoParagraph(c.logo) : null;
  if (logo) out.push(logo);
  else {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "YAŞAM SİSTEMİ", bold: true, size: 60, font: REPORT_FONT, color: BG.deep })],
    }));
  }
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 640 },
    children: [new TextRun({ text: "Bütüncül Yaşam Analizi Platformu", italics: true, size: 22, font: REPORT_FONT, color: C_MID })],
  }));
  out.push(rule(BG.green, 12, 80), rule(BG.mint, 6, 460));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text: "BESLENME PLANI", bold: true, size: 30, font: REPORT_FONT, color: BG.green, characterSpacing: 60 })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text: safe(c.planTitle) || "Beslenme Planı", bold: true, size: 52, font: REPORT_FONT, color: C_DARK })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 480 },
    children: [new TextRun({ text: safe(c.range), size: 26, font: REPORT_FONT, color: BG.deep })],
  }));
  out.push(rule(BG.mint, 6, 320));
  for (const [label, value] of c.meta) {
    if (!value?.trim()) continue;
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: `${safe(label)}:  `, size: 22, font: REPORT_FONT, color: C_MID }),
        new TextRun({ text: safe(value), bold: true, size: 22, font: REPORT_FONT, color: C_DARK }),
      ],
    }));
  }
  out.push(new Paragraph({ spacing: { before: 360, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BG.mint } } }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 0 },
    children: [new TextRun({ text: "yasamsistemi.com", size: 18, font: REPORT_FONT, color: C_LIGHT })],
  }));
  return out;
}

/** Gövde üst bilgisi: sağda marka + plan adı, ince yeşil çizgi. */
export function bHeader(planTitle: string): Header {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BG.mint, space: 4 } },
      children: [
        new TextRun({ text: "Yaşam Sistemi · Beslenme Planı", size: 16, font: REPORT_FONT, color: BG.green, bold: true }),
        new TextRun({ text: `  ·  ${safe(planTitle)}`, size: 16, font: REPORT_FONT, color: C_LIGHT }),
      ],
    })],
  });
}

// ─── Başlıklar / metin ───────────────────────────────────────────────────────

/** Bölüm başlığı (ör. "Plan Genel Özeti"): sol yeşil şerit; içerikle aynı sayfada kalır. */
export function bSectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    keepLines: true,
    spacing: { before: 360, after: 160 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 36, color: BG.green, space: 8 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BG.border, space: 4 },
    },
    children: [new TextRun({ text: safe(text), bold: true, size: 28, font: REPORT_FONT, color: BG.deep })],
  });
}

/** Gün başlığı: açık yeşil bant; ilk öğünle aynı sayfada kalır (keepNext zinciri). */
export function bDayTitle(text: string, meta?: string | null): Paragraph {
  const r = [new TextRun({ text: safe(text), bold: true, size: 26, font: REPORT_FONT, color: BG.deep })];
  if (meta?.trim()) r.push(new TextRun({ text: `   ${safe(meta)}`, size: 19, font: REPORT_FONT, color: C_MID }));
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    keepLines: true,
    spacing: { before: 320, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: BG.fill, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: BG.leaf, space: 6 } },
    children: r,
  });
}

/** Öğün başlığı. */
export function bMealTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    keepLines: true,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text: safe(text), bold: true, size: 22, font: REPORT_FONT, color: BG.green })],
  });
}

export function bText(text: string, opts: { keepNext?: boolean } = {}): Paragraph {
  return new Paragraph({ keepNext: opts.keepNext, spacing: { after: 100 }, children: runs(text, { size: 21, color: C_DARK }) });
}

export function bMuted(text: string, opts: { keepNext?: boolean } = {}): Paragraph {
  return new Paragraph({ keepNext: opts.keepNext, spacing: { after: 100 }, children: runs(text, { size: 18, color: C_MID, italics: true }) });
}

export function bGap(after = 140): Paragraph {
  return new Paragraph({ spacing: { before: 0, after } });
}

// ─── Tablolar (sabit düzen, tam genişlik) ────────────────────────────────────

const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BG.border },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BG.border },
  left: { style: BorderStyle.SINGLE, size: 4, color: BG.border },
  right: { style: BorderStyle.SINGLE, size: 4, color: BG.border },
};

function widths(pcts: number[]): number[] {
  const sum = pcts.reduce((s, p) => s + p, 0);
  const w = pcts.map((p) => Math.floor((p / sum) * BCONTENT_W));
  w[w.length - 1]! += BCONTENT_W - w.reduce((s, x) => s + x, 0);
  return w;
}

type Align = "left" | "center" | "right";
const al = (a?: Align) => (a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT);

function cell(text: string, width: number, o: { fill?: string; bold?: boolean; color?: string; size?: number; align?: Align; keepNext?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    borders: BORDERS,
    ...(o.fill ? { shading: { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    children: [new Paragraph({
      alignment: al(o.align),
      keepNext: o.keepNext,
      keepLines: true,
      children: runs(text || "—", { size: o.size ?? 19, color: o.color ?? C_DARK, bold: o.bold }),
    })],
  });
}

function table(w: number[], rows: TableRow[]): Table {
  return new Table({ width: { size: BCONTENT_W, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows });
}

/** Bu satır sayısına kadar tablo tek parça tutulur (başlıkla birlikte sayfa değiştirir). */
const KEEP_TOGETHER_ROWS = 12;

/**
 * Veri tablosu: başlık satırı her sayfada tekrarlanır, satırlar bölünmez. Kısa tablolar (≤12 satır)
 * keepNext zinciriyle tek parça kalır; uzun tablolar doğal bölünür (başlık tekrarı ile).
 */
export function bDataTable(columns: { header: string; pct: number; align?: Align }[], rows: string[][], opts: { headerFill?: string } = {}): Table {
  const w = widths(columns.map((c) => c.pct));
  const together = rows.length <= KEEP_TOGETHER_ROWS;
  const head = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: columns.map((c, i) => cell(c.header, w[i]!, { fill: opts.headerFill ?? BG.green, bold: true, color: "ffffff", size: 18, align: c.align, keepNext: true })),
  });
  const body = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: columns.map((c, i) => cell(r[i] ?? "", w[i]!, {
      align: c.align,
      fill: ri % 2 === 1 ? BG.fillSoft : undefined,
      keepNext: together && ri < rows.length - 1,
    })),
  }));
  return table(w, [head, ...body]);
}

/** Etiket/değer tablosu (2 kolon, etiket %38). Tek parça tutulur. */
export function bKvTable(rows: [string, string][], opts: { labelColor?: string } = {}): Table {
  const w = widths([38, 62]);
  return table(w, rows.map(([k, v], i) => new TableRow({
    cantSplit: true,
    children: [
      cell(k, w[0]!, { fill: BG.fill, bold: true, color: opts.labelColor ?? BG.deep, keepNext: i < rows.length - 1 }),
      cell(v, w[1]!, { keepNext: i < rows.length - 1 }),
    ],
  })));
}

/** Tek satırlık değer şeridi (başlık + değer; ör. gün toplamı). */
export function bStripTable(items: { label: string; value: string }[], opts: { headerFill?: string } = {}): Table {
  const w = widths(items.map((it, i) => (i === 0 ? 2 : 1)));
  return table(w, [
    new TableRow({
      cantSplit: true,
      children: items.map((it, i) => cell(it.label, w[i]!, { fill: opts.headerFill ?? BG.fill, bold: true, color: BG.deep, size: 17, align: "center", keepNext: true })),
    }),
    new TableRow({
      cantSplit: true,
      children: items.map((it, i) => cell(it.value, w[i]!, { bold: i === 0, size: 20, align: "center" })),
    }),
  ]);
}

/** Bilgilendirme + Hazırlayan — bölünmeyen tek blok (sona tek başına düşmez). */
export function bWellness(note: string, expertName?: string | null): Paragraph[] {
  const name = expertName?.trim();
  return [
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: 360, after: 60 },
      children: [new TextRun({ text: "Bilgilendirme", bold: true, size: 18, font: REPORT_FONT, color: C_MID })],
    }),
    new Paragraph({
      keepNext: !!name,
      keepLines: true,
      spacing: { after: 80 },
      children: [new TextRun({ text: note, italics: true, size: 16, font: REPORT_FONT, color: C_LIGHT })],
    }),
    ...(name ? [new Paragraph({
      keepLines: true,
      spacing: { after: 60 },
      children: [new TextRun({ text: `Hazırlayan: ${safe(name)}`, size: 16, font: REPORT_FONT, color: C_MID })],
    })] : []),
  ];
}
