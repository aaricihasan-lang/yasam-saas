// Astroloji Aşama 8 — Word (.docx) rapor üretici. Ortak Word sistemi (lib/docx/reportHelpers) kullanılır:
// kapak, başlık stilleri (Heading 1–3 → gezinme bölmesi), üst/alt bilgi (Sayfa X / Y), görsel gömme.
// Girdi yalnız SAF rapor modelidir (buildAstroReport); burada veri okunmaz, hesap yapılmaz.

import { AlignmentType, Document, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
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
  h3,
  muted,
  sanitizeXmlText,
  twoColTable,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import type { AstroReport, ReportTable } from "./model";

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
      if (tone === "muted") return muted(p);
      if (tone === "warn") {
        return new Paragraph({
          children: [new TextRun({ text: p, size: 20, font: REPORT_FONT, color: "92400e" })],
          shading: { fill: "fffbeb" },
          spacing: { before: 60, after: 160 },
          indent: { left: 360 },
        });
      }
      const lines = p.split("\n");
      return new Paragraph({
        children: lines.map((l, i) => new TextRun({ text: l, size: 22, font: REPORT_FONT, color: C_MID, break: i > 0 ? 1 : undefined })),
        indent: { left: 360 },
        spacing: { after: 140 },
        widowControl: true,
      });
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
          children: [new TextRun({ text: t(text), bold: header, size, font: REPORT_FONT, color: header ? C_DARK : C_MID })],
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

export function buildAstroReportDocument(r: AstroReport, chartPng: Buffer | null): Document {
  const cover: ReportChild[] = buildPremiumCover({
    title1: "YAŞAM SİSTEMİ",
    title2: "ASTROLOJİ ANALİZ RAPORU",
    subtitle: t(r.cover.technique),
    date: `Analiz tarihi: ${r.cover.analysisDate}`,
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
      children: [new TextRun({ text: t(r.title), bold: true, size: 32, font: REPORT_FONT, color: C_DARK })],
    }),
  ];
  for (const b of r.blocks) {
    switch (b.kind) {
      case "heading":
        body.push(b.level === 1 ? h1(t(b.text)) : h3(t(b.text), { keepNext: true }));
        break;
      case "para":
        body.push(...paragraphs(b.text, b.tone));
        break;
      case "kv":
        body.push(twoColTable(b.rows.map(([k, v]) => [t(k), t(v)])), new Paragraph({ spacing: { after: 120 } }));
        break;
      case "table":
        if (b.caption) body.push(muted(t(b.caption)));
        body.push(dataTable(b.table), new Paragraph({ spacing: { after: 160 } }));
        break;
      case "bullets":
        body.push(...b.items.map((i) => bulletItem(t(i))));
        break;
      case "chart":
        if (chartPng) {
          // Kare çark: genişlik 430 px (~11,4 cm) — oran korunur, sayfaya sığar.
          body.push(embedImageParagraph(chartPng, 430, 430), new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t(b.caption), italics: true, size: 18, font: REPORT_FONT, color: C_LIGHT })] }));
        } else {
          body.push(muted("Harita görseli bu raporda oluşturulamadı; teknik tablolar aşağıdadır."));
        }
        break;
    }
  }
  body.push(...paragraphs("Rapor Yaşam Sistemi Astroloji modülünde, kayıtlı analizden oluşturulmuştur.", "muted"));

  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } };
  return new Document({
    creator: "Yaşam Sistemi",
    title: t(r.title),
    description: "Astroloji analiz raporu",
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
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

export async function renderAstroReportDocx(r: AstroReport, chartPng: Buffer | null): Promise<Buffer> {
  return Packer.toBuffer(buildAstroReportDocument(r, chartPng));
}
