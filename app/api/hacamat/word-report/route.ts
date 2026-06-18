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

// ─── Paragraph yardımcıları ───────────────────────────────────────────────────

function docTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children:  [new TextRun({ text, bold: true, size: 34, font: FONT, color: C_TEAL, allCaps: true })],
    spacing:   { before: 0, after: 30 },
  });
}

function docSubtitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children:  [new TextRun({ text, size: 18, font: FONT, color: C_MID, italics: true })],
    spacing:   { before: 0, after: 20 },
  });
}

function secH1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: FONT, color: C_TEAL })],
    spacing:  { before: 80, after: 40 },
    border:   { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCFBF1" } },
  });
}

function secH2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 18, font: FONT, color: C_TEAL })],
    spacing:  { before: 70, after: 25 },
  });
}

function caption(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 15, font: FONT, color: C_LIGHT, italics: true })],
    spacing:  { before: 10, after: 15 },
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: FONT, color: C_MID })],
    spacing:  { before: 20, after: 35 },
    indent:   { left: 160 },
  });
}

function noteItem(num: number, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${num}.  `, bold: true, size: 18, font: FONT, color: C_TEAL }),
      new TextRun({ text, size: 18, font: FONT, color: C_MID }),
    ],
    spacing: { before: 20, after: 30 },
    indent:  { left: 160 },
  });
}

function gap(size = 80): Paragraph {
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
              children:  [new TextRun({ text: item.label, size: 15, font: FONT, color: item.color })],
              spacing:   { before: 30, after: 6 },
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children:  [new TextRun({ text: item.value, bold: true, size: 24, font: FONT, color: item.color })],
              spacing:   { before: 0, after: 30 },
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
        children: [new TextRun({ text, bold, size: 17, font: FONT, color: textColor })],
        spacing:  { before: 22, after: 22 },
        indent:   { left: 50 },
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

// ─── Tek sütun numaralı kural listesi ────────────────────────────────────────

function buildRulesList(rules: { rule_text: string }[]): Paragraph[] {
  return rules.map((rule, i) =>
    new Paragraph({
      children: [
        new TextRun({ text: `${i + 1})  `, bold: true, size: 18, font: FONT, color: C_TEAL }),
        new TextRun({ text: rule.rule_text, size: 18, font: FONT, color: C_DARK }),
      ],
      spacing: { before: 25, after: 35, line: 260, lineRule: "auto" },
      indent:  { left: 180, hanging: 180 },
    })
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────

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

// ─── Belge oluşturucu ────────────────────────────────────────────────────────

async function buildWordBuffer(params: {
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

  const all: ReportChild[] = [];

  all.push(docTitle(title || "HACAMAT TAKVİMİ"));
  all.push(docSubtitle(`${monthLabel}  ·  Hicri Ay: ${data.hijriMonthName}`));
  if (expertName?.trim()) {
    all.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children:  [new TextRun({ text: expertName.trim(), size: 20, font: FONT, color: C_MID })],
      spacing:   { before: 0, after: 40 },
    }));
  }
  all.push(gap(35));

  all.push(buildSummaryBox([
    { label: "Altın Gün",   value: `${data.altin.length} gün`,          fill: "FEF3C7", color: "B45309" },
    { label: "Sünnet Gün",  value: `${data.sunnet.length} gün`,         fill: "D1FAE5", color: "047857" },
    { label: "Uygun Gün",   value: `${data.uygun.length} gün`,          fill: "FEF9C3", color: "A16207" },
    { label: "Yasaklı Gün", value: `${data.yasakliNotable.length} gün`, fill: "FEE2E2", color: "B91C1C" },
  ]));
  all.push(gap(50));

  all.push(secH1("Aylık Hacamat Takvimi"));
  all.push(caption(`${monthLabel} — Hicri 17–24 aralığı · ${tableRows.length} gün`));
  all.push(gap(25));
  if (tableRows.length > 0) {
    all.push(buildTable(tableRows));
  } else {
    all.push(new Paragraph({
      children: [new TextRun({ text: "Seçili filtrelerle gösterilecek gün bulunamadı.", size: 17, font: FONT, color: C_LIGHT, italics: true })],
      spacing: { before: 25, after: 25 },
      indent:  { left: 160 },
    }));
  }
  all.push(gap(50));

  if (data.notes.length > 0) {
    all.push(secH1("Dinamik Hicri Gün Notları"));
    all.push(caption("Hicri günlerin akşamdan başlaması kuralına göre otomatik üretilmiştir."));
    all.push(gap(20));
    data.notes.forEach((note, i) => all.push(noteItem(i + 1, note)));
    all.push(gap(40));
  }

  if (inc.kurallar) {
    if (beforeRules.length > 0) {
      all.push(secH2("Hacamat Öncesi Kurallar"));
      all.push(...buildRulesList(beforeRules));
      all.push(gap(25));
    }
    if (afterRules.length > 0) {
      all.push(secH2("Hacamat Sonrası Kurallar"));
      all.push(...buildRulesList(afterRules));
      all.push(gap(25));
    }
  }

  if (inc.uzmanNotu && expertNotes.trim()) {
    all.push(secH2("Hacamat Uzmanı Notları"));
    expertNotes.split("\n").filter(l => l.trim()).forEach(line => all.push(para(line.trim())));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 480, bottom: 380, left: 600, right: 600, header: 240, footer: 240 },
        },
      },
      footers: { default: buildFooter(`Hacamat Takvimi · ${monthLabel}`) },
      children: all,
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

const WORD_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ─── GET — mobil için doğrudan indirme ───────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth()), 10);

  if (isNaN(year) || isNaN(month) || month < 0 || month > 11)
    return new Response("Geçersiz ay/yıl.", { status: 400 });

  const buffer   = await buildWordBuffer({ year, month });
  const filename = `hacamat-takvimi-${year}-${String(month + 1).padStart(2, "0")}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        WORD_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
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

  const buffer   = await buildWordBuffer({ year, month, rules, expertNotes, title, expertName, includeSections });
  const filename = `hacamat-takvimi-${year}-${String(month + 1).padStart(2, "0")}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        WORD_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(buffer.length),
      "Cache-Control":       "no-store",
    },
  });
}
