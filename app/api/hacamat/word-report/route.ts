import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, ShadingType } from "docx";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildTOCPage,
  divider,
  fieldInline,
  h1Colored,
  h2,
  muted,
  spacer,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import { getHacamatMonthData, MONTH_NAMES_TR, type HacamatStatus, type CalendarDay } from "@/lib/cosmic/hacamat";

export const runtime = "nodejs";

// ─── Renk sabitleri ────────────────────────────────────────────────────────────

const C_TEAL   = "0f766e";
const C_ALTIN  = "d97706";
const C_SUNNET = "059669";
const C_UYGUN  = "ca8a04";
const C_YASAK  = "dc2626";
const C_DARK   = "1e293b";
const C_MID    = "475569";
const C_LIGHT  = "94a3b8";
const FONT     = "Calibri";

// Dolgu renkleri (hex, Word için alfa yok)
const FILL: Record<HacamatStatus, string> = {
  altin:   "FEF3C7",
  sunnet:  "D1FAE5",
  uygun:   "FEF9C3",
  yasakli: "FEE2E2",
  normal:  "FFFFFF",
};

const LABEL: Record<HacamatStatus, string> = {
  altin:   "ALTIN GÜN ⭐⭐⭐⭐⭐",
  sunnet:  "SÜNNET GÜN ⭐⭐⭐",
  uygun:   "UYGUN GÜN ⭐",
  yasakli: "YASAKLI GÜN ⛔",
  normal:  "",
};

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function makeCell(text: string, fill: string, bold = false, color = C_DARK, colWidth = 20): TableCell {
  return new TableCell({
    width: { size: colWidth, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, fill },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 20, font: FONT, color })],
        spacing: { before: 80, after: 80 },
        indent:  { left: 100 },
      }),
    ],
  });
}

function buildCalendarTable(days: CalendarDay[]): Table {
  const headers  = ["Miladi Tarih", "Gün", "Hicri Tarih", "Durum", "Açıklama"];
  const colWidths = [22, 10, 22, 20, 26];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width:   { size: colWidths[i]!, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, fill: "0f766e" },
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: 20, font: FONT, color: "FFFFFF" })],
            spacing:  { before: 80, after: 80 },
            indent:   { left: 100 },
          }),
        ],
      })
    ),
  });

  const dataRows = days.map(d =>
    new TableRow({
      children: [
        makeCell(d.miladiFull,      FILL[d.status], false, C_DARK, colWidths[0]!),
        makeCell(d.weekDayName,     FILL[d.status], false, C_MID,  colWidths[1]!),
        makeCell(d.hijriFormatted,  FILL[d.status], false, C_MID,  colWidths[2]!),
        makeCell(LABEL[d.status],   FILL[d.status], true,
          d.status === "altin"   ? C_ALTIN  :
          d.status === "sunnet"  ? C_SUNNET :
          d.status === "uygun"   ? C_UYGUN  :
          d.status === "yasakli" ? C_YASAK  : C_DARK,
          colWidths[3]!),
        makeCell(d.description,     FILL[d.status], false, C_MID,  colWidths[4]!),
      ],
    })
  );

  return new Table({
    width:   { size: 100, type: WidthType.PERCENTAGE },
    rows:    [headerRow, ...dataRows],
  });
}

function dayListSection(title: string, days: CalendarDay[], color: string, items: ReportChild[]): void {
  if (!days.length) return;
  items.push(h2(title));
  items.push(muted(`${days.length} gün`));
  for (const d of days) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${d.stars}  `, size: 22, font: FONT }),
          new TextRun({ text: d.miladiFull, bold: true, size: 22, font: FONT, color }),
          new TextRun({ text: `  ·  ${d.weekDayName}  ·  ${d.hijriFormatted}`, size: 20, font: FONT, color: C_MID }),
        ],
        spacing: { after: 100 },
        indent:  { left: 360 },
      })
    );
    if (d.description)
      items.push(bodyText(d.description));
  }
  items.push(spacer());
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek." }, { status: 400 }); }

  const { year, month, rules = [], expertNotes = "" } = body as {
    year:         number;
    month:        number;
    rules:        { text: string; category: string }[];
    expertNotes:  string;
  };

  if (typeof year !== "number" || typeof month !== "number" || month < 0 || month > 11)
    return Response.json({ ok: false, error: "Geçersiz ay/yıl." }, { status: 400 });

  const data        = getHacamatMonthData(year, month);
  const monthLabel  = `${MONTH_NAMES_TR[month]} ${year}`;
  const today       = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug    = new Date().toISOString().slice(0, 10);

  const all: ReportChild[] = [];

  // ── 1. Kapak ────────────────────────────────────────────────────────────────
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "HACAMAT TAKVİMİ",
    subtitle: `${monthLabel} · Hicri Ay: ${data.hijriMonthName}`,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Altın Gün",    value: String(data.altin.length) },
      { label: "Sünnet Gün",   value: String(data.sunnet.length) },
      { label: "Uygun Gün",    value: String(data.uygun.length) },
      { label: "Yasaklı (17-24)", value: String(data.yasakliNotable.length) },
    ],
  }));

  // ── 2. İçindekiler ──────────────────────────────────────────────────────────
  all.push(...buildTOCPage());

  // ── 3. Aylık Hacamat Takvimi ────────────────────────────────────────────────
  all.push(h1Colored("1. Aylık Hacamat Takvimi", C_TEAL, true));
  all.push(muted(`${monthLabel} — Hicri 17–24 gün aralığı · ${data.notable.length} gün`));
  all.push(spacer());
  all.push(buildCalendarTable(data.notable));
  all.push(spacer());

  // ── 4. Altın Günler ─────────────────────────────────────────────────────────
  all.push(h1Colored("2. Altın Günler", C_ALTIN, true));
  if (data.altin.length === 0) {
    all.push(muted(`${monthLabel}'de Altın Gün bulunmuyor.`));
    all.push(muted("Altın Gün: Hicri 17 + Salı günü eşleştiğinde oluşur."));
  } else {
    all.push(muted("Hicri 17 + Salı — yılın en güçlü hacamat günleri"));
    dayListSection("", data.altin, C_ALTIN, all);
  }

  // ── 5. Sünnet Günleri ───────────────────────────────────────────────────────
  all.push(h1Colored("3. Sünnet Günleri", C_SUNNET, true));
  if (data.sunnet.length === 0) {
    all.push(muted(`${monthLabel}'de Sünnet Gün bulunmuyor.`));
  } else {
    all.push(muted("Hicri 17/19/21 + Pazar/Pazartesi/Salı/Perşembe"));
    dayListSection("", data.sunnet, C_SUNNET, all);
  }

  // ── 6. Uygun Günler ─────────────────────────────────────────────────────────
  all.push(h1Colored("4. Uygun Günler", C_UYGUN, true));
  if (data.uygun.length === 0) {
    all.push(muted(`${monthLabel}'de Uygun Gün bulunmuyor.`));
  } else {
    all.push(muted("Hicri 18/20/22/23/24 + Pazar/Pazartesi/Salı/Perşembe"));
    dayListSection("", data.uygun, C_UYGUN, all);
  }

  // ── 7. Yasaklı Günler (17-24 aralığında) ────────────────────────────────────
  all.push(h1Colored("5. Yasaklı Günler (Hicri 17–24)", C_YASAK, true));
  all.push(muted("Not: Çarşamba, Cuma ve Cumartesi günleri hicri gün ne olursa olsun yasaktır."));
  if (data.yasakliNotable.length === 0) {
    all.push(muted(`${monthLabel}'de sünnet/uygun aralığında yasaklı gün bulunmuyor.`));
  } else {
    dayListSection("", data.yasakliNotable, C_YASAK, all);
  }

  // ── 8. Dinamik Hicri Gün Notları ────────────────────────────────────────────
  all.push(h1Colored("6. Dinamik Hicri Gün Notları", C_TEAL, true));
  all.push(muted("Hicri günlerin akşamdan başlaması kuralına göre otomatik üretilmiştir."));
  all.push(spacer());

  if (data.notes.length === 0) {
    all.push(bodyText("Bu ay için özel not bulunmuyor."));
  } else {
    data.notes.forEach((note, i) => {
      all.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true, size: 22, font: FONT, color: C_TEAL }),
            new TextRun({ text: note, size: 22, font: FONT, color: C_MID }),
          ],
          spacing: { before: 140, after: 200 },
          indent:  { left: 360 },
        })
      );
    });
  }

  // ── 9. Hacamat Kuralları ────────────────────────────────────────────────────
  all.push(h1Colored("7. Hacamat Öncesi ve Sonrası Dikkat Edilecek Kurallar", C_TEAL, true));
  all.push(spacer());

  const categories: [string, string, string][] = [
    ["oncesi",  "Hacamat Öncesi Kurallar",  C_TEAL],
    ["sonrasi", "Hacamat Sonrası Kurallar", C_TEAL],
    ["genel",   "Genel Kurallar",            C_TEAL],
  ];

  for (const [cat, catLabel, catColor] of categories) {
    const catRules = rules.filter(r => r.category === cat);
    if (!catRules.length) continue;
    all.push(h2(catLabel));
    for (const rule of catRules) {
      all.push(
        new Paragraph({
          children: [
            new TextRun({ text: "·  ", size: 20, font: FONT, color: C_LIGHT }),
            new TextRun({ text: rule.text, size: 20, font: FONT, color: C_MID }),
          ],
          indent:  { left: 360 },
          spacing: { after: 80 },
        })
      );
    }
    all.push(spacer());
  }

  // ── 10. Uzman Notları ───────────────────────────────────────────────────────
  all.push(h1Colored("8. Hacamat Uzmanı Notları", C_TEAL, true));
  if (!expertNotes.trim()) {
    all.push(muted("Bu ay için uzman notu girilmemiştir."));
  } else {
    expertNotes.split("\n").filter(Boolean).forEach(line => {
      all.push(bodyText(line.trim()));
    });
  }

  // ── Oluştur ─────────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Hacamat Takvimi · ${monthLabel}`) },
      children: all,
    }],
  });

  const buffer   = await Packer.toBuffer(doc);
  const filename = `hacamat-takvimi-${year}-${String(month + 1).padStart(2, "0")}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(buffer.length),
    },
  });
}
