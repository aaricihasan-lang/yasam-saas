/**
 * NKB-V4 — Premium Numeroloji Word raporu (server-only; route + kabul testi ortak).
 *
 * Masaüstü raporunun DOĞRU bilgi yerleşimi referans alınır (PIN piramidi, Çakra Omurgası sol/merkez/sağ,
 * Element X kartları, değer/yorum ayrı kartlar), Yaşam Sistemi mor-lila premium kimliğiyle. Her bilgiyi
 * tabloya çevirme yaklaşımı KALDIRILDI; tablo yalnız gerçek karşılaştırma (Harfler) için. İçerik/metin
 * DEĞİŞTİRİLMEZ (özet/kesme/AI yok); yalnız sunum. Sekmeler: Sonuç Özeti · Hesap Özetsiz · Hesap Özetli ·
 * Taş Açıklamaları. (Görsel Rapor Word'den kaldırıldı; ayrı PNG indirme akışı ayrıdır.)
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
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
import { calcDegisimByYearOnly, calcDegisimByFullDate, parseBirthDate } from "@/lib/numeroloji";
import {
  WORD_TAB_LABELS,
  WORD_TAB_ORDER,
  personSourceNotesForRecords,
  type MatchedNoteRef,
  type PersonSourceNoteGroup,
  type WordPersonSections,
  type WordTabKey,
} from "./wordPersonSections";
import { buildKnowledgeLookupPlan, pickNotesForType, type KnowledgeNote } from "./knowledgeLookup";
import { noteHeading, resolveNoteSectionsForView } from "./noteLogic";
import type { SourceEntryRow } from "./sourceEntryUiLogic";
import type { KnowledgeRecordRow } from "./bilgiBankaKayit";
import { matchStock, stockLabel, STOCK_HINT_WORD, type StockIndex } from "./stoneStockLogic";
import { extractMotorFromAnalysisJson, extractSummaryFromAnalysisData } from "../../utils/analysisJson";

type Block = Paragraph | Table;

// ── Tema ─────────────────────────────────────────────────────────────────────
const FONT = "Arial";
const MOR = "5B21B6";
const INDIGO = "3730A3";
const LILA = "F5F3FF";
const GRAY = "F8FAFC";
const BODY = "334155";
const SECONDARY = "64748B";
const WHITE = "FFFFFF";
const GREEN_BG = "ECFDF5";
const GREEN_TXT = "047857";
const AMBER_BG = "FFFBEB";
const RED_BG = "FEF2F2";

const S_BODY = 21; // ~10.5pt
const S_H1 = 44;
const S_H2 = 24;
const S_H3 = 20;
const S_SMALL = 18;
const S_BIG = 34;

const ANALIZ_LABELS: Record<string, string> = {
  "ana-kulvar": "Ana Kulvar", "yan-kulvar": "Yan Kulvar", "ifade-sayisi": "İfade Sayısı",
  "hayat-yolu": "Hayat Yolu", "cakra-omurga": "Çakra Omurga", element: "Element", diger: "Diğer",
};
const analizLabel = (k: string): string => ANALIZ_LABELS[k] ?? k;

// ── Küçük yardımcılar ──────────────────────────────────────────────────────────
function tr(text: string, o: { bold?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({ text, font: FONT, size: o.size ?? S_BODY, bold: o.bold, color: o.color ?? BODY });
}
function p(text: string, o: { size?: number; color?: string; bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; justify?: boolean; before?: number; after?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: o.justify ? AlignmentType.JUSTIFIED : o.align,
    spacing: { before: o.before ?? 0, after: o.after ?? 100, line: 264 },
    children: [tr(text, o)],
  });
}
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
const LIGHT_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } as const;
const TABLE_BORDERS = { top: LIGHT_BORDER, bottom: LIGHT_BORDER, left: LIGHT_BORDER, right: LIGHT_BORDER, insideHorizontal: LIGHT_BORDER, insideVertical: LIGHT_BORDER };

function noSpread(nr: unknown): string {
  if (!nr || typeof nr !== "object") return "—";
  const d = (nr as { display?: unknown }).display;
  return typeof d === "string" && d.trim() ? d.trim() : "—";
}
function xRepeat(n: number): string {
  return n > 0 ? "X".repeat(Math.min(n, 12)) : "—";
}

/** Mor sol-vurgulu bölüm başlığı (açık lila zeminli kart). keepNext ile içerikten kopmaz. */
function sectionHeading(text: string, pageBreakBefore = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore,
    keepNext: true,
    spacing: { before: pageBreakBefore ? 0 : 240, after: 130 },
    shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 30, color: MOR, space: 8 } },
    children: [new TextRun({ text: `  ${text}`, font: FONT, size: S_H2, bold: true, color: INDIGO })],
  });
}
function subHeading(text: string, pageBreakBefore = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3, keepNext: true, pageBreakBefore, spacing: { before: pageBreakBefore ? 0 : 150, after: 70 },
    children: [new TextRun({ text, font: FONT, size: S_H3, bold: true, color: MOR })],
  });
}

// ── Kapak ──────────────────────────────────────────────────────────────────────
function personInfoCard(adSoyad: string, birth: string, analiz: string, created: string): Table {
  const rowsData: [string, string][] = [
    ["Danışan", adSoyad || "—"], ["Doğum Tarihi", birth || "—"], ["Analiz Tarihi", analiz || "—"], ["Rapor Tarihi", created || "—"],
  ];
  return new Table({
    width: { size: 82, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: NO_BORDERS,
    rows: rowsData.map(([k, v], i) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, margins: { top: 60, bottom: 60, left: 140, right: 100 }, width: { size: 38, type: WidthType.PERCENTAGE }, children: [new Paragraph({ spacing: { after: 0 }, children: [tr(k, { bold: true, color: INDIGO, size: S_SMALL })] })] }),
        new TableCell({ shading: { type: ShadingType.CLEAR, fill: i % 2 ? GRAY : WHITE, color: "auto" }, margins: { top: 60, bottom: 60, left: 140, right: 100 }, width: { size: 62, type: WidthType.PERCENTAGE }, children: [new Paragraph({ spacing: { after: 0 }, children: [tr(v, { bold: true, color: BODY })] })] }),
      ],
    })),
  });
}

function coverPage(reportType: string, selectedLabels: string[], adSoyad: string, birth: string, analiz: string, created: string, pageBreakBefore: boolean): Block[] {
  const out: Block[] = [];
  // Üst mor bant
  out.push(new Paragraph({ pageBreakBefore, spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, alignment: AlignmentType.CENTER, children: [tr("YAŞAM SİSTEMİ", { bold: true, color: WHITE, size: S_H3 })] }));
  out.push(new Paragraph({ spacing: { before: 40, after: 500 }, alignment: AlignmentType.CENTER, children: [tr("Bütüncül Yaşam Analizi Platformu", { color: SECONDARY, size: S_SMALL })] }));
  out.push(new Paragraph({ spacing: { before: 800, after: 120 }, alignment: AlignmentType.CENTER, children: [tr("NUMEROLOJİ ANALİZ RAPORU", { bold: true, color: INDIGO, size: S_H1 })] }));
  // İnce lila ayraç
  out.push(new Paragraph({ spacing: { after: 240 }, alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: MOR } }, children: [] }));
  out.push(new Paragraph({ spacing: { after: 500 }, alignment: AlignmentType.CENTER, children: [tr(reportType, { bold: true, color: MOR, size: S_H2 })] }));
  if (selectedLabels.length > 1) {
    for (const l of selectedLabels) out.push(new Paragraph({ spacing: { after: 20 }, alignment: AlignmentType.CENTER, children: [tr(`•  ${l}`, { color: SECONDARY, size: S_SMALL })] }));
    out.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
  }
  out.push(personInfoCard(adSoyad, birth, analiz, created));
  out.push(new Paragraph({ spacing: { before: 900, after: 20 }, alignment: AlignmentType.CENTER, children: [tr("Yaşam Sistemi", { bold: true, color: MOR, size: S_SMALL })] }));
  out.push(new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [tr("Bütünsel farkındalık, kişisel dönüşüm", { color: SECONDARY, size: 16 })] }));
  return out;
}

// ── Değer kartları (tablo değil; borderless kart satırı) ─────────────────────
function valueCards(items: { label: string; value: string }[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({
      cantSplit: true,
      children: items.map((it) => new TableCell({
        verticalAlign: VerticalAlign.CENTER,
        shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" },
        margins: { top: 120, bottom: 120, left: 60, right: 60 },
        width: { size: Math.floor(100 / items.length), type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [tr(it.label.toLocaleUpperCase("tr-TR"), { bold: true, color: SECONDARY, size: 15 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(it.value, { bold: true, color: INDIGO, size: S_BIG })] }),
        ],
      })),
    })],
  });
}

// ── PIN piramidi (4 sıra ortalı; her sayı lila çerçeveli kutu) ────────────────
function pinBox(v: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" },
    borders: { top: { style: BorderStyle.SINGLE, size: 8, color: MOR }, bottom: { style: BorderStyle.SINGLE, size: 8, color: MOR }, left: { style: BorderStyle.SINGLE, size: 8, color: MOR }, right: { style: BorderStyle.SINGLE, size: 8, color: MOR } },
    width: { size: 620, type: WidthType.DXA },
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(v, { bold: true, color: INDIGO, size: S_H2 })] })],
  });
}
function pinRowTable(vals: string[]): Table {
  return new Table({ alignment: AlignmentType.CENTER, borders: NO_BORDERS, columnWidths: vals.map(() => 620), rows: [new TableRow({ cantSplit: true, children: vals.map(pinBox) })] });
}
function pinPyramid(pin: unknown): Block[] {
  const g = (k: string) => { const v = (pin as Record<string, unknown> | null)?.[k]; return v == null ? "—" : String(v); };
  return [
    pinRowTable([g("k1"), g("k2"), g("k3"), g("k4")]),
    new Paragraph({ spacing: { after: 40 }, children: [] }),
    pinRowTable([g("k5"), g("k6"), g("k7")]),
    new Paragraph({ spacing: { after: 40 }, children: [] }),
    pinRowTable([g("k8")]),
    new Paragraph({ spacing: { after: 40 }, children: [] }),
    pinRowTable([g("k9")]),
  ];
}

// ── Çakra Omurgası (sol destek / merkez çakra / sağ destek) ───────────────────
function chakraSpine(motor: NonNullable<Motor>): Block[] {
  const c = motor.cakraOmurgasi as { harfler?: Record<number, number>; sayilar?: Record<number, number> };
  const out: Block[] = [];
  out.push(p("Sol sütun sayı desteğini, sağ sütun isim/harf desteğini gösterir.", { color: SECONDARY, size: S_SMALL, after: 80 }));
  const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: [
    new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, margins: { top: 30, bottom: 30, left: 90, right: 90 }, children: [new Paragraph({ alignment: AlignmentType.END, spacing: { after: 0 }, children: [tr("Sol Destek", { bold: true, color: INDIGO, size: S_SMALL })] })] }),
    new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, margins: { top: 30, bottom: 30 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr("Çakra", { bold: true, color: INDIGO, size: S_SMALL })] })] }),
    new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, margins: { top: 30, bottom: 30, left: 90, right: 90 }, children: [new Paragraph({ spacing: { after: 0 }, children: [tr("Sağ Destek", { bold: true, color: INDIGO, size: S_SMALL })] })] }),
  ] });
  const rows = [headerRow];
  for (let n = 10; n >= 1; n -= 1) {
    const sol = c?.sayilar?.[n] ?? 0;
    const sag = c?.harfler?.[n] ?? 0;
    rows.push(new TableRow({ cantSplit: true, children: [
      new TableCell({ verticalAlign: VerticalAlign.CENTER, margins: { top: 20, bottom: 20, left: 90, right: 90 }, children: [new Paragraph({ alignment: AlignmentType.END, spacing: { after: 0 }, children: [tr(xRepeat(sol), { bold: true, color: MOR })] })] }),
      new TableCell({ verticalAlign: VerticalAlign.CENTER, shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, margins: { top: 20, bottom: 20 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(String(n), { bold: true, color: INDIGO, size: S_H3 })] })] }),
      new TableCell({ verticalAlign: VerticalAlign.CENTER, margins: { top: 20, bottom: 20, left: 90, right: 90 }, children: [new Paragraph({ spacing: { after: 0 }, children: [tr(xRepeat(sag), { bold: true, color: MOR })] })] }),
    ] }));
  }
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: LIGHT_BORDER, bottom: LIGHT_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "EDE9FE" }, insideVertical: NO_BORDER }, rows }));
  return out;
}

// ── Elementler (4 kart + baskın vurgu + PIN dağılımı) ────────────────────────
const DIGIT_ELEMENT: Record<number, string> = { 1: "Hava", 5: "Hava", 2: "Su", 7: "Su", 3: "Ateş", 6: "Ateş", 4: "Toprak", 8: "Toprak", 9: "Nötr" };
function elementCards(motor: NonNullable<Motor>): Block[] {
  const el = motor.elementler as { counts?: Record<string, number>; neutralCount?: number; key?: string };
  const order = ["Hava", "Su", "Ateş", "Toprak"];
  const dominant = (el?.key || "").trim();
  const out: Block[] = [];
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
    rows: [new TableRow({ cantSplit: true, children: order.map((e) => {
      const cnt = el?.counts?.[e] ?? 0;
      return new TableCell({ verticalAlign: VerticalAlign.CENTER, shading: { type: ShadingType.CLEAR, fill: dominant === e ? LILA : GRAY, color: "auto" }, margins: { top: 110, bottom: 110, left: 40, right: 40 }, width: { size: 25, type: WidthType.PERCENTAGE }, children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [tr(e.toLocaleUpperCase("tr-TR"), { bold: true, color: dominant === e ? MOR : SECONDARY, size: 16 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [tr(xRepeat(cnt), { bold: true, color: MOR })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(String(cnt), { bold: true, color: INDIGO, size: S_H2 })] }),
      ] });
    }) })],
  }));
  if (dominant) {
    out.push(new Paragraph({ spacing: { before: 120, after: 20 }, alignment: AlignmentType.CENTER, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, children: [tr(`  BASKIN ELEMENT: ${dominant.toLocaleUpperCase("tr-TR")}  `, { bold: true, color: WHITE, size: S_H3 })] }));
  }
  if (typeof el?.neutralCount === "number" && el.neutralCount > 0) out.push(p(`Nötr: ${el.neutralCount}`, { color: SECONDARY, size: S_SMALL, after: 40 }));
  // PIN → element dağılımı (kompakt)
  const pin = motor.pinKodu as Record<string, unknown> | null;
  if (pin) {
    const parts: string[] = [];
    for (const k of ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"]) {
      const d = Number(pin[k]);
      if (Number.isFinite(d) && DIGIT_ELEMENT[d]) parts.push(`${d} → ${DIGIT_ELEMENT[d]}`);
    }
    if (parts.length) out.push(p(parts.join("   ·   "), { color: SECONDARY, size: S_SMALL }));
  }
  return out;
}

// ── Zaman/liste bölümleri ────────────────────────────────────────────────────
function dataTable(headers: string[], rows: string[][], widths?: number[]): Table {
  const header = new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: INDIGO, color: "auto" }, margins: { top: 40, bottom: 40, left: 90, right: 90 }, width: widths ? { size: widths[i]!, type: WidthType.PERCENTAGE } : undefined, children: [new Paragraph({ spacing: { after: 0 }, children: [tr(h, { bold: true, color: WHITE, size: S_SMALL })] })] })) });
  const body = rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((cv, i) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: ri % 2 ? GRAY : WHITE, color: "auto" }, margins: { top: 40, bottom: 40, left: 90, right: 90 }, width: widths ? { size: widths[i]!, type: WidthType.PERCENTAGE } : undefined, children: [new Paragraph({ spacing: { after: 0 }, children: [tr(cv)] })] })) }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows: [header, ...body] });
}

function timelineCard(title: string, lines: string[]): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: GRAY, color: "auto" }, borders: { left: { style: BorderStyle.SINGLE, size: 20, color: MOR }, top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER }, margins: { top: 60, bottom: 60, left: 140, right: 100 }, children: [
    new Paragraph({ spacing: { after: 20 }, children: [tr(title, { bold: true, color: INDIGO, size: S_SMALL })] }),
    ...lines.map((l) => new Paragraph({ spacing: { after: 0 }, children: [tr(l)] })),
  ] })] })] });
}

function degisimBlocks(birthDate: string): Block[] {
  const parts = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!parts) return [];
  const { day, month, year } = parts;
  const out: Block[] = [];
  const y = calcDegisimByYearOnly(year, month, 5);
  if (y.length) { out.push(subHeading("Doğum yılına göre")); for (const r of y) out.push(timelineCard(`${r.index}. Değişim`, [`Yıl: ${r.changeYear}`, `Çakra: ${r.chakra}. çakra`, `Etki Dönemi: ${r.effectStartYear}–${r.effectEndYear}`])); }
  const f = calcDegisimByFullDate(day, month, year, 5);
  if (f.length) {
    out.push(subHeading("Gün ve ay dâhil"));
    for (const r of f) { const md = String(r.effectMonth).padStart(2, "0"); const dd = String(r.effectDay).padStart(2, "0"); out.push(timelineCard(`${r.index}. Değişim`, [`Yıl: ${r.changeYear}`, `Çakra: ${r.chakra}. çakra`, `Etki: ${r.effectStartYear}.${md}.${dd} – ${r.effectEndYear}.${md}.${dd}`])); }
  }
  return out;
}
function zirveCards(motor: NonNullable<Motor>): Block[] {
  const peaks = (motor.zirveYillari as { peaks?: { index: number; age: number; topic: string }[] } | null)?.peaks;
  if (!peaks?.length) return [];
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ cantSplit: true, children: peaks.map((pk) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, margins: { top: 90, bottom: 90, left: 40, right: 40 }, verticalAlign: VerticalAlign.CENTER, children: [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [tr(`${pk.index}. Zirve`, { bold: true, color: MOR, size: S_SMALL })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 10 }, children: [tr(`${pk.age} yaş`, { bold: true, color: INDIGO, size: S_H3 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(String(pk.topic), { color: BODY, size: S_SMALL })] }),
  ] })) })] })];
}
function mucadeleBlocks(motor: NonNullable<Motor>): Block[] {
  const m = motor.mucadeleYillari as { method1?: { index: number; age: number; topic: string }[]; method2?: { index: number; age: number; topic: string }[] } | null;
  if (!m) return [];
  const out: Block[] = [];
  const blk = (title: string, items: { index: number; age: number; topic: string }[]) => {
    out.push(subHeading(title));
    out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ cantSplit: true, children: items.map((it) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: GRAY, color: "auto" }, margins: { top: 80, bottom: 80, left: 40, right: 40 }, children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 16 }, children: [tr(`${it.index}. Mücadele`, { bold: true, color: MOR, size: S_SMALL })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 10 }, children: [tr(`${it.age} yaş`, { bold: true, color: INDIGO, size: S_H3 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(String(it.topic), { color: BODY, size: S_SMALL })] }),
    ] })) })] }));
  };
  if (m.method1?.length) blk("1. yöntem (36 yıl arayla)", m.method1);
  if (m.method2?.length) blk("2. yöntem (9 yıl arayla)", m.method2);
  return out;
}
function harflerTable(motor: NonNullable<Motor>): Block | null {
  const hy = motor.harflerinYankilanisi as { letter: string; chakra: number; ageStart: number; ageEnd: number; yearStart?: number; yearEnd?: number }[] | undefined;
  if (!Array.isArray(hy) || !hy.length) return null;
  return dataTable(["Sıra", "Harf", "Çakra", "Yaş Aralığı", "Yıl Aralığı"], hy.map((s, i) => [String(i + 1), s.letter, `${s.chakra}. çakra`, `${s.ageStart}–${s.ageEnd}`, s.yearStart != null && s.yearEnd != null ? `${s.yearStart}–${s.yearEnd}` : "—"]), [12, 14, 20, 27, 27]);
}

// ── Yorum kartları (potansiyel bölümleri pastel) ─────────────────────────────
function potentialBlock(label: string, body: string, fill: string): Paragraph {
  return new Paragraph({ spacing: { before: 40, after: 60, line: 264 }, shading: { type: ShadingType.CLEAR, fill, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 14, color: MOR, space: 6 } }, children: [tr(`${label}: `, { bold: true, color: INDIGO, size: S_SMALL }), tr(body, {})] });
}
const POT_FILL: Record<string, string> = { "Yapıcı Potansiyeller": GREEN_BG, "Olumsuz Potansiyeller": AMBER_BG, "Yıkıcı Potansiyeller": RED_BG };

function commentCards(matchedNotes: KnowledgeNote[], shared: WordSharedData): Block[] {
  const groups: PersonSourceNoteGroup[] = personSourceNotesForRecords(matchedNotes.map((n) => ({ id: n.id, analysisType: n.analysisType, value: n.value } as MatchedNoteRef)), shared.entries, shared.sourceLabelById);
  const groupById = new Map(groups.map((g) => [g.ref.id, g]));
  const out: Block[] = [];
  for (const note of matchedNotes) {
    const secs = resolveNoteSectionsForView(note).map((s) => ({ label: s.label, body: (s.body || "").trim() })).filter((s) => s.body !== "");
    const grp = groupById.get(note.id);
    if (secs.length === 0 && (!grp || grp.notes.length === 0)) continue;
    out.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 60 }, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, children: [tr(`  ${noteHeading(note.analysisType, note.value)}`, { bold: true, color: WHITE, size: S_H3 })] }));
    for (const s of secs) {
      if (!s.label || s.label === "Genel Açıklama") out.push(p(s.body, { justify: true }));
      else if (POT_FILL[s.label]) out.push(potentialBlock(s.label, s.body, POT_FILL[s.label]!));
      else { out.push(new Paragraph({ keepNext: true, spacing: { before: 40, after: 20 }, children: [tr(s.label, { bold: true, color: INDIGO, size: S_SMALL })] })); out.push(p(s.body, { justify: true })); }
    }
    if (grp) for (const nt of grp.notes) out.push(new Paragraph({ spacing: { before: 40, after: 60, line: 264 }, shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 16, color: MOR, space: 6 } }, children: [tr(`Kaynak Notu${nt.label ? ` — ${nt.label}` : ""}: `, { bold: true, color: INDIGO, size: S_SMALL }), tr(nt.body.trim(), {})] }));
  }
  return out;
}

// ── Public tipler ────────────────────────────────────────────────────────────
export type WordRecordRow = { id: string; name: string; surname: string; birth_date: string; analysis_data: unknown; created_at: string };
export type WordStoneRow = { id: string; analysis_type: string; value: string; reason: string | null; stones: unknown };
export type WordSharedData = { knowledgeRows: KnowledgeRecordRow[]; entries: SourceEntryRow[]; sourceLabelById: Map<string, string>; stoneRows: WordStoneRow[] };
type Motor = ReturnType<typeof extractMotorFromAnalysisJson>;

function parseStones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

// ── Taş kartları ─────────────────────────────────────────────────────────────
function stoneColumns(stones: string[], stockIndex: StockIndex, cols = 3): Table {
  const rows: TableRow[] = [];
  const cw = Math.floor(100 / cols);
  for (let i = 0; i < stones.length; i += cols) {
    const slice = stones.slice(i, i + cols);
    while (slice.length < cols) slice.push("");
    rows.push(new TableRow({ cantSplit: true, children: slice.map((s) => {
      if (!s) return new TableCell({ margins: { top: 20, bottom: 20, left: 60, right: 60 }, width: { size: cw, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: [new Paragraph({ spacing: { after: 0 }, children: [] })] });
      const info = matchStock(s, stockIndex);
      // Stoktaki taş: açık yeşil hücre + ✓ + "Stokta[· N adet]". Yoksa nötr madde işareti.
      const runs = info.stocked
        ? [tr("✓ ", { bold: true, color: GREEN_TXT }), tr(s, { bold: true }), tr(`  — ${stockLabel(info)}`, { bold: true, color: GREEN_TXT, size: S_SMALL })]
        : [tr(`•  ${s}`, {})];
      return new TableCell({
        shading: info.stocked ? { type: ShadingType.CLEAR, fill: GREEN_BG, color: "auto" } : undefined,
        borders: info.stocked ? { top: { style: BorderStyle.SINGLE, size: 2, color: "A7F3D0" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "A7F3D0" }, left: { style: BorderStyle.SINGLE, size: 2, color: "A7F3D0" }, right: { style: BorderStyle.SINGLE, size: 2, color: "A7F3D0" } } : NO_BORDERS,
        margins: { top: 20, bottom: 20, left: 60, right: 60 }, width: { size: cw, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ spacing: { after: 0 }, children: runs })],
      });
    }) }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows });
}
function stoneStatusLabel(value: string): string | null {
  const v = value.toLocaleUpperCase("tr-TR");
  if (v.includes("FAZLA")) return "FAZLA DESTEK";
  if (v.includes("AZ")) return "AZ DESTEK";
  return null;
}
function tasBlocks(motor: Motor, shared: WordSharedData, stockIndex: StockIndex): Block[] {
  const out: Block[] = [];
  if (!motor) return out;
  out.push(p(STOCK_HINT_WORD, { color: SECONDARY, size: S_SMALL, after: 100 }));
  const seen = new Set<string>();
  let any = false;
  for (const plan of buildKnowledgeLookupPlan(motor)) {
    for (const value of plan.values) {
      const st = shared.stoneRows.find((s) => s.analysis_type === plan.analysisType && s.value === value);
      if (!st) continue;
      const key = `${st.analysis_type}::${st.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stones = parseStones(st.stones);
      if (!st.reason?.trim() && stones.length === 0) continue;
      any = true;
      const badge = stoneStatusLabel(st.value);
      const titleRuns: TextRun[] = [tr(`  ${analizLabel(st.analysis_type)} — ${st.value}`, { bold: true, color: WHITE, size: S_H3 })];
      if (badge) titleRuns.push(tr(`    [ ${badge} ]`, { bold: true, color: LILA, size: S_SMALL }));
      // Kart başlığı + ilk açıklama paragrafı aynı sayfada (keepNext); tek satır/başlık artık kalmaz.
      out.push(new Paragraph({ keepNext: true, spacing: { before: 150, after: 60 }, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, children: titleRuns }));
      if (st.reason?.trim()) out.push(new Paragraph({ keepNext: stones.length > 0, spacing: { after: 100, line: 264 }, alignment: AlignmentType.JUSTIFIED, children: [tr(st.reason.trim())] }));
      if (stones.length > 0) {
        out.push(new Paragraph({ keepNext: true, spacing: { before: 40, after: 30 }, children: [tr("Önerilen Taşlar", { bold: true, color: INDIGO, size: S_SMALL })] }));
        out.push(stoneColumns(stones, stockIndex, stones.length >= 6 ? 3 : 2));
      }
    }
  }
  return any ? out : [];
}

// ── Kişi bölümleri ───────────────────────────────────────────────────────────
export function buildPersonSections(
  row: WordRecordRow,
  sections: WordPersonSections,
  shared: WordSharedData,
  reportType: string,
  selectedLabels: string[],
  personIndex: number,
  stockIndex: StockIndex,
): { children: Block[]; emptyTabs: WordTabKey[] } {
  const children: Block[] = [];
  const emptyTabs: WordTabKey[] = [];
  const motor = extractMotorFromAnalysisJson(row.analysis_data);
  const summary = extractSummaryFromAnalysisData(row.analysis_data);
  const adSoyad = `${row.name} ${row.surname}`.trim() || "—";
  const analiz = new Date(row.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  const created = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  // Kapak (kişi başına bir kez)
  children.push(...coverPage(reportType, selectedLabels, adSoyad, row.birth_date, analiz, created, personIndex > 0));

  const matched: KnowledgeNote[] = [];
  if (motor && (sections.summary || sections.detailed)) {
    const seen = new Set<string>();
    for (const plan of buildKnowledgeLookupPlan(motor)) for (const nt of pickNotesForType(shared.knowledgeRows, plan.analysisType, plan.values, seen)) matched.push(nt);
  }
  const temelItems = (m: NonNullable<Motor>) => [
    { label: "Ana Kulvar", value: noSpread(m.anaKulvar) },
    { label: "Yan Kulvar", value: noSpread(m.yanKulvar) },
    { label: "İfade Sayısı", value: noSpread(m.ifadeSayisi) },
    { label: "Hayat Yolu / DM", value: noSpread(m.hayatYolu) },
  ];

  const add = (tab: WordTabKey, blocks: Block[]) => {
    if (blocks.length === 0) { emptyTabs.push(tab); return; }
    children.push(sectionHeading(WORD_TAB_LABELS[tab], true));
    children.push(...blocks);
  };

  for (const tab of WORD_TAB_ORDER) {
    if (!sections[tab]) continue;
    let blocks: Block[] = [];

    if (tab === "summary") {
      if (motor) {
        blocks.push(subHeading("Numerolojik Profil Özeti"));
        blocks.push(valueCards(temelItems(motor)));
        blocks.push(subHeading("PIN Kodu"));
        blocks.push(...pinPyramid(motor.pinKodu));
      }
      if (matched.length) { blocks.push(subHeading("Ana Yorumlar")); blocks.push(...commentCards(matched, shared)); }
      else if (summary && !motor) blocks.push(p(summary, { justify: true }));
      // Kayıtlı summary metni de varsa (yorum yoksa) ekle — kesme yok.
      if (!matched.length && summary && motor) { blocks.push(subHeading("Sonuç Özeti")); for (const b of summary.split(/\n{2,}/)) { const t = b.trim(); if (t) blocks.push(p(t, { justify: true })); } }
    } else if (tab === "plain") {
      if (motor) {
        blocks.push(subHeading("Temel Numeroloji Değerleri"));
        blocks.push(valueCards(temelItems(motor)));
        blocks.push(subHeading("PIN Kodu"));
        blocks.push(...pinPyramid(motor.pinKodu));
        blocks.push(subHeading("Çakra Omurgası"));
        blocks.push(...chakraSpine(motor));
        blocks.push(subHeading("Elementler"));
        blocks.push(...elementCards(motor));
        const deg = degisimBlocks(row.birth_date);
        if (deg.length) { blocks.push(subHeading("Değişim — Dönüşüm")); blocks.push(...deg); }
        const z = zirveCards(motor); if (z.length) { blocks.push(subHeading("Zirve Yılları")); blocks.push(...z); }
        const muc = mucadeleBlocks(motor); if (muc.length) { blocks.push(subHeading("Mücadele Yılları")); blocks.push(...muc); }
        const harf = harflerTable(motor); if (harf) { blocks.push(subHeading("Harflerin Yankılanışı", true)); blocks.push(harf); }
      }
    } else if (tab === "detailed") {
      // Hesap Özetsiz de seçiliyse hesap bölümlerini TEKRAR ETME → doğrudan yorumlara geç.
      if (!sections.plain && motor) {
        blocks.push(subHeading("Kısa Numerolojik Profil"));
        blocks.push(valueCards(temelItems(motor)));
        blocks.push(subHeading("PIN Kodu"));
        blocks.push(...pinPyramid(motor.pinKodu));
        blocks.push(subHeading("Çakra Omurgası"));
        blocks.push(...chakraSpine(motor));
        blocks.push(subHeading("Elementler"));
        blocks.push(...elementCards(motor));
      }
      const yorum = commentCards(matched, shared);
      if (yorum.length) { blocks.push(subHeading("Numerolojik Yorumlar ve Bilgi Bankası Açıklamaları")); blocks.push(...yorum); }
    } else if (tab === "tas") {
      blocks = tasBlocks(motor, shared, stockIndex);
      if (blocks.length) blocks.unshift(subHeading("Kişiye Özel Taş Destekleri"));
    }

    add(tab, blocks);
  }

  return { children, emptyTabs };
}

export function buildNumerolojiWordChildren(
  rows: WordRecordRow[],
  sections: WordPersonSections,
  shared: WordSharedData,
  stockIndex: StockIndex = new Map(),
): { children: Block[]; emptyTabs: WordTabKey[]; anyContent: boolean } {
  const selected = WORD_TAB_ORDER.filter((k) => sections[k]);
  const reportType = selected.length === 1 ? WORD_TAB_LABELS[selected[0]!] : "Seçili Bölümler";
  const selectedLabels = selected.map((k) => WORD_TAB_LABELS[k]);
  const all: Block[] = [];
  const emptyTabSet = new Set<WordTabKey>();
  let anyContent = false;

  rows.forEach((row, i) => {
    const { children, emptyTabs } = buildPersonSections(row, sections, shared, reportType, selectedLabels, i, stockIndex);
    for (const t of emptyTabs) emptyTabSet.add(t);
    // Bu kişi en az bir seçili sekmede içerik ürettiyse belge içerik taşıyor.
    if (selected.some((k) => !emptyTabs.includes(k))) anyContent = true;
    all.push(...children);
  });

  return { children: all, emptyTabs: Array.from(emptyTabSet), anyContent };
}

function runningHeader(adSoyad: string): Header {
  return new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "EDE9FE" } }, children: [tr(`Yaşam Sistemi  ·  Numeroloji Analiz Raporu  ·  ${adSoyad}`, { color: SECONDARY, size: 16 })] })] });
}
function footer(): Footer {
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [tr("Yaşam Sistemi  ·  Sayfa ", { color: SECONDARY, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: SECONDARY }), tr(" / ", { color: SECONDARY, size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: SECONDARY })] })] });
}

/** docx child listesini gerçek .docx buffer'ına paketler (A4, ~1.9cm kenar, üst/alt bilgi). */
export async function packNumerolojiDocx(children: Block[], adSoyad = ""): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: S_BODY, color: BODY } } } },
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, size: { width: 11906, height: 16838 } } },
      headers: { default: runningHeader(adSoyad) },
      footers: { default: footer() },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
