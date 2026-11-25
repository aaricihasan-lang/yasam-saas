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
import { parseBirthDate, mucadeleKonuText, MUCADELE_ONCEKI_METOD_NOTU, type MucadeleResult, type Zirve } from "@/lib/numeroloji";
import { chronoBirthYear as resolveChronoBirthYear } from "@/app/numeroloji/utils/chronoBirth";
import {
  computeUniversalTiming,
  computePersonalTiming,
  computeCycleTiming,
  currentIstanbulYear,
  type CalendarDate,
} from "@/lib/numeroloji/timing";
import {
  chronoLimitYear,
  chronoNoteText,
  cutoffDegisimYearOnly,
  cutoffDegisimFullDate,
  cutoffHarfSegments,
  harfDisplayAgeEnd,
  harfDisplayYearEnd,
  zirveYasGorunumu,
  cutoffMucadele,
  ZIRVE_METOT1_LABEL,
  ZIRVE_METOT2_LABEL,
} from "@/app/numeroloji/utils/chronoCutoff";
import { computeDevelopment } from "@/lib/numeroloji/development";
import {
  WORD_TAB_ORDER,
  personSourceNotesForRecords,
  wordFileName,
  type MatchedNoteRef,
  type PersonSourceNoteGroup,
  type WordPersonSections,
  type WordTabKey,
} from "./wordPersonSections";
import { buildKnowledgeLookupPlan, pickNotesForType, type KnowledgeNote } from "./knowledgeLookup";
import { noteHeading, resolveNoteSectionsForView } from "./noteLogic";
import { KULVAR_SECTION_TEMPLATE } from "./knowledgeSections";
import { kbValueDisplay } from "./kbValueDisplay";
import type { SourceEntryRow } from "./sourceEntryUiLogic";
import type { KnowledgeRecordRow } from "./bilgiBankaKayit";
import { matchStock, stockLabel, STOCK_HINT_WORD, type StockIndex, type StockInfo } from "./stoneStockLogic";
import { LEGACY_METHOD_NOTE, extractMotorFromAnalysisJson, extractSummaryFromAnalysisData, resolveRecordMotor } from "../../utils/analysisJson";
import { isPreBirth, preBirthActiveYearText, preBirthActiveYearTextEn, preBirthEvreText, preBirthEvreTextEn, preBirthNote, preBirthNoteEn } from "../../utils/preBirth";
import { formatDateLoose, formatInstantDateTime, reportGeneratedLabel } from "@/lib/time/reportTime";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import { buildWellnessNoteSection } from "@/lib/docx/reportHelpers";
import {
  expertCoverBlock,
  expertFooterParagraph,
  expertSignatureBlock,
  type ExpertBranding,
  type ExpertBrandingVariant,
} from "@/lib/docx/expertBranding";
import { getOutputTranslator, SOURCE_OUTPUT_LOCALE, type OutputLocale } from "@/lib/i18n/output";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

/** F3A: uzman rapor markalaması (null/yok → çıktı bugünküyle birebir). Veri kaynağı F1/F2 ile bağlanacak. */
export type NumerolojiBrandingOptions = { branding?: ExpertBranding | null; brandingVariant?: ExpertBrandingVariant };

/**
 * I18N-F1-R5 (P35): çıktı dili. Yok / kaynak dil → bugünkü Türkçe çıktı BAYT-EŞİT (golden:
 * scripts/numeroloji/report-golden). Dil yalnız görünen metni seçer; hesap/snapshot/gizleme kararına GİRMEZ.
 * #855 birleşince route'ta `resolveOutputLocale(req)` → `resolveReportLocale(req, hesap)` tek satır geçişi.
 */
export type NumerolojiWordOptions = NumerolojiBrandingOptions & { output?: OutputLocale | null };

type Vars = Record<string, string | number>;
type WordText = {
  out: OutputLocale;
  isSource: boolean;
  /** reports.numerology.* (ICU değerleri DAİMA metin geçirilir → yıl/sayı gruplanmaz). */
  w: (key: string, vars?: Vars) => string;
  /** numerology.tabs.timing.preBirth (ekranla aynı katalog). */
  pre: (key: string, values?: Record<string, string>) => string;
  /** Bilgi Bankası kanonik değer (eşleşme anahtarı) → görünen etiket; değer DEĞİŞMEZ. */
  kb: (value: string) => string;
};
type RawT = (k: string, v?: Record<string, string>) => string;
const strVars = (v?: Vars): Record<string, string> | undefined => (v ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : undefined);
const TEXT_CACHE = new Map<string, WordText>();
function wordText(out: OutputLocale | null | undefined): WordText {
  const o = out ?? SOURCE_OUTPUT_LOCALE;
  const hit = TEXT_CACHE.get(o.locale);
  if (hit) return hit;
  const t = getOutputTranslator(o, "reports.numerology") as unknown as RawT;
  const pb = getOutputTranslator(o, "numerology.tabs.timing.preBirth") as unknown as RawT;
  const vd = getOutputTranslator(o, "numerology.knowledge.valueDisplay") as unknown as RawT;
  const isSource = o.locale === DEFAULT_LOCALE;
  const wt: WordText = {
    out: o,
    isSource,
    w: (k, v) => t(k, strVars(v)),
    pre: (k, v) => pb(k, v),
    kb: (value) => (isSource ? value : kbValueDisplay(value, vd)),
  };
  TEXT_CACHE.set(o.locale, wt);
  return wt;
}
/** Etkin metin katmanı — dışa açık kurucular senkron bölümde ayarlar ve geri alır (await yok → istekler karışmaz). */
let X: WordText | null = null;
const L = (): WordText => X ?? wordText(null);
function withWordText<T>(out: OutputLocale | null | undefined, fn: () => T): T {
  const prev = X;
  X = wordText(out);
  try { return fn(); } finally { X = prev; }
}
const up = (s: string) => s.toLocaleUpperCase(L().out.intlTag);
const ANALIZ_KEY: Record<string, string> = {
  "ana-kulvar": "anaKulvar", "yan-kulvar": "yanKulvar", "ifade-sayisi": "ifadeSayisi",
  "hayat-yolu": "hayatYolu", "cakra-omurga": "cakraOmurga", element: "element", diger: "diger",
};
const ELEMENT_KEY: Record<string, string> = { Hava: "hava", Su: "su", "Ateş": "ates", Toprak: "toprak", "Eter / Nötr": "notr" };
/** Kanonik element adı (motor anahtarı) → görünen ad; birleşik "Ateş/Su" parça parça. */
const elName = (e: string): string =>
  L().isSource ? e : ELEMENT_KEY[e] ? L().w(`word.el.${ELEMENT_KEY[e]}`) : e.split("/").map((x) => (ELEMENT_KEY[x] ? L().w(`word.el.${ELEMENT_KEY[x]}`) : x)).join("/");
/** Sekme etiketi (ekran sekme adlarıyla birebir; TR = WORD_TAB_LABELS). */
export const wordTabLabel = (k: WordTabKey, output?: OutputLocale | null): string => wordText(output).w(`word.tabs.${k}`);
const SECTION_KEY_BY_LABEL = new Map<string, string>(KULVAR_SECTION_TEMPLATE.map((t) => [t.label, t.key]));
/** Bölüm etiketi: kontrol akışı TR şablon etiketiyle kalır; yalnız görünen metin dile göre. */
const sectionLabelView = (label: string): string => {
  if (L().isSource) return label;
  const key = SECTION_KEY_BY_LABEL.get(label);
  return key ? L().w(`word.notes.sections.${key}`) : label;
};

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

const analizLabel = (k: string): string => (ANALIZ_KEY[k] ? L().w(`analysisTypes.${ANALIZ_KEY[k]}`) : k);

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
    [L().w("word.cover.client"), adSoyad || "—"], [L().w("word.cover.birthDate"), birth || "—"], [L().w("word.cover.analysisDate"), analiz || "—"], [L().w("word.cover.reportDate"), created || "—"],
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

function coverPage(reportType: string, selectedLabels: string[], adSoyad: string, birth: string, analiz: string, created: string, pageBreakBefore: boolean, brand: NumerolojiBrandingOptions = {}): Block[] {
  const out: Block[] = [];
  // Üst mor bant
  out.push(new Paragraph({ pageBreakBefore, spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, alignment: AlignmentType.CENTER, children: [tr(L().w("word.cover.brand"), { bold: true, color: WHITE, size: S_H3 })] }));
  out.push(new Paragraph({ spacing: { before: 40, after: 500 }, alignment: AlignmentType.CENTER, children: [tr(L().w("word.cover.platform"), { color: SECONDARY, size: S_SMALL })] }));
  out.push(new Paragraph({ spacing: { before: 800, after: 120 }, alignment: AlignmentType.CENTER, children: [tr(L().w("word.cover.title"), { bold: true, color: INDIGO, size: S_H1 })] }));
  // İnce lila ayraç
  out.push(new Paragraph({ spacing: { after: 240 }, alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: MOR } }, children: [] }));
  out.push(new Paragraph({ spacing: { after: 500 }, alignment: AlignmentType.CENTER, children: [tr(reportType, { bold: true, color: MOR, size: S_H2 })] }));
  if (selectedLabels.length > 1) {
    for (const l of selectedLabels) out.push(new Paragraph({ spacing: { after: 20 }, alignment: AlignmentType.CENTER, children: [tr(`•  ${l}`, { color: SECONDARY, size: S_SMALL })] }));
    out.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
  }
  out.push(personInfoCard(adSoyad, birth, analiz, created));
  // F3A: uzman kimlik bloğu (markalama yoksa öğe YOK → kapak birebir). Blok varsa alt marka satırı
  // boşluğu daraltılır → kapak tek sayfada kalır.
  const expertBlock = expertCoverBlock(brand.branding, { variant: brand.brandingVariant, accent: MOR, ruleColor: "EDE9FE", before: 360 });
  out.push(...expertBlock);
  out.push(new Paragraph({ spacing: { before: expertBlock.length ? 500 : 900, after: 20 }, alignment: AlignmentType.CENTER, children: [tr(L().w("word.cover.brandFooter"), { bold: true, color: MOR, size: S_SMALL })] }));
  out.push(new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [tr(L().w("word.cover.motto"), { color: SECONDARY, size: 16 })] }));
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
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [tr(up(it.label), { bold: true, color: SECONDARY, size: 15 })] }),
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
  out.push(p(L().w("word.spine.lead"), { color: SECONDARY, size: S_SMALL, after: 80 }));
  const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: [
    new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, margins: { top: 30, bottom: 30, left: 90, right: 90 }, children: [new Paragraph({ alignment: AlignmentType.END, spacing: { after: 0 }, children: [tr(L().w("word.spine.left"), { bold: true, color: INDIGO, size: S_SMALL })] })] }),
    new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, margins: { top: 30, bottom: 30 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(L().w("word.spine.chakra"), { bold: true, color: INDIGO, size: S_SMALL })] })] }),
    new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, margins: { top: 30, bottom: 30, left: 90, right: 90 }, children: [new Paragraph({ spacing: { after: 0 }, children: [tr(L().w("word.spine.right"), { bold: true, color: INDIGO, size: S_SMALL })] })] }),
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
const DIGIT_ELEMENT: Record<number, string> = { 1: "Hava", 5: "Hava", 2: "Su", 7: "Su", 3: "Ateş", 6: "Ateş", 4: "Toprak", 8: "Toprak", 9: "Eter / Nötr" };
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
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [tr(up(elName(e)), { bold: true, color: dominant === e ? MOR : SECONDARY, size: 16 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [tr(xRepeat(cnt), { bold: true, color: MOR })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(String(cnt), { bold: true, color: INDIGO, size: S_H2 })] }),
      ] });
    }) })],
  }));
  if (dominant) {
    out.push(new Paragraph({ spacing: { before: 120, after: 20 }, alignment: AlignmentType.CENTER, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, children: [tr(L().w("word.dominant", { el: up(elName(dominant)) }), { bold: true, color: WHITE, size: S_H3 })] }));
  }
  if (typeof el?.neutralCount === "number" && el.neutralCount > 0) out.push(p(L().w("word.neutral", { n: el.neutralCount }), { color: SECONDARY, size: S_SMALL, after: 40 }));
  // PIN → element dağılımı (kompakt)
  const pin = motor.pinKodu as Record<string, unknown> | null;
  if (pin) {
    const parts: string[] = [];
    for (const k of ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"]) {
      const d = Number(pin[k]);
      if (Number.isFinite(d) && DIGIT_ELEMENT[d]) parts.push(`${d} → ${elName(DIGIT_ELEMENT[d]!)}`);
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

// OWNER YEAR-CUTOFF (Word): başlangıç yılı ≤ currentYear olan dönemler ORİJİNAL (tam) aralıkla
// gösterilir; başlamamış dönemler gizli. Kırpma / "gösterilen bölüm" YOK. Canonical hesap DEĞİŞMEZ.
function degisimBlocks(birthDate: string, currentYear: number): Block[] {
  const out: Block[] = [];
  const y = cutoffDegisimYearOnly(birthDate, currentYear, 5);
  const w = L().w;
  if (y.length) { out.push(subHeading(w("word.change.byYear"))); for (const r of y) out.push(timelineCard(w("word.change.title", { i: r.index }), [w("word.change.year", { year: r.changeYear }), w("word.change.chakra", { n: r.chakra }), w("word.change.effectPeriod", { start: r.effectStartYear, end: r.effectEndYearDisplay })])); }
  const f = cutoffDegisimFullDate(birthDate, currentYear, 5);
  if (f.length) {
    out.push(subHeading(w("word.change.withDay")));
    for (const r of f) { const md = String(r.effectMonth).padStart(2, "0"); const dd = String(r.effectDay).padStart(2, "0"); out.push(timelineCard(w("word.change.title", { i: r.index }), [w("word.change.year", { year: r.changeYear }), w("word.change.chakra", { n: r.chakra }), w("word.change.effect", { start: `${r.effectStartYear}.${md}.${dd}`, end: `${r.effectEndYearDisplay}.${md}.${dd}` })])); }
  }
  return out;
}
function zirveRowTable(rows: { index: number; age: number; topic: number; display?: string }[]): Block {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ cantSplit: true, children: rows.map((pk) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, margins: { top: 90, bottom: 90, left: 40, right: 40 }, verticalAlign: VerticalAlign.CENTER, children: [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [tr(L().w("word.peak.title", { i: pk.index }), { bold: true, color: MOR, size: S_SMALL })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 10 }, children: [tr(L().w("word.peak.age", { age: pk.age }), { bold: true, color: INDIGO, size: S_H3 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(pk.display && pk.display.includes("/") ? L().w("word.peak.topic", { display: pk.display, topic: pk.topic }) : String(pk.topic), { color: BODY, size: S_SMALL })] }),
  ] })) })] });
}
/** Zirve yaşları: iki metot (UI ile aynı zirveYasGorunumu helper'ı); eski snapshot kayıtlı tek liste. */
function zirveCards(motor: NonNullable<Motor>, birthYear: number | null, currentYear: number): Block[] {
  const g = zirveYasGorunumu((motor.zirveYillari as { peaks?: Zirve[] } | null)?.peaks, birthYear, currentYear);
  if (!g) return [];
  if (g.format === "kayitli") return g.peaks.length ? [zirveRowTable(g.peaks)] : [];
  if (!g.metot1.length && !g.metot2.length) return [];
  const out: Block[] = [];
  const m1 = L().isSource ? ZIRVE_METOT1_LABEL : L().w("word.peak.method1");
  const m2 = L().isSource ? ZIRVE_METOT2_LABEL : L().w("word.peak.method2");
  for (const [label, rows] of [[m1, g.metot1], [m2, g.metot2]] as const) {
    out.push(p(label, { color: MOR, size: S_SMALL, before: 60, after: 30 }));
    out.push(rows.length ? zirveRowTable(rows) : p("—", { color: SECONDARY, size: S_SMALL }));
  }
  return out;
}
/** Mücadele: UI ile aynı cutoffMucadele + mucadeleDonemleri (yaşlar GEÇİŞ SINIRI; devam eden dönem görünür). */
function mucadeleBlocks(motor: NonNullable<Motor>, birthYear: number | null, currentYear: number): Block[] {
  const c = cutoffMucadele(motor.mucadeleYillari as MucadeleResult | null, birthYear, currentYear);
  if (!c) return [];
  const cards: { title: string; mid: string; topic: number }[] =
    c.format === "onceki"
      ? c.points.map((pt) => ({ title: L().w("word.challenge.title", { i: pt.index }), mid: L().w("word.challenge.age", { age: pt.age }), topic: pt.topic }))
      : [
          ...c.periods.map((pd) => ({
            title: L().w("word.challenge.title", { i: pd.index }),
            mid: pd.index === 1 ? L().w("word.challenge.until", { age: pd.cutoffAge }) : L().w("word.challenge.next", { age: pd.cutoffAge }),
            topic: pd.topic,
          })),
          ...(c.ana ? [{ title: L().w("word.challenge.main"), mid: L().w("word.challenge.after", { age: c.ana.startAge }), topic: c.ana.topic }] : []),
        ];
  if (!cards.length) return [];
  const out: Block[] = [subHeading(L().w("word.h.challenges"))];
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ cantSplit: true, children: cards.map((it) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: GRAY, color: "auto" }, margins: { top: 80, bottom: 80, left: 40, right: 40 }, children: [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 16 }, children: [tr(it.title, { bold: true, color: MOR, size: S_SMALL })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 10 }, children: [tr(it.mid, { bold: true, color: INDIGO, size: S_SMALL })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(L().isSource ? `konu ${mucadeleKonuText(it.topic)}` : L().w("word.challenge.topic", { topic: it.topic === 0 ? L().w("word.challenge.topicZero") : L().w("word.challenge.topicChakra", { n: it.topic }) }), { color: BODY, size: S_SMALL })] }),
  ] })) })] }));
  if (c.format === "onceki") out.push(p(L().isSource ? MUCADELE_ONCEKI_METOD_NOTU : L().w("word.challenge.prevNote"), { color: SECONDARY, size: S_SMALL, before: 40 }));
  return out;
}
function harflerTable(motor: NonNullable<Motor>, currentYear: number): Block | null {
  const hy = motor.harflerinYankilanisi as { letter: string; chakra: number; ageStart: number; ageEnd: number; yearStart?: number; yearEnd?: number }[] | undefined;
  if (!Array.isArray(hy) || !hy.length) return null;
  const cut = cutoffHarfSegments(hy, currentYear);
  if (!cut.length) return null;
  const w = L().w;
  return dataTable([w("word.letters.no"), w("word.letters.letter"), w("word.letters.chakra"), w("word.letters.ages"), w("word.letters.years")], cut.map((s, i) => {
    const yearEnd = harfDisplayYearEnd(s);
    const yil = s.yearStart != null && yearEnd != null ? `${s.yearStart}–${yearEnd}` : "—";
    return [String(i + 1), s.letter, w("word.letters.chakraCell", { n: s.chakra }), `${s.ageStart}–${harfDisplayAgeEnd(s)}`, yil];
  }), [12, 14, 20, 27, 27]);
}

// ── FAZ 6: Zamanlama & Gelişim (referans tarihe göre; canonical engine reuse) ──
function fmtCalendar(cd: CalendarDate): string {
  return `${String(cd.day).padStart(2, "0")}/${String(cd.month).padStart(2, "0")}/${cd.year}`;
}
/** FAZ 6: başlık altı 1 cümlelik kavram tanımı (italik, ikincil renk). Yorum/skor DEĞİL. */
function conceptDef(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 90, line: 264 },
    children: [new TextRun({ text, font: FONT, size: S_SMALL, color: SECONDARY, italics: true })],
  });
}
/** Sol-mor vurgulu "Etiket: Değer" + (varsa) yorum kartı. */
function timingItemCard(label: string, value: string, interpretation?: string): Table {
  const lines = [L().w("word.timing.value", { value })];
  if (interpretation && interpretation.trim()) lines.push(interpretation.trim());
  return timelineCard(label, lines);
}
/**
 * "Zamanlama & Gelişim" Word bölümü. UI'daki FAZ 4 canonical engine'lerini AYNEN kullanır
 * (ikinci motor YOK). Referans tarih AÇIKÇA geçirilir; new Date() KULLANILMAZ.
 */
function timingBlocks(firstName: string, lastName: string, birthDate: string, ref: CalendarDate): Block[] {
  const bd = (birthDate || "").replace(/\//g, ".");
  if (!parseBirthDate(bd)) return [];
  const u = computeUniversalTiming(ref);
  const per = computePersonalTiming(bd, ref);
  const cyc = computeCycleTiming(bd, ref);
  const dev = computeDevelopment(firstName, lastName, bd, ref);
  const py = per.personalYear;
  // Doğum öncesi (planlanan doğum referans tarihten sonra): yaş / aktif dönem / şu anki evre yazılmaz.
  const bp = parseBirthDate(bd);
  const preBirth = isPreBirth(cyc) && bp !== null;

  const out: Block[] = [];
  const { w, isSource, pre } = L();
  // Referans tarih — rapor yıllar sonra açıldığında bağlam netliği için AÇIKÇA yazılır.
  out.push(p(w("word.timing.refDate", { date: fmtCalendar(ref) }), { bold: true, color: INDIGO, size: S_SMALL, after: 140 }));
  if (preBirth && bp) out.push(p(isSource ? preBirthNote(bp, ref) : preBirthNoteEn(pre, bp, ref), { color: SECONDARY, size: S_SMALL, after: 140 }));

  out.push(subHeading(w("word.timing.universal")));
  out.push(timingItemCard(w("word.timing.universalYear"), u.universalYear.display, u.universalYear.interpretation));
  out.push(timingItemCard(w("word.timing.universalMonth"), u.universalMonth.display, u.universalMonth.interpretation));
  out.push(timingItemCard(w("word.timing.universalDay"), u.universalDay.display, u.universalDay.interpretation));

  out.push(subHeading(w("word.timing.personal")));
  out.push(conceptDef(w("word.timing.nominalDef")));
  out.push(timingItemCard(w("word.timing.nominal", { year: ref.year }), py.nominal.display, py.nominal.interpretation));
  out.push(conceptDef(w("word.timing.activeDef")));
  out.push(
    preBirth && bp
      ? timelineCard(w("word.timing.active"), [isSource ? preBirthActiveYearText(bp) : preBirthActiveYearTextEn(pre, bp)])
      : timelineCard(w("word.timing.active"), [
          w("word.timing.value", { value: py.active.display }),
          w("word.timing.activePeriod", { start: fmtCalendar(py.active.periodStart), end: fmtCalendar(py.active.periodEnd) }),
          ...(py.active.interpretation ? [py.active.interpretation] : []),
        ]),
  );
  out.push(timingItemCard(w("word.timing.personalMonth"), per.personalMonth.display, per.personalMonth.interpretation));
  out.push(timingItemCard(w("word.timing.personalDay"), per.personalDay.display, per.personalDay.interpretation));

  out.push(subHeading(w("word.timing.phase")));
  out.push(conceptDef(w("word.timing.phaseDef")));
  if (preBirth) {
    out.push(p(isSource ? preBirthEvreText(cyc.timeline[0]?.energy) : preBirthEvreTextEn(pre, cyc.timeline[0]?.energy), { color: SECONDARY, size: S_SMALL }));
  } else if (cyc.evre) {
    out.push(
      timelineCard(w("word.timing.evreTitle", { i: cyc.evre.index, age: cyc.age }), [
        w("word.timing.evreEnergy", { energy: cyc.evre.energy }),
        ...(cyc.evre.interpretation ? [cyc.evre.interpretation] : []),
      ]),
    );
    if (cyc.dongu) {
      out.push(timingItemCard(w("word.timing.dongu", { i: cyc.dongu.index }), String(cyc.dongu.index), cyc.dongu.interpretation));
    }
  } else {
    out.push(p(w("word.timing.noPhase", { age: cyc.age }), { color: SECONDARY, size: S_SMALL }));
  }

  out.push(subHeading(w("word.timing.development")));
  out.push(timingItemCard(w("word.timing.yearChakra"), dev.yearChakra.display, dev.yearChakra.interpretation));
  out.push(timingItemCard(w("word.timing.maturity"), dev.maturity.display, dev.maturity.interpretation));
  out.push(timingItemCard(w("word.timing.birthDayEnergy", { d: dev.birthDayEnergy.display }), dev.birthDayEnergy.display, dev.birthDayEnergy.interpretation));
  out.push(timingItemCard(w("word.timing.personality"), dev.personalityEnergy.display, dev.personalityEnergy.interpretation));
  out.push(timingItemCard(w("word.timing.lifeLesson"), dev.lifeLesson.display, dev.lifeLesson.interpretation));
  out.push(timingItemCard(w("word.timing.destiny"), dev.destiny.display, dev.destiny.interpretation));

  return out;
}

// ── Yorum kartları (potansiyel bölümleri pastel) ─────────────────────────────
function potentialBlock(label: string, body: string, fill: string): Paragraph {
  return new Paragraph({ spacing: { before: 40, after: 60, line: 264 }, shading: { type: ShadingType.CLEAR, fill, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 14, color: MOR, space: 6 } }, children: [tr(`${label}: `, { bold: true, color: INDIGO, size: S_SMALL }), tr(body, {})] });
}
const POT_FILL: Record<string, string> = { "Yapıcı Potansiyeller": GREEN_BG, "Olumsuz Potansiyeller": AMBER_BG, "Yıkıcı Potansiyeller": RED_BG };

function commentCards(matchedNotes: KnowledgeNote[], shared: WordSharedData): Block[] {
  const { w, isSource } = L();
  const noteLabels = isSource ? undefined : { own: w("word.notes.expertOwn"), unknown: w("word.notes.unknownSource") };
  const generalSuffixTr = wordText(SOURCE_OUTPUT_LOCALE).w("word.notes.generalSuffix");
  const suffixView = (sfx: string | undefined): string => (!sfx ? "" : isSource ? sfx : sfx === generalSuffixTr ? w("word.notes.generalSuffix") : sfx);
  const groups: PersonSourceNoteGroup[] = personSourceNotesForRecords(matchedNotes.map((n) => ({ id: n.id, analysisType: n.analysisType, value: n.value } as MatchedNoteRef)), shared.entries, shared.sourceLabelById, noteLabels);
  const groupById = new Map(groups.map((g) => [g.ref.id, g]));
  const out: Block[] = [];
  for (const note of matchedNotes) {
    const secs = resolveNoteSectionsForView(note).map((s) => ({ label: s.label, body: (s.body || "").trim() })).filter((s) => s.body !== "");
    const grp = groupById.get(note.id);
    if (secs.length === 0 && (!grp || grp.notes.length === 0)) continue;
    out.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 60 }, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, children: [tr(`  ${isSource ? noteHeading(note.analysisType, note.value) : `${analizLabel(note.analysisType)} — ${L().kb(note.value)}`}${suffixView(note.headingSuffix)}`, { bold: true, color: WHITE, size: S_H3 })] }));
    for (const s of secs) {
      if (!s.label || s.label === "Genel Açıklama") out.push(p(s.body, { justify: true }));
      else if (POT_FILL[s.label]) out.push(potentialBlock(sectionLabelView(s.label), s.body, POT_FILL[s.label]!));
      else { out.push(new Paragraph({ keepNext: true, spacing: { before: 40, after: 20 }, children: [tr(sectionLabelView(s.label), { bold: true, color: INDIGO, size: S_SMALL })] })); out.push(p(s.body, { justify: true })); }
    }
    if (grp) for (const nt of grp.notes) out.push(new Paragraph({ spacing: { before: 40, after: 60, line: 264 }, shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 16, color: MOR, space: 6 } }, children: [tr(`${w("word.notes.sourceNote")}${nt.label ? ` — ${nt.label}` : ""}: `, { bold: true, color: INDIGO, size: S_SMALL }), tr(nt.body.trim(), {})] }));
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
function stoneColumns(stones: string[], stockIndex: StockIndex, contextTitle: string, cols = 3): Table {
  const rows: TableRow[] = [];
  const cw = Math.floor(100 / cols);
  // Tekrarlayan bağlam başlığı: kart sayfalar arası bölünürse docx bunu her yeni sayfanın
  // BAŞINDA otomatik tekrarlar → devam sayfası bağlamsız taş adıyla başlamaz. Kompakt lila bar
  // (yeni ana kart gibi görünmez; stok yeşil vurgusunu bozmaz).
  rows.push(new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [new TableCell({
      columnSpan: cols,
      shading: { type: ShadingType.CLEAR, fill: LILA, color: "auto" },
      borders: NO_BORDERS,
      margins: { top: 30, bottom: 30, left: 60, right: 60 },
      children: [new Paragraph({ spacing: { after: 0 }, children: [tr(L().w("word.stones.continued", { ctx: contextTitle }), { bold: true, color: MOR, size: S_SMALL })] })],
    })],
  }));
  for (let i = 0; i < stones.length; i += cols) {
    const slice = stones.slice(i, i + cols);
    while (slice.length < cols) slice.push("");
    rows.push(new TableRow({ cantSplit: true, children: slice.map((s) => {
      if (!s) return new TableCell({ margins: { top: 20, bottom: 20, left: 60, right: 60 }, width: { size: cw, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: [new Paragraph({ spacing: { after: 0 }, children: [] })] });
      const info = matchStock(s, stockIndex);
      // Stoktaki taş: açık yeşil hücre + ✓ + "Stokta[· N adet]". Yoksa nötr madde işareti.
      const runs = info.stocked
        ? [tr("✓ ", { bold: true, color: GREEN_TXT }), tr(s, { bold: true }), tr(`  — ${stockText(info)}`, { bold: true, color: GREEN_TXT, size: S_SMALL })]
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
function stockText(info: StockInfo): string {
  if (L().isSource) return stockLabel(info);
  if (!info.stocked) return "";
  return info.adet > 0 ? L().w("word.stones.inStockCount", { n: info.adet }) : L().w("word.stones.inStock");
}
function stoneStatusLabel(value: string): string | null {
  // Karar KANONİK değerin TR büyük harfinden (dilden bağımsız); yalnız rozet metni dile göre.
  const v = value.toLocaleUpperCase("tr-TR");
  if (v.includes("FAZLA")) return L().w("word.stones.excess");
  if (v.includes("AZ")) return L().w("word.stones.low");
  return null;
}
function tasBlocks(motor: Motor, shared: WordSharedData, stockIndex: StockIndex): Block[] {
  const out: Block[] = [];
  if (!motor) return out;
  out.push(p(L().isSource ? STOCK_HINT_WORD : L().w("word.stones.hint"), { color: SECONDARY, size: S_SMALL, after: 100 }));
  const seen = new Set<string>();
  let any = false;
  for (const plan of buildKnowledgeLookupPlan(motor)) {
    let matchedInPlan = false;
    for (const value of plan.values) {
      // NUM-F10: Hayat Yolu planında ilk eşleşen taş ataması kullanılır (UI ile aynı).
      if (plan.firstMatchOnly && matchedInPlan) break;
      const st = shared.stoneRows.find((s) => s.analysis_type === plan.analysisType && s.value === value);
      if (!st) continue;
      const key = `${st.analysis_type}::${st.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stones = parseStones(st.stones);
      if (!st.reason?.trim() && stones.length === 0) continue;
      any = true;
      matchedInPlan = true;
      const badge = stoneStatusLabel(st.value);
      const titleRuns: TextRun[] = [tr(`  ${analizLabel(st.analysis_type)} — ${L().kb(st.value)}`, { bold: true, color: WHITE, size: S_H3 })];
      if (badge) titleRuns.push(tr(`    [ ${badge} ]`, { bold: true, color: LILA, size: S_SMALL }));
      // Kart başlığı + ilk açıklama paragrafı aynı sayfada (keepNext); tek satır/başlık artık kalmaz.
      out.push(new Paragraph({ keepNext: true, spacing: { before: 150, after: 60 }, shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" }, children: titleRuns }));
      if (st.reason?.trim()) out.push(new Paragraph({ keepNext: stones.length > 0, spacing: { after: 100, line: 264 }, alignment: AlignmentType.JUSTIFIED, children: [tr(st.reason.trim())] }));
      if (stones.length > 0) {
        out.push(new Paragraph({ keepNext: true, spacing: { before: 40, after: 30 }, children: [tr(L().w("word.stones.recommended"), { bold: true, color: INDIGO, size: S_SMALL })] }));
        const contextTitle = `${analizLabel(st.analysis_type)} — ${L().kb(st.value)}`;
        out.push(stoneColumns(stones, stockIndex, contextTitle, stones.length >= 6 ? 3 : 2));
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
  refCalendar: CalendarDate | null = null,
  now: Date = new Date(),
  /** SUNUCUDA doğrulanmış "Gelecek Yılları Göster" yetkisi (route; istemci değeri DEĞİL). Varsayılan KAPALI. */
  futureYears: boolean = false,
  brand: NumerolojiWordOptions = {},
): { children: Block[]; emptyTabs: WordTabKey[] } {
  return withWordText(brand.output, () => personSectionsImpl(row, sections, shared, reportType, selectedLabels, personIndex, stockIndex, refCalendar, now, futureYears, brand));
}

function personSectionsImpl(
  row: WordRecordRow,
  sections: WordPersonSections,
  shared: WordSharedData,
  reportType: string,
  selectedLabels: string[],
  personIndex: number,
  stockIndex: StockIndex,
  refCalendar: CalendarDate | null,
  now: Date,
  futureYears: boolean,
  brand: NumerolojiWordOptions,
): { children: Block[]; emptyTabs: WordTabKey[] } {
  const { w, isSource, out: lang } = L();
  const dateOpts = isSource ? {} : { locale: lang.intlTag };
  const children: Block[] = [];
  const emptyTabs: WordTabKey[] = [];
  // MODEL C (UI ile aynı politika): Word, kaydın KAYDEDİLDİĞİ GÜNKÜ snapshot'ını ve kayıtlı özet
  // metnini kullanır; önceki metodoloji kayıtlarında yalnız bilgilendirme notu eklenir.
  const resolved = resolveRecordMotor(row);
  const motor = resolved.motor;
  const summary = extractSummaryFromAnalysisData(row.analysis_data);
  // OWNER YEAR-CUTOFF: kronolojik bölümler rapor oluşturma anındaki Türkiye takvim yılına
  // sınırlanır (yıl hardcode DEĞİL; her yıl otomatik güncellenir). refCalendar timing sekmesi
  // içindir ve bu sınırı ETKİLEMEZ.
  // Gelecek Yıllar yetkisi AÇIK → aynı filtreler sınırsız yılla (yöntemin doğal bitişi) çalışır;
  // KAPALI → currentIstanbulYear() (önceki davranış birebir).
  const chronoCutoffYear = chronoLimitYear(currentIstanbulYear(), futureYears);
  // NUM-005: row.birth_date DB'den ISO (YYYY-MM-DD) veya TR gelebilir → esnek sınır parser'ı.
  // I18N-0003: doğum yılı tek çözücüden (kayıt alanı birincil; snapshot metni yalnız eski kayıt geri
  // dönüşü; harf segmentleri çapraz doğrulama). Çözülemez/çelişkili → yetki KAPALI iken kronoloji gizli.
  const chronoBirthYear = resolveChronoBirthYear(motor, row.birth_date);
  const chronoOpen = futureYears || chronoBirthYear !== null;
  const adSoyad = `${row.name} ${row.surname}`.trim() || "—";
  // FA-02: analiz anı (created_at timestamptz) Europe/Istanbul; rapor tarihi yerel gün;
  // doğum tarihi TEXT (ISO veya GG.AA.YYYY) → kaydırmasız gösterim (anlaşılamazsa ham metin).
  const analiz = formatInstantDateTime(row.created_at, { fallback: "—", ...dateOpts });
  const created = reportGeneratedLabel(isSource ? undefined : dateOpts, now);
  const birthLabel = formatDateLoose(row.birth_date, { fallback: row.birth_date || "—", ...dateOpts });

  // Kapak (kişi başına bir kez)
  children.push(...coverPage(reportType, selectedLabels, adSoyad, birthLabel, analiz, created, personIndex > 0, brand));
  if (resolved.legacy) children.push(p(isSource ? LEGACY_METHOD_NOTE : w("word.legacyNote"), { color: SECONDARY, size: S_SMALL, after: 120 }));

  const matched: KnowledgeNote[] = [];
  if (motor && (sections.summary || sections.detailed)) {
    const seen = new Set<string>();
    for (const plan of buildKnowledgeLookupPlan(motor)) for (const nt of pickNotesForType(shared.knowledgeRows, plan.analysisType, plan.values, seen, plan)) matched.push(nt);
  }
  const temelItems = (m: NonNullable<Motor>) => [
    { label: w("word.core.anaKulvar"), value: noSpread(m.anaKulvar) },
    { label: w("word.core.yanKulvar"), value: noSpread(m.yanKulvar) },
    { label: w("word.core.ifadeSayisi"), value: noSpread(m.ifadeSayisi) },
    { label: w("word.core.hayatYolu"), value: noSpread(m.hayatYolu) },
  ];

  const add = (tab: WordTabKey, blocks: Block[]) => {
    if (blocks.length === 0) { emptyTabs.push(tab); return; }
    children.push(sectionHeading(w(`word.tabs.${tab}`), true));
    children.push(...blocks);
  };

  for (const tab of WORD_TAB_ORDER) {
    if (!sections[tab]) continue;
    let blocks: Block[] = [];

    if (tab === "summary") {
      if (motor) {
        blocks.push(subHeading(w("word.h.profileSummary")));
        blocks.push(valueCards(temelItems(motor)));
        blocks.push(subHeading(w("word.h.pin")));
        blocks.push(...pinPyramid(motor.pinKodu));
      }
      if (matched.length) { blocks.push(subHeading(w("word.h.mainComments"))); blocks.push(...commentCards(matched, shared)); }
      else if (summary && !motor) blocks.push(p(summary, { justify: true }));
      // Kayıtlı summary metni de varsa (yorum yoksa) ekle — kesme yok.
      if (!matched.length && summary && motor) { blocks.push(subHeading(w("word.h.resultSummary"))); for (const b of summary.split(/\n{2,}/)) { const t = b.trim(); if (t) blocks.push(p(t, { justify: true })); } }
    } else if (tab === "plain") {
      if (motor) {
        blocks.push(subHeading(w("word.h.coreValues")));
        blocks.push(valueCards(temelItems(motor)));
        blocks.push(subHeading(w("word.h.pin")));
        blocks.push(...pinPyramid(motor.pinKodu));
        blocks.push(subHeading(w("word.h.spine")));
        blocks.push(...chakraSpine(motor));
        blocks.push(subHeading(w("word.h.elements")));
        blocks.push(...elementCards(motor));
        // Not metni dile göre; hangi notun basılacağı (yetki) ve kesim kararı dilden bağımsız.
        const chronoNote = () => p(isSource ? chronoNoteText(futureYears) : w(futureYears ? "word.chrono.full" : "word.chrono.cutoff"), { size: S_SMALL, color: BODY, before: 40 });
        const deg = chronoOpen ? degisimBlocks(row.birth_date, chronoCutoffYear) : [];
        if (deg.length) { blocks.push(subHeading(w("word.h.change"))); blocks.push(...deg); blocks.push(chronoNote()); }
        const z = zirveCards(motor, chronoBirthYear, chronoCutoffYear); if (z.length) { blocks.push(subHeading(w("word.h.peaks"))); blocks.push(...z); blocks.push(chronoNote()); }
        // AŞAMA 1 P3: mucadeleBlocks kendi "Mücadele Yılları" alt başlığını üretir; burada tekrar eklenmez.
        const muc = mucadeleBlocks(motor, chronoBirthYear, chronoCutoffYear); if (muc.length) { blocks.push(...muc); blocks.push(chronoNote()); }
        const harf = chronoOpen ? harflerTable(motor, chronoCutoffYear) : null; if (harf) { blocks.push(subHeading(w("word.h.letters"), true)); blocks.push(harf); blocks.push(chronoNote()); }
      }
    } else if (tab === "detailed") {
      // Hesap Özetsiz de seçiliyse hesap bölümlerini TEKRAR ETME → doğrudan yorumlara geç.
      if (!sections.plain && motor) {
        blocks.push(subHeading(w("word.h.shortProfile")));
        blocks.push(valueCards(temelItems(motor)));
        blocks.push(subHeading(w("word.h.pin")));
        blocks.push(...pinPyramid(motor.pinKodu));
        blocks.push(subHeading(w("word.h.spine")));
        blocks.push(...chakraSpine(motor));
        blocks.push(subHeading(w("word.h.elements")));
        blocks.push(...elementCards(motor));
      }
      const yorum = commentCards(matched, shared);
      if (yorum.length) { blocks.push(subHeading(w("word.h.comments"))); blocks.push(...yorum); }
    } else if (tab === "zamanlama") {
      // Referans tarih route'ta doğrulanır; yoksa (savunma) bölüm boş kalır.
      if (refCalendar) blocks = timingBlocks(row.name, row.surname, row.birth_date, refCalendar);
    } else if (tab === "tas") {
      blocks = tasBlocks(motor, shared, stockIndex);
      if (blocks.length) blocks.unshift(subHeading(w("word.h.stones")));
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
  refCalendar: CalendarDate | null = null,
  now: Date = new Date(),
  /** SUNUCUDA doğrulanmış "Gelecek Yılları Göster" yetkisi. Varsayılan KAPALI (fail-closed). */
  futureYears: boolean = false,
  brand: NumerolojiWordOptions = {},
): { children: Block[]; emptyTabs: WordTabKey[]; anyContent: boolean } {
  return withWordText(brand.output, () => wordChildrenImpl(rows, sections, shared, stockIndex, refCalendar, now, futureYears, brand));
}

function wordChildrenImpl(
  rows: WordRecordRow[],
  sections: WordPersonSections,
  shared: WordSharedData,
  stockIndex: StockIndex,
  refCalendar: CalendarDate | null,
  now: Date,
  futureYears: boolean,
  brand: NumerolojiWordOptions,
): { children: Block[]; emptyTabs: WordTabKey[]; anyContent: boolean } {
  const { w } = L();
  const selected = WORD_TAB_ORDER.filter((k) => sections[k]);
  const reportType = selected.length === 1 ? w(`word.tabs.${selected[0]!}`) : w("word.selectedSections");
  const selectedLabels = selected.map((k) => w(`word.tabs.${k}`));
  const all: Block[] = [];
  const emptyTabSet = new Set<WordTabKey>();
  let anyContent = false;

  rows.forEach((row, i) => {
    const { children, emptyTabs } = buildPersonSections(row, sections, shared, reportType, selectedLabels, i, stockIndex, refCalendar, now, futureYears === true, brand);
    for (const t of emptyTabs) emptyTabSet.add(t);
    // Bu kişi en az bir seçili sekmede içerik ürettiyse belge içerik taşıyor.
    if (selected.some((k) => !emptyTabs.includes(k))) anyContent = true;
    all.push(...children);
  });

  return { children: all, emptyTabs: Array.from(emptyTabSet), anyContent };
}

/**
 * I18N-F1-R5: Word dosya adı (çıktı dili). Kaynak dilde route'un ürettiği TR adı AYNEN döner (bugünkü ad birebir);
 * diğer dillerde sistem parçaları katalogdan, kişi adı parçası güvenli ASCII (kullanıcı içeriği, çevrilmez).
 */
export function numerologyWordFileName(
  output: OutputLocale | null | undefined,
  sourceName: string,
  ctx: { rows: { name: string; surname: string }[]; selectedTabs: WordTabKey[]; isSingle: boolean },
): string {
  const lt = wordText(output);
  if (lt.isSource) return sourceName;
  const parts = {
    prefix: lt.w("word.file.prefix"),
    selected: lt.w("word.file.selected"),
    fallback: lt.w("word.file.fallbackName"),
    tabFile: Object.fromEntries(WORD_TAB_ORDER.map((k) => [k, lt.w(`word.tabsFile.${k}`)])) as Record<WordTabKey, string>,
  };
  const first = ctx.rows[0]!;
  return ctx.isSingle
    ? wordFileName(`${first.name} ${first.surname}`, ctx.selectedTabs, parts)
    : `${parts.prefix}_${ctx.rows.length}_${lt.w("word.file.records")}_${ctx.selectedTabs.length === 1 ? parts.tabFile[ctx.selectedTabs[0]!] : parts.selected}.docx`;
}

function runningHeader(adSoyad: string): Header {
  return new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "EDE9FE" } }, children: [tr(L().w("word.header", { name: adSoyad }), { color: SECONDARY, size: 16 })] })] });
}
function footer(brand: NumerolojiBrandingOptions = {}): Footer {
  // F3A: markalama açıksa küçük kurum satırı; yoksa öğe YOK (footer birebir).
  const brandLine = expertFooterParagraph(brand.branding, { variant: brand.brandingVariant, color: SECONDARY });
  return new Footer({ children: [
    // FA-16: kısa bilgilendirme notu (sade, küçük punto; uyarı kutusu değil).
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: wellnessNote("numeroloji").short, font: FONT, size: 14, italics: true, color: SECONDARY })] }),
    ...(brandLine ? [brandLine] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [tr(L().w("word.footerPage"), { color: SECONDARY, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: SECONDARY }), tr(" / ", { color: SECONDARY, size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: SECONDARY })] })] });
}

/**
 * docx child listesini gerçek .docx buffer'ına paketler (A4, ~1.9cm kenar, üst/alt bilgi).
 * FA-16: belge sonuna sade "Bilgilendirme" notu (+ varsa "Hazırlayan: <uzman>") eklenir.
 */
export async function packNumerolojiDocx(children: Block[], adSoyad = "", opts?: { expertName?: string | null } & NumerolojiWordOptions): Promise<Buffer> {
  // Belge senkron kurulur (metin katmanı yalnız bu bölümde etkin); paketleme sonra.
  const doc = withWordText(opts?.output, () => {
    // F3A: markalama açıksa "Hazırlayan" satırı genişletilmiş imza bloğuyla değişir (bilgilendirme metni AYNEN).
    // Not (#855): ortak motorlar (bilgilendirme notu / imza / alt bilgi notu) bu dalda yalnız TR; #855
    // birleşince `common: output.common` geçirilir.
    const signature = expertSignatureBlock(opts?.branding, { variant: opts?.brandingVariant, accent: MOR, fallbackName: opts?.expertName, contentWidth: 11906 - 2 * 1080, fill: LILA });
    const all = signature.length
      ? [...children, ...buildWellnessNoteSection("numeroloji", null), ...signature]
      : [...children, ...buildWellnessNoteSection("numeroloji", opts?.expertName)];
    const { isSource, out } = L();
    // Belge dili: TR'de dil işareti EKLENMEZ (golden bayt-eşit); diğer dillerde w:lang = documentLang.
    const run = isSource ? { font: FONT, size: S_BODY, color: BODY } : { font: FONT, size: S_BODY, color: BODY, language: { value: out.documentLang } };
    return new Document({
      styles: { default: { document: { run } } },
      sections: [{
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, size: { width: 11906, height: 16838 } } },
        headers: { default: runningHeader(adSoyad) },
        footers: { default: footer(opts) },
        children: all,
      }],
    });
  });
  return Packer.toBuffer(doc);
}
