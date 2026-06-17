import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  buildFooter,
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

// ─── Renkler — sabit HEX, ThemeColor yok ─────────────────────────────────────

const C_TEAL  = "0F766E";
const C_DARK  = "1E293B";
const C_MID   = "475569";
const C_LIGHT = "94A3B8";

const TH_FILL = "CCFBF1";
const TH_TEXT = "134E4A";

const FILL: Record<HacamatStatus, string> = {
  altin:   "FEF3C7",
  sunnet:  "D1FAE5",
  uygun:   "FEF9C3",
  yasakli: "FEE2E2",
  normal:  "F8FAFC",
};

const STATUS_COLOR: Record<HacamatStatus, string> = {
  altin:   "B45309",
  sunnet:  "047857",
  uygun:   "A16207",
  yasakli: "B91C1C",
  normal:  "334155",
};

const LABEL: Record<HacamatStatus, string> = {
  altin:   "ALTIN GÜN ⭐⭐⭐⭐⭐",
  sunnet:  "SÜNNET GÜN ⭐⭐⭐",
  uygun:   "UYGUN GÜN ⭐",
  yasakli: "YASAKLI GÜN ⛔",
  normal:  "—",
};

// ─── Kenarlık sıfırı (kurul tablosu için) ─────────────────────────────────────

const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

// ─── Paragraph yardımcıları ───────────────────────────────────────────────────

function docTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children:  [new TextRun({ text, bold: true, size: 44, font: FONT, color: C_TEAL, allCaps: true })],
    spacing:   { before: 0, after: 80 },
  });
}

function docSubtitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children:  [new TextRun({ text, size: 20, font: FONT, color: C_MID, italics: true })],
    spacing:   { before: 0, after: 60 },
  });
}

function secH1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, font: FONT, color: C_TEAL })],
    spacing:  { before: 160, after: 80 },
    border:   { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCFBF1" } },
  });
}

function secH2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, font: FONT, color: C_TEAL })],
    spacing:  { before: 140, after: 60 },
  });
}

function caption(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 17, font: FONT, color: C_LIGHT, italics: true })],
    spacing:  { before: 20, after: 40 },
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 19, font: FONT, color: C_MID })],
    spacing:  { before: 30, after: 50 },
    indent:   { left: 180 },
  });
}

function noteItem(num: number, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${num}.  `, bold: true, size: 19, font: FONT, color: C_TEAL }),
      new TextRun({ text, size: 19, font: FONT, color: C_MID }),
    ],
    spacing: { before: 40, after: 60 },
    indent:  { left: 180 },
  });
}

function gap(size = 100): Paragraph {
  return new Paragraph({ spacing: { after: size } });
}

// ─── Ay Özeti kutusu ─────────────────────────────────────────────────────────

type SummaryItem = { label: string; value: string; fill: string; color: string };

function buildSummaryBox(items: SummaryItem[]): Table {
  const pct = Math.floor(100 / items.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: items.map(item =>
        new TableCell({
          width:   { size: pct, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: item.fill },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children:  [new TextRun({ text: item.label, size: 17, font: FONT, color: item.color })],
              spacing:   { before: 50, after: 10 },
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children:  [new TextRun({ text: item.value, bold: true, size: 28, font: FONT, color: item.color })],
              spacing:   { before: 0, after: 50 },
            }),
          ],
        })
      ),
    })],
  });
}

// ─── Hacamat Takvimi tablosu ──────────────────────────────────────────────────

function tableCell(
  text: string,
  fill: string,
  textColor: string,
  colPct: number,
  bold = false,
): TableCell {
  return new TableCell({
    width:   { size: colPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 18, font: FONT, color: textColor })],
        spacing:  { before: 40, after: 40 },
        indent:   { left: 60 },
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
        shading: { type: ShadingType.CLEAR, fill: TH_FILL },
        children: [
          new Paragraph({
            children: [new TextRun({ text: c.label, bold: true, size: 18, font: FONT, color: TH_TEXT })],
            spacing:  { before: 40, after: 40 },
            indent:   { left: 60 },
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
        tableCell(d.miladiFull,     fill, C_DARK, COLS[0].pct),
        tableCell(d.weekDayName,    fill, C_MID,  COLS[1].pct),
        tableCell(d.hijriFormatted, fill, C_DARK, COLS[2].pct),
        tableCell(LABEL[d.status],  fill, color,  COLS[3].pct, true),
        tableCell(d.description,    fill, C_MID,  COLS[4].pct),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows:  [headerRow, ...dataRows],
  });
}

// ─── İki kolonlu kural tablosu ────────────────────────────────────────────────

function ruleCell(text: string): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE },
    children: [
      new Paragraph({
        children: text
          ? [
              new TextRun({ text: "•  ", size: 18, font: FONT, color: C_TEAL }),
              new TextRun({ text, size: 18, font: FONT, color: C_MID }),
            ]
          : [new TextRun({ text: "" })],
        spacing: { before: 30, after: 40 },
        indent:  { left: 60 },
      }),
    ],
  });
}

function buildRulesTable(rules: { text: string }[]): Table {
  const rows: TableRow[] = [];
  for (let i = 0; i < rules.length; i += 2) {
    rows.push(new TableRow({
      children: [
        ruleCell(rules[i]!.text),
        ruleCell(rules[i + 1]?.text ?? ""),
      ],
    }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    BORDER_NONE,
      bottom: BORDER_NONE,
      left:   BORDER_NONE,
      right:  BORDER_NONE,
    },
    rows,
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

  const oncesiRules  = rules.filter(r => r.category === "oncesi");
  const sonrasiRules = rules.filter(r => r.category === "sonrasi");
  // "genel" kategorisi Word raporuna dahil edilmez

  const all: ReportChild[] = [];

  // ── 1. Başlık ────────────────────────────────────────────────────────────────
  all.push(docTitle("HACAMAT TAKVİMİ"));
  all.push(docSubtitle(`${monthLabel}  ·  Hicri Ay: ${data.hijriMonthName}`));
  all.push(gap(80));

  // ── 2. Ay Özeti kutusu ──────────────────────────────────────────────────────
  all.push(buildSummaryBox([
    { label: "Altın Gün",   value: `${data.altin.length} gün`,          fill: "FEF3C7", color: "B45309" },
    { label: "Sünnet Gün",  value: `${data.sunnet.length} gün`,         fill: "D1FAE5", color: "047857" },
    { label: "Uygun Gün",   value: `${data.uygun.length} gün`,          fill: "FEF9C3", color: "A16207" },
    { label: "Yasaklı Gün", value: `${data.yasakliNotable.length} gün`, fill: "FEE2E2", color: "B91C1C" },
  ]));
  all.push(gap(120));

  // ── 3. Aylık Hacamat Takvimi ────────────────────────────────────────────────
  all.push(secH1("Aylık Hacamat Takvimi"));
  all.push(caption(`${monthLabel} — Hicri 17–24 aralığı · ${data.notable.length} gün`));
  all.push(gap(60));
  all.push(buildTable(data.notable));
  all.push(gap(120));

  // ── 4. Dinamik Hicri Gün Notları ─────────────────────────────────────────────
  if (data.notes.length > 0) {
    all.push(secH1("Dinamik Hicri Gün Notları"));
    all.push(caption("Hicri günlerin akşamdan başlaması kuralına göre otomatik üretilmiştir."));
    all.push(gap(40));
    data.notes.forEach((note, i) => all.push(noteItem(i + 1, note)));
    all.push(gap(100));
  }

  // ── 5. Hacamat Öncesi Kurallar — 2 kolon ─────────────────────────────────────
  if (oncesiRules.length > 0) {
    all.push(secH2("Hacamat Öncesi Kurallar"));
    all.push(buildRulesTable(oncesiRules));
    all.push(gap(80));
  }

  // ── 6. Hacamat Sonrası Kurallar — 2 kolon ────────────────────────────────────
  if (sonrasiRules.length > 0) {
    all.push(secH2("Hacamat Sonrası Kurallar"));
    all.push(buildRulesTable(sonrasiRules));
    all.push(gap(80));
  }

  // ── 7. Uzman Notları — sadece boş değilse ────────────────────────────────────
  if (expertNotes.trim()) {
    all.push(secH2("Hacamat Uzmanı Notları"));
    expertNotes.split("\n").filter(Boolean).forEach(line => all.push(para(line.trim())));
  }

  // ── Oluştur — sıkıştırılmış sayfa marjı ──────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top:    640,   // ~0.44 inch
            bottom: 500,   // ~0.35 inch
            left:   720,   // 0.5 inch
            right:  720,   // 0.5 inch
            header: 280,
            footer: 280,
          },
        },
      },
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
