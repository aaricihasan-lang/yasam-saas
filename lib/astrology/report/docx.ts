// Astroloji Aşama 8 — Word (.docx) rapor üretici. Ortak Word sistemi (lib/docx/reportHelpers) kullanılır:
// kapak, başlık stilleri (Heading 1–3 → gezinme bölmesi), üst/alt bilgi (Sayfa X / Y), görsel gömme.
// Girdi yalnız SAF rapor modelidir (buildAstroReport); burada veri okunmaz, hesap yapılmaz.

import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType, type IRunOptions } from "docx";
import {
  C_DARK,
  C_LIGHT,
  C_MID,
  REPORT_FONT,
  bulletItem,
  buildFooter,
  buildHeader,
  buildPremiumCover,
  embedImageParagraph,
  h1,
  h2,
  h3,
  muted,
  sanitizeXmlText,
  twoColTable,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import type { AstroReport, ReportTable } from "./model";
import { fontRuns, hasSymbolChars, SYMBOL_FONT_A, SYMBOL_FONT_B } from "./symbolFonts";

// ─── Sembol yazı tipi (2026-10-14) ───────────────────────────────────────────
// Astroloji glifleri ve Yunan harfleri Calibri'de güvenilir değildir (platforma göre yedek font). Sembol karakterleri
// gömülü "Yasam Astro Symbols A/B" yazı tipine yönlendirilir (symbolFonts.ts); sembolsüz metin ORTAK yardımcılarla
// (lib/docx/reportHelpers) birebir eski çıktıyı üretir — ortak dosyaya dokunulmaz.
const SYM_FAMILY = { A: SYMBOL_FONT_A, B: SYMBOL_FONT_B } as const;
type RunOpts = Omit<IRunOptions, "text" | "font" | "children">;
function runs(text: string, o: RunOpts): TextRun[] {
  return fontRuns(text).map((r) => {
    const fam = r.font === "base" ? null : SYM_FAMILY[r.font];
    return new TextRun({ ...o, text: r.text, font: fam ? { ascii: fam, hAnsi: fam, cs: fam, eastAsia: fam } : REPORT_FONT });
  });
}
/** Ortak h1/h2/h3/muted/bulletItem/twoColTable ile AYNI biçim; yalnız metin sembol içerirse yerel kopya kullanılır. */
function hx(level: 1 | 2 | 3, text: string, pageBreak = false): Paragraph {
  if (!hasSymbolChars(text)) return level === 1 ? h1(text, pageBreak) : level === 2 ? h2(text, { keepNext: true }) : h3(text, { keepNext: true });
  const heading = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  const spacing = level === 1 ? { before: 480, after: 300 } : level === 2 ? { before: 360, after: 200 } : { before: 240, after: 100 };
  return new Paragraph({ heading, spacing, keepNext: true, ...(level === 1 ? { pageBreakBefore: pageBreak, keepLines: true } : {}), children: runs(text, {}) });
}
function mutedX(text: string): Paragraph {
  if (!hasSymbolChars(text)) return muted(text);
  return new Paragraph({ children: runs(text, { size: 20, color: C_LIGHT, italics: true }), spacing: { after: 220 }, keepNext: true });
}
function bulletX(text: string): Paragraph {
  if (!hasSymbolChars(text)) return bulletItem(text);
  return new Paragraph({ bullet: { level: 0 }, children: runs(text.trim(), { size: 22, color: C_MID }), spacing: { after: 60 } });
}
function kvX(rows: [string, string][]): Table {
  if (!rows.some(([k, v]) => hasSymbolChars(k) || hasSymbolChars(v))) return twoColTable(rows);
  const cell = (text: string, dxa: number, label: boolean) =>
    new TableCell({
      width: { size: dxa, type: WidthType.DXA },
      children: [new Paragraph({ children: runs(text, label ? { bold: true, size: 22, color: C_DARK } : { size: 22, color: C_MID }), spacing: { before: 100, after: 100 }, indent: { left: 120 }, keepNext: false })],
    });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, 3000, true), cell(v, 6000, false)] })) });
}

/** Gömülecek sembol yazı tipleri (sunucu okur; verilmezse yalnız yönlendirme yapılır, gömme yapılmaz). */
export type SymbolFontBuffers = { A: Buffer; B: Buffer } | null;

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const t = (v: string) => sanitizeXmlText(v);
/** A4 (11906) − 2 × 1134 kenar boşluğu = içerik genişliği (twip). */
const CONTENT_DXA = 11906 - 2 * 1134;

/** Çok satırlı metin: boş satır → yeni paragraf; tek satır sonu korunur. */
function paragraphs(text: string, tone?: "muted" | "warn"): Paragraph[] {
  return t(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (tone === "muted") return mutedX(p);
      if (tone === "warn") {
        return new Paragraph({
          children: runs(p, { size: 20, color: "92400e" }),
          shading: { fill: "fffbeb" },
          spacing: { before: 60, after: 160 },
          indent: { left: 360 },
        });
      }
      const lines = p.split("\n");
      return new Paragraph({
        children: lines.flatMap((l, i) =>
          hasSymbolChars(l)
            ? [...(i > 0 ? [new TextRun({ break: 1 })] : []), ...runs(l, { size: 22, color: C_MID })]
            : [new TextRun({ text: l, size: 22, font: REPORT_FONT, color: C_MID, break: i > 0 ? 1 : undefined })],
        ),
        indent: { left: 360 },
        spacing: { after: 140 },
        widowControl: true,
      });
    });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
/**
 * Başlık + harita görseli + alt yazı: kenarlıksız, bölünmeyen (cantSplit) tek hücre. Sığmazsa üçü birlikte sonraki
 * sayfaya geçer — başlık sayfa sonunda yalnız kalmaz. Görsel üretilemezse aynı açık not (görsel uydurulmaz).
 */
function figureBlock(heading: Paragraph, png: Buffer | null, caption: string): Table {
  const children: Paragraph[] = png
    ? [heading, embedImageParagraph(png, 430, 430), new Paragraph({ alignment: AlignmentType.CENTER, children: runs(caption, { italics: true, size: 18, color: C_LIGHT }) })]
    : [heading, mutedX("Harita görseli bu raporda oluşturulamadı; teknik tablolar aşağıdadır.")];
  const borders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_DXA],
    layout: TableLayoutType.FIXED,
    borders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [new TableCell({ width: { size: CONTENT_DXA, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, children })],
      }),
    ],
  });
}

/** Başlığı tekrar eden, satırı bölünmeyen tablo; geniş tablolarda küçük punto. */
function dataTable(tb: ReportTable): Table {
  const n = tb.columns.length;
  const compact = tb.compact || n >= 7;
  const size = compact ? 15 : n >= 5 ? 18 : 20;
  const w = tb.widths && tb.widths.length === n ? tb.widths : Array(n).fill(1);
  const sum = w.reduce((a, b) => a + b, 0);
  // Tamsayı twip (DXA) genişlikleri + sabit düzen: kesirli yüzde Word'de onarım uyarısı doğurabilir.
  const dxa = w.map((x) => Math.floor((x / sum) * CONTENT_DXA));
  dxa[dxa.length - 1] += CONTENT_DXA - dxa.reduce((a, b) => a + b, 0);
  const cell = (text: string, i: number, header: boolean) =>
    new TableCell({
      width: { size: dxa[i], type: WidthType.DXA },
      shading: header ? { fill: "f1f5f9" } : undefined,
      margins: { top: 40, bottom: 40, left: compact ? 50 : 90, right: compact ? 50 : 90 },
      children: [
        new Paragraph({
          children: runs(t(text), { bold: header, size, color: header ? C_DARK : C_MID }),
          keepNext: header,
        }),
      ],
    });
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: dxa,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: tb.columns.map((c, i) => cell(c, i, true)) }),
      ...tb.rows.map((r) => new TableRow({ cantSplit: true, children: tb.columns.map((_, i) => cell(r[i] ?? "", i, false)) })),
    ],
  });
}

/**
 * `chartPng`: tekli raporda tek görsel; toplu raporda (UAT 2. tur, madde L) rapordaki "chart" bloklarıyla AYNI sırada
 * görsel dizisi (çizilemeyen için null).
 */
export function buildAstroReportDocument(r: AstroReport, chartPng: Buffer | null | (Buffer | null)[], symbolFonts: SymbolFontBuffers = null): Document {
  const charts = Array.isArray(chartPng) ? chartPng : [chartPng];
  let chartIdx = 0;
  let breakNext = false;
  const cover: ReportChild[] = buildPremiumCover({
    title1: "YAŞAM SİSTEMİ",
    title2: "ASTROLOJİ ANALİZ RAPORU",
    subtitle: t(r.cover.technique),
    date: `${r.cover.dateLabel ?? "Analiz tarihi"}: ${r.cover.analysisDate}`,
    stats: [
      { label: "Danışan", value: t(r.cover.client) },
      { label: "Gelenek", value: t(r.cover.tradition) },
      { label: "Analiz türü", value: t(r.cover.technique) },
      ...(r.cover.options !== "—" ? [{ label: "Seçenekler", value: t(r.cover.options) }] : []),
    ],
  });

  const body: ReportChild[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 240 },
      children: runs(t(r.title), { bold: true, size: 32, color: C_DARK }),
    }),
  ];
  for (let i = 0; i < r.blocks.length; i++) {
    const b = r.blocks[i];
    switch (b.kind) {
      case "heading": {
        const next = r.blocks[i + 1];
        // Vedik/KP figürü: başlık + görsel + alt yazı bölünmez tek blok (2026-10-15 UAT). keepNext tek başına
        // her görüntüleyicide (LibreOffice) yetmedi → "Harita" sayfa sonunda yalnız kalıyordu. Batı çarkı aynen.
        if (next && next.kind === "chart" && "figure" in next) {
          const png = charts[chartIdx++] ?? null;
          body.push(figureBlock(hx(b.level, t(b.text), breakNext), png, t(next.caption)));
          breakNext = false;
          i++;
          break;
        }
        body.push(hx(b.level, t(b.text), breakNext));
        breakNext = false;
        break;
      }
      case "pagebreak":
        breakNext = true;
        break;
      case "para":
        body.push(...paragraphs(b.text, b.tone));
        break;
      case "kv":
        body.push(kvX(b.rows.map(([k, v]) => [t(k), t(v)])), new Paragraph({ spacing: { after: 120 } }));
        break;
      case "table":
        if (b.caption) body.push(mutedX(t(b.caption)));
        body.push(dataTable(b.table), new Paragraph({ spacing: { after: 160 } }));
        break;
      case "bullets":
        body.push(...b.items.map((i) => bulletX(t(i))));
        break;
      case "chart": {
        const png = charts[chartIdx++] ?? null;
        if (png) {
          // Kare çark: genişlik 430 px (~11,4 cm) — oran korunur, sayfaya sığar.
          body.push(embedImageParagraph(png, 430, 430), new Paragraph({ alignment: AlignmentType.CENTER, children: runs(t(b.caption), { italics: true, size: 18, color: C_LIGHT }) }));
        } else {
          body.push(mutedX("Harita görseli bu raporda oluşturulamadı; teknik tablolar aşağıdadır."));
        }
        break;
      }
    }
  }
  body.push(...paragraphs("Rapor Yaşam Sistemi Astroloji modülünde, kayıtlı analizden oluşturulmuştur.", "muted"));

  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } };
  return new Document({
    creator: "Yaşam Sistemi",
    title: t(r.title),
    description: "Astroloji analiz raporu",
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    // Sembol yazı tipleri belgeye GÖMÜLÜR → Word hangi cihazda açılırsa açılsın glifler aynı görünür.
    ...(symbolFonts ? { fonts: [{ name: SYMBOL_FONT_A, data: symbolFonts.A }, { name: SYMBOL_FONT_B, data: symbolFonts.B }] } : {}),
    sections: [
      { properties: { page }, children: cover },
      {
        properties: { page },
        headers: { default: buildHeader("Yaşam Sistemi · Astroloji") },
        footers: { default: buildFooter("Astroloji analiz raporu") },
        children: body,
      },
    ],
  });
}

export async function renderAstroReportDocx(r: AstroReport, chartPng: Buffer | null | (Buffer | null)[], symbolFonts: SymbolFontBuffers = null): Promise<Buffer> {
  return Packer.toBuffer(buildAstroReportDocument(r, chartPng, symbolFonts));
}
