/**
 * KUPA & HACAMAT — K2 — PROFESYONEL PROTOKOL WORD (.docx) ÜRETİCİSİ (SAF).
 *
 * AMAÇ: Uzmanın KAYDEDİLMİŞ protokolünü (bölgeler + teknikler + akış + güvenlik + hazırlık/sonrası/
 *   takip + bilgiler + kaynaklar) profesyonel, düzenlenebilir bir Word belgesine döker.
 *
 * OWNER-1: Bu belge UZMAN ÇALIŞMA / REFERANS kaydıdır (danışan-özel rapor DEĞİL). Danışan adı/alanı
 *   YOKTUR (protokol generic master'dır). Ancak tasarım, uzmanın isterse danışanına da gösterebileceği
 *   kalitededir. Belge başlığı "Hacamat Protokolü" (danışan raporu adlandırması yok).
 *
 * SAFLIK SÖZLEŞMESİ (test edilebilirlik): Bu dosya DB/auth/network İÇERMEZ; girdi tamamen çağıran
 *   (server route) tarafından tenant-güvenli toplanmış hazır veridir → harness gerçek DOCX üretip
 *   JSZip ile doğrulayabilir. Sistem içerik/hüküm ÜRETMEZ; yalnız verilen kayıtları temsil eder.
 *   Boş bölümler için başlık BASILMAZ. calendarWord.ts'ten AYRI (takvim düzeninden bağımsız).
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export const WORD_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Gövde sans-serif (okunaklı); başlıklar serif (premium his) — calendarWord ile aynı marka dili.
const FONT = "Calibri";
const HEAD_FONT = "Cambria";
const C_TITLE = "134E4A"; // derin teal — ana başlık
const C_BRAND = "0F766E"; // teal aksan — bölüm başlıkları
const C_DARK = "292524"; // gövde başlık
const C_MID = "57534E"; // ikincil metin
const C_LIGHT = "A8A29E"; // soluk / footer
const RULE_GRAY = "E7E2D8"; // ince çizgi
const C_CELL_FILL = "F3F1EA"; // tablo başlık zemini

/** A4 dikey sayfa (twips): 210mm × 297mm. */
const A4_PORTRAIT = { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT } as const;

// ── Girdi tipleri (yalnız builder'ın kullandığı alanlar; client tiplerinden BAĞIMSIZ) ──
export type ProtocolWordProtocol = {
  title: string;
  category?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  preparation_note?: string | null;
  aftercare_note?: string | null;
  follow_up_note?: string | null;
};
type NamedRef = { name: string; note?: string | null; extra?: string | null };
export type ProtocolWordStep = { title?: string | null; body: string; stage_label?: string | null };
export type ProtocolWordEntry = { title?: string | null; content: string; source_label?: string | null; locator?: string | null };
export type ProtocolWordSource = { name: string; type_label?: string | null; locator?: string | null; note?: string | null };

export type ProtocolWordInput = {
  protocol: ProtocolWordProtocol;
  points: NamedRef[];
  techniques: NamedRef[];
  steps: ProtocolWordStep[];
  safety: NamedRef[];
  entries: ProtocolWordEntry[];
  sources: ProtocolWordSource[];
};

// ═══════════════════════════════════════════════════════════════════════════
// Paragraf yardımcıları (docx TextRun metni GÜVENLİ serialize eder → manuel XML escape gereksiz).
// ═══════════════════════════════════════════════════════════════════════════

function isFilled(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** Ana belge başlığı. */
function titleParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text, bold: true, size: 40, font: HEAD_FONT, color: C_TITLE })],
  });
}

/** Bölüm başlığı (Heading 2 hissi) + altına ince çizgi. */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_GRAY, space: 4 } },
    children: [
      new TextRun({ text: text.toLocaleUpperCase("tr-TR"), bold: true, size: 22, font: HEAD_FONT, color: C_BRAND }),
    ],
  });
}

/** Düz gövde paragrafı (çok satırlı metni \n ile bölerek her satırı ayrı run yapar). */
function bodyParagraphs(text: string, color = C_MID): Paragraph[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(
      (line) =>
        new Paragraph({
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: line, size: 20, font: FONT, color })],
        }),
    );
}

/** Madde imli satır (nokta/teknik/güvenlik listeleri + opsiyonel not). */
function bulletParagraph(main: string, note?: string | null, extra?: string | null): Paragraph {
  const runs: TextRun[] = [new TextRun({ text: main, bold: true, size: 20, font: FONT, color: C_DARK })];
  if (isFilled(extra)) runs.push(new TextRun({ text: `  — ${extra}`, size: 18, font: FONT, color: C_LIGHT }));
  if (isFilled(note)) runs.push(new TextRun({ text: `\n${note}`, size: 20, font: FONT, color: C_MID }));
  return new Paragraph({ bullet: { level: 0 }, spacing: { before: 0, after: 60 }, children: runs });
}

/** Numaralı adım (Uygulama Akışı) — stage_label opsiyonel etiket + gövde. */
function stepParagraph(index: number, step: ProtocolWordStep): Paragraph[] {
  const headRuns: TextRun[] = [
    new TextRun({ text: `${index}. `, bold: true, size: 20, font: FONT, color: C_BRAND }),
  ];
  if (isFilled(step.title)) headRuns.push(new TextRun({ text: step.title, bold: true, size: 20, font: FONT, color: C_DARK }));
  if (isFilled(step.stage_label)) {
    headRuns.push(new TextRun({ text: `  [${step.stage_label}]`, size: 18, font: FONT, color: C_LIGHT }));
  }
  const out: Paragraph[] = [
    new Paragraph({ spacing: { before: 40, after: 20 }, children: headRuns }),
  ];
  for (const line of step.body.replace(/\r\n/g, "\n").split("\n")) {
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 20 },
        indent: { left: 300 },
        children: [new TextRun({ text: line, size: 20, font: FONT, color: C_MID })],
      }),
    );
  }
  return out;
}

/** Kaynaklar tablosu (Kaynak · Tür · Sayfa/Not). */
function sourcesTable(sources: ProtocolWordSource[]): Table {
  const headerCell = (t: string) =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, color: "auto", fill: C_CELL_FILL },
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 18, font: FONT, color: C_DARK })] })],
    });
  const bodyCell = (t: string) =>
    new TableCell({
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: t, size: 18, font: FONT, color: C_MID })] })],
    });
  const rows: TableRow[] = [
    new TableRow({ tableHeader: true, children: [headerCell("Kaynak"), headerCell("Tür"), headerCell("Sayfa / Not")] }),
  ];
  for (const s of sources) {
    const meta = [isFilled(s.locator) ? s.locator : null, isFilled(s.note) ? s.note : null]
      .filter(Boolean)
      .join(" · ");
    rows.push(
      new TableRow({
        children: [bodyCell(s.name), bodyCell(isFilled(s.type_label) ? s.type_label : "—"), bodyCell(meta || "—")],
      }),
    );
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE_GRAY, space: 4 } },
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: "", size: 2, font: FONT })],
      }),
      // OWNER-1: nötr kullanım notu (tıbbi/hukuki disclaimer DEĞİL) — TAM METİN sabit.
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [
          new TextRun({
            text: "Bu içerik, uzman tarafından oluşturulan çalışma ve bilgilendirme kaydının bir parçasıdır.",
            italics: true,
            size: 12,
            font: FONT,
            color: C_LIGHT,
          }),
        ],
      }),
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
          new TextRun({ text: "Hacamat Protokolü  •  Sayfa ", size: 13, font: FONT, color: C_LIGHT }),
          // Yalnız CURRENT sayfa (NUMPAGES/TOTAL_PAGES KULLANILMAZ — calendarWord ile aynı gerekçe:
          // sayfa sınırına denk gelen belgelerde Word yazdırma/PDF motorunu kilitleyebilir).
          new TextRun({ children: [PageNumber.CURRENT], size: 13, font: FONT, color: C_LIGHT }),
        ],
      }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Ana giriş noktası
// ═══════════════════════════════════════════════════════════════════════════

export async function buildProtocolWordBuffer(input: ProtocolWordInput): Promise<Buffer> {
  const { protocol, points, techniques, steps, safety, entries, sources } = input;
  const children: Paragraph[] | (Paragraph | Table)[] = [];

  // 1) Başlık
  children.push(titleParagraph(protocol.title));

  // 2) Özet / kategori / etiketler (yalnız dolu olanlar)
  const metaBits: string[] = [];
  if (isFilled(protocol.category)) metaBits.push(protocol.category);
  if (protocol.tags && protocol.tags.length > 0) metaBits.push(protocol.tags.join(", "));
  if (metaBits.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: metaBits.join("  ·  "), size: 18, font: FONT, color: C_LIGHT })],
      }),
    );
  }
  if (isFilled(protocol.summary)) {
    children.push(...bodyParagraphs(protocol.summary));
  }

  // 3) Noktalar / Bölgeler
  if (points.length > 0) {
    children.push(sectionHeading("Bölgeler / Noktalar"));
    for (const p of points) children.push(bulletParagraph(p.name, p.note, p.extra));
  }

  // 4) Teknikler
  if (techniques.length > 0) {
    children.push(sectionHeading("Teknikler"));
    for (const t of techniques) children.push(bulletParagraph(t.name, t.note, t.extra));
  }

  // 5) Uygulama Akışı
  if (steps.length > 0) {
    children.push(sectionHeading("Uygulama Akışı"));
    steps.forEach((s, i) => children.push(...stepParagraph(i + 1, s)));
  }

  // 6) Güvenlik
  if (safety.length > 0) {
    children.push(sectionHeading("Güvenlik / Dikkat"));
    for (const s of safety) children.push(bulletParagraph(s.name, s.note, s.extra));
  }

  // 7) Hazırlık — 8) Uygulama Sonrası — 9) Takip (yalnız dolu olanlar)
  if (isFilled(protocol.preparation_note)) {
    children.push(sectionHeading("Hazırlık"));
    children.push(...bodyParagraphs(protocol.preparation_note));
  }
  if (isFilled(protocol.aftercare_note)) {
    children.push(sectionHeading("Uygulama Sonrası"));
    children.push(...bodyParagraphs(protocol.aftercare_note));
  }
  if (isFilled(protocol.follow_up_note)) {
    children.push(sectionHeading("Takip / Sonraki Seans"));
    children.push(...bodyParagraphs(protocol.follow_up_note));
  }

  // 10) Bilgiler
  if (entries.length > 0) {
    children.push(sectionHeading("Bilgiler"));
    for (const e of entries) {
      if (isFilled(e.title)) {
        children.push(
          new Paragraph({
            spacing: { before: 40, after: 20 },
            children: [new TextRun({ text: e.title, bold: true, size: 20, font: FONT, color: C_DARK })],
          }),
        );
      }
      children.push(...bodyParagraphs(e.content));
      const src = [isFilled(e.source_label) ? e.source_label : null, isFilled(e.locator) ? e.locator : null]
        .filter(Boolean)
        .join(" · ");
      if (src) {
        children.push(
          new Paragraph({
            spacing: { before: 0, after: 40 },
            children: [new TextRun({ text: `Kaynak: ${src}`, italics: true, size: 16, font: FONT, color: C_LIGHT })],
          }),
        );
      }
    }
  }

  // 11) Kaynaklar (tablo)
  if (sources.length > 0) {
    children.push(sectionHeading("Kaynaklar"));
    (children as (Paragraph | Table)[]).push(sourcesTable(sources));
  }

  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: `Hacamat Protokolü — ${protocol.title}`,
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_PORTRAIT.width, height: A4_PORTRAIT.height, orientation: A4_PORTRAIT.orientation },
            margin: { top: 720, bottom: 900, left: 900, right: 900 },
          },
        },
        footers: { default: buildFooter() },
        children: children as (Paragraph | Table)[],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Server-generated güvenli dosya adı (path traversal / control char YOK; Türkçe korunur). */
export function protocolWordFilename(protocol: Pick<ProtocolWordProtocol, "title">): string {
  const safe = protocol.title
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, " ") // path/control karakterleri
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `Kupa-Protokolu-${safe || "Protokol"}.docx`;
}
