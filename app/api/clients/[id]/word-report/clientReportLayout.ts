/**
 * Danışan Yolculuğu Word — DY'YE ÖZEL premium düzen yapı taşları (AŞAMA 2 / W1).
 *
 * Ortak `lib/docx/reportHelpers` DEĞİŞMEZ (diğer modüllerin raporları etkilenmez); yalnız
 * okuma amaçlı (font/renk sabitleri, görsel gömme, XML temizleme, footer) kullanılır.
 *
 * Neden ayrı tablolar? Ortak `twoColTable` yüzde genişlikli tablo + DXA hücre karışımıdır ve
 * `columnWidths` taşımaz; Mobil Word / LibreOffice bunu otomatik sığdırmayla DAR kolonlara
 * indirebiliyor (DY-002 / DY-004 / DY-011). Buradaki tablolar SABİT düzen (fixed layout) +
 * DXA kolon genişlikleri ile basılabilir alanın tamamını kullanır.
 *
 * Sayfa: A4, 2 cm kenar boşluğu (HD profesyonel raporla aynı) → basılabilir genişlik 9638 twip.
 */
import {
  AlignmentType,
  BorderStyle,
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
import {
  C_DARK,
  C_LIGHT,
  C_MID,
  REPORT_FONT,
  getImgDimensions,
  sanitizeXmlText,
  type ReportChild,
} from "@/lib/docx/reportHelpers";

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export const DY_PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
} as const;

/** Basılabilir genişlik (twip): 11906 − 2 × 1134. */
export const DY_CONTENT_W = 9638;

// ─── Renkler ─────────────────────────────────────────────────────────────────

export const DY_NAVY = "1e3a5f";
const DY_ACCENT = "93c5fd";
const DY_LABEL_FILL = "f1f5f9";
const DY_BORDER = "dbe3ec";

// ─── Metin ───────────────────────────────────────────────────────────────────

/** Kullanıcı metni → XML 1.0 güvenli, kırpılmış tek satır. */
export function safe(text: string | null | undefined): string {
  return sanitizeXmlText(String(text ?? "")).trim();
}

/** Satır sonlarını koruyarak paragraf koşuları (Word'de satır kırılımı). */
function multilineRuns(text: string, opts: { size: number; color: string; italics?: boolean; bold?: boolean }): TextRun[] {
  const lines = sanitizeXmlText(text).replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line, i) => new TextRun({
    text: line,
    break: i > 0 ? 1 : undefined,
    size: opts.size,
    font: REPORT_FONT,
    color: opts.color,
    italics: opts.italics,
    bold: opts.bold,
  }));
}

// ─── Kapak ───────────────────────────────────────────────────────────────────

export type DyCoverInput = {
  /** Onaylı Yaşam Sistemi logosu (değiştirilmeden, oran korunarak gömülür). Yoksa yazı ile marka. */
  logo: Buffer | null;
  /** Rapor adı ("Danışan Dosyası", "Seans Geçmişi" …). */
  reportTitle: string;
  /** Rapor adı altı kısa açıklama (opsiyonel). */
  reportSubtitle?: string | null;
  /** Danışan adı (toplu raporda danışan sayısı metni). */
  clientName: string;
  /** "22 Ekim 2026" biçiminde rapor tarihi. */
  dateLabel: string;
  /** Hazırlayan uzman (yoksa satır yok). */
  expertName?: string | null;
  /** Ek künye satırları (ör. tarih aralığı). Boş değerli satırlar gösterilmez. */
  meta?: [string, string][];
};

function rule(color: string, size = 6, after = 0): Paragraph {
  return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size, color } }, spacing: { before: 0, after } });
}

/** Logo: oran korunur, yalnız ölçeklenir (kırpma/renk/kompozisyon değişikliği YOK). */
function logoParagraph(logo: Buffer, maxW: number): Paragraph | null {
  const dims = getImgDimensions(logo);
  if (!dims) return null;
  const scale = Math.min(1, maxW / dims.w);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new ImageRun({ type: "png", data: logo, transformation: { width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) } })],
  });
}

/**
 * Tek sayfalık premium kapak: logo → platform satırı → rapor adı → danışan adı → künye.
 * Kapak ayrı bölüm (section) olarak kullanılır → üst/alt bilgi taşımaz.
 */
export function dyCover(c: DyCoverInput): ReportChild[] {
  const out: ReportChild[] = [new Paragraph({ spacing: { before: 0, after: 900 } })];
  const logo = c.logo ? logoParagraph(c.logo, 230) : null;
  if (logo) {
    out.push(logo);
  } else {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "YAŞAM SİSTEMİ", bold: true, size: 64, font: REPORT_FONT, color: DY_NAVY })],
    }));
  }
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 720 },
    children: [new TextRun({ text: "Bütüncül Yaşam Analizi Platformu", italics: true, size: 22, font: REPORT_FONT, color: C_MID })],
  }));
  out.push(rule(DY_NAVY, 12, 80), rule(DY_ACCENT, 4, 520));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: safe(c.reportTitle).toLocaleUpperCase("tr-TR"), bold: true, size: 40, font: REPORT_FONT, color: DY_NAVY, characterSpacing: 40 })],
  }));
  if (c.reportSubtitle?.trim()) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: safe(c.reportSubtitle), size: 24, font: REPORT_FONT, color: C_MID })],
    }));
  }
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 520 },
    children: [new TextRun({ text: safe(c.clientName), bold: true, size: 56, font: REPORT_FONT, color: C_DARK })],
  }));
  out.push(rule(DY_ACCENT, 4, 360));
  const meta: [string, string][] = [
    ["Rapor Tarihi", c.dateLabel],
    ...(c.meta ?? []),
    ...(c.expertName?.trim() ? [["Uzman", c.expertName.trim()] as [string, string]] : []),
  ].filter(([, v]) => !!v?.trim()) as [string, string][];
  for (const [label, value] of meta) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: `${safe(label)}:  `, size: 22, font: REPORT_FONT, color: C_MID }),
        new TextRun({ text: safe(value), bold: true, size: 22, font: REPORT_FONT, color: C_DARK }),
      ],
    }));
  }
  out.push(new Paragraph({ spacing: { before: 360, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DY_ACCENT } } }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 0 },
    children: [new TextRun({ text: "yasamsistemi.com", size: 18, font: REPORT_FONT, color: C_LIGHT })],
  }));
  return out;
}

// ─── Başlıklar ───────────────────────────────────────────────────────────────

/** Bölüm başlığı: sol renk şeridi + alt çizgi; sonraki içerikle aynı sayfada kalır. */
export function dySectionTitle(text: string, color: string, opts: { pageBreakBefore?: boolean } = {}): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: opts.pageBreakBefore === true,
    keepNext: true,
    keepLines: true,
    spacing: { before: opts.pageBreakBefore ? 0 : 400, after: 200 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 36, color, space: 8 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: DY_BORDER, space: 4 },
    },
    children: [new TextRun({ text: safe(text), bold: true, size: 30, font: REPORT_FONT, color })],
  });
}

/** Kayıt başlığı (seans/taş/ödev/analiz …). */
export function dyItemTitle(text: string, color: string, meta?: string | null): Paragraph {
  const runs = [new TextRun({ text: safe(text), bold: true, size: 24, font: REPORT_FONT, color })];
  if (meta?.trim()) runs.push(new TextRun({ text: `   ${safe(meta)}`, size: 20, font: REPORT_FONT, color: C_MID }));
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    keepLines: true,
    spacing: { before: 260, after: 100 },
    children: runs,
  });
}

/** Küçük alt başlık (tablo başlığı vb.). */
export function dySubTitle(text: string, color: string = C_DARK): Paragraph {
  return new Paragraph({
    keepNext: true,
    keepLines: true,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text: safe(text), bold: true, size: 21, font: REPORT_FONT, color })],
  });
}

/** Etiketli metin bloğu (Seans Notu, Açıklama …). Boş metin → hiçbir şey. */
export function dyLabeledText(label: string, text: string | null | undefined): Paragraph[] {
  const t = String(text ?? "").trim();
  if (!t) return [];
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 120, after: 40 },
      children: [new TextRun({ text: safe(label), bold: true, size: 20, font: REPORT_FONT, color: C_MID })],
    }),
    new Paragraph({ spacing: { after: 100 }, children: multilineRuns(t, { size: 21, color: C_DARK }) }),
  ];
}

/** Düz paragraf metni. */
export function dyBody(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 120 }, children: multilineRuns(text, { size: 21, color: C_DARK }) });
}

/** Küçük gri açıklama satırı. */
export function dyNote(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: safe(text), italics: true, size: 18, font: REPORT_FONT, color: C_LIGHT })],
  });
}

/** Kayıtlar arası ince ayırıcı. */
export function dyDivider(): Paragraph {
  return new Paragraph({ spacing: { before: 120, after: 120 }, border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: DY_BORDER } } });
}

// ─── Tablolar ────────────────────────────────────────────────────────────────

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: DY_BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: DY_BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: DY_BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: DY_BORDER },
};

/** Yüzdeleri basılabilir genişliğe göre DXA'ya çevirir; toplam tam DY_CONTENT_W olur. */
function dxaWidths(pcts: number[]): number[] {
  const sum = pcts.reduce((s, p) => s + p, 0);
  const w = pcts.map((p) => Math.floor((p / sum) * DY_CONTENT_W));
  w[w.length - 1]! += DY_CONTENT_W - w.reduce((s, x) => s + x, 0);
  return w;
}

type CellOpts = {
  fill?: string;
  bold?: boolean;
  color?: string;
  size?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  italics?: boolean;
  /** İkinci satır (küçük, italik) — ör. ücret notu. */
  sub?: string | null;
};

function cell(text: string, width: number, o: CellOpts = {}): TableCell {
  const kids: Paragraph[] = [
    new Paragraph({
      alignment: o.align,
      children: multilineRuns(text || "—", { size: o.size ?? 20, color: o.color ?? C_DARK, bold: o.bold, italics: o.italics }),
    }),
  ];
  if (o.sub?.trim()) {
    kids.push(new Paragraph({
      alignment: o.align,
      spacing: { before: 40 },
      children: multilineRuns(o.sub.trim(), { size: 17, color: C_MID, italics: true }),
    }));
  }
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    borders: CELL_BORDERS,
    ...(o.fill ? { shading: { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    children: kids,
  });
}

/** Tek sayıda alan kalan 4 kolonlu künyede boş hücre ("—" yazılmaz). */
function blankCell(width: number): TableCell {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, borders: CELL_BORDERS, children: [new Paragraph({})] });
}

function fixedTable(widths: number[], rows: TableRow[]): Table {
  return new Table({
    width: { size: DY_CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows,
  });
}

/** Yalnız değeri dolu satırlar (boş/"—" değerler gizlenir). */
export function filledRows(rows: [string, string | null | undefined][]): [string, string][] {
  return rows
    .map(([k, v]) => [k, String(v ?? "").trim()] as [string, string])
    .filter(([, v]) => v !== "" && v !== "—");
}

/**
 * Etiket / değer tablosu (sabit düzen, tam genişlik). `cols: 2` → etiket %30 / değer %70;
 * `cols: 4` → iki çift yan yana (künye blokları için kompakt). Boş liste → null.
 */
export function dyKvTable(rows: [string, string][], opts: { cols?: 2 | 4; labelColor?: string } = {}): Table | null {
  if (!rows.length) return null;
  const labelColor = opts.labelColor ?? C_MID;
  if (opts.cols === 4 && rows.length > 1) {
    const w = dxaWidths([18, 32, 18, 32]);
    const trs: TableRow[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      const a = rows[i]!;
      const b = rows[i + 1];
      trs.push(new TableRow({
        cantSplit: true,
        children: [
          cell(a[0], w[0]!, { fill: DY_LABEL_FILL, bold: true, color: labelColor, size: 19 }),
          cell(a[1], w[1]!),
          b ? cell(b[0], w[2]!, { fill: DY_LABEL_FILL, bold: true, color: labelColor, size: 19 }) : blankCell(w[2]!),
          b ? cell(b[1], w[3]!) : blankCell(w[3]!),
        ],
      }));
    }
    return fixedTable(w, trs);
  }
  const w = dxaWidths([30, 70]);
  return fixedTable(w, rows.map(([k, v]) => new TableRow({
    cantSplit: true,
    children: [cell(k, w[0]!, { fill: DY_LABEL_FILL, bold: true, color: labelColor, size: 19 }), cell(v, w[1]!)],
  })));
}

export type DyColumn = { header: string; pct: number; align?: "left" | "center" | "right" };
export type DyCell = string | { text: string; sub?: string | null; bold?: boolean; color?: string; fill?: string; textColor?: string };

/** Başlık satırı tekrarlanan veri tablosu (sabit düzen, tam genişlik). */
export function dyDataTable(columns: DyColumn[], rows: DyCell[][], opts: { headerFill?: string } = {}): Table {
  const w = dxaWidths(columns.map((c) => c.pct));
  const alignOf = (a?: DyColumn["align"]) => a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: columns.map((c, i) => cell(c.header, w[i]!, { fill: opts.headerFill ?? DY_NAVY, bold: true, color: "ffffff", size: 18, align: alignOf(c.align) })),
  });
  const body = rows.map((r) => new TableRow({
    cantSplit: true,
    children: columns.map((c, i) => {
      const v = r[i] ?? "";
      if (typeof v === "string") return cell(v, w[i]!, { align: alignOf(c.align) });
      return cell(v.text, w[i]!, {
        align: alignOf(c.align),
        sub: v.sub,
        bold: v.bold,
        fill: v.fill,
        color: v.textColor ?? v.color,
      });
    }),
  }));
  return fixedTable(w, [header, ...body]);
}

/** Tek satırlık özet kartları (yalnız sıfırdan büyük sayılar). Boş → null. */
export function dyStatStrip(items: { label: string; value: number; color: string }[]): Table | null {
  const shown = items.filter((i) => i.value > 0);
  if (!shown.length) return null;
  const w = dxaWidths(shown.map(() => 1));
  return fixedTable(w, [new TableRow({
    cantSplit: true,
    children: shown.map((it, i) => new TableCell({
      width: { size: w[i]!, type: WidthType.DXA },
      margins: { top: 100, bottom: 100, left: 80, right: 80 },
      shading: { fill: "f8fafc", type: ShadingType.CLEAR, color: "auto" },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 18, color: it.color },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: DY_BORDER },
        left: { style: BorderStyle.SINGLE, size: 4, color: "ffffff" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "ffffff" },
      },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(it.value), bold: true, size: 32, font: REPORT_FONT, color: it.color })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: safe(it.label), size: 16, font: REPORT_FONT, color: C_MID })] }),
      ],
    })),
  })]);
}

/** Tablodan sonra küçük boşluk (tablolar arka arkaya yapışmasın). */
export function dyGap(after = 160): Paragraph {
  return new Paragraph({ spacing: { before: 0, after } });
}
