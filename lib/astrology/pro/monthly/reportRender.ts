// Gökyüzü Atlası — AYLIK EFEMERİS Word / PDF işleyicisi (YALNIZ SUNUCU). Ortak astroloji rapor işleyicileri yalnız DİKEY A4 desteklediği
// için (geniş 10–15 sütunlu aylık tablo dikeyde okunmaz) bu rapor YATAY A4 ile burada çizilir; ortak dosyalara DOKUNULMAZ. Ortak
// yardımcılar yalnız OKUNUR: üst/alt bilgi + renkler (lib/docx/reportHelpers), uzman imza kartı (Word + PDF), sembol yazı tipi
// yönlendirmesi (lib/astrology/report/symbolFonts) — glifler Word'e gömülür, PDF'te yedek yazı tipiyle çizilir.
// Sayfa kuralları: tablo başlık satırı her sayfada tekrar eder; satır bölünmez (Word: tableHeader + cantSplit; PDF: elle).
import "server-only";
import { AlignmentType, BorderStyle, Document, Packer, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType, type IRunOptions } from "docx";
import { jsPDF } from "jspdf";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { C_DARK, C_LIGHT, C_MID, REPORT_FONT, buildFooter, buildHeader } from "@/lib/docx/reportHelpers";
import { expertSignatureBlock, type ExpertBranding } from "@/lib/docx/expertBranding";
import { drawExpertSignaturePdf } from "@/lib/pdf/expertBrandingPdf";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import { fontRuns, SYMBOL_FONT_A, SYMBOL_FONT_B, type FontKey } from "@/lib/astrology/report/symbolFonts";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { buildMonthlyReport, type MonthlyReport } from "./reportModel";
import type { MonthlyEphemeris } from "./types";

assertServerOnly("lib/astrology/pro/monthly/reportRender");

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME = "application/pdf";

// ─── Word ─────────────────────────────────────────────────────────────────────
const SYM_FAMILY = { A: SYMBOL_FONT_A, B: SYMBOL_FONT_B } as const;
type RunOpts = Omit<IRunOptions, "text" | "font" | "children">;
function runs(text: string, o: RunOpts): TextRun[] {
  return fontRuns(text).map((r) => {
    const fam = r.font === "base" ? null : SYM_FAMILY[r.font];
    return new TextRun({ ...o, text: r.text, font: fam ? { ascii: fam, hAnsi: fam, cs: fam, eastAsia: fam } : REPORT_FONT });
  });
}
const PAGE_MARGIN = 680; // twip (≈12 mm)
const CONTENT_DXA = 16838 - 2 * PAGE_MARGIN;
const thin = { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" } as const;

function metaTable(rows: [string, string][]): Table {
  const w = [3200, CONTENT_DXA - 3200];
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: w,
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({ width: { size: w[0], type: WidthType.DXA }, shading: { fill: "f8fafc" }, borders: { top: thin, bottom: thin, left: thin, right: thin }, margins: { top: 30, bottom: 30, left: 80, right: 80 }, children: [new Paragraph({ children: runs(k, { bold: true, size: 17, color: C_DARK }) })] }),
            new TableCell({ width: { size: w[1], type: WidthType.DXA }, borders: { top: thin, bottom: thin, left: thin, right: thin }, margins: { top: 30, bottom: 30, left: 80, right: 80 }, children: [new Paragraph({ children: runs(v, { size: 17, color: C_MID }) })] }),
          ],
        }),
    ),
  });
}

function dataTable(r: MonthlyReport): Table {
  const n = r.columns.length - 1;
  const dayW = 1000;
  const colW = Math.floor((CONTENT_DXA - dayW) / n);
  const widths = [dayW, ...Array.from({ length: n }, (_, i) => (i === n - 1 ? CONTENT_DXA - dayW - colW * (n - 1) : colW))];
  const size = n > 10 ? 14 : 17; // 7 pt (Batı 14 cisim) / 8,5 pt (Vedik 9 graha)
  const cell = (lines: string[], i: number, header: boolean) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: header ? { fill: "f1f5f9" } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      borders: { top: thin, bottom: thin, left: thin, right: thin },
      margins: { top: 20, bottom: 20, left: 40, right: 40 },
      children: lines.map((l) => new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, keepNext: header, children: runs(l, { bold: header, size, color: header ? C_DARK : C_MID }) })),
    });
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: r.columns.map((c, i) => cell([c], i, true)) }),
      ...r.rows.map((row) => new TableRow({ cantSplit: true, children: [cell([row.day], 0, false), ...row.cells.map((c, i) => cell([c.top, c.bottom], i + 1, false))] })),
    ],
  });
}

export async function renderMonthlyDocx(r: MonthlyReport, branding: ExpertBranding | null): Promise<Buffer> {
  const sym = symbolFontBuffers();
  const body = [
    new Paragraph({ spacing: { after: 60 }, children: runs(r.title, { bold: true, size: 32, color: C_DARK }) }),
    new Paragraph({ spacing: { after: 160 }, children: runs(r.subtitle, { size: 20, color: C_MID }) }),
    metaTable(r.meta),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: runs(r.legend, { size: 15, color: C_LIGHT }) }),
    dataTable(r),
    new Paragraph({ spacing: { before: 160, after: 60 }, keepNext: true, children: runs("Yöntem ve okuma notları", { bold: true, size: 18, color: C_DARK }) }),
    ...r.notes.map((t) => new Paragraph({ spacing: { after: 60 }, children: runs(t, { size: 15, color: C_MID }) })),
    new Paragraph({ spacing: { before: 120 }, children: runs("Rapor Yaşam Sistemi Gökyüzü Atlası'nda oluşturulmuştur.", { size: 15, color: C_LIGHT, italics: true }) }),
    ...expertSignatureBlock(branding, { accent: "5b21b6", contentWidth: CONTENT_DXA, fill: "f8fafc", font: REPORT_FONT }),
  ];
  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: r.title,
    description: "Gökyüzü Atlası aylık efemeris raporu",
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    fonts: [
      { name: SYMBOL_FONT_A, data: sym.A },
      { name: SYMBOL_FONT_B, data: sym.B },
    ],
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN } } },
        headers: { default: buildHeader("Yaşam Sistemi · Gökyüzü Atlası") },
        footers: { default: buildFooter("Aylık efemeris raporu") },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
type Rgb = [number, number, number];
const PW = 297;
const PH = 210;
const MX = 12;
const TOP = 16;
const BOTTOM = 14;
const CW = PW - MX * 2;
const INK: Rgb = [30, 41, 59];
const MID: Rgb = [71, 85, 105];
const LIGHT: Rgb = [148, 163, 184];
const LINE: Rgb = [226, 232, 240];
const HEAD_FILL: Rgb = [241, 245, 249];
const ACCENT: Rgb = [91, 33, 182];
const LH = 0.42;

class W {
  doc: jsPDF;
  y = TOP;
  constructor() {
    this.doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    this.doc.addFileToVFS("Geist-Regular.ttf", anamnezPdfFontBase64());
    this.doc.addFont("Geist-Regular.ttf", "Geist", "normal");
    const sym = symbolFontsBase64();
    this.doc.addFileToVFS("YasamAstroSymbolsA.ttf", sym.A);
    this.doc.addFont("YasamAstroSymbolsA.ttf", "YasamSymA", "normal");
    this.doc.addFileToVFS("YasamAstroSymbolsB.ttf", sym.B);
    this.doc.addFont("YasamAstroSymbolsB.ttf", "YasamSymB", "normal");
    this.doc.setFont("Geist", "normal");
  }
  private fam = (k: FontKey) => (k === "base" ? "Geist" : k === "A" ? "YasamSymA" : "YasamSymB");
  width(s: string): number {
    let w = 0;
    for (const r of fontRuns(s)) {
      this.doc.setFont(this.fam(r.font), "normal");
      w += this.doc.getTextWidth(r.text);
    }
    this.doc.setFont("Geist", "normal");
    return w;
  }
  text(s: string, x: number, y: number, align?: "center") {
    let cx = align === "center" ? x - this.width(s) / 2 : x;
    for (const r of fontRuns(s)) {
      this.doc.setFont(this.fam(r.font), "normal");
      this.doc.text(r.text, cx, y);
      cx += this.doc.getTextWidth(r.text);
    }
    this.doc.setFont("Geist", "normal");
  }
  get room() {
    return PH - BOTTOM - this.y;
  }
  newPage() {
    this.doc.addPage("a4", "landscape");
    this.doc.setFont("Geist", "normal");
    this.y = TOP;
  }
  ensure(h: number) {
    if (h > this.room && this.y > TOP) this.newPage();
  }
  /** Karışık yazı tipli açgözlü sözcük kaydırma. */
  wrap(text: string, size: number, width: number): string[] {
    this.doc.setFontSize(size);
    const out: string[] = [];
    let cur = "";
    for (const tok of text.split(/(\s+)/)) {
      if (!tok) continue;
      if (this.width(cur + tok) <= width) {
        cur += tok;
        continue;
      }
      if (cur.trim()) out.push(cur.trimEnd());
      cur = /^\s+$/.test(tok) ? "" : tok;
    }
    if (cur.trim()) out.push(cur.trimEnd());
    return out;
  }
  para(text: string, size: number, color: Rgb, after = 1.5) {
    const lh = size * LH;
    for (const l of this.wrap(text, size, CW)) {
      this.ensure(lh);
      this.doc.setFontSize(size);
      this.doc.setTextColor(...color);
      this.text(l, MX, this.y + lh * 0.8);
      this.y += lh;
    }
    this.y += after;
  }
}

export function renderMonthlyPdf(r: MonthlyReport, branding: ExpertBranding | null): Uint8Array {
  const w = new W();
  const d = w.doc;
  w.para(r.title, 15, INK, 0.5);
  w.para(r.subtitle, 9.5, MID, 3);
  // Künye: iki sütunlu satırlar.
  const kW = 42;
  for (const [k, v] of r.meta) {
    const lines = w.wrap(v, 8, CW - kW - 4);
    const h = Math.max(1, lines.length) * 8 * LH + 1.6;
    w.ensure(h);
    d.setFillColor(248, 250, 252);
    d.rect(MX, w.y, kW, h, "F");
    d.setDrawColor(...LINE);
    d.rect(MX, w.y, CW, h);
    d.setFontSize(8);
    d.setTextColor(...INK);
    w.text(k, MX + 1.5, w.y + 8 * LH * 0.8 + 0.8);
    d.setTextColor(...MID);
    lines.forEach((l, i) => w.text(l, MX + kW + 2, w.y + 8 * LH * (i + 0.8) + 0.8));
    w.y += h;
  }
  w.y += 2.5;
  w.para(r.legend, 7, LIGHT, 2.5);

  // Ana tablo: başlık her sayfada tekrar; satır bölünmez.
  const n = r.columns.length - 1;
  const dayW = 17;
  const colW = (CW - dayW) / n;
  const fs = n > 10 ? 6.6 : 8;
  const headH = fs * LH + 3;
  const rowH = 2 * fs * LH + 2.6;
  const colX = (i: number) => MX + (i === 0 ? 0 : dayW + (i - 1) * colW);
  const colWi = (i: number) => (i === 0 ? dayW : colW);
  const header = () => {
    d.setFillColor(...HEAD_FILL);
    d.rect(MX, w.y, CW, headH, "F");
    d.setFontSize(fs);
    d.setTextColor(...INK);
    r.columns.forEach((c, i) => (i === 0 ? w.text(c, colX(i) + 1.2, w.y + headH / 2 + fs * LH * 0.3) : w.text(c, colX(i) + colWi(i) / 2, w.y + headH / 2 + fs * LH * 0.3, "center")));
    d.setDrawColor(...LINE);
    d.rect(MX, w.y, CW, headH);
    w.y += headH;
  };
  w.ensure(headH + rowH);
  header();
  for (const row of r.rows) {
    if (rowH > w.room) {
      w.newPage();
      header();
    }
    d.setFontSize(fs);
    d.setTextColor(...INK);
    w.text(row.day, colX(0) + 1.2, w.y + rowH / 2 + fs * LH * 0.3);
    d.setTextColor(...MID);
    row.cells.forEach((c, i) => {
      const cx = colX(i + 1) + colW / 2;
      w.text(c.top, cx, w.y + 1.2 + fs * LH * 0.8, "center");
      w.text(c.bottom, cx, w.y + 1.2 + fs * LH * 1.8, "center");
    });
    d.setDrawColor(...LINE);
    d.line(MX, w.y + rowH, MX + CW, w.y + rowH);
    for (let i = 0; i <= n + 1; i++) {
      const x = i === n + 1 ? MX + CW : colX(i);
      d.line(x, w.y, x, w.y + rowH);
    }
    w.y += rowH;
  }
  w.y += 3;
  w.ensure(12);
  w.para("Yöntem ve okuma notları", 9, INK, 1);
  for (const t of r.notes) w.para(t, 7.4, MID, 1);
  w.para("Rapor Yaşam Sistemi Gökyüzü Atlası'nda oluşturulmuştur.", 7.2, LIGHT, 2);
  drawExpertSignaturePdf(d, branding, { get y() { return w.y; }, set y(v: number) { w.y = v; }, ensure: (h: number) => w.ensure(h) }, { font: "Geist", x: MX, width: CW, accent: ACCENT, ink: INK, mid: MID, light: LIGHT, fill: [248, 250, 252] });

  const total = d.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    d.setPage(p);
    d.setFont("Geist", "normal");
    d.setFontSize(7.2);
    d.setTextColor(...LIGHT);
    d.text("YAŞAM SİSTEMİ · GÖKYÜZÜ ATLASI", PW - MX, 9, { align: "right" });
    d.text(`Sayfa ${p} / ${total}  ·  Aylık efemeris raporu`, PW / 2, PH - 7, { align: "center" });
  }
  return new Uint8Array(d.output("arraybuffer"));
}

/** Rapor üretimi: içerik YALNIZ verilen sonuçtan (kayıtlı anlık görüntü ya da önbellek) — sağlayıcı çağrısı YOK. */
export async function renderMonthlyReport(
  e: MonthlyEphemeris,
  format: "docx" | "pdf",
  opts: { generatedAt: string; saved?: { title: string; savedAt: string; methodologyVersion: string } | null; branding?: ExpertBranding | null },
): Promise<{ bytes: Uint8Array; filename: string; contentType: string; model: MonthlyReport }> {
  const model = buildMonthlyReport(e, { generatedAt: opts.generatedAt, saved: opts.saved ?? null });
  if (format === "docx") return { bytes: new Uint8Array(await renderMonthlyDocx(model, opts.branding ?? null)), filename: `${model.fileBase}.docx`, contentType: DOCX_MIME, model };
  return { bytes: renderMonthlyPdf(model, opts.branding ?? null), filename: `${model.fileBase}.pdf`, contentType: PDF_MIME, model };
}
