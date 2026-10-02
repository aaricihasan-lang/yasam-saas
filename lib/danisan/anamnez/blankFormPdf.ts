import { jsPDF } from "jspdf";
import trMessages from "@/messages/tr/clients.anamnez.json";
import enMessages from "@/messages/en/clients.anamnez.json";
import { effectiveSections, fieldLabel, fieldOptions, getCatalog, getTemplate, type AnamnezLocale } from "./schema";
import type { FormCustom, RowColumn } from "./types";

/**
 * BOŞ ANAMNEZ FORMU — yazdırılabilir A4 PDF (sunucu, jsPDF). Danışana kâğıt olarak verilir;
 * doldurulan form daha sonra taranıp anamneze PDF eki olarak yüklenir.
 * OCR / otomatik okuma YOK. Word YOK.
 *
 * - Standart form: kanonik şablonun tüm bölümleri (koşullu bölüm "yalnız uygun olduğunda" notuyla).
 * - Danışana özel form: taslağın form farkı uygulanır (kaldırılan sorular yok, eklenen sorular var,
 *   kapalı koşullu bölüm yok).
 * - Türkçe karakter: public/fonts/Geist-Regular.ttf gömülür (hacamat PDF kalıbı).
 *
 * Writer / renkler / başlık-bölüm-alt bilgi çizimi DOLU form PDF'i (filledFormPdf.ts) ile
 * PAYLAŞILIR. Boş form çıktısı bu paylaşımdan etkilenmez (harness normalize hash kilidi).
 */

type Pdf = jsPDF;
export type Rgb = [number, number, number];

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MX = 16;
export const TOP = 18;
export const BOTTOM = 20;
export const CONTENT_W = PAGE_W - MX * 2;

export const INK: Rgb = [30, 41, 59];
export const MUTED: Rgb = [100, 116, 139];
export const LINE: Rgb = [203, 213, 225];
export const TEAL: Rgb = [15, 118, 110];
export const SOFT: Rgb = [240, 253, 250];

export type AnamnezMessages = (typeof trMessages)["clients"]["anamnez"];
type PdfText = AnamnezMessages["pdf"];

export function anamnezMessages(locale: AnamnezLocale): AnamnezMessages {
  return (locale === "en" ? enMessages : trMessages).clients.anamnez;
}

export function pdfText(locale: AnamnezLocale): { pdf: PdfText; wellness: string; yes: string; no: string; detail: string } {
  const m = anamnezMessages(locale);
  return { pdf: m.pdf, wellness: m.wellnessNote, yes: m.field.yes, no: m.field.no, detail: m.field.detail };
}

export type BlankFormInput = {
  locale: AnamnezLocale;
  version: string;
  formCustom: FormCustom | null;
  clientName: string | null;
  fontBase64: string;
};

/** Sayfadaki kullanılabilir içerik yüksekliği (üst boşluk → alt bilgi). */
const USABLE_H = PAGE_H - BOTTOM - TOP;

export class Writer {
  doc: Pdf;
  y = TOP;
  constructor(fontBase64: string) {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    this.doc.addFileToVFS("Geist-Regular.ttf", fontBase64);
    this.doc.addFont("Geist-Regular.ttf", "Geist", "normal");
    this.doc.setFont("Geist", "normal");
    this.doc.setTextColor(...INK);
  }
  /** Gerekirse yeni sayfa; yeni sayfa açıldıysa true. */
  ensure(h: number): boolean {
    if (this.y + h > PAGE_H - BOTTOM) {
      this.doc.addPage();
      this.doc.setFont("Geist", "normal");
      this.y = TOP;
      return true;
    }
    return false;
  }
  /**
   * Sarılmış metin. Sayfaya sığan blok bölünmeden yazılır (gerekirse tamamı yeni sayfaya);
   * TEK sayfadan uzun blok satır satır sayfalanır (alt bilgiye taşmaz).
   */
  text(str: string, size: number, color: Rgb = INK, x = MX, width = CONTENT_W): number {
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
    const lines = this.doc.splitTextToSize(str, width) as string[];
    const lh = size * 0.42;
    if (lines.length * lh + 1 > USABLE_H) return this.flowLines(lines, size, color, x);
    this.ensure(lines.length * lh + 1);
    this.doc.text(lines, x, this.y + lh * 0.8);
    this.y += lines.length * lh;
    return lines.length * lh;
  }
  /** Satır satır akan metin (uzun cevaplar): bulunulan konumdan başlar, sayfa sonunda devam eder. */
  flow(str: string, size: number, color: Rgb = INK, x = MX, width = CONTENT_W): number {
    this.doc.setFontSize(size);
    const lines = this.doc.splitTextToSize(str, width) as string[];
    return this.flowLines(lines, size, color, x);
  }
  private flowLines(lines: string[], size: number, color: Rgb, x: number): number {
    const lh = size * 0.42;
    let total = 0;
    for (const line of lines) {
      this.ensure(lh + 1);
      this.doc.setFontSize(size);
      this.doc.setTextColor(...color);
      this.doc.text(line, x, this.y + lh * 0.8);
      this.y += lh;
      total += lh;
    }
    return total;
  }
  line(x1: number, x2: number, y = this.y) {
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.25);
    this.doc.line(x1, y, x2, y);
  }
  box(x: number, y: number, s = 3.2) {
    this.doc.setDrawColor(...MUTED);
    this.doc.setLineWidth(0.25);
    this.doc.rect(x, y, s, s);
  }
  /** Seçili kutu işareti: kutunun içine dolu kare (glif gerektirmez). */
  mark(x: number, y: number, s = 3.2) {
    this.doc.setFillColor(...TEAL);
    this.doc.rect(x + 0.7, y + 0.7, s - 1.4, s - 1.4, "F");
  }
  writeLines(n: number, gap = 7) {
    for (let i = 0; i < n; i++) {
      this.ensure(gap);
      this.y += gap;
      this.line(MX, MX + CONTENT_W);
    }
    this.y += 2;
  }
  /**
   * Seçenek kutuları; satıra sığmayan seçenek alt satıra geçer.
   * `selected` verilirse (dolu form) seçili kutular işaretlenir, seçili olmayan etiketler soluk yazılır.
   */
  choices(labels: string[], selected?: ReadonlySet<number>) {
    this.doc.setFontSize(9);
    this.doc.setTextColor(...INK);
    let x = MX;
    this.ensure(7);
    let rowY = this.y + 1.5;
    labels.forEach((label, i) => {
      const w = 3.2 + 1.8 + this.doc.getTextWidth(label) + 6;
      if (x + w > MX + CONTENT_W && x > MX) {
        x = MX;
        this.y += 6;
        this.ensure(7);
        rowY = this.y + 1.5;
      }
      this.box(x, rowY);
      if (selected) {
        const on = selected.has(i);
        if (on) this.mark(x, rowY);
        this.doc.setFontSize(9);
        this.doc.setTextColor(...(on ? INK : MUTED));
      }
      this.doc.text(label, x + 5, rowY + 2.7);
      x += w;
    });
    this.y += 7.5;
  }
}

/** Sayfa üstü teal şerit. */
export function drawTopBar(doc: Pdf) {
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, PAGE_W, 4, "F");
}

/** Bölüm başlığı bandı ("A. Başvuru …"). */
export function drawSectionHeader(w: Writer, title: string) {
  const doc = w.doc;
  w.ensure(22);
  w.y += 2;
  doc.setFillColor(...SOFT);
  doc.setDrawColor(...TEAL);
  doc.rect(MX, w.y, CONTENT_W, 8, "F");
  doc.setFontSize(11);
  doc.setTextColor(...TEAL);
  doc.text(title, MX + 2.5, w.y + 5.5);
  w.y += 10;
}

/**
 * Her sayfaya alt bilgi: solda wellness notu, sağda sayfa no + ek satırlar
 * (boş form: şablon · sürüm; dolu form: sürüm · rev + oluşturma tarihi).
 */
export function drawFooters(
  doc: Pdf,
  opts: { note: string; pageLabel: string; right: string[]; noteWidth?: number },
) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("Geist", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const note = doc.splitTextToSize(opts.note, opts.noteWidth ?? CONTENT_W - 30) as string[];
    doc.text(note, MX, PAGE_H - 11);
    doc.text(opts.pageLabel.replace("{page}", String(p)).replace("{total}", String(total)), PAGE_W - MX, PAGE_H - 11, { align: "right" });
    opts.right.forEach((line, i) => doc.text(line, PAGE_W - MX, PAGE_H - 7.5 + i * 3.4, { align: "right" }));
  }
}

function drawRowsTable(w: Writer, columns: readonly RowColumn[], colLabel: (key: string) => string, rows = 3) {
  const colW = CONTENT_W / columns.length;
  const rowH = 7.5;
  w.ensure(rowH * (rows + 1) + 2);
  const doc = w.doc;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  const top = w.y + 1;
  doc.setFillColor(248, 250, 252);
  doc.rect(MX, top, CONTENT_W, rowH, "FD");
  columns.forEach((c, i) => {
    const label = (doc.splitTextToSize(colLabel(c.key), colW - 3) as string[])[0] ?? "";
    doc.text(label, MX + i * colW + 1.5, top + 4.8);
  });
  for (let r = 1; r <= rows; r++) doc.rect(MX, top + r * rowH, CONTENT_W, rowH);
  for (let i = 1; i < columns.length; i++) doc.line(MX + i * colW, top, MX + i * colW, top + (rows + 1) * rowH);
  w.y = top + (rows + 1) * rowH + 3;
}

export function buildBlankAnamnesisPdf(input: BlankFormInput): Uint8Array {
  const { locale, version } = input;
  const template = getTemplate(version);
  const catalog = getCatalog(version, locale);
  const t = pdfText(locale);
  const custom: FormCustom = input.formCustom ?? { hidden: [], labels: {}, enabledSections: [], custom: [] };
  const w = new Writer(input.fontBase64);
  const doc = w.doc;

  // ── Başlık ──
  drawTopBar(doc);
  w.y = 12;
  w.text(t.pdf.title, 18, TEAL);
  w.y += 2;
  const half = CONTENT_W / 2 - 4;
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(`${t.pdf.clientLabel}:`, MX, w.y + 5);
  doc.text(`${t.pdf.dateLabel}:`, MX + half + 8, w.y + 5);
  doc.setTextColor(...INK);
  if (input.clientName) doc.text((doc.splitTextToSize(input.clientName, half - 22) as string[])[0], MX + 22, w.y + 5);
  w.line(MX + 20, MX + half, w.y + 6.2);
  w.line(MX + half + 20, MX + CONTENT_W, w.y + 6.2);
  w.y += 10;
  doc.setTextColor(...MUTED);
  doc.text(`${t.pdf.expertLabel}:`, MX, w.y + 5);
  w.line(MX + 20, MX + half, w.y + 6.2);
  w.y += 11;
  w.text(t.pdf.intro, 9, MUTED);
  w.y += 3;

  // ── Bölümler ──
  for (const s of effectiveSections(version, custom)) {
    const isCustomForm = input.formCustom !== null;
    if (s.optional && isCustomForm && !s.enabled) continue;
    const visible = s.fields.filter((f) => !f.hidden);
    if (visible.length === 0) continue;

    drawSectionHeader(w, `${s.key}. ${catalog.sections[s.key]?.title ?? s.key}`);
    if (s.optional) {
      w.text(t.pdf.optionalSection, 8.5, MUTED);
      w.y += 1;
    }

    for (const f of visible) {
      const type = f.kind === "template" ? f.field.type : f.custom.type;
      const label = fieldLabel(f, catalog);
      w.ensure(14);
      w.text(label, 9.5, INK);
      w.y += 0.5;
      switch (type) {
        case "yn":
          w.choices([t.yes, t.no]);
          break;
        case "ynd":
          w.choices([t.yes, t.no]);
          w.text(`${t.detail}:`, 8.5, MUTED);
          w.writeLines(1, 5);
          break;
        case "single":
        case "multi":
          w.choices(fieldOptions(f, template, catalog).map((o) => o.label));
          break;
        case "text":
          w.writeLines(1, 6);
          break;
        case "textarea":
          w.writeLines(3, 7);
          break;
        case "date":
          w.text("___ . ___ . ______", 10, MUTED);
          w.y += 3;
          break;
        case "time":
          w.text("___ : ___", 10, MUTED);
          w.y += 3;
          break;
        case "number": {
          const unitKey = f.kind === "template" ? f.field.unit : undefined;
          w.text(`__________ ${unitKey ? catalog.units[unitKey] ?? "" : ""}`, 10, MUTED);
          w.y += 3;
          break;
        }
        case "scale10":
          w.choices(Array.from({ length: 11 }, (_, i) => String(i)));
          break;
        case "rows":
          if (f.kind === "template" && f.field.columns) {
            drawRowsTable(w, f.field.columns, (k) => catalog.columns[k] ?? k);
          }
          break;
      }
      w.y += 1.5;
    }
  }

  // ── Alt bilgi (her sayfa) ──
  drawFooters(doc, { note: t.wellness, pageLabel: t.pdf.page, right: [`${template.key} · ${version}`] });

  return new Uint8Array(doc.output("arraybuffer"));
}
