/**
 * NKB-V3 — Profesyonel native Numeroloji Word raporu üretimi (server-only; route + kabir testi ortak).
 *
 * Ham metin dökümü YASAK: ekrandaki gerçek veri korunur ancak Heading/Paragraph/Table/shaded cell/
 * border/keepNext ile YAPILANDIRILMIŞ docx üretilir. Yeni yorum/hesap/özet ÜRETİLMEZ; yalnız sunum.
 *
 * Sekmeler (ekranla birebir): Sonuç Özeti · Analiz (Hesap Özetsiz) · Analiz (Hesap Özetli) ·
 * Taş Açıklamaları · Görsel Rapor. (İlişki/Ev-İş canlı giriş gerektirir → Word'de YOK.)
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
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
  type IParagraphOptions,
} from "docx";
import { calcDegisimByYearOnly, calcDegisimByFullDate, parseBirthDate } from "@/lib/numeroloji";
import { embedImageParagraph } from "@/lib/docx/reportHelpers";
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
import { extractMotorFromAnalysisJson, extractSummaryFromAnalysisData } from "../../utils/analysisJson";

// ── Tema ─────────────────────────────────────────────────────────────────────
const FONT = "Arial";
const MOR = "5B21B6";
const INDIGO = "3730A3";
const LIGHT_MOR = "F5F3FF";
const LIGHT_GRAY = "F8FAFC";
const BODY = "334155";
const SECONDARY = "64748B";
const WHITE = "FFFFFF";

const S_BODY = 21; // ~10.5pt
const S_H1 = 30;
const S_H2 = 24;
const S_H3 = 20;
const S_SMALL = 18;

const ANALIZ_LABELS: Record<string, string> = {
  "ana-kulvar": "Ana Kulvar", "yan-kulvar": "Yan Kulvar", "ifade-sayisi": "İfade Sayısı",
  "hayat-yolu": "Hayat Yolu", "cakra-omurga": "Çakra Omurga", element: "Element", diger: "Diğer",
};
const analizLabel = (k: string): string => ANALIZ_LABELS[k] ?? k;

// ── Küçük yardımcılar ──────────────────────────────────────────────────────────
function run(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({ text, font: FONT, size: opts.size ?? S_BODY, bold: opts.bold, color: opts.color ?? BODY });
}
function para(text: string, opts: Partial<IParagraphOptions> & { size?: number; color?: string; bold?: boolean } = {}): Paragraph {
  const { size, color, bold, ...p } = opts;
  return new Paragraph({
    spacing: { after: 90, line: 264 }, // ~1.15
    ...p,
    children: [run(text, { size, color, bold })],
  });
}
function noSpread(nr: unknown): string {
  if (!nr || typeof nr !== "object") return "—";
  const d = (nr as { display?: unknown }).display;
  return typeof d === "string" && d.trim() ? d.trim() : "—";
}

/** Mor şeritli bölüm başlığı (keepNext ile içerikten kopmaz). */
function sectionHeading(text: string, pageBreakBefore = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore,
    keepNext: true,
    spacing: { before: pageBreakBefore ? 0 : 220, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: INDIGO, space: 6 } },
    children: [new TextRun({ text: `  ${text}`, font: FONT, size: S_H2, bold: true, color: WHITE })],
  });
}
function subHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    spacing: { before: 140, after: 70 },
    children: [new TextRun({ text, font: FONT, size: S_H3, bold: true, color: INDIGO })],
  });
}

function cell(children: Paragraph[], opts: { fill?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children: children,
  });
}
function txtCell(text: string, opts: { fill?: string; bold?: boolean; color?: string; width?: number; header?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): TableCell {
  const p = new Paragraph({
    alignment: opts.align,
    spacing: { after: 0, line: 252 },
    children: [run(text, { bold: opts.bold || opts.header, color: opts.header ? WHITE : opts.color, size: opts.header ? S_SMALL : S_BODY })],
  });
  return cell([p], { fill: opts.header ? INDIGO : opts.fill, width: opts.width });
}

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
};

/** Başlık satırı tekrarlı (tableHeader) veri tablosu; satırlar bölünmez (cantSplit). */
function dataTable(headers: string[], rows: string[][], widths?: number[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) => txtCell(h, { header: true, width: widths?.[i] })),
  });
  const bodyRows = rows.map((r, ri) =>
    new TableRow({
      cantSplit: true,
      children: r.map((c, i) => txtCell(c, { fill: ri % 2 === 1 ? LIGHT_GRAY : WHITE, width: widths?.[i] })),
    }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [headerRow, ...bodyRows],
  });
}

/** Etiket-değer bilgi kartı (açık mor zemin). */
function infoCard(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: rows.map(([k, v], i) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell([new Paragraph({ spacing: { after: 0 }, children: [run(k, { bold: true, color: INDIGO, size: S_SMALL })] })], { fill: LIGHT_MOR, width: 34 }),
          cell([new Paragraph({ spacing: { after: 0 }, children: [run(v, { color: BODY })] })], { fill: i % 2 === 1 ? LIGHT_GRAY : WHITE, width: 66 }),
        ],
      }),
    ),
  });
}

// ── Belge başlığı + kişi kartı ───────────────────────────────────────────────
function brandHeaderAndPersonCard(reportType: string, adSoyad: string, birth: string, analiz: string, pageBreakBefore = false): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  // İnce mor marka bandı
  out.push(new Paragraph({
    pageBreakBefore,
    spacing: { after: 0 },
    shading: { type: ShadingType.CLEAR, fill: MOR, color: "auto" },
    children: [new TextRun({ text: "  YAŞAM SİSTEMİ", font: FONT, size: S_SMALL, bold: true, color: WHITE })],
  }));
  out.push(new Paragraph({
    spacing: { before: 60, after: 20 },
    children: [new TextRun({ text: "Numeroloji Raporu", font: FONT, size: S_H1, bold: true, color: INDIGO })],
  }));
  out.push(new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: reportType, font: FONT, size: S_H3, bold: true, color: MOR })],
  }));
  out.push(infoCard([
    ["Ad Soyad", adSoyad || "—"],
    ["Doğum Tarihi", birth || "—"],
    ["Analiz Tarihi", analiz || "—"],
  ]));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

// ── Yapılandırılmış motor bölümleri ─────────────────────────────────────────
type Motor = ReturnType<typeof extractMotorFromAnalysisJson>;

function pinGrupped(pin: unknown): string {
  const p = pin as Record<string, unknown> | null;
  if (!p) return "—";
  const g = (k: string) => String(p[k] ?? "—");
  return `${g("k1")} ${g("k2")} ${g("k3")} ${g("k4")}  |  ${g("k5")} ${g("k6")} ${g("k7")}  |  ${g("k8")} ${g("k9")}`;
}

function temelSayilarTable(motor: NonNullable<Motor>): Table {
  return dataTable(
    ["Değer", "Sonuç"],
    [
      ["Ana Kulvar", noSpread(motor.anaKulvar)],
      ["Yan Kulvar", noSpread(motor.yanKulvar)],
      ["İfade Sayısı", noSpread(motor.ifadeSayisi)],
      ["Hayat Yolu / DM", noSpread(motor.hayatYolu)],
      ["PIN Kodu", pinGrupped(motor.pinKodu)],
    ],
    [34, 66],
  );
}

function cakraTable(motor: NonNullable<Motor>): Table {
  const c = motor.cakraOmurgasi as { harfler?: Record<number, number>; sayilar?: Record<number, number> };
  const rows: string[][] = [];
  for (let n = 10; n >= 1; n -= 1) {
    const sol = c?.sayilar?.[n] ?? 0;
    const sag = c?.harfler?.[n] ?? 0;
    rows.push([`${n}. Çakra`, String(sol), String(sag)]);
  }
  return dataTable(["Çakra", "Sol (Sayı)", "Sağ (Harf/Destek)"], rows, [40, 30, 30]);
}

function elementBlocks(motor: NonNullable<Motor>): (Paragraph | Table)[] {
  const el = motor.elementler as { counts?: Record<string, number>; neutralCount?: number; key?: string };
  const order = ["Hava", "Su", "Ateş", "Toprak"];
  const dominant = (el?.key || "").trim();
  const rows = [order.map((e) => `${e}${dominant === e ? " ★" : ""}`), order.map((e) => String(el?.counts?.[e] ?? 0))];
  const out: (Paragraph | Table)[] = [];
  out.push(dataTable(rows[0], [rows[1]]));
  const extra: string[] = [];
  if (dominant) extra.push(`Baskın element: ${dominant}`);
  if (typeof el?.neutralCount === "number") extra.push(`Nötr: ${el.neutralCount}`);
  if (extra.length) out.push(para(extra.join("  ·  "), { color: SECONDARY, size: S_SMALL }));
  return out;
}

function degisimBlocks(birthDate: string): (Paragraph | Table)[] {
  const parts = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!parts) return [];
  const { day, month, year } = parts;
  const out: (Paragraph | Table)[] = [];
  const y = calcDegisimByYearOnly(year, month, 5).map((r) => [String(r.index), String(r.changeYear), `${r.chakra}. çakra`, `${r.effectStartYear}–${r.effectEndYear}`]);
  if (y.length) {
    out.push(subHeading("Doğum yılına göre"));
    out.push(dataTable(["Sıra", "Değişim Yılı", "Çakra", "Etki Dönemi"], y, [12, 26, 26, 36]));
  }
  const f = calcDegisimByFullDate(day, month, year, 5).map((r) => {
    const md = String(r.effectMonth).padStart(2, "0");
    const dd = String(r.effectDay).padStart(2, "0");
    return [String(r.index), String(r.changeYear), `${r.chakra}. çakra`, `${r.effectStartYear}.${md}.${dd} – ${r.effectEndYear}.${md}.${dd}`];
  });
  if (f.length) {
    out.push(subHeading("Gün ve ay dâhil"));
    out.push(dataTable(["Sıra", "Değişim Yılı", "Çakra", "Etki Dönemi"], f, [12, 22, 22, 44]));
  }
  return out;
}

function zirveTable(motor: NonNullable<Motor>): Table | null {
  const peaks = (motor.zirveYillari as { peaks?: { index: number; age: number; topic: string }[] } | null)?.peaks;
  if (!peaks?.length) return null;
  return dataTable(["Sıra", "Yaş", "Konu"], peaks.map((p) => [`${p.index}. zirve`, String(p.age), String(p.topic)]), [22, 18, 60]);
}

function mucadeleBlocks(motor: NonNullable<Motor>): (Paragraph | Table)[] {
  const m = motor.mucadeleYillari as { method1?: { index: number; age: number; topic: string }[]; method2?: { index: number; age: number; topic: string }[] } | null;
  if (!m) return [];
  const out: (Paragraph | Table)[] = [];
  if (m.method1?.length) {
    out.push(subHeading("1. yöntem (36 yıl arayla)"));
    out.push(dataTable(["Sıra", "Yaş", "Konu"], m.method1.map((p) => [`${p.index}. mücadele`, String(p.age), String(p.topic)]), [22, 18, 60]));
  }
  if (m.method2?.length) {
    out.push(subHeading("2. yöntem (9 yıl arayla)"));
    out.push(dataTable(["Sıra", "Yaş", "Konu"], m.method2.map((p) => [`${p.index}. mücadele`, String(p.age), String(p.topic)]), [22, 18, 60]));
  }
  return out;
}

function harflerTable(motor: NonNullable<Motor>): Table | null {
  const hy = motor.harflerinYankilanisi as { letter: string; chakra: number; ageStart: number; ageEnd: number; yearStart?: number; yearEnd?: number }[] | undefined;
  if (!Array.isArray(hy) || !hy.length) return null;
  return dataTable(
    ["Sıra", "Harf", "Çakra", "Yaş Aralığı", "Yıl Aralığı"],
    hy.map((s, i) => [
      String(i + 1), s.letter, `${s.chakra}. çakra`,
      `${s.ageStart}–${s.ageEnd}`,
      s.yearStart != null && s.yearEnd != null ? `${s.yearStart}–${s.yearEnd}` : "—",
    ]),
    [12, 14, 20, 27, 27],
  );
}

/** Hesap Özetsiz'in yapılandırılmış tablolarını (ham metin YOK) üretir. */
function hesapTablolari(motor: NonNullable<Motor>, birthDate: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(subHeading("Temel Sayılar"));
  out.push(temelSayilarTable(motor));
  out.push(subHeading("Çakra Omurgası"));
  out.push(cakraTable(motor));
  out.push(subHeading("Elementler"));
  out.push(...elementBlocks(motor));
  const deg = degisimBlocks(birthDate);
  if (deg.length) { out.push(subHeading("Değişim — Dönüşüm")); out.push(...deg); }
  const z = zirveTable(motor);
  if (z) { out.push(subHeading("Zirve Yılları")); out.push(z); }
  const muc = mucadeleBlocks(motor);
  if (muc.length) { out.push(subHeading("Mücadele Yılları")); out.push(...muc); }
  const harf = harflerTable(motor);
  if (harf) { out.push(subHeading("Harflerin Yankılanışı")); out.push(harf); }
  return out;
}

// ── Public tipler ────────────────────────────────────────────────────────────
export type WordRecordRow = { id: string; name: string; surname: string; birth_date: string; analysis_data: unknown; created_at: string };
export type WordStoneRow = { id: string; analysis_type: string; value: string; reason: string | null; stones: unknown };
export type WordSharedData = {
  knowledgeRows: KnowledgeRecordRow[];
  entries: SourceEntryRow[];
  sourceLabelById: Map<string, string>;
  stoneRows: WordStoneRow[];
};

function parseStones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

export function dataUrlToBuffer(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  try {
    const buf = Buffer.from(m[1]!, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

// ── Sekme içerikleri (yapılandırılmış) ───────────────────────────────────────
function summaryBlocks(motor: Motor, summary: string | null): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  if (motor) { out.push(subHeading("Temel Numeroloji Değerleri")); out.push(temelSayilarTable(motor)); }
  if (summary) {
    out.push(subHeading("Sonuç Özeti"));
    for (const block of summary.split(/\n{2,}/)) {
      const t = block.trim();
      if (t) out.push(para(t));
    }
  }
  return out;
}

function detailedYorumBlocks(matchedNotes: KnowledgeNote[], shared: WordSharedData): (Paragraph | Table)[] {
  const matchedRefs: MatchedNoteRef[] = matchedNotes.map((n) => ({ id: n.id, analysisType: n.analysisType, value: n.value }));
  const noteGroups: PersonSourceNoteGroup[] = personSourceNotesForRecords(matchedRefs, shared.entries, shared.sourceLabelById);
  const groupById = new Map(noteGroups.map((g) => [g.ref.id, g]));
  const out: (Paragraph | Table)[] = [];
  for (const note of matchedNotes) {
    const secs = resolveNoteSectionsForView(note).map((s) => ({ label: s.label, body: (s.body || "").trim() })).filter((s) => s.body !== "");
    const grp = groupById.get(note.id);
    if (secs.length === 0 && (!grp || grp.notes.length === 0)) continue;
    out.push(new Paragraph({
      keepNext: true,
      spacing: { before: 140, after: 60 },
      shading: { type: ShadingType.CLEAR, fill: LIGHT_MOR, color: "auto" },
      children: [new TextRun({ text: `  ${noteHeading(note.analysisType, note.value)}`, font: FONT, size: S_H3, bold: true, color: MOR })],
    }));
    for (const s of secs) {
      if (s.label) out.push(new Paragraph({ keepNext: true, spacing: { before: 60, after: 30 }, children: [run(s.label, { bold: true, color: INDIGO, size: S_SMALL })] }));
      out.push(para(s.body));
    }
    if (grp) {
      for (const nt of grp.notes) {
        out.push(new Paragraph({
          spacing: { before: 40, after: 60 },
          shading: { type: ShadingType.CLEAR, fill: LIGHT_GRAY, color: "auto" },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: MOR, space: 6 } },
          children: [
            new TextRun({ text: `Kaynak Notu${nt.label ? ` — ${nt.label}` : ""}: `, font: FONT, size: S_SMALL, bold: true, color: INDIGO }),
            run(nt.body.trim(), {}),
          ],
        }));
      }
    }
  }
  return out;
}

function tasBlocks(motor: Motor, shared: WordSharedData): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  if (!motor) return out;
  const seen = new Set<string>();
  for (const p of buildKnowledgeLookupPlan(motor)) {
    for (const value of p.values) {
      const st = shared.stoneRows.find((s) => s.analysis_type === p.analysisType && s.value === value);
      if (!st) continue;
      const key = `${st.analysis_type}::${st.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stones = parseStones(st.stones);
      if (!st.reason?.trim() && stones.length === 0) continue;
      out.push(new Paragraph({
        keepNext: true,
        spacing: { before: 140, after: 50 },
        shading: { type: ShadingType.CLEAR, fill: LIGHT_MOR, color: "auto" },
        children: [new TextRun({ text: `  ${analizLabel(st.analysis_type)} — ${st.value}`, font: FONT, size: S_H3, bold: true, color: MOR })],
      }));
      if (st.reason?.trim()) out.push(para(st.reason.trim()));
      if (stones.length > 0) {
        out.push(new Paragraph({ keepNext: true, spacing: { before: 40, after: 20 }, children: [run("Önerilen Taşlar", { bold: true, color: INDIGO, size: S_SMALL })] }));
        out.push(para(stones.join(", ")));
      }
    }
  }
  return out;
}

/** Bir kişinin seçilen sekmelerini yapılandırılmış olarak üretir; boş sekmeleri atlar + raporlar. */
export function buildPersonSections(
  row: WordRecordRow,
  sections: WordPersonSections,
  shared: WordSharedData,
  gorselBuf: Buffer | null,
): { children: (Paragraph | Table)[]; emptyTabs: WordTabKey[] } {
  const children: (Paragraph | Table)[] = [];
  const emptyTabs: WordTabKey[] = [];
  const motor = extractMotorFromAnalysisJson(row.analysis_data);
  const summary = extractSummaryFromAnalysisData(row.analysis_data);

  const matchedNotes: KnowledgeNote[] = [];
  if (motor && sections.detailed) {
    const seen = new Set<string>();
    for (const p of buildKnowledgeLookupPlan(motor)) {
      for (const nt of pickNotesForType(shared.knowledgeRows, p.analysisType, p.values, seen)) matchedNotes.push(nt);
    }
  }

  const add = (tab: WordTabKey, blocks: (Paragraph | Table)[], firstInDoc: boolean) => {
    if (blocks.length === 0) { emptyTabs.push(tab); return; }
    children.push(sectionHeading(WORD_TAB_LABELS[tab], !firstInDoc && children.length > 0));
    children.push(...blocks);
  };

  let first = true;
  for (const tab of WORD_TAB_ORDER) {
    if (!sections[tab]) continue;
    let blocks: (Paragraph | Table)[] = [];
    if (tab === "summary") blocks = summaryBlocks(motor, summary);
    else if (tab === "plain") blocks = motor ? hesapTablolari(motor, row.birth_date) : [];
    else if (tab === "detailed") {
      blocks = motor ? [...hesapTablolari(motor, row.birth_date)] : [];
      const yorum = detailedYorumBlocks(matchedNotes, shared);
      if (yorum.length) { blocks.push(sectionHeading("Bilgi Bankası Yorumları")); blocks.push(...yorum); }
      if (!motor && yorum.length === 0) blocks = [];
    } else if (tab === "tas") blocks = tasBlocks(motor, shared);
    else if (tab === "gorsel") blocks = gorselBuf ? [embedImageParagraph(gorselBuf, 600)] : [];

    const before = children.length;
    add(tab, blocks, first);
    if (children.length > before) first = false;
  }

  return { children, emptyTabs };
}

/** Tüm kişiler için docx child listesi + boş sekmeler + içerik var mı. Gereksiz kapak/özet/TOC YOK. */
export function buildNumerolojiWordChildren(
  rows: WordRecordRow[],
  sections: WordPersonSections,
  shared: WordSharedData,
  gorselBuf: Buffer | null,
): { children: (Paragraph | Table)[]; emptyTabs: WordTabKey[]; anyContent: boolean } {
  const selected = WORD_TAB_ORDER.filter((k) => sections[k]);
  const reportType = selected.length === 1 ? WORD_TAB_LABELS[selected[0]!] : "Seçili Bölümler";
  const all: (Paragraph | Table)[] = [];
  const emptyTabSet = new Set<WordTabKey>();
  let anyContent = false;

  rows.forEach((row, i) => {
    const adSoyad = `${row.name} ${row.surname}`.trim() || "—";
    const analiz = new Date(row.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
    all.push(...brandHeaderAndPersonCard(reportType, adSoyad, row.birth_date, analiz, i > 0));

    const { children, emptyTabs } = buildPersonSections(row, sections, shared, gorselBuf);
    for (const t of emptyTabs) emptyTabSet.add(t);
    if (children.length > 0) { anyContent = true; all.push(...children); }
  });

  return { children: all, emptyTabs: Array.from(emptyTabSet), anyContent };
}

function footer(): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Yaşam Sistemi · Numeroloji Raporu · Sayfa ", font: FONT, size: 16, color: SECONDARY }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: SECONDARY }),
        new TextRun({ text: " / ", font: FONT, size: 16, color: SECONDARY }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: SECONDARY }),
      ],
    })],
  });
}

/** docx child listesini gerçek .docx buffer'ına paketler (A4, ~1.8cm kenar). */
export async function packNumerolojiDocx(children: (Paragraph | Table)[]): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: S_BODY, color: BODY } } } },
    sections: [{
      properties: { page: { margin: { top: 1020, bottom: 1020, left: 1020, right: 1020 }, size: { width: 11906, height: 16838 } } },
      footers: { default: footer() },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
