// Astroloji Aşama 8 — PDF rapor üretici (sunucu, jsPDF). Mevcut sunucu PDF altyapısıyla aynı yöntem
// (Anamnez / Hacamat): A4, Türkçe karakter için Geist TTF gömülür, sayfa sonları elle yönetilir,
// alt bilgide "Sayfa X / Y". İçerik Word raporuyla AYNI rapor modelinden gelir.
//
// Sayfa kuralları: başlık sonraki içerikle birlikte kalır (yetim başlık yok); tablo satırı bölünmez,
// yeni sayfada başlık satırı tekrar edilir; tek sayfadan uzun paragraf satır satır akar; görsel
// oranı korunur ve sayfaya sığdırılır. Boş sayfa açılmaz (yeni sayfa yalnız yazılacak içerik varken).

import { jsPDF } from "jspdf";
import type { AstroReport, ReportBlock, ReportTable } from "./model";

type Rgb = [number, number, number];
const PAGE_W = 210;
const PAGE_H = 297;
const MX = 16;
const TOP = 18;
const BOTTOM = 18;
const CW = PAGE_W - MX * 2;
const INK: Rgb = [30, 41, 59];
const MID: Rgb = [71, 85, 105];
const LIGHT: Rgb = [148, 163, 184];
const LINE: Rgb = [226, 232, 240];
const HEAD_FILL: Rgb = [241, 245, 249];
const ACCENT: Rgb = [91, 33, 182];
const WARN_INK: Rgb = [146, 64, 14];
const WARN_FILL: Rgb = [255, 251, 235];
const LH = 0.42; // satır yüksekliği = punto × LH (mm)

class W {
  doc: jsPDF;
  y = TOP;
  constructor(fontBase64: string) {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    this.doc.addFileToVFS("Geist-Regular.ttf", fontBase64);
    this.doc.addFont("Geist-Regular.ttf", "Geist", "normal");
    this.doc.setFont("Geist", "normal");
  }
  get room() {
    return PAGE_H - BOTTOM - this.y;
  }
  newPage() {
    this.doc.addPage();
    this.doc.setFont("Geist", "normal");
    this.y = TOP;
  }
  ensure(h: number) {
    if (h > this.room && this.y > TOP) this.newPage();
  }
  lines(text: string, size: number, width: number): string[] {
    this.doc.setFontSize(size);
    return this.doc.splitTextToSize(text, width) as string[];
  }
  /** Paragraf: sığarsa bütün, sığmazsa satır satır akar. */
  para(text: string, size: number, color: Rgb, x = MX, width = CW, after = 2) {
    for (const chunk of text.split(/\n/)) {
      const ls = this.lines(chunk || " ", size, width);
      const lh = size * LH;
      if (ls.length * lh <= PAGE_H - TOP - BOTTOM) this.ensure(Math.min(ls.length * lh, lh * 3));
      for (const l of ls) {
        this.ensure(lh);
        this.doc.setFontSize(size);
        this.doc.setTextColor(...color);
        this.doc.text(l, x, this.y + lh * 0.8);
        this.y += lh;
      }
    }
    this.y += after;
  }
}

function heading(w: W, level: 1 | 2 | 3, text: string, next: ReportBlock | undefined) {
  const size = level === 1 ? 14 : 11;
  // Başlık + bir sonraki bloğun en az ilk satırları aynı sayfada kalsın.
  const nextNeed = !next ? 0 : next.kind === "table" ? 16 : next.kind === "chart" ? 120 : 10;
  w.ensure(size * LH * 2 + (level === 1 ? 6 : 3) + nextNeed);
  w.y += level === 1 ? 4 : 2;
  const ls = w.lines(text, size, CW);
  w.doc.setFontSize(size);
  w.doc.setTextColor(...(level === 1 ? ACCENT : INK));
  for (const l of ls) {
    w.doc.text(l, MX, w.y + size * LH * 0.8);
    w.y += size * LH;
  }
  if (level === 1) {
    w.doc.setDrawColor(...LINE);
    w.doc.setLineWidth(0.3);
    w.doc.line(MX, w.y + 1, MX + CW, w.y + 1);
    w.y += 3;
  } else w.y += 1.5;
}

function table(w: W, tb: ReportTable) {
  const n = tb.columns.length;
  const size = tb.compact || n >= 7 ? 6.6 : n >= 5 ? 7.6 : 8.6;
  const lh = size * LH;
  const pad = 1.2;
  const ws = tb.widths && tb.widths.length === n ? tb.widths : Array(n).fill(1);
  const sum = ws.reduce((a, b) => a + b, 0);
  const cw = ws.map((x) => (x / sum) * CW);
  const wrap = (row: string[]) => row.map((c, i) => w.lines(c || " ", size, cw[i] - pad * 2));
  const rowH = (cells: string[][]) => Math.max(...cells.map((c) => c.length)) * lh + pad * 2;
  const draw = (cells: string[][], h: number, header: boolean) => {
    let x = MX;
    w.doc.setDrawColor(...LINE);
    w.doc.setLineWidth(0.2);
    cells.forEach((c, i) => {
      if (header) {
        w.doc.setFillColor(...HEAD_FILL);
        w.doc.rect(x, w.y, cw[i], h, "FD");
      } else w.doc.rect(x, w.y, cw[i], h);
      w.doc.setFontSize(size);
      w.doc.setTextColor(...(header ? INK : MID));
      c.forEach((l, j) => w.doc.text(l, x + pad, w.y + pad + lh * (j + 0.8)));
      x += cw[i];
    });
    w.y += h;
  };
  const head = wrap(tb.columns);
  const hh = rowH(head);
  const rows = tb.rows.map((r) => wrap(tb.columns.map((_, i) => r[i] ?? "")));
  w.ensure(hh + (rows[0] ? rowH(rows[0]) : 0));
  draw(head, hh, true);
  for (const r of rows) {
    const h = rowH(r);
    if (h > w.room) {
      w.newPage();
      draw(head, hh, true);
    }
    draw(r, h, false);
  }
  w.y += 3;
}

function kv(w: W, rows: [string, string][]) {
  const k = CW * 0.32;
  const size = 8.8;
  const lh = size * LH;
  for (const [key, val] of rows) {
    const kl = w.lines(key, size, k - 2);
    const vl = w.lines(val, size, CW - k - 2);
    const h = Math.max(kl.length, vl.length) * lh + 2;
    w.ensure(h);
    w.doc.setFontSize(size);
    w.doc.setTextColor(...INK);
    kl.forEach((l, i) => w.doc.text(l, MX + 1, w.y + 1 + lh * (i + 0.8)));
    w.doc.setTextColor(...MID);
    vl.forEach((l, i) => w.doc.text(l, MX + k, w.y + 1 + lh * (i + 0.8)));
    w.doc.setDrawColor(...LINE);
    w.doc.setLineWidth(0.15);
    w.doc.line(MX, w.y + h, MX + CW, w.y + h);
    w.y += h;
  }
  w.y += 3;
}

function cover(w: W, r: AstroReport) {
  const center = (text: string, size: number, color: Rgb, gap: number) => {
    for (const l of w.lines(text, size, CW - 20)) {
      w.doc.setFontSize(size);
      w.doc.setTextColor(...color);
      w.doc.text(l, PAGE_W / 2, w.y, { align: "center" });
      w.y += size * LH;
    }
    w.y += gap;
  };
  w.y = 70;
  w.doc.setDrawColor(203, 213, 225);
  w.doc.setLineWidth(0.8);
  w.doc.line(MX + 10, w.y - 12, PAGE_W - MX - 10, w.y - 12);
  center("YAŞAM SİSTEMİ", 26, INK, 4);
  center("ASTROLOJİ ANALİZ RAPORU", 17, MID, 4);
  center(r.cover.technique, 11, LIGHT, 14);
  w.doc.setLineWidth(0.3);
  w.doc.line(MX + 30, w.y - 6, PAGE_W - MX - 30, w.y - 6);
  center(`Analiz tarihi: ${r.cover.analysisDate}`, 10, LIGHT, 8);
  for (const [k, v] of [
    ["Danışan", r.cover.client],
    ["Gelenek", r.cover.tradition],
    ["Analiz türü", r.cover.technique],
    ["Seçenekler", r.cover.options],
  ]) if (v !== "—") center(`${k}: ${v}`, 10, MID, 2);
}

export function buildAstroReportPdf(r: AstroReport, chart: { png: Buffer; width: number; height: number } | null, fontBase64: string): Uint8Array {
  const w = new W(fontBase64);
  w.doc.setProperties({ title: r.title, subject: "Astroloji analiz raporu", creator: "Yaşam Sistemi" });
  cover(w, r);
  w.newPage();
  w.para(r.title, 15, INK, MX, CW, 4);
  r.blocks.forEach((b, i) => {
    switch (b.kind) {
      case "heading":
        heading(w, b.level, b.text, r.blocks[i + 1]);
        break;
      case "para":
        if (b.tone === "warn") {
          const ls = w.lines(b.text, 8.6, CW - 6);
          const h = ls.length * 8.6 * LH + 3;
          w.ensure(h);
          w.doc.setFillColor(...WARN_FILL);
          w.doc.rect(MX, w.y, CW, h, "F");
          w.doc.setFontSize(8.6);
          w.doc.setTextColor(...WARN_INK);
          ls.forEach((l, j) => w.doc.text(l, MX + 3, w.y + 1.5 + 8.6 * LH * (j + 0.8)));
          w.y += h + 2;
        } else w.para(b.text, b.tone === "muted" ? 8 : 9.4, b.tone === "muted" ? LIGHT : MID, MX + (b.tone === "muted" ? 0 : 2), CW - (b.tone === "muted" ? 0 : 2), 2.4);
        break;
      case "kv":
        kv(w, b.rows);
        break;
      case "table":
        if (b.caption) w.para(b.caption, 8, LIGHT);
        table(w, b.table);
        break;
      case "bullets":
        for (const it of b.items) {
          w.ensure(9.4 * LH);
          w.doc.setFontSize(9.4);
          w.doc.setTextColor(...MID);
          w.doc.text("•", MX + 3, w.y + 9.4 * LH * 0.8);
          w.para(it, 9.4, MID, MX + 7, CW - 7, 0.8);
        }
        w.y += 1.5;
        break;
      case "chart": {
        if (!chart) {
          w.para("Harita görseli bu raporda oluşturulamadı; teknik tablolar aşağıdadır.", 8, LIGHT);
          break;
        }
        // Oran korunur: genişliğe ve kalan sayfa yüksekliğine sığdırılır (kare çark ~120 mm).
        const maxW = Math.min(CW, 125);
        const ratio = chart.height / chart.width;
        let iw = maxW;
        let ih = iw * ratio;
        const maxH = PAGE_H - TOP - BOTTOM - 12;
        if (ih > maxH) {
          ih = maxH;
          iw = ih / ratio;
        }
        w.ensure(ih + 8);
        w.doc.addImage(chart.png, "PNG", (PAGE_W - iw) / 2, w.y, iw, ih, undefined, "FAST");
        w.y += ih + 2;
        w.para(b.caption, 7.8, LIGHT);
        break;
      }
    }
  });
  w.para("Rapor Yaşam Sistemi Astroloji modülünde, kayıtlı analizden oluşturulmuştur.", 7.8, LIGHT);

  const total = w.doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    w.doc.setPage(p);
    w.doc.setFont("Geist", "normal");
    w.doc.setFontSize(7.5);
    w.doc.setTextColor(...LIGHT);
    if (p > 1) w.doc.text("Yaşam Sistemi · Astroloji", PAGE_W - MX, 10, { align: "right" });
    w.doc.text(`Sayfa ${p} / ${total}`, PAGE_W / 2, PAGE_H - 9, { align: "center" });
  }
  return new Uint8Array(w.doc.output("arraybuffer"));
}
