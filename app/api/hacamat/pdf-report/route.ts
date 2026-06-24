import { jsPDF } from "jspdf";
import path from "path";
import fs from "fs";
import {
  getHacamatMonthData,
  MONTH_NAMES_TR,
  type HacamatStatus,
} from "@/lib/cosmic/hacamat";

export const runtime = "nodejs";

// ─── Renkler ─────────────────────────────────────────────────────────────────

const TEAL:  [number, number, number] = [15,  118, 110];
const DARK:  [number, number, number] = [30,  41,  59];
const MID:   [number, number, number] = [71,  85,  105];
const LIGHT: [number, number, number] = [148, 163, 184];
const WHITE: [number, number, number] = [255, 255, 255];

const STATUS_FILL: Record<HacamatStatus, [number, number, number]> = {
  altin:   [254, 243, 199],
  sunnet:  [209, 250, 229],
  uygun:   [254, 249, 195],
  yasakli: [254, 226, 226],
  normal:  [248, 250, 252],
};

const STATUS_TEXT: Record<HacamatStatus, [number, number, number]> = {
  altin:   [180, 83,  9],
  sunnet:  [4,   120, 87],
  uygun:   [161, 98,  7],
  yasakli: [185, 28,  28],
  normal:  [51,  65,  85],
};

const STATUS_LABEL: Record<HacamatStatus, string> = {
  altin:   "ALTIN GUN",
  sunnet:  "SUNNET GUN",
  uygun:   "UYGUN GUN",
  yasakli: "YASAKLI GUN",
  normal:  "—",
};

// ─── Layout sabitleri ─────────────────────────────────────────────────────────

const LM = 14;   // left margin mm
const RM = 14;   // right margin mm
const TM = 14;   // top margin mm
const W  = 210;  // A4 width mm
const H  = 297;  // A4 height mm
const CW = W - LM - RM;  // content width = 182 mm
const PB = H - 14;       // page bottom safe line

// ─── PDF helper sınıfı ────────────────────────────────────────────────────────

class PdfDoc {
  doc: jsPDF;
  y: number;
  pageNum: number;
  footerText: string;

  constructor(footerText: string) {
    this.doc       = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    this.y         = TM;
    this.pageNum   = 1;
    this.footerText = footerText;

    // Geist fontu yükle
    const fontPath = path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf");
    const fontData = fs.readFileSync(fontPath);
    const fontB64  = fontData.toString("base64");
    this.doc.addFileToVFS("Geist-Regular.ttf", fontB64);
    this.doc.addFont("Geist-Regular.ttf", "Geist", "normal");
    this.doc.setFont("Geist", "normal");
  }

  // Yeni sayfaya geç
  newPage() {
    this.drawFooter();
    this.doc.addPage();
    this.pageNum++;
    this.y = TM;
    this.doc.setFont("Geist", "normal");
  }

  // Sayfa alt footer
  drawFooter() {
    this.doc.setFontSize(7);
    this.doc.setTextColor(...LIGHT);
    this.doc.text(this.footerText, LM, H - 7);
    this.doc.text(`${this.pageNum}`, W - RM, H - 7, { align: "right" });
  }

  // Sayfa sonu kontrolü
  ensureSpace(needed: number) {
    if (this.y + needed > PB) this.newPage();
  }

  // Renk ayarlayıcılar
  color(c: [number, number, number])      { this.doc.setTextColor(c[0], c[1], c[2]); }
  fill(c: [number, number, number])       { this.doc.setFillColor(c[0], c[1], c[2]); }
  draw(c: [number, number, number])       { this.doc.setDrawColor(c[0], c[1], c[2]); }

  // Çizgi
  line(y: number) {
    this.draw([209, 250, 229]);
    this.doc.setLineWidth(0.3);
    this.doc.line(LM, y, W - RM, y);
  }

  // Başlık (H1 karşılığı)
  h1(text: string) {
    this.ensureSpace(12);
    this.doc.setFontSize(13);
    this.color(TEAL);
    this.doc.text(text, LM, this.y + 5);
    this.line(this.y + 7);
    this.y += 12;
  }

  // Alt başlık (H2 karşılığı)
  h2(text: string) {
    this.ensureSpace(9);
    this.doc.setFontSize(10);
    this.color(TEAL);
    this.doc.text(text, LM, this.y + 4);
    this.y += 9;
  }

  // Normal paragraf
  p(text: string, indent = 0, size = 9, color: [number, number, number] = MID) {
    this.doc.setFontSize(size);
    this.color(color);
    const lines = this.doc.splitTextToSize(text, CW - indent);
    const lh    = size * 0.42;
    for (const line of lines) {
      this.ensureSpace(lh + 1);
      this.doc.text(line as string, LM + indent, this.y);
      this.y += lh + 1;
    }
    this.y += 0.5;
  }

  // Boşluk
  gap(mm = 3) { this.y += mm; }
}

// ─── İçerik oluşturucular ─────────────────────────────────────────────────────

type IncludeSections = {
  altin:     boolean;
  sunnet:    boolean;
  uygun:     boolean;
  yasakli:   boolean;
  kurallar:  boolean;
  uzmanNotu: boolean;
};

const DEFAULT_INCLUDE: IncludeSections = {
  altin: true, sunnet: true, uygun: true, yasakli: true, kurallar: true, uzmanNotu: true,
};

// ─── Ortak PDF üretici ───────────────────────────────────────────────────────

async function buildPdfBuffer(params: {
  year:            number;
  month:           number;
  rules?:          { rule_text: string; category: string }[];
  expertNotes?:    string;
  title?:          string;
  expertName?:     string;
  includeSections?: Partial<IncludeSections>;
}): Promise<Buffer> {
  const {
    year, month,
    rules       = [],
    expertNotes = "",
    title       = "HACAMAT TAKVİMİ",
    expertName  = "",
    includeSections = DEFAULT_INCLUDE,
  } = params;

  const inc: IncludeSections = { ...DEFAULT_INCLUDE, ...includeSections };
  const data       = getHacamatMonthData(year, month);
  const monthLabel = `${MONTH_NAMES_TR[month]} ${year}`;

  const tableRows = data.notable.filter(d => {
    if (d.status === "altin"   && !inc.altin)   return false;
    if (d.status === "sunnet"  && !inc.sunnet)  return false;
    if (d.status === "uygun"   && !inc.uygun)   return false;
    if (d.status === "yasakli" && !inc.yasakli) return false;
    return true;
  });

  const beforeRules = rules.filter(r => r.category === "before");
  const afterRules  = rules.filter(r => r.category === "after");

  const pdf = new PdfDoc(`Hacamat Takvimi  ·  ${monthLabel}`);
  const doc = pdf.doc;

  doc.setFontSize(17);
  pdf.color(TEAL);
  doc.text((title || "HACAMAT TAKVİMİ").toUpperCase(), W / 2, pdf.y + 6, { align: "center" });
  pdf.y += 10;

  doc.setFontSize(9.5);
  pdf.color(MID);
  doc.text(`${monthLabel}  ·  Hicri Ay: ${data.hijriMonthName}`, W / 2, pdf.y, { align: "center" });
  pdf.y += 5;

  if (expertName?.trim()) {
    doc.setFontSize(9);
    pdf.color(LIGHT);
    doc.text(expertName.trim(), W / 2, pdf.y, { align: "center" });
    pdf.y += 4.5;
  }

  pdf.gap(3);

  const stats = [
    { label: "Altin Gun",   val: `${data.altin.length}`,          bg: [254,243,199] as [number,number,number], fg: [180,83,9]   as [number,number,number] },
    { label: "Sunnet Gun",  val: `${data.sunnet.length}`,         bg: [209,250,229] as [number,number,number], fg: [4,120,87]   as [number,number,number] },
    { label: "Uygun Gun",   val: `${data.uygun.length}`,          bg: [254,249,195] as [number,number,number], fg: [161,98,7]   as [number,number,number] },
    { label: "Yasakli Gun", val: `${data.yasakliNotable.length}`, bg: [254,226,226] as [number,number,number], fg: [185,28,28]  as [number,number,number] },
  ];
  const boxW = CW / 4;
  const boxH = 12;
  stats.forEach((s, i) => {
    const bx = LM + i * boxW;
    doc.setFillColor(s.bg[0], s.bg[1], s.bg[2]);
    doc.rect(bx, pdf.y, boxW, boxH, "F");
    doc.setFontSize(7);
    doc.setTextColor(s.fg[0], s.fg[1], s.fg[2]);
    doc.text(s.label, bx + boxW / 2, pdf.y + 3.5, { align: "center" });
    doc.setFontSize(12);
    doc.text(s.val, bx + boxW / 2, pdf.y + 9, { align: "center" });
  });
  pdf.y += boxH + 4;

  pdf.h1("Aylik Hacamat Takvimi");
  doc.setFontSize(7.5);
  pdf.color(LIGHT);
  doc.text(`${monthLabel} — Hicri 17-24 araligi · ${tableRows.length} gun`, LM, pdf.y);
  pdf.y += 4;

  if (tableRows.length > 0) {
    const cols = [34, 20, 34, 38, 56] as const;
    const headers = ["Miladi Tarih", "Gun", "Hicri Tarih", "Durum", "Aciklama"];
    const rowH = 6.5;

    pdf.ensureSpace(rowH + 2);
    let cx = LM;
    doc.setFillColor(204, 251, 241);
    doc.rect(LM, pdf.y, CW, rowH, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(19, 78, 74);
    headers.forEach((h, i) => {
      doc.text(h, cx + 1, pdf.y + rowH / 2 + 1.3, { baseline: "middle" });
      cx += cols[i];
    });
    pdf.y += rowH;

    for (const d of tableRows) {
      pdf.ensureSpace(rowH + 1);
      const fill  = STATUS_FILL[d.status];
      const tcol  = STATUS_TEXT[d.status];
      cx = LM;
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.rect(LM, pdf.y, CW, rowH, "F");
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.rect(LM, pdf.y, CW, rowH, "S");
      const cells = [
        { text: d.miladiFull,           color: DARK },
        { text: d.weekDayName,          color: MID  },
        { text: d.hijriFormatted,       color: DARK },
        { text: STATUS_LABEL[d.status], color: tcol },
        { text: d.description,          color: MID  },
      ];
      doc.setFontSize(7.5);
      cells.forEach((cell, i) => {
        doc.setTextColor(cell.color[0], cell.color[1], cell.color[2]);
        const maxW = cols[i] - 2;
        const txt  = doc.splitTextToSize(cell.text, maxW)[0] as string ?? "";
        doc.text(txt, cx + 1, pdf.y + rowH / 2 + 1.3, { baseline: "middle" });
        cx += cols[i];
      });
      pdf.y += rowH;
    }
  }
  pdf.gap(5);

  if (data.notes.length > 0) {
    pdf.h1("Dinamik Hicri Gun Notlari");
    data.notes.forEach((note, i) => {
      pdf.ensureSpace(8);
      doc.setFontSize(8.5);
      pdf.color(TEAL);
      doc.text(`${i + 1}.`, LM, pdf.y);
      pdf.color(MID);
      const lines = doc.splitTextToSize(note, CW - 6);
      lines.forEach((line: string, li: number) => {
        if (li > 0) pdf.ensureSpace(5);
        doc.text(line, LM + 6, pdf.y);
        pdf.y += 4.5;
      });
      pdf.y += 1;
    });
    pdf.gap(3);
  }

  if (inc.kurallar) {
    if (beforeRules.length > 0) {
      pdf.h2("Hacamat Oncesi Kurallar");
      beforeRules.forEach((rule, i) => {
        pdf.ensureSpace(8);
        doc.setFontSize(8.5);
        pdf.color(TEAL);
        doc.text(`${i + 1})`, LM, pdf.y);
        pdf.color(DARK);
        const lines = doc.splitTextToSize(rule.rule_text, CW - 7);
        lines.forEach((line: string, li: number) => {
          if (li > 0) pdf.ensureSpace(5);
          doc.text(line, LM + 7, pdf.y);
          pdf.y += 4.5;
        });
        pdf.y += 1.5;
      });
      pdf.gap(2);
    }
    if (afterRules.length > 0) {
      pdf.h2("Hacamat Sonrasi Kurallar");
      afterRules.forEach((rule, i) => {
        pdf.ensureSpace(8);
        doc.setFontSize(8.5);
        pdf.color(TEAL);
        doc.text(`${i + 1})`, LM, pdf.y);
        pdf.color(DARK);
        const lines = doc.splitTextToSize(rule.rule_text, CW - 7);
        lines.forEach((line: string, li: number) => {
          if (li > 0) pdf.ensureSpace(5);
          doc.text(line, LM + 7, pdf.y);
          pdf.y += 4.5;
        });
        pdf.y += 1.5;
      });
      pdf.gap(2);
    }
  }

  if (inc.uzmanNotu && expertNotes.trim()) {
    pdf.h2("Uzman Notlari");
    expertNotes.split("\n").filter(l => l.trim()).forEach(line => {
      pdf.p(line.trim(), 0, 9, MID);
    });
  }

  pdf.drawFooter();
  return Buffer.from(doc.output("arraybuffer"));
}

// ─── GET — mobil için doğrudan indirme ───────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const year        = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()), 10);
  const month       = parseInt(searchParams.get("month") ?? String(new Date().getMonth()), 10);
  const disposition = searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  if (isNaN(year) || isNaN(month) || month < 0 || month > 11)
    return new Response("Geçersiz ay/yıl.", { status: 400 });

  const buffer   = await buildPdfBuffer({ year, month });
  const filename = `hacamat-takvimi-${year}-${String(month + 1).padStart(2, "0")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length":      String(buffer.length),
      "Cache-Control":       "no-store",
    },
  });
}

// ─── POST — tam özelleştirilmiş rapor ────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek." }, { status: 400 }); }

  // DEMO-NOTE: kimlik taşımıyor; demo bloğu uygulanamadı
  // (rapor tarih/kural payload'ından hesaplanır; userId/tenantId yok, DB erişimi yok)
  const {
    year, month,
    rules       = [],
    expertNotes = "",
    title       = "HACAMAT TAKVİMİ",
    expertName  = "",
    includeSections = DEFAULT_INCLUDE,
  } = body as {
    year:             number;
    month:            number;
    rules:            { rule_text: string; category: string }[];
    expertNotes:      string;
    title?:           string;
    expertName?:      string;
    includeSections?: Partial<IncludeSections>;
  };

  if (typeof year !== "number" || typeof month !== "number" || month < 0 || month > 11)
    return Response.json({ ok: false, error: "Geçersiz ay/yıl." }, { status: 400 });

  const buffer   = await buildPdfBuffer({ year, month, rules, expertNotes, title, expertName, includeSections });
  const filename = `hacamat-takvimi-${year}-${String(month + 1).padStart(2, "0")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(buffer.length),
      "Cache-Control":       "no-store",
    },
  });
}
