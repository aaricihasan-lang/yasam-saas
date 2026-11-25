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
import { expertSignatureBlock, type ExpertBranding, type ExpertBrandingVariant } from "@/lib/docx/expertBranding";
import {
  ALL_ATLAS_GROUPS,
  type AtlasBackgroundGroup,
  type ResolvedAtlas,
  type OrganResolved,
} from "./atlasRegionsCore";
import { renderAtlasGroupPng } from "./atlasImage";
// I18N-F1-R5 RAPOR-E (P21): sistem metinleri `reports.refleksoloji` → `reports.reflexology.*` (çıktı dili; TR birebir — golden).
// Organ adları (atlas eşleşme anahtarı) ve protokol içeriği çevrilmez.
import { reflexText } from "./reportText";

const T = (key: string, values?: Record<string, string | number>): string => reflexText().t(key, values);
const groupLabel = (g: AtlasBackgroundGroup): string => reflexText().group(g);

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
      children: [new TextRun({ text: T("brand"), bold: true, size: 26, font: REPORT_FONT, color: V_EYEBROW, allCaps: true })],
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
  rows.push([T("summary.organCount"), String(input.organs.length)]);
  const totalRegions = input.resolved.organs.reduce((a, o) => a + o.totalRegions, 0);
  rows.push([T("summary.totalRegions"), String(totalRegions)]);
  for (const g of ALL_ATLAS_GROUPS) {
    const count = input.resolved.regionsByGroup[g].length;
    if (count > 0) rows.push([T("summary.groupRegions", { group: groupLabel(g) }), String(count)]);
  }

  const out: ReportChild[] = [sectionHeading(T("summary.title"))];
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
    sectionHeading(T("map.heading", { group: groupLabel(group) })),
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
      new TextRun({ text: T("map.legend", { organ: clean(organ.label), count, shown: String(count) }), size: 20, font: REPORT_FONT, color: C_MID }),
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
/**
 * FA-41: "Seçilen Organlar" bölümü HER ZAMAN üretilir (protokolün kendi organ
 * etiketleri — atlas eşleşmesi olmasa da). Atlas tablosu YALNIZ eşleşen
 * organlar için; atlas bölgesi bulunmayan organlar notu da her zaman (varsa).
 * Eskiden eşleşme yoksa tüm bölüm (organ listesi + eksik notu) düşüyordu.
 */
function organTable(
  resolved: ResolvedAtlas,
  organLabels: string[],
  heading = T("organs.headingProtocol"),
): ReportChild[] {
  // Her (organ, grup) için bir satır → çok görünümlü organ doğru gösterilir.
  const bodyRows: { organ: OrganResolved; group: AtlasBackgroundGroup; count: number }[] = [];
  for (const o of resolved.organs) {
    for (const g of ALL_ATLAS_GROUPS) {
      if (o.byGroup[g] > 0) bodyRows.push({ organ: o, group: g, count: o.byGroup[g] });
    }
  }

  const labels = organLabels.map((o) => o.trim()).filter(Boolean);
  if (labels.length === 0 && bodyRows.length === 0) return [];

  const out: ReportChild[] = [sectionHeading(heading)];
  if (labels.length > 0) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: T("organs.selected"), bold: true, size: 20, font: REPORT_FONT, color: V_ACCENT }),
          new TextRun({ text: clean(labels.join(", ")), size: 20, font: REPORT_FONT, color: V_DARK }),
        ],
        spacing: { after: 160 },
      }),
    );
  }
  if (bodyRows.length === 0) {
    out.push(...missingOrgansNote(resolved));
    return out;
  }

  const headerFill = "ede9fe"; // violet-100
  const thin = { style: BorderStyle.SINGLE, size: 2, color: V_RULE } as const;
  const headerCells = ["", T("organs.colOrgan"), T("organs.colView"), T("organs.colRegions")].map((h, i) =>
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
        cellText(groupLabel(group), 28),
        cellText(String(count), 18),
      ],
    });
  });

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin },
      rows: [header, ...rows],
    }),
    ...missingOrgansNote(resolved),
  );
  return out;
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
        new TextRun({ text: T("organs.missing"), italics: true, size: 18, font: REPORT_FONT, color: C_LIGHT }),
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
        children: [new TextRun({ text: T("notes.callout"), bold: true, size: 20, font: REPORT_FONT, color: accent, allCaps: true })],
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
    sectionHeading(T("notes.heading")),
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
        children: [new TextRun({ text: T("protocolNo", { no: String(input.index + 1).padStart(3, "0") }), bold: true, size: 18, font: REPORT_FONT, color: V_EYEBROW, allCaps: true })],
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
  out.push(...organTable(input.resolved, input.organs));
  out.push(...notesCallout(input.notes));
  return out;
}

// ─── Kullanılan görünümler (kapak metadata) ───────────────────────────────────
export function usedGroupsLabel(resolved: ResolvedAtlas): string {
  const used = ALL_ATLAS_GROUPS.filter((g) => resolved.regionsByGroup[g].length > 0);
  return used.length ? used.map((g) => groupLabel(g)).join(", ") : "—";
}

// ─── SINGLE rapor ─────────────────────────────────────────────────────────────
// ─── REF-002: Sağlık/uyumluluk bilgilendirmesi (metin: reports.reflexology.disclaimer.text) ─────────────

/** Rapor sonuna eklenen profesyonel "Bilgilendirme" bölümü. */
function disclaimerSection(): ReportChild[] {
  return [
    new Paragraph({
      spacing: { before: 360, after: 80 },
      children: [
        new TextRun({ text: T("disclaimer.title"), bold: true, size: 20, font: REPORT_FONT, color: V_ACCENT }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: V_RULE } },
      children: [
        new TextRun({ text: T("disclaimer.text"), italics: true, size: 18, font: REPORT_FONT, color: C_MID }),
      ],
    }),
  ];
}

// ─── F3B: uzman "Hazırlayan" imza bloğu (isteğe bağlı) ─────────────────────────
/**
 * F3B: uzman rapor markalaması. Refleksoloji raporları bugün uzman adı GÖSTERMEZ; yalnız uzmanın "Raporlarımda kurumsal
 * bilgilerimi göster" anahtarı AÇIKKEN (route `resolveReportBranding(..., { purpose: "signature" })`) bilgilendirme
 * bölümünün ARDINDAN "Hazırlayan" imza kartı (+ uzman dipnotu) eklenir. Kapak, üst/alt bilgi ve bilgilendirme metni
 * DEĞİŞMEZ. null / yok → rapor bugünküyle birebir.
 */
export type ReflexologyBrandingOptions = { branding?: ExpertBranding | null; brandingVariant?: ExpertBrandingVariant };

/** A4 (11906) − 2 × 1134 kenar boşluğu = içerik genişliği (twip). */
const REFLEX_CONTENT_W = 11906 - 2 * 1134;

function signatureSection(o: ReflexologyBrandingOptions | undefined): ReportChild[] {
  return expertSignatureBlock(o?.branding, { variant: o?.brandingVariant, accent: V_ACCENT, contentWidth: REFLEX_CONTENT_W, fill: V_CARD_FILL, font: REPORT_FONT, common: reflexText().common });
}

export async function buildSingleReport(
  input: ReflexologyProtocolInput,
  /** Raporun ÜRETİM tarihi (export anı, Türkiye takvimi). "Oluşturulma Tarihi". */
  reportDateLabel: string,
  /** Protokolün kayıt tarihi — ayrı "Protokol Tarihi" metadata'sı (opsiyonel). */
  protocolDateLabel?: string,
  brand?: ReflexologyBrandingOptions,
): Promise<ReportChild[]> {
  const totalRegions = input.resolved.organs.reduce((a, o) => a + o.totalRegions, 0);
  const meta: CoverMeta = [
    { label: T("cover.generated"), value: reportDateLabel },
    ...(protocolDateLabel ? [{ label: T("cover.protocolDate"), value: protocolDateLabel }] : []),
    { label: T("cover.organCount"), value: String(input.organs.length) },
    { label: T("cover.totalRegions"), value: String(totalRegions) },
    { label: T("cover.usedViews"), value: usedGroupsLabel(input.resolved) },
  ];
  const out: ReportChild[] = [
    ...buildCover(input.title, T("cover.singleSubtitle"), meta),
    ...(await protocolBody(input, { bulk: false, pageBreak: false })),
    ...disclaimerSection(), // REF-002
    ...signatureSection(brand), // F3B (yalnız anahtar açıkken)
  ];
  return out;
}

// ─── BULK rapor ───────────────────────────────────────────────────────────────
export async function buildBulkReport(
  inputs: ReflexologyProtocolInput[],
  createdLabel: string,
  scopeLabel: string,
  brand?: ReflexologyBrandingOptions,
): Promise<ReportChild[]> {
  const totalOrgans = new Set(inputs.flatMap((i) => i.organs.map((o) => o.trim().toLocaleLowerCase("tr")))).size;
  const meta: CoverMeta = [
    { label: T("cover.generated"), value: createdLabel },
    { label: T("cover.protocolCount"), value: String(inputs.length) },
    { label: T("cover.scope"), value: scopeLabel },
    { label: T("cover.totalOrgans"), value: String(totalOrgans) },
  ];
  const out: ReportChild[] = [...buildCover(T("cover.catalogTitle"), T("cover.catalogSubtitle"), meta)];
  for (let i = 0; i < inputs.length; i++) {
    out.push(...(await protocolBody(inputs[i], { bulk: true, pageBreak: true })));
  }
  out.push(...disclaimerSection()); // REF-002
  out.push(...signatureSection(brand)); // F3B (yalnız anahtar açıkken)
  return out;
}

// ─── W07: KAYITLI ATLAS raporu ────────────────────────────────────────────────
/**
 * Kayıtlı Atlas Word raporu: kapak + görünüm başına BİRLEŞİK harita (tüm organlar, organ
 * başına sabit renk + lejant) + organ/görünüm/bölge tablosu + bilgilendirme. Görünüm başına
 * tek görsel (organ başına değil) → rapor boyutu organ sayısıyla büyümez (4,4 MB sınırı).
 */
export async function buildAtlasReport(
  resolved: ResolvedAtlas,
  reportDateLabel: string,
  scopeLabel: string,
  brand?: ReflexologyBrandingOptions,
): Promise<ReportChild[]> {
  const totalRegions = resolved.organs.reduce((a, o) => a + o.totalRegions, 0);
  const meta: CoverMeta = [
    { label: T("cover.generated"), value: reportDateLabel },
    { label: T("cover.scope"), value: scopeLabel },
    { label: T("cover.organCount"), value: String(resolved.organs.filter((o) => o.found).length) },
    { label: T("cover.totalRegions"), value: String(totalRegions) },
    { label: T("cover.usedViews"), value: usedGroupsLabel(resolved) },
  ];
  const out: ReportChild[] = [...buildCover(T("cover.atlasTitle"), T("cover.atlasSubtitle"), meta)];
  for (const g of ALL_ATLAS_GROUPS) {
    out.push(...(await atlasMapSection(g, resolved)));
  }
  out.push(...organTable(resolved, [], T("organs.headingAtlas")));
  out.push(...disclaimerSection()); // REF-002
  out.push(...signatureSection(brand)); // F3B (yalnız anahtar açıkken)
  return out;
}

// ─── Header / Footer (titlePage: kapakta boş) ─────────────────────────────────
export function reflexologyHeaders(): { default: Header; first: Header } {
  return {
    default: new Header({
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: V_RULE } },
        children: [new TextRun({ text: T("header"), size: 16, font: REPORT_FONT, color: C_LIGHT, allCaps: true })],
      })],
    }),
    first: new Header({ children: [new Paragraph({ children: [] })] }),
  };
}

export function reflexologyFooters(reportLabel: string = T("footer.protocol")): { default: Footer; first: Footer } {
  const line = (): Paragraph =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `${reportLabel}  ·  ${T("footer.page")} `, size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: " / ", size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: "  ·  Yaşam Sistemi", size: 16, font: REPORT_FONT, color: C_LIGHT }),
      ],
    });
  // REF-002: her sayfa altında kısa bilgilendirme (tam metin rapor içinde).
  const disclaimerLine = (): Paragraph =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: T("disclaimer.footer"),
          italics: true,
          size: 14,
          font: REPORT_FONT,
          color: C_LIGHT,
        }),
      ],
    });
  return {
    default: new Footer({ children: [disclaimerLine(), line()] }),
    first: new Footer({ children: [new Paragraph({ children: [] })] }),
  };
}
