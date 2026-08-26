/**
 * Refleksoloji PREMIUM Word/DOCX raporu — İZOLE builder.
 *
 * `lib/docx/reportHelpers` yalnız ADDITIVE olarak (mevcut export'lar) kullanılır;
 * bu dosyadaki stiller/builder'lar refleksolojiye özeldir ve başka raporları
 * (Doğaltaş/clients/aromaterapi) ETKİLEMEZ.
 *
 * İçerik SÖZLEŞMESİ (LOCKED):
 *   - İçindekiler YOK, boş "Rapor Özeti" tam-sayfa YOK.
 *   - Single export: PROTOKOL #001 / "Protokol Sayısı: 1" / "Kapsam" / Kaynak UID YOK.
 *   - Bulk export: çok protokol varsa #001/#002 numaralandırma.
 *   - Boş alan → bölüm YOK (açıklama/not yoksa, grup haritası bölgesizse üretilmez).
 *
 * Alan eşlemesi (DB → UI etiketi):
 *   title            → "Hedef / Sorun Adı" (protokol adı, kapak odağı)
 *   target_problem   → "Kısa Açıklama"
 *   application_notes→ "Uygulama Notları"
 */

import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  Paragraph,
  PageNumber,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { REPORT_FONT, C_MID, C_LIGHT, embedImageParagraph, sanitizeXmlText, type ReportChild } from "@/lib/docx/reportHelpers";
import {
  ALL_ATLAS_GROUPS,
  ATLAS_GROUP_LABEL,
  type AtlasBackgroundGroup,
  type ResolvedAtlas,
  type OrganResolved,
} from "./atlasRegionsCore";
import { renderAtlasGroupPng } from "./atlasImage";

// ─── Premium violet kimlik paleti ─────────────────────────────────────────────
const V_EYEBROW = "7c3aed"; // violet-600
const V_TITLE = "4c1d95"; // violet-900
const V_ACCENT = "6d28d9"; // violet-700
const V_RULE = "ddd6fe"; // violet-200
const V_CARD_FILL = "faf5ff"; // violet-50/rose tint
const V_DARK = "1e293b";

const clean = (s: string): string => sanitizeXmlText(s);

// ─── Kapak (SAYFA 1) ──────────────────────────────────────────────────────────
export type CoverMeta = { label: string; value: string }[];

export function buildCover(protocolTitle: string, subtitle: string, meta: CoverMeta): ReportChild[] {
  return [
    new Paragraph({ spacing: { before: 1400 } }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: V_RULE } },
      spacing: { after: 0 },
    }),
    new Paragraph({ spacing: { after: 360 } }),
    // Eyebrow
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "YAŞAM SİSTEMİ", bold: true, size: 26, font: REPORT_FONT, color: V_EYEBROW, allCaps: true })],
      spacing: { after: 120 },
    }),
    // Report subtitle (küçük)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: subtitle, size: 24, font: REPORT_FONT, color: C_LIGHT, italics: true })],
      spacing: { after: 420 },
    }),
    // Protokol adı — ana görsel odak
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: clean(protocolTitle), bold: true, size: 60, font: REPORT_FONT, color: V_TITLE })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: V_RULE } },
      spacing: { before: 0, after: 420 },
    }),
    // Metadata (etiket: değer)
    ...meta.map(({ label, value }) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${label}:  `, size: 22, font: REPORT_FONT, color: C_MID }),
          new TextRun({ text: clean(value), bold: true, size: 22, font: REPORT_FONT, color: V_DARK }),
        ],
        spacing: { after: 110 },
      }),
    ),
    new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: V_RULE } },
      spacing: { before: 420, after: 0 },
    }),
  ];
}

// ─── Bölüm / kart başlıkları ──────────────────────────────────────────────────
function sectionHeading(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: clean(text), bold: true, size: 30, font: REPORT_FONT, color: V_ACCENT })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: V_RULE } },
    spacing: { before: 360, after: 200 },
    ...(pageBreak ? { pageBreakBefore: true } : {}),
    keepNext: true,
  });
}

function protocolTitleHeading(title: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: clean(title), bold: true, size: 34, font: REPORT_FONT, color: V_TITLE })],
    spacing: { after: 200 },
    keepNext: true,
  });
}

// ─── Protokol özeti kartı (kompakt; tam sayfa DEĞİL) ──────────────────────────
function summaryCard(input: ReflexologyProtocolInput): ReportChild[] {
  const rows: [string, string][] = [];
  rows.push(["Organ Sayısı", String(input.organs.length)]);
  const totalRegions = input.resolved.organs.reduce((a, o) => a + o.totalRegions, 0);
  rows.push(["Toplam Atlas Bölgesi", String(totalRegions)]);
  for (const g of ALL_ATLAS_GROUPS) {
    const count = input.resolved.regionsByGroup[g].length;
    if (count > 0) rows.push([`${ATLAS_GROUP_LABEL[g]} Bölgesi`, String(count)]);
  }

  const out: ReportChild[] = [sectionHeading("Protokol Özeti")];
  // Kısa Açıklama — yalnız varsa
  const desc = (input.description ?? "").trim();
  if (desc) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: clean(desc), size: 22, font: REPORT_FONT, color: C_MID })],
        spacing: { after: 200 },
        widowControl: true,
      }),
    );
  }
  out.push(compactKeyValueTable(rows));
  return out;
}

/** Kompakt iki sütun künye tablosu (violet başlık hücreleri). */
function compactKeyValueTable(rows: [string, string][]): Table {
  const thin = { style: BorderStyle.SINGLE, size: 2, color: V_RULE } as const;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: thin, bottom: thin, left: thin, right: thin,
      insideHorizontal: thin, insideVertical: thin,
    },
    rows: rows.map(([label, value]) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: V_CARD_FILL, color: "auto" },
            margins: { top: 60, bottom: 60, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: clean(label), bold: true, size: 20, font: REPORT_FONT, color: V_ACCENT })] })],
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: clean(value), size: 20, font: REPORT_FONT, color: V_DARK })] })],
          }),
        ],
      }),
    ),
  });
}

// ─── Atlas harita bölümü (grup başına) ────────────────────────────────────────
async function atlasMapSection(
  group: AtlasBackgroundGroup,
  resolved: ResolvedAtlas,
): Promise<ReportChild[]> {
  const regions = resolved.regionsByGroup[group];
  if (regions.length === 0) return []; // boş grup → bölüm YOK

  const { png } = await renderAtlasGroupPng(group, regions);
  const out: ReportChild[] = [
    sectionHeading(`Refleksoloji Uygulama Haritası — ${ATLAS_GROUP_LABEL[group]}`),
    embedImageParagraph(png, 580, 600),
  ];

  // Legend — YALNIZ bu haritadaki organlar, harita paletiyle aynı renk.
  const organsInGroup = resolved.organs.filter((o) => o.byGroup[group] > 0);
  for (const o of organsInGroup) {
    out.push(legendRow(o, o.byGroup[group]));
  }
  return out;
}

function legendRow(organ: OrganResolved, count: number): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "● ", size: 22, font: REPORT_FONT, color: rgbToHex(organ.color.stroke) }),
      new TextRun({ text: `${clean(organ.label)} — ${count} bölge`, size: 20, font: REPORT_FONT, color: C_MID }),
    ],
    spacing: { after: 40 },
    indent: { left: 120 },
  });
}

/** "rgb(220, 38, 38)" → "dc2626" (docx color = hex, # yok). */
function rgbToHex(color: string): string {
  const m = color.match(/rgba?\(([^)]+)\)/i);
  if (!m) return color.replace(/^#/, "");
  const [r, g, b] = m[1].split(",").map((s) => s.trim());
  const to2 = (v: string) => Math.max(0, Math.min(255, Math.round(parseFloat(v)))).toString(16).padStart(2, "0");
  return `${to2(r)}${to2(g)}${to2(b)}`;
}

// ─── Organ + atlas bölgeleri tablosu ──────────────────────────────────────────
function organTable(resolved: ResolvedAtlas): ReportChild[] {
  // Her (organ, grup) için bir satır → çok görünümlü organ doğru gösterilir.
  const bodyRows: { organ: OrganResolved; group: AtlasBackgroundGroup; count: number }[] = [];
  for (const o of resolved.organs) {
    for (const g of ALL_ATLAS_GROUPS) {
      if (o.byGroup[g] > 0) bodyRows.push({ organ: o, group: g, count: o.byGroup[g] });
    }
  }
  if (bodyRows.length === 0) return [];

  const headerFill = "ede9fe"; // violet-100
  const thin = { style: BorderStyle.SINGLE, size: 2, color: V_RULE } as const;
  const headerCells = ["", "Organ", "Görünüm", "Bölge Sayısı"].map((h, i) =>
    new TableCell({
      width: { size: [8, 46, 28, 18][i], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: headerFill, color: "auto" },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ keepNext: true, children: [new TextRun({ text: h, bold: true, size: 20, font: REPORT_FONT, color: V_ACCENT })] })],
    }),
  );
  const header = new TableRow({ tableHeader: true, cantSplit: true, children: headerCells });

  const rows = bodyRows.map(({ organ, group, count }) => {
    const swatch = rgbToHex(organ.color.stroke);
    const fill = rgbToHex(organ.color.fill);
    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill, color: "auto" },
          margins: { top: 40, bottom: 40, left: 60, right: 60 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "●", size: 18, font: REPORT_FONT, color: swatch })] })],
        }),
        cellText(clean(organ.label), 46),
        cellText(ATLAS_GROUP_LABEL[group], 28),
        cellText(String(count), 18),
      ],
    });
  });

  return [
    sectionHeading("Seçilen Organlar ve Atlas Bölgeleri"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin },
      rows: [header, ...rows],
    }),
    ...missingOrgansNote(resolved),
  ];
}

function cellText(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    margins: { top: 40, bottom: 40, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: REPORT_FONT, color: V_DARK })] })],
  });
}

function missingOrgansNote(resolved: ResolvedAtlas): Paragraph[] {
  if (resolved.missingOrgans.length === 0) return [];
  return [
    new Paragraph({
      children: [
        new TextRun({ text: "Atlas bölgesi bulunmayan organlar: ", italics: true, size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: clean(resolved.missingOrgans.join(", ")), italics: true, size: 18, font: REPORT_FONT, color: C_MID }),
      ],
      spacing: { before: 120, after: 0 },
    }),
  ];
}

// ─── Uygulama Notları callout (violet) ────────────────────────────────────────
function notesCallout(notes: string | null): ReportChild[] {
  const body = (notes ?? "").trim();
  if (!body) return []; // not yoksa bölüm YOK

  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const accent = V_ACCENT;
  const thin = { style: BorderStyle.SINGLE, size: 2, color: V_RULE } as const;
  const cell = new TableCell({
    shading: { type: ShadingType.CLEAR, fill: V_CARD_FILL, color: "auto" },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: "UYGULAMA NOTLARI", bold: true, size: 20, font: REPORT_FONT, color: accent, allCaps: true })],
        spacing: { after: 100 },
      }),
      ...paras.map((p, i) =>
        new Paragraph({
          children: [new TextRun({ text: clean(p), size: 22, font: REPORT_FONT, color: V_DARK })],
          spacing: { after: i === paras.length - 1 ? 0 : 140 },
          widowControl: true,
        }),
      ),
    ],
  });
  return [
    sectionHeading("Uygulama Notları"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: thin, bottom: thin, right: thin,
        left: { style: BorderStyle.SINGLE, size: 18, color: accent },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
      },
      rows: [new TableRow({ children: [cell] })],
    }),
  ];
}

// ─── Protokol gövdesi (single + bulk ortak) ───────────────────────────────────
export type ReflexologyProtocolInput = {
  index: number;
  title: string;
  description: string | null; // target_problem = Kısa Açıklama
  notes: string | null; // application_notes = Uygulama Notları
  organs: string[];
  createdAt: string;
  resolved: ResolvedAtlas;
};

async function protocolBody(
  input: ReflexologyProtocolInput,
  opts: { bulk: boolean; pageBreak: boolean },
): Promise<ReportChild[]> {
  const out: ReportChild[] = [];

  if (opts.bulk) {
    // Bulk: numaralı profil etiketi + başlık (yeni sayfadan).
    out.push(
      new Paragraph({
        children: [new TextRun({ text: `PROTOKOL #${String(input.index + 1).padStart(3, "0")}`, bold: true, size: 18, font: REPORT_FONT, color: V_EYEBROW, allCaps: true })],
        spacing: { before: 0, after: 60 },
        keepNext: true,
        ...(opts.pageBreak ? { pageBreakBefore: true } : {}),
      }),
      protocolTitleHeading(input.title),
    );
  }

  out.push(...summaryCard(input));
  for (const g of ALL_ATLAS_GROUPS) {
    out.push(...(await atlasMapSection(g, input.resolved)));
  }
  out.push(...organTable(input.resolved));
  out.push(...notesCallout(input.notes));
  return out;
}

// ─── Kullanılan görünümler (kapak metadata) ───────────────────────────────────
export function usedGroupsLabel(resolved: ResolvedAtlas): string {
  const used = ALL_ATLAS_GROUPS.filter((g) => resolved.regionsByGroup[g].length > 0);
  return used.length ? used.map((g) => ATLAS_GROUP_LABEL[g]).join(", ") : "—";
}

// ─── SINGLE rapor ─────────────────────────────────────────────────────────────
export async function buildSingleReport(
  input: ReflexologyProtocolInput,
  /** Raporun ÜRETİM tarihi (export anı, Türkiye takvimi). "Oluşturulma Tarihi". */
  reportDateLabel: string,
  /** Protokolün kayıt tarihi — ayrı "Protokol Tarihi" metadata'sı (opsiyonel). */
  protocolDateLabel?: string,
): Promise<ReportChild[]> {
  const totalRegions = input.resolved.organs.reduce((a, o) => a + o.totalRegions, 0);
  const meta: CoverMeta = [
    { label: "Oluşturulma Tarihi", value: reportDateLabel },
    ...(protocolDateLabel ? [{ label: "Protokol Tarihi", value: protocolDateLabel }] : []),
    { label: "Organ Sayısı", value: String(input.organs.length) },
    { label: "Toplam Atlas Bölgesi", value: String(totalRegions) },
    { label: "Kullanılan Görünümler", value: usedGroupsLabel(input.resolved) },
  ];
  const out: ReportChild[] = [
    ...buildCover(input.title, "Refleksoloji Protokol Raporu", meta),
    ...(await protocolBody(input, { bulk: false, pageBreak: false })),
  ];
  return out;
}

// ─── BULK rapor ───────────────────────────────────────────────────────────────
export async function buildBulkReport(
  inputs: ReflexologyProtocolInput[],
  createdLabel: string,
  scopeLabel: string,
): Promise<ReportChild[]> {
  const totalOrgans = new Set(inputs.flatMap((i) => i.organs.map((o) => o.trim().toLocaleLowerCase("tr")))).size;
  const meta: CoverMeta = [
    { label: "Oluşturulma Tarihi", value: createdLabel },
    { label: "Protokol Sayısı", value: String(inputs.length) },
    { label: "Kapsam", value: scopeLabel },
    { label: "Toplam Organ", value: String(totalOrgans) },
  ];
  const out: ReportChild[] = [...buildCover("Refleksoloji Protokol Kataloğu", "Klinik Protokol Kataloğu", meta)];
  for (let i = 0; i < inputs.length; i++) {
    out.push(...(await protocolBody(inputs[i], { bulk: true, pageBreak: true })));
  }
  return out;
}

// ─── Header / Footer (titlePage: kapakta boş) ─────────────────────────────────
export function reflexologyHeaders(): { default: Header; first: Header } {
  return {
    default: new Header({
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: V_RULE } },
        children: [new TextRun({ text: "Yaşam Sistemi · Refleksoloji", size: 16, font: REPORT_FONT, color: C_LIGHT, allCaps: true })],
      })],
    }),
    first: new Header({ children: [new Paragraph({ children: [] })] }),
  };
}

export function reflexologyFooters(): { default: Footer; first: Footer } {
  const line = (): Paragraph =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Refleksoloji Protokol Raporu  ·  Sayfa ", size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: " / ", size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: "  ·  Yaşam Sistemi", size: 16, font: REPORT_FONT, color: C_LIGHT }),
      ],
    });
  return {
    default: new Footer({ children: [line()] }),
    first: new Footer({ children: [new Paragraph({ children: [] })] }),
  };
}
