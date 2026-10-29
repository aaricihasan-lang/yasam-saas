/**
 * Klasik Numeroloji — Word yapı taşları (SAF; `docx`).
 *
 * Görsel kimlik mevcut Numeroloji Word raporuyla AYNI (Arial, mor-lila bölüm başlığı, indigo tablo başlığı,
 * lila değer kartları, ince gri tablo çizgileri, üst bilgi + sayfa numaralı alt bilgi). O koddan içe aktarma
 * YAPILMAZ (sınır kuralı); değerler burada yeniden tanımlıdır.
 *
 * Her metin `safeText` ile temizlenmiş olarak gelmelidir; yardımcılar yine de son bir temizlik uygular.
 */
import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { safeInline, safeText, TEXT_CAP } from "./sanitize";

export type Block = Paragraph | Table;

export const FONT = "Arial";
export const MOR = "5B21B6";
export const INDIGO = "3730A3";
export const LILA = "F5F3FF";
export const GRAY = "F8FAFC";
export const BODY = "334155";
export const SECONDARY = "64748B";
export const WHITE = "FFFFFF";
export const GREEN_BG = "ECFDF5";
export const GREEN_TXT = "047857";
export const AMBER_BG = "FFFBEB";
export const AMBER_TXT = "B45309";
export const RED_BG = "FEF2F2";
export const RED_TXT = "B91C1C";

export const S_BODY = 21;
export const S_H1 = 44;
export const S_H2 = 24;
export const S_H3 = 20;
export const S_SMALL = 18;
export const S_TINY = 15;
export const S_BIG = 34;

type RunOpts = { bold?: boolean; italics?: boolean; color?: string; size?: number; highlightFill?: string };

export function run(text: string, o: RunOpts = {}): TextRun {
  return new TextRun({
    text: safeInline(text, TEXT_CAP.long),
    font: FONT,
    size: o.size ?? S_BODY,
    bold: o.bold,
    italics: o.italics,
    color: o.color ?? BODY,
    shading: o.highlightFill ? { type: ShadingType.CLEAR, fill: o.highlightFill, color: "auto" } : undefined,
  });
}

type ParaOpts = RunOpts & { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; justify?: boolean; before?: number; after?: number; keepNext?: boolean };

export function para(text: string, o: ParaOpts = {}): Paragraph {
  return new Paragraph({
    alignment: o.justify ? AlignmentType.JUSTIFIED : o.align,
    keepNext: o.keepNext,
    spacing: { before: o.before ?? 0, after: o.after ?? 100, line: 264 },
    children: [run(text, o)],
  });
}

export function paraRuns(children: TextRun[], o: { after?: number; before?: number; align?: ParaOpts["align"] } = {}): Paragraph {
  return new Paragraph({ alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 100, line: 264 }, children });
}

export function spacer(after = 120): Paragraph {
  return new Paragraph({ spacing: { after }, children: [] });
}

export function bullets(items: readonly string[], o: { color?: string; size?: number } = {}): Paragraph[] {
  return items.filter(Boolean).map((t) => new Paragraph({
    spacing: { after: 50, line: 260 },
    indent: { left: 280, hanging: 200 },
    children: [run("•  ", { color: MOR, bold: true, size: o.size }), run(t, { color: o.color, size: o.size })],
  }));
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
export const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
const LIGHT_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } as const;
export const TABLE_BORDERS = { top: LIGHT_BORDER, bottom: LIGHT_BORDER, left: LIGHT_BORDER, right: LIGHT_BORDER, insideHorizontal: LIGHT_BORDER, insideVertical: LIGHT_BORDER };

/** Mor sol vurgulu, lila zeminli bölüm başlığı (Başlık 2). */
export function sectionHeading(text: string, pageBreakBefore = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore,
    keepNext: true,
    spacing: { before: pageBreakBefore ? 0 : 240, after: 130 },
    shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 30, color: MOR, space: 8 } },
    children: [new TextRun({ text: `  ${safeText(text, TEXT_CAP.short)}`, font: FONT, size: S_H2, bold: true, color: INDIGO })],
  });
}

export function subHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    spacing: { before: 150, after: 70 },
    children: [new TextRun({ text: safeText(text, TEXT_CAP.short), font: FONT, size: S_H3, bold: true, color: MOR })],
  });
}

/** Küçük etiket rozeti (metin içi; zeminli). */
export type BadgeTone = "master" | "karmic" | "ok" | "warn" | "bad" | "info";
const BADGE: Readonly<Record<BadgeTone, { fill: string; color: string }>> = Object.freeze({
  master: { fill: LILA, color: MOR },
  karmic: { fill: AMBER_BG, color: AMBER_TXT },
  ok: { fill: GREEN_BG, color: GREEN_TXT },
  warn: { fill: AMBER_BG, color: AMBER_TXT },
  bad: { fill: RED_BG, color: RED_TXT },
  info: { fill: GRAY, color: SECONDARY },
});
export function badge(text: string, tone: BadgeTone): TextRun {
  const b = BADGE[tone];
  return run(` ${text} `, { bold: true, size: S_TINY, color: b.color, highlightFill: b.fill });
}

/** Lila değer kartları (tek satır; sayı büyük). */
export function valueCards(items: readonly { label: string; value: string; badges?: TextRun[] }[]): Table {
  const list = items.length ? items : [{ label: "—", value: "—" }];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({
      cantSplit: true,
      children: list.map((it) => new TableCell({
        verticalAlign: VerticalAlign.CENTER,
        shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" },
        margins: { top: 120, bottom: 120, left: 60, right: 60 },
        width: { size: Math.floor(100 / list.length), type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [run(it.label.toLocaleUpperCase("tr-TR"), { bold: true, color: SECONDARY, size: S_TINY })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: it.badges?.length ? 40 : 0 }, children: [run(it.value, { bold: true, color: INDIGO, size: S_BIG })] }),
          ...(it.badges?.length ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: it.badges })] : []),
        ],
      })),
    })],
  });
}

export type Cell = string | { text: string; bold?: boolean; color?: string; fill?: string; badges?: TextRun[] };

/** Gerçek veri tablosu: indigo başlık + zebra satır. */
export function dataTable(headers: readonly string[], rows: readonly (readonly Cell[])[], widths?: readonly number[]): Table {
  const head = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: INDIGO, color: "auto" },
      margins: { top: 40, bottom: 40, left: 90, right: 90 },
      width: widths ? { size: widths[i] ?? 10, type: WidthType.PERCENTAGE } : undefined,
      children: [new Paragraph({ spacing: { after: 0 }, children: [run(h, { bold: true, color: WHITE, size: S_SMALL })] })],
    })),
  });
  const body = (rows.length ? rows : [headers.map(() => "—")]).map((r, ri) => new TableRow({
    cantSplit: true,
    children: headers.map((_, i) => {
      const c = r[i] ?? "—";
      const o = typeof c === "string" ? { text: c } : c;
      return new TableCell({
        shading: { type: ShadingType.CLEAR, fill: o.fill ?? (ri % 2 ? GRAY : WHITE), color: "auto" },
        margins: { top: 40, bottom: 40, left: 90, right: 90 },
        width: widths ? { size: widths[i] ?? 10, type: WidthType.PERCENTAGE } : undefined,
        children: [new Paragraph({ spacing: { after: 0 }, children: [...(o.text || !o.badges?.length ? [run(o.text || "—", { bold: o.bold, color: o.color })] : []), ...(o.badges ?? [])] })],
      });
    }),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows: [head, ...body] });
}

/** Anahtar–değer kartı (lila etiket sütunu). */
export function kvTable(rows: readonly (readonly [string, string])[]): Table {
  const list = rows.length ? rows : [["—", "—"] as const];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: list.map(([k, v], i) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, margins: { top: 50, bottom: 50, left: 140, right: 100 }, width: { size: 34, type: WidthType.PERCENTAGE }, children: [new Paragraph({ spacing: { after: 0 }, children: [run(k, { bold: true, color: INDIGO, size: S_SMALL })] })] }),
        new TableCell({ shading: { type: ShadingType.CLEAR, fill: i % 2 ? GRAY : WHITE, color: "auto" }, margins: { top: 50, bottom: 50, left: 140, right: 100 }, width: { size: 66, type: WidthType.PERCENTAGE }, children: [new Paragraph({ spacing: { after: 0 }, children: [run(v || "—")] })] }),
      ],
    })),
  });
}

/** Sol mor çizgili gri not kutusu. */
export function noteBox(title: string, lines: readonly string[], tone: "neutral" | "warn" = "neutral"): Table {
  const fill = tone === "warn" ? AMBER_BG : GRAY;
  const bar = tone === "warn" ? AMBER_TXT : MOR;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill, color: "auto" },
        borders: { left: { style: BorderStyle.SINGLE, size: 20, color: bar }, top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER },
        margins: { top: 60, bottom: 60, left: 140, right: 100 },
        children: [
          ...(title ? [new Paragraph({ spacing: { after: 40 }, children: [run(title, { bold: true, color: INDIGO, size: S_SMALL })] })] : []),
          ...lines.filter(Boolean).map((l) => new Paragraph({ spacing: { after: 40, line: 260 }, children: [run(l, { size: S_SMALL })] })),
        ],
      })],
    })],
  });
}

/** Kapak sayfası. */
export function coverPage(o: { heading: string; subtitle: string; bulletsList?: readonly string[]; info: readonly (readonly [string, string])[] }): Block[] {
  const out: Block[] = [];
  out.push(new Paragraph({ spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, alignment: AlignmentType.CENTER, children: [run("YAŞAM SİSTEMİ", { bold: true, color: WHITE, size: S_H3 })] }));
  out.push(new Paragraph({ spacing: { before: 40, after: 500 }, alignment: AlignmentType.CENTER, children: [run("Bütüncül Yaşam Analizi Platformu", { color: SECONDARY, size: S_SMALL })] }));
  out.push(new Paragraph({ heading: HeadingLevel.TITLE, spacing: { before: 700, after: 120 }, alignment: AlignmentType.CENTER, children: [run(o.heading, { bold: true, color: INDIGO, size: S_H1 })] }));
  out.push(new Paragraph({ spacing: { after: 240 }, alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: MOR } }, children: [] }));
  out.push(new Paragraph({ spacing: { after: 400 }, alignment: AlignmentType.CENTER, children: [run(o.subtitle, { bold: true, color: MOR, size: S_H2 })] }));
  if (o.bulletsList?.length) {
    for (const l of o.bulletsList) out.push(new Paragraph({ spacing: { after: 20 }, alignment: AlignmentType.CENTER, children: [run(`•  ${l}`, { color: SECONDARY, size: S_SMALL })] }));
    out.push(spacer(300));
  }
  out.push(new Table({
    width: { size: 82, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: NO_BORDERS,
    rows: o.info.map(([k, v], i) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, margins: { top: 60, bottom: 60, left: 140, right: 100 }, width: { size: 38, type: WidthType.PERCENTAGE }, children: [new Paragraph({ spacing: { after: 0 }, children: [run(k, { bold: true, color: INDIGO, size: S_SMALL })] })] }),
        new TableCell({ shading: { type: ShadingType.CLEAR, fill: i % 2 ? GRAY : WHITE, color: "auto" }, margins: { top: 60, bottom: 60, left: 140, right: 100 }, width: { size: 62, type: WidthType.PERCENTAGE }, children: [new Paragraph({ spacing: { after: 0 }, children: [run(v || "—", { bold: true })] })] }),
      ],
    })),
  }));
  out.push(new Paragraph({ spacing: { before: 800, after: 20 }, alignment: AlignmentType.CENTER, children: [run("Yaşam Sistemi", { bold: true, color: MOR, size: S_SMALL })] }));
  out.push(new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [run("Bütünsel farkındalık, kişisel dönüşüm", { color: SECONDARY, size: 16 })] }));
  return out;
}

export function runningHeader(label: string): Header {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "EDE9FE" } },
      children: [run(`Yaşam Sistemi  ·  ${label}`, { color: SECONDARY, size: 16 })],
    })],
  });
}

export function runningFooter(disclaimerShort: string): Footer {
  return new Footer({
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [run(disclaimerShort, { italics: true, color: SECONDARY, size: 14 })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run("Yaşam Sistemi  ·  Sayfa ", { color: SECONDARY, size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: SECONDARY }),
          run(" / ", { color: SECONDARY, size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: SECONDARY }),
        ],
      }),
    ],
  });
}
