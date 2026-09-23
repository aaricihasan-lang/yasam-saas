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

// Gövde metni: sans-serif (okunaklı). Başlık/bölüm başlıkları: serif (premium his — referans görsel).
const FONT = "Calibri";
const HEAD_FONT = "Cambria"; // Office ile gelen güvenilir serif (Garamond hissi); gömme/COM gerektirmez.

// ─── Premium sıcak palet (marka; gün renklerinden AYRI — 7 gün rengi DEĞİŞMEZ) ─────
const C_TITLE = "134E4A"; // derin teal — ana başlık
const C_BRAND = "0F766E"; // teal aksan (bölüm başlıkları)
const C_DARK = "292524"; // sıcak siyaha yakın (gövde başlık/tarih)
const C_MID = "57534E"; // sıcak gri (ikincil metin)
const C_LIGHT = "A8A29E"; // sıcak açık gri (üçüncül/soluk)
const RULE_GRAY = "E7E2D8"; // sıcak ince çizgi (sert siyah DEĞİL)
const C_HEADER_FILL = "F3F1EA"; // takvim haftagünü satırı yumuşak zemin
const C_PILL_FILL = "EDEBE3"; // bilgilendirme etiket "pill" zemini

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

/** Kompakt "Seçili Günler ve Açıklamaları" özet tablosu sütun sayısı. */
const PAGE1_SUMMARY_COLUMNS = 4;

/**
 * SAYFALAMA BÜTÇESİ (twips) — SUNUCU-TARAFI, Word'e BAĞIMSIZ sezgisel yükseklik tahmini.
 *
 * AMAÇ (owner kararı): Yıllık takvim + seçili gün özeti + detay notları + bilgilendirme metinleri
 *   OKUNAKLI biçimde SIĞIYORSA belge TEK A3 yatay sayfa olur (gereksiz 2. sayfa YOK). Sığmıyorsa
 *   yalnız kalan içerik A4 dikey devam sayfalarına akar; aynı bilgiler TEKRAR EDİLMEZ.
 *
 * YÖNTEM: Blok yükseklikleri KONSERVATİF (aşırı) tahmin edilir → estimate ≤ bütçe ise gerçek içerik
 *   kesinlikle sığar (asla 2. A3 sayfasına taşmaz). Sabitler GERÇEK Microsoft Word render'ı ile
 *   0/5/10/30/100 gün + uzun not/şablon + 2025/2027/2028 senaryolarında kalibre edildi. Word COM'a
 *   ÇALIŞMA-ZAMANI bağımlılığı YOKTUR (yalnız kalibrasyon/CI doğrulaması için kullanılır).
 */
const EST = {
  TITLE: 850,
  GRID: 7400,
  SUM_HEAD: 500,
  SUM_ROW: 700, // ≤4 girişlik bir satır (en fazla 3 satırlık giriş)
  NOTES_HEAD: 500,
  NOTE_HDR: 320,
  NOTE_LABEL: 240,
  NOTE_LINE: 250,
  NOTE_RULE: 100,
  ADV_HEAD: 500,
  ADV_TITLE: 280,
  ADV_SUB: 360,
  ADV_LINE: 250,
  CONT_NOTE: 300,
  CHARS_PER_LINE: 88, // A4 dikey en dar sarma; A3'te daha az satır → tahmin konservatif kalır
} as const;

/**
 * A3 yatay kullanılabilir gövde yüksekliği ≈ 16838 − (top 400 + bottom 700) = 15738 twips.
 * Bütçe bunun ALTINDA (emniyet payı) — EST tahmini KONSERVATİF (≥ gerçek) olduğundan tahmin ≤ bütçe
 *   ⟹ gerçek ≤ kullanılabilir ⟹ tek A3 sayfada kesinlikle sığar (gerçek Word render ile doğrulandı).
 */
const A3_CONTENT_BUDGET = 15500;

/** Taşma durumunda A3'te gösterilecek özet gün ÜST SINIRI (ızgara+özet tek A3 sayfada — render-doğrulanmış). */
const PAGE1_SUMMARY_CAPACITY_MAX = 24;

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
        height: { value: 276, rule: HeightRule.ATLEAST },
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
    margins: { top: 20, bottom: 60, left: 90, right: 90 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 40 },
        children: [new TextRun({ text: GREGORIAN_MONTHS_TR[month - 1], bold: true, size: 18, font: FONT, color: C_BRAND })],
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

/**
 * AYLIK RAPOR — TEK ay için BÜYÜK, bağımsız, okunaklı takvim tablosu (A4 dikey; Pazartesi başlangıç).
 *   Yıllık ızgaranın küçültülmüş hâli DEĞİL; gerçek tek-ay ızgarası. Yalnız o ayın seçili günleri
 *   uzmanın renkleriyle işaretlenir (grid ymd araması ay dışına çıkmaz → başka ay sızmaz).
 */
function monthCalendarTable(year: number, month: number, selected: Map<string, CuppingCalendarPlanDay>): Table {
  const total = daysInMonth(year, month);
  const firstIso = isoWeekday(toYmd({ year, month, day: 1 }));
  const lead = firstIso - 1;

  const headerRow = new TableRow({
    tableHeader: true,
    children: WEEKDAYS_TR.map((w) =>
      new TableCell({
        width: { size: 14, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: C_HEADER_FILL },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 44, after: 44 },
            children: [new TextRun({ text: w.long.toLocaleUpperCase("tr-TR"), bold: true, size: 13, font: FONT, color: C_MID })],
          }),
        ],
      }),
    ),
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weekRows: TableRow[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    weekRows.push(
      new TableRow({
        height: { value: 780, rule: HeightRule.ATLEAST },
        cantSplit: true,
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
              borders: {
                top: { style: BorderStyle.SINGLE, size: 8, color: c.border },
                bottom: { style: BorderStyle.SINGLE, size: 8, color: c.border },
                left: { style: BorderStyle.SINGLE, size: 8, color: c.border },
                right: { style: BorderStyle.SINGLE, size: 8, color: c.border },
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 60, after: 60 },
                  children: [new TextRun({ text: String(day), bold: true, size: 24, font: FONT, color: c.text })],
                }),
              ],
            });
          }
          return new TableCell({
            width: { size: 14, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: [new TextRun({ text: String(day), size: 22, font: FONT, color: C_MID })],
              }),
            ],
          });
        }),
      }),
    );
  }

  const line = { style: BorderStyle.SINGLE, size: 3, color: RULE_GRAY } as const;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Hafif SICAK ızgara çizgileri (sert siyah DEĞİL). Seçili günler kendi renkli kenarlığını taşır.
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: [headerRow, ...weekRows],
  });
}

/** AYLIK belge başlığı: "HACAMAT TAKVİMİ" + "<Ay> <Yıl>" (açıkça görünür) + plan adı. */
function monthTitleBlock(plan: CuppingCalendarPlan, month: number): Paragraph[] {
  return [
    // Ana başlık — güçlü serif (premium his).
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 18 },
      children: [new TextRun({ text: "HACAMAT TAKVİMİ", bold: true, size: 44, font: HEAD_FONT, color: C_TITLE })],
    }),
    // Seçilen ay + yıl — belirgin serif alt başlık.
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 6 },
      children: [new TextRun({ text: `${GREGORIAN_MONTHS_TR[month - 1]} ${plan.year}`, bold: true, size: 26, font: HEAD_FONT, color: C_DARK })],
    }),
    // Plan adı — sakin ikincil metin.
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [new TextRun({ text: plan.name, size: 17, font: FONT, color: C_MID })],
    }),
    // İnce marka aksanı (sıcak hairline).
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 90 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C_BRAND } },
      children: [new TextRun({ text: "", size: 2, font: FONT })],
    }),
  ];
}

/**
 * SAYFA 1 kompakt özet hücresi — TEK seçili gün: renk işareti + Gregoryen tarih + haftagünü +
 *   TAM Hicrî tarih + (varsa) uzmanın KISA açıklaması. Her açıklama DOĞRUDAN kendi günüyle
 *   ilişkilidir (başka günün altında görünmez). Açıklama YOKSA uydurma metin eklenmez.
 */
function page1SummaryCell(day: CuppingCalendarPlanDay | null, colPct: number): TableCell {
  if (!day) {
    // Izgara doldurma (boş hücre) — OOXML için paragraf ile biter.
    return new TableCell({
      width: { size: colPct, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: "", size: 2, font: FONT })] })],
    });
  }
  const [y, m, d] = day.gregorian_date.split("-").map(Number);
  const weekday = WEEKDAYS_TR[isoWeekday(day.gregorian_date) - 1]?.long ?? "";
  const hijri = gregorianToHijri(day.gregorian_date);
  const c = wordColorFor(day.color_key);

  const children: Paragraph[] = [
    // Satır 1: renkli sol aksan + SERİF tarih + haftagünü.
    new Paragraph({
      keepLines: true,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: `${d} ${GREGORIAN_MONTHS_TR[m - 1]} ${y}`, bold: true, size: 15, font: HEAD_FONT, color: C_DARK }),
        new TextRun({ text: weekday ? ` - ${weekday}` : "", size: 14, font: FONT, color: C_MID }),
      ],
    }),
    // Satır 2: TAM Hicrî tarih (kanonik kaynak).
    new Paragraph({
      keepLines: true,
      spacing: { before: 0, after: 0 },
      indent: { left: 170 },
      children: [
        new TextRun({ text: hijri ? hijri.formatted : "Hicrî tarih hesaplanamadı", size: 14, font: FONT, color: C_MID, italics: !hijri }),
      ],
    }),
  ];
  // Satır 3: uzmanın kısa açıklaması — YALNIZ varsa (sistem üretmez).
  if (day.user_label && day.user_label.trim()) {
    children.push(
      new Paragraph({
        keepLines: true,
        spacing: { before: 0, after: 0 },
        indent: { left: 170 },
        children: [new TextRun({ text: day.user_label.trim(), size: 14, font: FONT, color: c.text })],
      }),
    );
  }

  // Renkli SOL aksan çizgisi (referans görseldeki gün-rengi bar) + üstte hafif ayraç.
  return new TableCell({
    width: { size: colPct, type: WidthType.PERCENTAGE },
    margins: { top: 50, bottom: 70, left: 100, right: 90 },
    verticalAlign: VerticalAlign.TOP,
    borders: {
      left: { style: BorderStyle.SINGLE, size: 20, color: c.border },
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    children,
  });
}

/**
 * SAYFA 1 — ızgaranın ALTINDA "SEÇİLİ GÜNLER VE AÇIKLAMALARI" kompakt çok-sütunlu özet.
 *
 * A3 TEK SAYFA şartı: yalnız kapasiteye kadar gün gösterilir (kronolojik). Kapasite aşılırsa
 *   günler SIKIŞTIRILMAZ; kalan günler A4 devam bölümünde EKSİKSİZ kalır ve burada açık bir
 *   "devamı sonraki sayfalarda" notu belirir (yalnız gerçekten devam eden kayıt varsa).
 */
/** Belge başlığı + plan adı/yılı (A3 üstü; her belgede bir kez) — premium serif hiyerarşi. */
function titleBlock(plan: CuppingCalendarPlan): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 14 },
      children: [new TextRun({ text: "HACAMAT TAKVİMİ", bold: true, size: 42, font: HEAD_FONT, color: C_TITLE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 10 },
      children: [
        new TextRun({ text: `${plan.year} Yıllık Takvim`, bold: true, size: 22, font: HEAD_FONT, color: C_DARK }),
        new TextRun({ text: `   ·   ${plan.name}`, size: 18, font: FONT, color: C_MID }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 70 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C_BRAND } },
      children: [new TextRun({ text: "", size: 2, font: FONT })],
    }),
  ];
}

/**
 * Premium bölüm başlığı — teal aksan (■) + SERİF başlık + ince sıcak alt çizgi.
 * keepNext KULLANILMAZ: keepNext, başlığı takip eden bloğu sığmazsa TOPLU olarak sonraki sayfaya iter
 *   → ilk A3 sayfasında büyük BOŞ ALAN bırakır (owner'ın bildirdiği "gereksiz ikinci sayfa" kök nedeni).
 */
function sectionHeader(text: string, size = 24): Paragraph {
  return new Paragraph({
    keepLines: true,
    spacing: { before: 130, after: 36 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_GRAY } },
    children: [
      new TextRun({ text: "■  ", size, font: FONT, color: C_BRAND }),
      new TextRun({ text, bold: true, size, font: HEAD_FONT, color: C_TITLE }),
    ],
  });
}

/** "SEÇİLİ GÜNLER VE AÇIKLAMALARI" (veya "… (devam)") bölüm başlığı. */
function summaryHeading(text: string): Paragraph {
  return sectionHeader(text, 22);
}

/**
 * Verilen günler için kompakt çok-sütun özet TABLOSU (renk işareti + Gregoryen tarih + haftagünü +
 *   TAM Hicrî tarih + varsa uzmanın KISA açıklaması). Bu, her günün ANA (ve TEK) özet gösterimidir —
 *   ikinci bir toplu liste üretilmez. Renk yalnız görsel; anlam uzmanın açıklamasından gelir.
 */
function daySummaryTable(days: CuppingCalendarPlanDay[], cols: number = PAGE1_SUMMARY_COLUMNS): Table {
  const colPct = Math.floor(100 / cols);
  const rows: TableRow[] = [];
  for (let i = 0; i < days.length; i += cols) {
    const rowCells: TableCell[] = [];
    for (let c = 0; c < cols; c++) rowCells.push(page1SummaryCell(days[i + c] ?? null, colPct));
    rows.push(new TableRow({ cantSplit: true, children: rowCells }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE_GRAY },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE_GRAY },
    },
    rows,
  });
}

/** Sıfır seçili gün notu (uydurma gün/açıklama üretilmez). */
function noSelectedDaysPara(): Paragraph {
  return new Paragraph({
    spacing: { before: 30, after: 0 },
    children: [new TextRun({ text: "Bu takvimde henüz seçili gün yok.", size: 16, font: FONT, color: C_LIGHT, italics: true })],
  });
}

/** OOXML: bir bölüm gövdesi TABLO ile bitmemeli — sondaki minik boş paragraf. */
function trailingPara(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "", size: 2, font: FONT })] });
}

// ═══════════════════════════════════════════════════════════════════════════
// SAYFA 2+ — SEÇİLİ GÜNLER VE AÇIKLAMALAR (A4 dikey)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DETAY NOTU olan TEK gün — premium: renkli sol aksan + SERİF tarih başlığı + Hicrî/renk meta + not.
 *   Notu OLMAYAN gün için ÜRETİLMEZ. Notun hangi güne ait olduğu başlıkta tarih tekrarlanarak AÇIKÇA
 *   gösterilir. keepNext YOK (sığmayan bloğu toplu itmesin); uzun not devam sayfasına doğal akar.
 */
function detailNoteBlock(day: CuppingCalendarPlanDay): Paragraph[] {
  const [y, m, d] = day.gregorian_date.split("-").map(Number);
  const weekday = WEEKDAYS_TR[isoWeekday(day.gregorian_date) - 1]?.long ?? "";
  const hijri = gregorianToHijri(day.gregorian_date);
  const c = wordColorFor(day.color_key);
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      keepLines: true,
      spacing: { before: 100, after: 6 },
      children: [
        new TextRun({ text: "▍ ", size: 20, font: FONT, color: c.text }),
        new TextRun({ text: `${d} ${GREGORIAN_MONTHS_TR[m - 1]} ${y}`, bold: true, size: 19, font: HEAD_FONT, color: C_DARK }),
        new TextRun({ text: weekday ? ` — ${weekday}` : "", size: 17, font: FONT, color: C_MID }),
        new TextRun({ text: hijri ? `    •    ${hijri.formatted}` : "", size: 15, font: FONT, color: C_LIGHT }),
        new TextRun({ text: `    •    Renk: ${colorNameFor(day.color_key)}`, size: 14, font: FONT, color: C_LIGHT }),
      ],
    }),
  );
  out.push(
    new Paragraph({
      keepLines: true,
      spacing: { before: 0, after: 4 },
      indent: { left: 260 },
      children: [new TextRun({ text: "Detay notu:", bold: true, size: 17, font: FONT, color: C_MID })],
    }),
  );
  for (const line of toLines((day.note ?? "").trim())) {
    out.push(
      new Paragraph({
        keepLines: true,
        spacing: { before: 0, after: 2 },
        indent: { left: 360 },
        children: [new TextRun({ text: line, size: 17, font: FONT, color: C_DARK })],
      }),
    );
  }
  out.push(ruleParagraph(46, 0));
  return out;
}

/**
 * DETAY NOTLARI bölümü — YALNIZ detay notu bulunan günler (kronolojik). Notsuz günler için satır/
 *   kart üretilmez; hiç not yoksa bölüm hiç eklenmez ([]). Kısa açıklamalar burada TEKRAR EDİLMEZ.
 */
function buildDetailNotesSection(days: CuppingCalendarPlanDay[]): Paragraph[] {
  const withNotes = days
    .filter((d) => d.note && d.note.trim())
    .sort((a, b) => a.gregorian_date.localeCompare(b.gregorian_date));
  if (withNotes.length === 0) return [];
  const out: Paragraph[] = [sectionHeader("DETAY NOTLARI", 22)];
  out.push(
    new Paragraph({
      spacing: { before: 0, after: 10 },
      children: [new TextRun({ text: "Yalnız detay notu bulunan günler listelenir.", size: 15, font: FONT, color: C_LIGHT, italics: true })],
    }),
  );
  for (const day of withNotes) out.push(...detailNoteBlock(day));
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// BİLGİLENDİRME NOTLARI (bağlı şablon; yoksa hiç render edilmez) — premium "pill" tablosu
// ═══════════════════════════════════════════════════════════════════════════

/** Öncesi/Sonrası/Genel — sol yumuşak "pill" etiket + sağ metin (ince sıcak çizgili tablo). */
function adviceTable(rows: { label: string; text: string }[]): Table {
  const line = { style: BorderStyle.SINGLE, size: 2, color: RULE_GRAY } as const;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: rows.map((r) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: C_PILL_FILL },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: r.label, bold: true, size: 17, font: HEAD_FONT, color: C_MID })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 80, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 160, right: 120 },
            children: toLines(r.text).map((l) =>
              new Paragraph({ spacing: { before: 0, after: 4 }, children: [new TextRun({ text: l, size: 18, font: FONT, color: C_DARK })] }),
            ),
          }),
        ],
      }),
    ),
  });
}

function buildAdviceSection(template: CuppingAdviceTemplate | null): (Paragraph | Table)[] {
  if (!template) return [];
  const before = (template.before_text ?? "").trim();
  const after = (template.after_text ?? "").trim();
  const general = (template.general_note ?? "").trim();
  if (!before && !after && !general) return [];

  const rows: { label: string; text: string }[] = [];
  if (before) rows.push({ label: "Öncesi", text: before });
  if (after) rows.push({ label: "Sonrası", text: after });
  if (general) rows.push({ label: "Genel", text: general });

  const out: (Paragraph | Table)[] = [sectionHeader("BİLGİLENDİRME NOTLARI", 22)];
  if (template.title?.trim()) {
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 12 },
        children: [new TextRun({ text: template.title.trim(), bold: true, size: 18, font: HEAD_FONT, color: C_DARK })],
      }),
    );
  }
  out.push(adviceTable(rows));
  out.push(trailingPara()); // tablo ile bitmesin (OOXML)
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
        children: [new TextRun({ text: "Yaşam Sistemi™", bold: true, size: 16, font: HEAD_FONT, color: C_TITLE })],
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
          // NOT: TOTAL_PAGES (NUMPAGES) alanı KULLANILMAZ. Bu alan, içerik sayfa sınırına denk gelen
          //   belgelerde Word'ün PDF/yazdırma motorunu sonsuz döngüye sokup KİLİTLİYOR (kullanıcının
          //   "PDF olarak kaydet" işlemi dahil). Yalnız geçerli sayfa numarası (X) gösterilir — güvenli.
          new TextRun({ children: [PageNumber.CURRENT], size: 13, font: FONT, color: C_LIGHT }),
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
  /**
   * Rapor KAPSAMI. Yoksa YILLIK (12 ay, A3 yatay). 1–12 arası TAM SAYI verilirse yalnız o AY
   *   (A4 dikey tek-ay takvimi). Aralık dışı/geçersiz değer YILLIK gibi ele alınır (route KATI doğrular).
   */
  month?: number | null;
};

/** Geçerli ay numarası mı? (1–12 tam sayı.) */
function isValidMonth(m: unknown): m is number {
  return typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 12;
}

/** Bir metnin tahmini SATIR sayısı (\n + sarma). Konservatif (dar sarma → çok satır). */
function estLines(text: string): number {
  return toLines(text).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / EST.CHARS_PER_LINE)), 0);
}

/** Detay notları bölümünün tahmini yüksekliği (twips). Notsuz → 0. */
function estimateNotesTwips(sorted: CuppingCalendarPlanDay[]): number {
  const withNotes = sorted.filter((d) => d.note && d.note.trim());
  if (withNotes.length === 0) return 0;
  let h = EST.NOTES_HEAD;
  for (const d of withNotes) h += EST.NOTE_HDR + EST.NOTE_LABEL + estLines((d.note ?? "").trim()) * EST.NOTE_LINE + EST.NOTE_RULE;
  return h;
}

/** Bilgilendirme bölümünün tahmini yüksekliği (twips). Yok/boş → 0. */
function estimateAdviceTwips(template: CuppingAdviceTemplate | null): number {
  if (!template) return 0;
  const b = (template.before_text ?? "").trim();
  const a = (template.after_text ?? "").trim();
  const g = (template.general_note ?? "").trim();
  if (!b && !a && !g) return 0;
  let h = EST.ADV_HEAD + (template.title?.trim() ? EST.ADV_TITLE : 0);
  if (b) h += EST.ADV_SUB + estLines(b) * EST.ADV_LINE;
  if (a) h += EST.ADV_SUB + estLines(a) * EST.ADV_LINE;
  if (g) h += EST.ADV_SUB + estLines(g) * EST.ADV_LINE;
  return h;
}

/** Özet tablosunun (n gün) tahmini yüksekliği — başlık HARİÇ (yalnız satırlar). */
function estimateSummaryRowsTwips(n: number): number {
  return Math.ceil(n / PAGE1_SUMMARY_COLUMNS) * EST.SUM_ROW;
}

/** AYLIK rapor: o ayda seçili gün yoksa nötr, doğru durum metni (uydurma gün/öneri YOK). */
function monthEmptyPara(): Paragraph {
  return new Paragraph({
    spacing: { before: 30, after: 0 },
    children: [new TextRun({ text: "Bu ay için seçili gün bulunmuyor.", size: 16, font: FONT, color: C_LIGHT, italics: true })],
  });
}

/**
 * AYLIK RAPOR (A4 dikey, tek ay). YALNIZ verilen yıl+ayın kayıtlarını içerir; başka ay sızmaz.
 *   Tek A4 bölüm — içerik doğal olarak sayfalanır (az içerik tek A4; uzun içerik ek A4 sayfaları).
 *   Yıllık 12-ay ızgarası KÜÇÜLTÜLÜP tek ay gibi gösterilmez; gerçek bağımsız tek-ay takvimi.
 */
async function buildMonthlyBuffer(args: {
  plan: CuppingCalendarPlan;
  sorted: CuppingCalendarPlanDay[];
  template: CuppingAdviceTemplate | null;
  month: number;
}): Promise<Buffer> {
  const { plan, sorted, template, month } = args;
  const prefix = `${plan.year}-${String(month).padStart(2, "0")}-`;
  // YALNIZ istenen yıl+ay (kanonik YYYY-MM-DD önek eşleşmesi; saat dilimi dönüşümü YOK → kayma yok).
  const monthDays = sorted.filter((d) => d.gregorian_date.startsWith(prefix));
  const selected = new Map<string, CuppingCalendarPlanDay>();
  for (const d of monthDays) selected.set(d.gregorian_date, d);

  const planLabel = `${plan.name} · ${GREGORIAN_MONTHS_TR[month - 1]} ${plan.year}`;
  const children: (Paragraph | Table)[] = [
    ...monthTitleBlock(plan, month),
    monthCalendarTable(plan.year, month, selected),
    summaryHeading("SEÇİLİ GÜNLER VE AÇIKLAMALARI"),
    ...(monthDays.length ? [daySummaryTable(monthDays, 2)] : [monthEmptyPara()]),
    ...buildDetailNotesSection(monthDays),
    ...buildAdviceSection(template),
    trailingPara(),
  ];

  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: `Hacamat Takvimi ${GREGORIAN_MONTHS_TR[month - 1]} ${plan.year}`,
    description: plan.name,
    sections: [
      {
        properties: { page: { size: A4_PORTRAIT, margin: { top: 700, bottom: 900, left: 800, right: 800, header: 320, footer: 320 } } },
        footers: { default: buildFooter(planLabel) },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/**
 * Kaydedilmiş takvim verisinden gerçek, düzenlenebilir DOCX buffer'ı üretir.
 * SAF: DB/auth/network yok. Çağıran (server route) veriyi tenant-güvenli toplar.
 *
 * SAYFALAMA: Tüm içerik (ızgara + özet + detay notları + bilgilendirme) A3'e KONSERVATİF tahminle
 *   sığıyorsa TEK A3 yatay sayfa (2. sayfa yok). Sığmıyorsa: A3 (ızgara + sığan özet + devam notu) +
 *   A4 dikey devam (kalan özet + detay notları + bilgilendirme). Hiçbir gün/not KAYBOLMAZ; aynı
 *   bilgi TEKRAR EDİLMEZ; kronolojik sıra korunur.
 */
export async function buildCalendarPlanWordBuffer(input: BuildCalendarWordInput): Promise<Buffer> {
  const { plan, days, template = null, month = null } = input;

  const selected = new Map<string, CuppingCalendarPlanDay>();
  for (const d of days) selected.set(d.gregorian_date, d);
  const sorted = [...days].sort((a, b) => a.gregorian_date.localeCompare(b.gregorian_date));

  const planLabel = `${plan.name} · ${plan.year}`;

  // ── AYLIK RAPOR (A4 dikey, tek ay) — month 1–12 verildiğinde ─────────────────
  if (isValidMonth(month)) {
    return buildMonthlyBuffer({ plan, sorted, template, month });
  }

  const grid = buildAnnualGrid(plan.year, selected);
  const notesSection = buildDetailNotesSection(sorted);
  const adviceSection = buildAdviceSection(template);

  // Konservatif toplam yükseklik tahmini (twips).
  const gridTitle = EST.TITLE + EST.GRID;
  const summaryH = EST.SUM_HEAD + (sorted.length ? estimateSummaryRowsTwips(sorted.length) : 200);
  const notesH = estimateNotesTwips(sorted);
  const adviceH = estimateAdviceTwips(template);
  const totalH = gridTitle + summaryH + notesH + adviceH;

  // A3 kenar boşlukları sıkılaştırıldı — ilk sayfada dikey alanı geri kazanır (owner: alt boşluk).
  const A3_MARGIN = { top: 400, bottom: 700, left: 480, right: 480, header: 200, footer: 260 };
  const A4_MARGIN = { top: 900, bottom: 1120, left: 1000, right: 1000, header: 360, footer: 360 };

  const docMeta = { creator: "Yaşam Sistemi", title: `Hacamat Takvimi ${plan.year}`, description: plan.name };

  // ── SENARYO A/C — HER ŞEY TEK A3 SAYFADA (2. sayfa yok) ──────────────────────
  if (totalH <= A3_CONTENT_BUDGET) {
    const children: (Paragraph | Table)[] = [
      ...titleBlock(plan),
      grid,
      summaryHeading("SEÇİLİ GÜNLER VE AÇIKLAMALARI"),
      ...(sorted.length ? [daySummaryTable(sorted)] : [noSelectedDaysPara()]),
      ...notesSection,
      ...adviceSection,
      trailingPara(),
    ];
    const doc = new Document({
      ...docMeta,
      sections: [
        {
          properties: { page: { size: A3_LANDSCAPE, margin: A3_MARGIN } },
          footers: { default: buildFooter(planLabel) },
          children,
        },
      ],
    });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  // ── SENARYO B — TAŞMA: A3 (ızgara + sığan özet) + A4 devam ───────────────────
  // A3'te ızgara sonrası özete kalan bütçeden kaç gün sığdığını hesapla (üst sınır + kronolojik).
  const remainingForSummary = A3_CONTENT_BUDGET - gridTitle - EST.SUM_HEAD - EST.CONT_NOTE;
  const rowsFit = Math.max(1, Math.floor(remainingForSummary / EST.SUM_ROW));
  const nA3 = Math.min(rowsFit * PAGE1_SUMMARY_COLUMNS, PAGE1_SUMMARY_CAPACITY_MAX, sorted.length);
  const daysA3 = sorted.slice(0, nA3);
  const daysA4 = sorted.slice(nA3);

  // Devam notu — YALNIZ gerçekten A4'e taşan içeriği (kalan gün / detay notları / bilgilendirme) anar.
  const contParts: string[] = [];
  if (daysA4.length > 0) contParts.push(`${daysA4.length} gün daha`);
  if (notesSection.length > 0) contParts.push("detay notları");
  if (adviceSection.length > 0) contParts.push("bilgilendirme");
  const contText =
    daysA4.length > 0
      ? `İlk sayfada ${daysA3.length} gün gösteriliyor · ${contParts.join(" + ")} sonraki sayfalardadır.`
      : `${contParts.join(" + ")} sonraki sayfalardadır.`;

  const sec1Children: (Paragraph | Table)[] = [
    ...titleBlock(plan),
    grid,
    summaryHeading("SEÇİLİ GÜNLER VE AÇIKLAMALARI"),
    daySummaryTable(daysA3),
    new Paragraph({
      spacing: { before: 70, after: 0 },
      children: [new TextRun({ text: contText, size: 15, font: FONT, color: C_MID, italics: true })],
    }),
  ];

  const sec2Children: (Paragraph | Table)[] = [];
  if (daysA4.length > 0) {
    sec2Children.push(summaryHeading("SEÇİLİ GÜNLER VE AÇIKLAMALARI (devam)"), daySummaryTable(daysA4));
  }
  sec2Children.push(...notesSection, ...adviceSection, trailingPara());

  const doc = new Document({
    ...docMeta,
    sections: [
      { properties: { page: { size: A3_LANDSCAPE, margin: A3_MARGIN } }, footers: { default: buildFooter(planLabel) }, children: sec1Children },
      { properties: { page: { size: A4_PORTRAIT, margin: A4_MARGIN } }, footers: { default: buildFooter(planLabel) }, children: sec2Children },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/** Gregoryen ay adlarının ASCII-güvenli slug'ları (dosya adı için; Türkçe karakter sorununa dayanıklı). */
const GREGORIAN_MONTHS_ASCII = [
  "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
  "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik",
] as const;

/**
 * İndirme için güvenli/anlaşılır dosya adı.
 *   Yıllık: "Hacamat-Takvimi-<yıl>-Yillik.docx"
 *   Aylık:  "Hacamat-Takvimi-<yıl>-<Ay>.docx" (ör. "Hacamat-Takvimi-2026-Ocak.docx")
 * Türkçe karakterler güvenli normalize edilir (ASCII); month geçerli 1–12 değilse YILLIK.
 */
export function calendarWordFilename(plan: Pick<CuppingCalendarPlan, "year">, month?: number | null): string {
  const scope = isValidMonth(month) ? GREGORIAN_MONTHS_ASCII[month - 1] : "Yillik";
  return `Hacamat-Takvimi-${plan.year}-${scope}.docx`;
}
