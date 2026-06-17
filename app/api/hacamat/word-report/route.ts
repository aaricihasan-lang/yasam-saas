import {
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
} from "docx";
import {
  buildFooter,
  buildPremiumCover,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import {
  getHacamatMonthData,
  MONTH_NAMES_TR,
  type HacamatStatus,
  type CalendarDay,
} from "@/lib/cosmic/hacamat";

export const runtime = "nodejs";

// ─── Yazı tipi ────────────────────────────────────────────────────────────────

const FONT = "Calibri";

// ─── Renkler ──────────────────────────────────────────────────────────────────

const C_TEAL      = "0F766E";   // teal-700 — başlıklar
const C_DARK      = "1E293B";   // slate-900 — ana metin
const C_MID       = "475569";   // slate-600 — ikincil metin
const C_LIGHT     = "94A3B8";   // slate-400 — yardımcı metin

// Tablo — başlık satırı
const TH_FILL     = "CCFBF1";   // teal-100  → açık teal, siyah değil
const TH_TEXT     = "134E4A";   // teal-900  → koyu teal, yüksek kontrast

// Tablo — durum renkleri (zemin açık, yazı koyu)
const FILL: Record<HacamatStatus, string> = {
  altin:   "FEF3C7",            // amber-100
  sunnet:  "D1FAE5",            // emerald-100
  uygun:   "FEF9C3",            // yellow-100
  yasakli: "FEE2E2",            // red-100
  normal:  "F8FAFC",            // slate-50
};

const STATUS_COLOR: Record<HacamatStatus, string> = {
  altin:   "B45309",            // amber-700
  sunnet:  "047857",            // emerald-700
  uygun:   "A16207",            // yellow-700
  yasakli: "B91C1C",            // red-700
  normal:  "334155",            // slate-700
};

const LABEL: Record<HacamatStatus, string> = {
  altin:   "ALTIN GÜN ⭐⭐⭐⭐⭐",
  sunnet:  "SÜNNET GÜN ⭐⭐⭐",
  uygun:   "UYGUN GÜN ⭐",
  yasakli: "YASAKLI GÜN ⛔",
  normal:  "—",
};

// ─── Kompakt paragraph yardımcıları ──────────────────────────────────────────

function secH1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: C_TEAL })],
    pageBreakBefore: pageBreak,
    spacing:  { before: pageBreak ? 0 : 320, after: 140 },
    border:   { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCFBF1" } },
  });
}

function secH2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, font: FONT, color: C_TEAL })],
    spacing:  { before: 240, after: 80 },
  });
}

function caption(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: FONT, color: C_LIGHT, italics: true })],
    spacing:  { before: 40, after: 60 },
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: FONT, color: C_MID })],
    spacing:  { before: 40, after: 80 },
    indent:   { left: 200 },
  });
}

function noteItem(num: number, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${num}.  `, bold: true, size: 20, font: FONT, color: C_TEAL }),
      new TextRun({ text, size: 20, font: FONT, color: C_MID }),
    ],
    spacing: { before: 80, after: 100 },
    indent:  { left: 200 },
  });
}

function ruleItem(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "•  ", size: 20, font: FONT, color: C_TEAL }),
      new TextRun({ text, size: 20, font: FONT, color: C_MID }),
    ],
    spacing: { before: 40, after: 60 },
    indent:  { left: 240 },
  });
}

function gap(size = 120): Paragraph {
  return new Paragraph({ spacing: { after: size } });
}

// ─── Tablo ───────────────────────────────────────────────────────────────────

function tableCell(
  text: string,
  fill: string,
  textColor: string,
  colPct: number,
  bold = false,
): TableCell {
  return new TableCell({
    width:   { size: colPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, fill },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 19, font: FONT, color: textColor })],
        spacing: { before: 60, after: 60 },
        indent:  { left: 80 },
      }),
    ],
  });
}

function buildTable(days: CalendarDay[]): Table {
  const COLS = [
    { label: "Miladi Tarih", pct: 22 },
    { label: "Gün",          pct:  9 },
    { label: "Hicri Tarih",  pct: 21 },
    { label: "Durum",        pct: 22 },
    { label: "Açıklama",     pct: 26 },
  ] as const;

  const headerRow = new TableRow({
    tableHeader: true,
    children: COLS.map(c =>
      new TableCell({
        width:   { size: c.pct, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, fill: TH_FILL },
        children: [
          new Paragraph({
            children: [new TextRun({ text: c.label, bold: true, size: 19, font: FONT, color: TH_TEXT })],
            spacing: { before: 60, after: 60 },
            indent:  { left: 80 },
          }),
        ],
      })
    ),
  });

  const dataRows = days.map(d => {
    const fill  = FILL[d.status];
    const color = STATUS_COLOR[d.status];
    return new TableRow({
      children: [
        tableCell(d.miladiFull,    fill, C_DARK,  COLS[0].pct),
        tableCell(d.weekDayName,   fill, C_MID,   COLS[1].pct),
        tableCell(d.hijriFormatted,fill, C_DARK,  COLS[2].pct),
        tableCell(LABEL[d.status], fill, color,   COLS[3].pct, true),
        tableCell(d.description,   fill, C_MID,   COLS[4].pct),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows:  [headerRow, ...dataRows],
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek." }, { status: 400 }); }

  const { year, month, rules = [], expertNotes = "" } = body as {
    year:        number;
    month:       number;
    rules:       { text: string; category: string }[];
    expertNotes: string;
  };

  if (typeof year !== "number" || typeof month !== "number" || month < 0 || month > 11)
    return Response.json({ ok: false, error: "Geçersiz ay/yıl." }, { status: 400 });

  const data       = getHacamatMonthData(year, month);
  const monthLabel = `${MONTH_NAMES_TR[month]} ${year}`;
  const today      = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  const oncesiRules  = rules.filter(r => r.category === "oncesi");
  const sonrasiRules = rules.filter(r => r.category === "sonrasi");
  // "genel" kategorisi Word raporuna dahil edilmez

  const all: ReportChild[] = [];

  // ── 1. Kapak ────────────────────────────────────────────────────────────────
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "HACAMAT TAKVİMİ",
    subtitle: `${monthLabel} · Hicri Ay: ${data.hijriMonthName}`,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Altın Gün",       value: String(data.altin.length) },
      { label: "Sünnet Gün",      value: String(data.sunnet.length) },
      { label: "Uygun Gün",       value: String(data.uygun.length) },
      { label: "Yasaklı (17–24)", value: String(data.yasakliNotable.length) },
    ],
  }));

  // ── 2. Aylık Hacamat Takvimi ────────────────────────────────────────────────
  all.push(secH1("Aylık Hacamat Takvimi", true));          // yeni sayfa
  all.push(caption(`${monthLabel} — Hicri 17–24 aralığı · ${data.notable.length} gün`));
  all.push(gap(100));
  all.push(buildTable(data.notable));
  all.push(gap(200));

  // ── 3. Dinamik Hicri Gün Notları ────────────────────────────────────────────
  all.push(secH1("Dinamik Hicri Gün Notları"));
  all.push(caption("Hicri günlerin akşamdan başlaması kuralına ve akşam geçişinin gerçek statüsüne göre otomatik üretilmiştir."));
  all.push(gap(60));

  if (data.notes.length === 0) {
    all.push(para("Bu ay için özel not bulunmuyor."));
  } else {
    data.notes.forEach((note, i) => all.push(noteItem(i + 1, note)));
  }
  all.push(gap(200));

  // ── 4. Hacamat Öncesi Kurallar ───────────────────────────────────────────────
  if (oncesiRules.length > 0) {
    all.push(secH2("Hacamat Öncesi Kurallar"));
    oncesiRules.forEach(r => all.push(ruleItem(r.text)));
    all.push(gap(140));
  }

  // ── 5. Hacamat Sonrası Kurallar ──────────────────────────────────────────────
  if (sonrasiRules.length > 0) {
    all.push(secH2("Hacamat Sonrası Kurallar"));
    sonrasiRules.forEach(r => all.push(ruleItem(r.text)));
    all.push(gap(140));
  }

  // ── 6. Uzman Notları ─────────────────────────────────────────────────────────
  all.push(secH2("Hacamat Uzmanı Notları"));
  if (!expertNotes.trim()) {
    all.push(para("Bu ay için uzman notu girilmemiştir."));
  } else {
    expertNotes.split("\n").filter(Boolean).forEach(line => all.push(para(line.trim())));
  }

  // ── Oluştur ──────────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Hacamat Takvimi · ${monthLabel}`) },
      children: all,
    }],
  });

  const buffer   = await Packer.toBuffer(doc);
  const filename = `hacamat-takvimi-${year}-${String(month + 1).padStart(2, "0")}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(buffer.length),
    },
  });
}
