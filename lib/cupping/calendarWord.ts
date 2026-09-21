/**
 * KUPA & HACAMAT — FAZ 6 — YILLIK HACAMAT TAKVİMİ WORD (.docx) ÜRETİCİSİ (SAF).
 *
 * AMAÇ: Uzmanın KAYDEDİLMİŞ yıllık takvim planından (plan + seçili günler + varsa bağlı
 *   bilgilendirme şablonu) gerçek, düzenlenebilir bir Word belgesi üretir.
 *
 * SAFLIK SÖZLEŞMESİ (KESİN — test edilebilirlik için):
 *   - Bu dosya DB/auth/network İÇERMEZ. Girdi tamamen çağıran (server route) tarafından
 *     tenant-güvenli biçimde toplanmış hazır veridir. Böylece harness gerçek DOCX üretip
 *     JSZip ile doğrulayabilir.
 *   - Sistem GÜN / RENK / RENK ANLAMI / SAĞLIK TAVSİYESİ ÜRETMEZ. Yalnız verilen kayıtları
 *     temsil eder (FAZ 5 ürün kararları Word'de de geçerlidir).
 *   - Otomatik Sünnet/Altın günü, 17/19/21 öneri motoru, hazır lejant YOKTUR.
 *   - Hicrî tarih TEK kanonik kaynaktan (lib/cupping/hijri) türetilir — ikinci motor yok.
 *   - Haftanın başlangıcı Pazartesi (WEEKDAYS_TR / isoWeekday — bulk.ts tek kaynağı).
 *
 * KOZMİK SINIR: lib/cosmic/** veya app/api/hacamat/** ile HİÇBİR bağı yoktur.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeightRule,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { gregorianToHijri, toYmd } from "@/lib/cupping/hijri";
import { WEEKDAYS_TR, isoWeekday } from "@/app/kupa/takvim/lib/bulk";
import {
  CUPPING_DAY_COLORS_LABEL_TR,
  CUPPING_DAY_WORD_COLORS,
  CUPPING_DAY_WORD_NEUTRAL,
} from "@/lib/cupping/calendarWordColors";
import type {
  CuppingAdviceTemplate,
  CuppingCalendarPlan,
  CuppingCalendarPlanDay,
  CuppingDayColorKey,
} from "@/lib/cupping/calendarTypes";

export const WORD_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const FONT = "Calibri";

// ─── Kurumsal renkler (marka; gün renklerinden AYRI) ─────────────────────────
const C_BRAND = "0F766E"; // teal
const C_DARK = "1E293B";
const C_MID = "475569";
const C_LIGHT = "94A3B8";
const RULE_GRAY = "CBD5E1";

/** Gregoryen ay adları (Türkçe; nötr — hiçbir hüküm taşımaz). */
const GREGORIAN_MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

/**
 * A3 YATAY sayfa (twips). NOT: docx, orientation=LANDSCAPE iken width/height'ı ÇIKTIDA takas eder.
 *   Bu yüzden burada A3'ün DİKEY (portrait) ölçüleri verilir — width 297mm=16838, height 420mm=23811.
 *   docx takas edince nihai pgSz: w:w=23811 (420mm), w:h=16838 (297mm), orient=landscape → GERÇEK A3 YATAY.
 */
const A3_LANDSCAPE = {
  width: 16838, // 297mm (kısa kenar) — landscape takası sonrası w:h olur
  height: 23811, // 420mm (uzun kenar) — landscape takası sonrası w:w olur
  orientation: PageOrientation.LANDSCAPE,
} as const;

/** A4 DİKEY sayfa (twips): 210mm × 297mm → 11906 × 16838. */
const A4_PORTRAIT = {
  width: 11906,
  height: 16838,
  orientation: PageOrientation.PORTRAIT,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Yardımcılar
// ═══════════════════════════════════════════════════════════════════════════

/** Bir Gregoryen ayın gün sayısı (UTC öğle → kayma yok; artık yıl doğru). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
}

/** Gün-stili çözümü: color_key → Word renk seti (NULL → nötr indigo). */
function wordColorFor(colorKey: CuppingDayColorKey | null): { fill: string; text: string; border: string } {
  return colorKey ? CUPPING_DAY_WORD_COLORS[colorKey] : CUPPING_DAY_WORD_NEUTRAL;
}

/** Türkçe renk adı (a11y/lejant; renk ANLAMI DEĞİL). NULL → "Renk yok". */
function colorNameFor(colorKey: CuppingDayColorKey | null): string {
  return colorKey ? CUPPING_DAY_COLORS_LABEL_TR[colorKey] : "Renk yok";
}

/** Metni satırlara böler (\r\n / \n); boş satırları da korur ama sondaki fazlalığı kırpar. */
function toLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/** İnce gri ayırıcı çizgi (alt kenarlıklı boş paragraf). */
function ruleParagraph(before = 60, after = 60): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_GRAY } },
    spacing: { before, after },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SAYFA 1 — A3 YATAY YILLIK TAKVİM (12 ay tek sayfada)
// ═══════════════════════════════════════════════════════════════════════════

/** Tek bir mini-ay hücresini (başlık + haftagünü satırı + gün ızgarası) üretir. */
function miniMonthCell(
  year: number,
  month: number, // 1..12
  selected: Map<string, CuppingCalendarPlanDay>,
): TableCell {
  const total = daysInMonth(year, month);
  const firstIso = isoWeekday(toYmd({ year, month, day: 1 })); // 1=Pzt … 7=Paz
  const lead = firstIso - 1; // önce boş hücre sayısı (Pazartesi başlangıç)

  // Haftagünü başlık satırı (Pzt … Paz).
  const headerRow = new TableRow({
    tableHeader: true,
    children: WEEKDAYS_TR.map((w) =>
      new TableCell({
        width: { size: 14, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 10, after: 10 },
            children: [new TextRun({ text: w.short, bold: true, size: 13, font: FONT, color: C_MID })],
          }),
        ],
      }),
    ),
  });

  // Gün ızgarası — 6 haftaya kadar; artık boş satır üretilmez.
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weekRows: TableRow[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    weekRows.push(
      new TableRow({
        height: { value: 340, rule: HeightRule.ATLEAST },
        children: week.map((day) => {
          if (day === null) {
            return new TableCell({
              width: { size: 14, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: "", size: 12, font: FONT })] })],
            });
          }
          const ymd = toYmd({ year, month, day });
          const sel = selected.get(ymd);
          if (sel) {
            const c = wordColorFor(sel.color_key);
            return new TableCell({
              width: { size: 14, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: c.fill },
              verticalAlign: VerticalAlign.CENTER,
              // Renk dışında destekleyici ince kenarlık (seçili durum ikinci sinyali; a11y/baskı).
              borders: {
                top: { style: BorderStyle.SINGLE, size: 6, color: c.border },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: c.border },
                left: { style: BorderStyle.SINGLE, size: 6, color: c.border },
                right: { style: BorderStyle.SINGLE, size: 6, color: c.border },
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 8, after: 8 },
                  children: [new TextRun({ text: String(day), bold: true, size: 16, font: FONT, color: c.text })],
                }),
              ],
            });
          }
          // Seçilmemiş gün — nötr.
          return new TableCell({
            width: { size: 14, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 8, after: 8 },
                children: [new TextRun({ text: String(day), size: 15, font: FONT, color: C_MID })],
              }),
            ],
          });
        }),
      }),
    );
  }

  const monthTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...weekRows],
  });

  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    margins: { top: 40, bottom: 120, left: 90, right: 90 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 60 },
        children: [new TextRun({ text: GREGORIAN_MONTHS_TR[month - 1], bold: true, size: 20, font: FONT, color: C_BRAND })],
      }),
      monthTable,
      // OOXML: bir tablo hücresi TABLO ile bitemez — sondaki boş paragraf zorunlu (yoksa Word "bozuk" der).
      new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "", size: 2, font: FONT })] }),
    ],
  });
}

/** 12 mini-ayı 4 sütun × 3 satır ızgarasında (Ocak→Aralık) döşer. */
function buildAnnualGrid(year: number, selected: Map<string, CuppingCalendarPlanDay>): Table {
  const rows: TableRow[] = [];
  for (let r = 0; r < 3; r++) {
    const rowCells: TableCell[] = [];
    for (let c = 0; c < 4; c++) {
      const month = r * 4 + c + 1; // 1..12
      rowCells.push(miniMonthCell(year, month, selected));
    }
    rows.push(new TableRow({ cantSplit: true, children: rowCells }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Dış ızgara çizgisiz — mini-ay tabloları kendi çizgisini taşır (ferah görünüm).
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows,
  });
}

/** Sayfa 1 (A3 yatay) gövdesi: başlık + plan adı/yılı + 12-ay ızgarası + kompakt renk şeridi. */
function buildPage1(plan: CuppingCalendarPlan, selected: Map<string, CuppingCalendarPlanDay>): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [new TextRun({ text: "HACAMAT TAKVİMİ", bold: true, size: 40, font: FONT, color: C_BRAND, allCaps: true })],
    }),
  );
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 140 },
      children: [
        new TextRun({ text: plan.name, bold: true, size: 24, font: FONT, color: C_DARK }),
        new TextRun({ text: `   ·   ${plan.year}`, size: 24, font: FONT, color: C_MID }),
      ],
    }),
  );

  out.push(buildAnnualGrid(plan.year, selected));

  // Bu plandaki günlerde GERÇEKTEN kullanılan renkler için kompakt şerit (hazır lejant DEĞİL;
  // yalnız uzmanın kullandığı renkleri sayar; renge anlam yüklemez).
  const usedColors = new Map<CuppingDayColorKey | "none", number>();
  for (const d of selected.values()) {
    const key = d.color_key ?? "none";
    usedColors.set(key, (usedColors.get(key) ?? 0) + 1);
  }
  if (usedColors.size > 0) {
    const chips: TextRun[] = [];
    for (const [key, count] of usedColors) {
      const ck = key === "none" ? null : (key as CuppingDayColorKey);
      const c = wordColorFor(ck);
      chips.push(new TextRun({ text: "  ■ ", size: 16, font: FONT, color: c.text }));
      chips.push(new TextRun({ text: `${colorNameFor(ck)} (${count})   `, size: 15, font: FONT, color: C_MID }));
    }
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 0 },
        children: [
          new TextRun({ text: "Kullanılan renkler:  ", size: 15, font: FONT, color: C_LIGHT, italics: true }),
          ...chips,
        ],
      }),
    );
  } else {
    // OOXML: bölüm gövdesi tablo ile bitmemeli — sıfır-gün durumunda sondaki boş paragraf.
    out.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "", size: 2, font: FONT })] }));
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAYFA 2+ — SEÇİLİ GÜNLER VE AÇIKLAMALAR (A4 dikey)
// ═══════════════════════════════════════════════════════════════════════════

function secH1(text: string): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 0, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCFBF1" } },
    children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: C_BRAND })],
  });
}

function secH2(text: string): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 160, after: 40 },
    children: [new TextRun({ text, bold: true, size: 22, font: FONT, color: C_BRAND })],
  });
}

/** Tek bir seçili günün blok gösterimi (başlık sayfa sonunda kopmaz — keepNext zinciri). */
function selectedDayBlock(day: CuppingCalendarPlanDay): Paragraph[] {
  const parts = day.gregorian_date.split("-").map(Number);
  const [y, m, d] = parts;
  const weekday = WEEKDAYS_TR[isoWeekday(day.gregorian_date) - 1]?.long ?? "";
  const hijri = gregorianToHijri(day.gregorian_date);
  const c = wordColorFor(day.color_key);

  const out: Paragraph[] = [];

  // Başlık: "9 Eylül 2026 — Çarşamba" (keepNext → içerikle beraber kalır).
  out.push(
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: 200, after: 20 },
      children: [
        new TextRun({ text: "■ ", size: 20, font: FONT, color: c.text }),
        new TextRun({ text: `${d} ${GREGORIAN_MONTHS_TR[m - 1]} ${y}`, bold: true, size: 21, font: FONT, color: C_DARK }),
        new TextRun({ text: weekday ? ` — ${weekday}` : "", size: 21, font: FONT, color: C_MID }),
      ],
    }),
  );

  // Tam Hicrî tarih (kanonik kaynak).
  out.push(
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: 0, after: 20 },
      indent: { left: 240 },
      children: [
        new TextRun({
          text: hijri ? hijri.formatted : "Hicrî tarih hesaplanamadı",
          size: 18,
          font: FONT,
          color: C_MID,
          italics: !hijri,
        }),
        new TextRun({ text: `    ·    Renk: ${colorNameFor(day.color_key)}`, size: 16, font: FONT, color: C_LIGHT }),
      ],
    }),
  );

  // Kısa açıklama (varsa) — detay notuyla BİRLEŞTİRİLMEZ.
  if (day.user_label && day.user_label.trim()) {
    out.push(
      new Paragraph({
        keepLines: true,
        spacing: { before: 10, after: 10 },
        indent: { left: 240 },
        children: [
          new TextRun({ text: "Kısa açıklama: ", bold: true, size: 18, font: FONT, color: C_MID }),
          new TextRun({ text: day.user_label.trim(), size: 18, font: FONT, color: C_DARK }),
        ],
      }),
    );
  }

  // Detay notu (varsa) — satır sonları korunur (paragraf-başına satır).
  if (day.note && day.note.trim()) {
    out.push(
      new Paragraph({
        keepLines: true,
        spacing: { before: 10, after: 4 },
        indent: { left: 240 },
        children: [new TextRun({ text: "Detay notu:", bold: true, size: 18, font: FONT, color: C_MID })],
      }),
    );
    for (const line of toLines(day.note.trim())) {
      out.push(
        new Paragraph({
          keepLines: true,
          spacing: { before: 0, after: 4 },
          indent: { left: 360 },
          children: [new TextRun({ text: line, size: 18, font: FONT, color: C_DARK })],
        }),
      );
    }
  }

  // İnce ayırıcı (günler arası).
  out.push(ruleParagraph(80, 0));

  return out;
}

function buildSelectedDaysSection(days: CuppingCalendarPlanDay[]): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(secH1("SEÇİLİ GÜNLER VE AÇIKLAMALAR"));

  if (days.length === 0) {
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 0 },
        children: [
          new TextRun({
            text: "Bu takvimde henüz seçili gün yok. Uygulama günlerinizi takvim üzerinden işaretledikçe burada listelenir.",
            size: 18,
            font: FONT,
            color: C_LIGHT,
            italics: true,
          }),
        ],
      }),
    );
    return out;
  }

  out.push(
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: `${days.length} seçili gün — kronolojik sırada.`, size: 16, font: FONT, color: C_LIGHT, italics: true }),
      ],
    }),
  );

  // Kaynak liste zaten gregorian_date ASC (server); yine de garanti altına al.
  const sorted = [...days].sort((a, b) => a.gregorian_date.localeCompare(b.gregorian_date));
  for (const day of sorted) out.push(...selectedDayBlock(day));

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// BİLGİLENDİRME NOTLARI (bağlı şablon; yoksa hiç render edilmez)
// ═══════════════════════════════════════════════════════════════════════════

function textBlock(label: string, text: string): Paragraph[] {
  const out: Paragraph[] = [secH2(label)];
  for (const line of toLines(text)) {
    out.push(
      new Paragraph({
        keepLines: true,
        spacing: { before: 0, after: 8 },
        indent: { left: 160 },
        children: [new TextRun({ text: line, size: 18, font: FONT, color: C_DARK })],
      }),
    );
  }
  return out;
}

function buildAdviceSection(template: CuppingAdviceTemplate | null): Paragraph[] {
  if (!template) return [];
  const before = (template.before_text ?? "").trim();
  const after = (template.after_text ?? "").trim();
  const general = (template.general_note ?? "").trim();
  // Hiç içerik yoksa boş sayfa/başlık üretme.
  if (!before && !after && !general) return [];

  const out: Paragraph[] = [];
  out.push(secH1("BİLGİLENDİRME NOTLARI"));
  if (template.title?.trim()) {
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: template.title.trim(), bold: true, size: 20, font: FONT, color: C_DARK })],
      }),
    );
  }
  if (before) out.push(...textBlock("Öncesi", before));
  if (after) out.push(...textBlock("Sonrası", after));
  if (general) out.push(...textBlock("Genel", general));
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Kurumsal footer (yerel; paylaşımlı helper'a dokunulmaz)
// ═══════════════════════════════════════════════════════════════════════════

function buildFooter(planLabel: string): Footer {
  return new Footer({
    children: [
      ruleParagraph(0, 40),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: "Yaşam Sistemi™", bold: true, size: 15, font: FONT, color: C_DARK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [
          new ExternalHyperlink({
            link: "https://www.yasamsistemi.com",
            children: [new TextRun({ text: "↗ www.yasamsistemi.com", size: 14, font: FONT, color: C_BRAND })],
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: `Hacamat Takvimi  •  ${planLabel}  •  Sayfa `, size: 13, font: FONT, color: C_LIGHT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 13, font: FONT, color: C_LIGHT }),
          new TextRun({ text: " / ", size: 13, font: FONT, color: C_LIGHT }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 13, font: FONT, color: C_LIGHT }),
        ],
      }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Ana giriş noktası
// ═══════════════════════════════════════════════════════════════════════════

export type BuildCalendarWordInput = {
  plan: CuppingCalendarPlan;
  days: CuppingCalendarPlanDay[];
  /** Plana bağlı bilgilendirme şablonu (varsa). Yoksa/boşsa bölüm hiç eklenmez. */
  template?: CuppingAdviceTemplate | null;
};

/**
 * Kaydedilmiş takvim verisinden gerçek, düzenlenebilir DOCX buffer'ı üretir.
 * SAF: DB/auth/network yok. Çağıran (server route) veriyi tenant-güvenli toplar.
 */
export async function buildCalendarPlanWordBuffer(input: BuildCalendarWordInput): Promise<Buffer> {
  const { plan, days, template = null } = input;

  const selected = new Map<string, CuppingCalendarPlanDay>();
  for (const d of days) selected.set(d.gregorian_date, d);

  const planLabel = `${plan.name} · ${plan.year}`;

  const page2Children = [
    ...buildSelectedDaysSection(days),
    ...buildAdviceSection(template),
  ];

  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: `Hacamat Takvimi ${plan.year}`,
    description: plan.name,
    sections: [
      // SAYFA 1 — A3 YATAY yıllık takvim (tek sayfa).
      {
        properties: {
          page: {
            size: A3_LANDSCAPE,
            margin: { top: 560, bottom: 900, left: 560, right: 560, header: 240, footer: 320 },
          },
        },
        footers: { default: buildFooter(planLabel) },
        children: buildPage1(plan, selected),
      },
      // SAYFA 2+ — A4 DİKEY seçili günler + bilgilendirme.
      {
        properties: {
          page: {
            size: A4_PORTRAIT,
            margin: { top: 900, bottom: 1120, left: 1000, right: 1000, header: 360, footer: 360 },
          },
        },
        footers: { default: buildFooter(planLabel) },
        children: page2Children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/**
 * İndirme için güvenli/anlaşılır dosya adı. Varsayılan: "Hacamat-Takvimi-<yıl>.docx" (şartname örneği).
 * Plan adı varsayılan kalıptan anlamlı biçimde farklıysa ayırt edici bir slug eklenir (ör. iki 2026
 * planını ayırmak için) — Türkçe karakterler güvenli normalize edilir (ASCII; başlık/uç tire kırpılır).
 */
export function calendarWordFilename(plan: Pick<CuppingCalendarPlan, "name" | "year">): string {
  const slug = (plan.name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diakritik kaldır (ör. NFKD "ş"→"s"; ASCII fallback)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  // Plan adı zaten "hacamat/takvim/yıl"dan ibaretse (varsayılan) ekstra slug ekleme → temiz ad.
  const genericSlug = slug.replace(/hacamat|takvim[i]?|-|\d/g, "") === "";
  const base = slug && !genericSlug ? `Hacamat-Takvimi-${slug}-${plan.year}` : `Hacamat-Takvimi-${plan.year}`;
  return `${base}.docx`;
}
