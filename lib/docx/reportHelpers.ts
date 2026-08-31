/**
 * Shared Word document builder utilities for Yaşam Sistemi reports.
 * All three dogaltas report routes import from here.
 */

import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// ─── Constants ────────────────────────────────────────────────────────────────

export const REPORT_FONT = "Calibri";
export const C_DARK = "1e293b";
export const C_MID  = "475569";
export const C_LIGHT = "94a3b8";

/** Accent colors per report section — corporate, not garish */
export const SECTION_COLORS = {
  stones:       "1e3a5f",  // deep navy blue
  minerals:     "064e3b",  // deep forest green
  combinations: "3b0764",  // deep violet
  knowledge:    "7c2d12",  // deep terracotta
  analytics:    "1e293b",  // dark slate
  summary:      "1e293b",
} as const;

export type SectionKey = keyof typeof SECTION_COLORS;

// ReportChild — union of all docx element types placed in section children
export type ReportChild = Paragraph | Table | TableOfContents;

// ─── Heading builders ─────────────────────────────────────────────────────────

/** Section heading — appears in TOC (depth 1) and Navigation Panel */
export function h1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
    pageBreakBefore: pageBreak,
    keepNext: true,
    keepLines: true,
    children: [new TextRun({ text, font: REPORT_FONT })],
  });
}

/**
 * Colored H1 — keeps Heading 1 style (TOC + Nav Panel) but overrides accent color.
 * Character-level color wins over paragraph style color in Word.
 */
export function h1Colored(text: string, color: string, pageBreak = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
    pageBreakBefore: pageBreak,
    keepNext: true,
    keepLines: true,
    children: [new TextRun({ text, bold: true, size: 32, font: REPORT_FONT, color })],
  });
}

/**
 * Optional heading layout controls. ADDITIVE — when omitted, output is byte-identical
 * to the previous single-arg form (mevcut çağıranlar etkilenmez):
 *   - pageBreakBefore: bölüm/kayıt yeni sayfadan başlasın.
 *   - keepNext: başlık takip eden paragrafla aynı sayfada kalsın (orphan azalt).
 *   - keepLines: başlık satırları bölünmesin (Aromaterapi orphan/pagination ihtiyacı).
 */
export type HeadingOptions = { pageBreakBefore?: boolean; keepNext?: boolean; keepLines?: boolean };

/** Item heading — appears in TOC (depth 2) and Navigation Panel */
export function h2(text: string, opts?: HeadingOptions): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 200 },
    ...(opts?.pageBreakBefore ? { pageBreakBefore: true } : {}),
    ...(opts?.keepNext ? { keepNext: true } : {}),
    ...(opts?.keepLines ? { keepLines: true } : {}),
    children: [new TextRun({ text, font: REPORT_FONT })],
  });
}

/** Field section heading — Navigation Panel only (TOC limited to depth 1-2) */
export function h3(text: string, opts?: HeadingOptions): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
    ...(opts?.pageBreakBefore ? { pageBreakBefore: true } : {}),
    ...(opts?.keepNext ? { keepNext: true } : {}),
    ...(opts?.keepLines ? { keepLines: true } : {}),
    children: [new TextRun({ text, font: REPORT_FONT })],
  });
}

// ─── Content builders ─────────────────────────────────────────────────────────

/** Cover or display line — centered, configurable size/bold/color */
export function coverLine(text: string, size: number, bold = false, color = C_MID): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: REPORT_FONT, color })],
    spacing: { after: 180 },
  });
}

/** Short one-line "Label: value" metadata — NOT a heading */
export function fieldInline(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: REPORT_FONT, color: C_DARK }),
      new TextRun({ text: value, size: 22, font: REPORT_FONT, color: C_MID }),
    ],
    spacing: { after: 100 },
  });
}

/**
 * Inline liste tipografisi — SUNUM-ONLY separator düzeltmesi. Virgül/noktalı-virgülle
 * ayrılmış "a,b, c" gibi bitişik değerleri "a, b, c" biçimine getirir; TOKEN/DEĞER
 * DEĞİŞTİRMEZ (yalnız ayırıcı boşluğu normalleştirir). main_components vb. list-string alanlar için.
 */
export function tidyInlineList(text: string): string {
  return text
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Body paragraph with left indent */
export function bodyText(text: string, size = 22): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size, font: REPORT_FONT, color: C_MID })],
    indent: { left: 360 },
    spacing: { after: 140 },
    widowControl: true,
  });
}

/**
 * Italic muted caption. keepNext:true — record-start Latince/altbaşlık satırı
 * kendinden sonraki içerikle (tablo/paragraf) birlikte kalır, sayfa dibinde yalnız kalmaz.
 */
export function muted(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: REPORT_FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 220 },
    keepNext: true,
  });
}

/** Thin horizontal rule */
export function divider(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
    spacing: { before: 280, after: 280 },
  });
}

/** Empty spacing paragraph */
export function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 200 } });
}

/**
 * Profile label — e.g. "DOĞALTAŞ #001" — small-caps style above item H2.
 * Not a heading.
 */
export function profileLabel(text: string, color: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: REPORT_FONT, color, bold: true, allCaps: true })],
    spacing: { before: 360, after: 60 },
    keepNext: true,
  });
}

/**
 * Array field section: H3 heading + bulleted list.
 * Returns [] if arr is null/empty — caller can spread directly.
 */
export function arraySection(label: string, arr: string[] | null): Paragraph[] {
  // Defensive: legacy/transfer rows may store a non-array JSONB value in a field
  // typed as string[] | null. A raw .filter on a non-array throws and can 500 the
  // whole report; treat any non-array as empty (report degrades, never crashes).
  const items = (Array.isArray(arr) ? arr : []).filter(Boolean);
  if (!items.length) return [];
  return [
    h3(label),
    ...items.map((item) =>
      new Paragraph({
        children: [
          new TextRun({ text: "·  ", size: 20, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ text: item.trim(), size: 20, font: REPORT_FONT, color: C_MID }),
        ],
        indent: { left: 360 },
        spacing: { after: 80 },
      })
    ),
  ];
}

// ─── Hyperlinks / DOI (additive, FAZ Word) ────────────────────────────────────

const C_LINK = "1d4ed8"; // blue-700

/** Yalnız http/https kabul edilir; başka şema (javascript:, data:) reddedilir. */
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const t = url.trim();
  return /^https?:\/\//i.test(t) && !/[\s<>"']/.test(t);
}

/**
 * Güvenli dış bağlantı satırı: "Label: <hyperlink>". Güvensiz/boş URL → düz metin
 * (execution taşımaz). Word'de gerçek tıklanabilir ExternalHyperlink relationship üretir.
 */
export function linkField(label: string, url: string | null | undefined, display?: string): Paragraph[] {
  const u = (url ?? "").trim();
  if (!u) return [];
  const labelRun = new TextRun({ text: `${label}: `, bold: true, size: 22, font: REPORT_FONT, color: C_DARK });
  if (!isSafeUrl(u)) {
    return [new Paragraph({ children: [labelRun, new TextRun({ text: display ?? u, size: 22, font: REPORT_FONT, color: C_MID })], spacing: { after: 100 } })];
  }
  return [new Paragraph({
    children: [
      labelRun,
      new ExternalHyperlink({
        link: u,
        children: [new TextRun({ text: display ?? u, size: 22, font: REPORT_FONT, color: C_LINK, underline: {} })],
      }),
    ],
    spacing: { after: 100 },
  })];
}

/** DOI → https://doi.org/<doi> tıklanabilir bağlantı. */
export function doiField(doi: string | null | undefined): Paragraph[] {
  const d = (doi ?? "").trim().replace(/^doi:\s*/i, "").replace(/^https?:\/\/doi\.org\//i, "");
  if (!d) return [];
  return linkField("DOI", `https://doi.org/${d}`, d);
}

// ─── Real bullet / numbered lists (additive) ───────────────────────────────────

/** Tek gerçek Word madde-imi (numPr → varsayılan bullet). */
export function bulletItem(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text: text.trim(), size: 22, font: REPORT_FONT, color: C_MID })],
    spacing: { after: 60 },
  });
}

/** H3 başlık + gerçek madde-imli liste. Boş → [] (çağıran spread eder). */
export function bulletList(label: string, items: (string | null | undefined)[]): Paragraph[] {
  const clean = items.map((s) => (s ?? "").trim()).filter(Boolean);
  if (!clean.length) return [];
  return [h3(label), ...clean.map(bulletItem)];
}

/**
 * Gerçek Word numbered-list için ortak abstract-numbering referansı.
 * Document({ numbering: { config: [stepsNumberingConfig()] } }) ile kaydedilir;
 * her adım paragrafı numbering:{reference, level:0, instance} kullanır → Word "1. 2. 3."
 * biçimini KENDİ üretir (metinde manuel "1. " prefix YOK → çift-numaralama olmaz).
 */
export const STEP_NUMBERING_REF = "aroma-ordered-steps";

/** Document.numbering.config'e verilecek tek düzeyli ondalık (1. 2. 3.) tanım. */
export function stepsNumberingConfig() {
  return {
    reference: STEP_NUMBERING_REF,
    levels: [{
      level: 0,
      format: LevelFormat.DECIMAL,
      text: "%1.",
      alignment: AlignmentType.LEFT,
      start: 1,
      style: { paragraph: { indent: { left: 640, hanging: 320 } } },
    }],
  };
}

/**
 * Sıralı adım listesi (order,text) → GERÇEK Word numbered list.
 * `instance` her ayrı liste için farklı verilirse Word numaralamayı 1'den yeniden başlatır
 * (aynı doküman içinde çok liste varsa devam-numaralama olmaz). Manuel numara prefix YOK.
 */
export function orderedSteps(
  label: string,
  steps: { order: number; text: string }[] | null | undefined,
  instance = 0,
): Paragraph[] {
  const clean = (steps ?? []).filter((s) => s && (s.text ?? "").trim());
  if (!clean.length) return [];
  const sorted = [...clean].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return [
    h3(label, { keepNext: true, keepLines: true }), // aromaterapi: "Uygulama Adımları" başlığı listeyle kalsın
    ...sorted.map((s) =>
      new Paragraph({
        numbering: { reference: STEP_NUMBERING_REF, level: 0, instance },
        children: [new TextRun({ text: s.text.trim(), size: 22, font: REPORT_FONT, color: C_MID })],
        spacing: { after: 60 },
        widowControl: true,
      }),
    ),
  ];
}

// ─── Repeating-header table (additive) ─────────────────────────────────────────

/**
 * Çok satırlı tablo; başlık satırı her yeni sayfada TEKRARLAR (tableHeader:true).
 * widths: yüzde toplamı ~100. Boş rows → [] (çağıran atlar).
 */
export function repeatingHeaderTable(headers: string[], widthsPct: number[], rows: string[][]): Table[] {
  if (!rows.length) return [];
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: widthsPct[i] ?? Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
        shading: { fill: "f1f5f9" },
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 20, font: REPORT_FONT, color: C_DARK })],
          spacing: { before: 80, after: 80 }, indent: { left: 100 },
          // Başlık satırı en az ilk veri satırıyla birlikte kalsın (tek başına orphan olmasın).
          keepNext: true,
        })],
      }),
    ),
  });
  const bodyRows = rows.map((cells) =>
    new TableRow({
      cantSplit: true,
      children: cells.map((c, i) =>
        new TableCell({
          width: { size: widthsPct[i] ?? Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({ text: c ?? "", size: 20, font: REPORT_FONT, color: C_MID })],
            spacing: { before: 60, after: 60 }, indent: { left: 100 },
          })],
        }),
      ),
    }),
  );
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] })];
}

// ─── Keep-together card (additive) ─────────────────────────────────────────────

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

/**
 * "Kayıt-başı birlikte-kalma" sarmalayıcısı — kenarlıksız, sıfır-kenar-boşluklu,
 * TEK satır + TEK hücreli, cantSplit:true bir tablo. İçindeki karışık paragraf/tablo
 * bloğu (ör. karışım adı + künye + "Formül" + formül tablosu) mevcut sayfaya sığmazsa
 * BÜTÜN olarak sonraki sayfaya iner (Word'ün tablo→paragraf keepNext'i güvenilir DEĞİL;
 * cantSplit satır güvenilirdir). Görünmez: kenarlık/gölge yok, içerik aynen render olur.
 *
 * NOT: Yalnız küçük/orta blok için kullanılır (çağıran boyut kararını verir). Bir sayfadan
 * uzun içerik verilirse Word cantSplit satırı yine de böler (kilitleme YOK) — güvenli degrade.
 * Hücre bir tabloyla bitemez (OOXML) → gerekirse minik (görünmez) kapanış paragrafı eklenir.
 */
export function keepTogetherCard(children: (Paragraph | Table)[]): Table {
  const kids: (Paragraph | Table)[] =
    children.length && children[children.length - 1] instanceof Paragraph
      ? children
      : [...children, new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "", size: 2 })] })];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    margins: { marginUnitType: WidthType.DXA, top: 0, bottom: 0, left: 0, right: 0 },
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        margins: { marginUnitType: WidthType.DXA, top: 0, bottom: 0, left: 0, right: 0 },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
        children: kids,
      })],
    })],
  });
}

// ─── Running header (additive) ─────────────────────────────────────────────────

export function buildHeader(text: string): Header {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" } },
      children: [new TextRun({ text, size: 16, font: REPORT_FONT, color: C_LIGHT, allCaps: true })],
    })],
  });
}

/** Inline runs supporting ^^bold^^ markers */
export function inlineRuns(text: string, size = 22): TextRun[] {
  return text.split("^^").flatMap((part, i) => {
    if (!part) return [];
    return [new TextRun({ text: part, bold: i % 2 === 1, size, font: REPORT_FONT, color: i % 2 === 1 ? C_DARK : C_MID })];
  });
}

// ─── Table builder ────────────────────────────────────────────────────────────

/**
 * İki sütunlu künye tablosu. keepNext:true → hücre paragrafları kendinden sonraki
 * blokla (ör. karışım künyesi → "Formül" başlığı → formül tablosu) birlikte kalır;
 * küçük/orta blok sayfa dibinde ikiye BÖLÜNMEZ, bütün olarak sonraki sayfaya iner.
 */
export function twoColTable(rows: [string, string][], opts?: { keepNext?: boolean }): Table {
  const kn = opts?.keepNext ?? false;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 22, font: REPORT_FONT, color: C_DARK })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
              keepNext: kn,
            })],
          }),
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: value, size: 22, font: REPORT_FONT, color: C_MID })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
              keepNext: kn,
            })],
          }),
        ],
      })
    ),
  });
}

// ─── Premium cover ────────────────────────────────────────────────────────────

export interface PremiumCoverOptions {
  title1: string;        // e.g. "YAŞAM SİSTEMİ"
  title2: string;        // e.g. "DOĞALTAŞ ANSİKLOPEDİSİ"
  subtitle: string;      // e.g. "Profesyonel Bilgi ve Referans Kataloğu"
  date: string;
  stats: { label: string; value: string }[];
}

export function buildPremiumCover(opts: PremiumCoverOptions): ReportChild[] {
  return [
    new Paragraph({ spacing: { before: 1200 } }),
    // Top accent rule
    new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: "cbd5e1" } },
      spacing: { before: 0, after: 0 },
    }),
    new Paragraph({ spacing: { after: 320 } }),
    // YAŞAM SİSTEMİ
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.title1, bold: true, size: 76, font: REPORT_FONT, color: C_DARK, allCaps: true })],
      spacing: { after: 160 },
    }),
    // Main title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.title2, size: 52, font: REPORT_FONT, color: C_MID })],
      spacing: { after: 180 },
    }),
    // Subtitle
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.subtitle, size: 26, font: REPORT_FONT, color: C_LIGHT, italics: true })],
      spacing: { after: 640 },
    }),
    // Mid rule
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
      spacing: { before: 0, after: 560 },
    }),
    // Date
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.date, size: 22, font: REPORT_FONT, color: C_LIGHT })],
      spacing: { after: 320 },
    }),
    // Stats (each on its own line, centered)
    ...opts.stats.map(({ label, value }) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: label + ":  ", size: 22, font: REPORT_FONT, color: C_MID }),
          new TextRun({ text: value, bold: true, size: 22, font: REPORT_FONT, color: C_DARK }),
        ],
        spacing: { after: 120 },
      })
    ),
    // Bottom rule
    new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: "cbd5e1" } },
      spacing: { before: 400, after: 0 },
    }),
  ];
}

// ─── Stats page ───────────────────────────────────────────────────────────────

/**
 * "RAPOR ÖZETİ" page — appears between cover and TOC (büyük/genel rapor).
 * Terminoloji compact front-matter ile birleşiktir (her ikisi de "RAPOR ÖZETİ").
 * rows: [label, value] pairs for the summary table.
 * extras: optional additional lines below the table.
 */
export function buildStatsPage(rows: [string, string][], extras?: string[]): ReportChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "RAPOR ÖZETİ", bold: true, size: 44, font: REPORT_FONT, color: C_DARK, allCaps: true })],
      pageBreakBefore: true,
      spacing: { before: 800, after: 640 },
    }),
    twoColTable(rows),
    ...(extras?.length ? [
      spacer(),
      ...extras.map((line) => new Paragraph({
        children: [new TextRun({ text: line, size: 20, font: REPORT_FONT, color: C_MID })],
        spacing: { after: 80 },
      })),
    ] : []),
  ];
}

/**
 * Kompakt front-matter — küçük seçili rapor (2–10 kayıt) için TEK sayfa:
 * "RAPOR ÖZETİ" (özet tablosu) + altında "İçindekiler" (gerçek TOC field).
 * TEK pageBreakBefore (başlıkta); araya ikinci sayfa kırılması KOYMAZ → özet+TOC ayrı
 * boş sayfalar oluşmaz. Başlıklar Heading STİLİ DEĞİL (düz paragraf) → TOC'a kendini eklemez.
 */
export function buildCompactFrontMatter(rows: [string, string][], includeTOC: boolean): ReportChild[] {
  const out: ReportChild[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "RAPOR ÖZETİ", bold: true, size: 40, font: REPORT_FONT, color: C_DARK, allCaps: true })],
      pageBreakBefore: true,
      keepNext: true,
      spacing: { before: 480, after: 360 },
    }),
    twoColTable(rows),
  ];
  if (includeTOC) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "İÇİNDEKİLER", bold: true, size: 30, font: REPORT_FONT, color: C_DARK })],
        keepNext: true,
        spacing: { before: 520, after: 260 },
      }),
      new TableOfContents("İçindekiler", { hyperlink: true, headingStyleRange: "1-2" }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: "Not: Belge düzenlenirse İçindekiler alanını Word üzerinden güncelleyebilirsiniz.",
          size: 18, font: REPORT_FONT, color: C_LIGHT, italics: true,
        })],
        spacing: { before: 240, after: 0 },
      }),
    );
  }
  return out;
}

// ─── Section divider page ─────────────────────────────────────────────────────

/**
 * Full-page visual separator before a main section.
 * Starts a new page; the subsequent h1Colored(…, true) starts yet another page.
 * Result: divider page → section content page.
 */
export function buildSectionDivider(title: string, subtitle: string, color: string): ReportChild[] {
  return [
    // New page: divider content
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "", size: 4 })],
      pageBreakBefore: true,
      spacing: { before: 2400 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 84, font: REPORT_FONT, color, allCaps: true })],
      spacing: { after: 320 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: subtitle, size: 30, font: REPORT_FONT, color: C_LIGHT, italics: true })],
      spacing: { after: 480 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color } },
      spacing: { before: 0, after: 0 },
    }),
  ];
}

// ─── TOC page ─────────────────────────────────────────────────────────────────

/**
 * Real Word TOC field (depth 1-2: H1 sections + H2 items).
 * H3 field headings appear only in Navigation Panel.
 * User must run: Başvurular → İçindekileri Güncelle for page numbers.
 */
export function buildTOCPage(): ReportChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "İÇİNDEKİLER", bold: true, size: 40, font: REPORT_FONT, color: C_DARK })],
      pageBreakBefore: true,
      spacing: { before: 800, after: 600 },
    }),
    new TableOfContents("İçindekiler", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: "Not: Belge düzenlenirse İçindekiler alanını Word üzerinden güncelleyebilirsiniz.",
        size: 18, font: REPORT_FONT, color: C_LIGHT, italics: true,
      })],
      spacing: { before: 320, after: 0 },
    }),
  ];
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function buildFooter(reportName: string): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Sayfa ", size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: " / ", size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: `  ·  ${reportName}`, size: 18, font: REPORT_FONT, color: C_LIGHT }),
      ],
    })],
  });
}

// ─── Image support ────────────────────────────────────────────────────────────

/** Extract first image URL from stones.images Array<{url:string}> field */
export function extractFirstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || !images.length) return null;
  const first = images[0];
  if (!first || typeof first !== "object") return null;
  const url = (first as Record<string, unknown>).url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/**
 * Extract first image reference (url + file_path) from stones.images.
 * F-016: private-bucket geçişinde file_path service_role ile download edilir;
 * url yalnız legacy/public fallback.
 */
export function extractFirstImageRef(
  images: unknown,
): { url: string | null; file_path: string | null } | null {
  if (!Array.isArray(images) || !images.length) return null;
  const first = images[0];
  if (!first || typeof first !== "object") return null;
  const rec = first as Record<string, unknown>;
  const url = typeof rec.url === "string" && rec.url.trim() ? rec.url.trim() : null;
  const file_path = typeof rec.file_path === "string" && rec.file_path.trim() ? rec.file_path.trim() : null;
  return url || file_path ? { url, file_path } : null;
}

/**
 * Storage objesini service_role ile indirir (public URL fetch gerektirmez).
 * F-016 (§8E): DOCX görsel embed'i, bucket private olsa dahi file_path ile çalışır.
 * `db` minimal storage arayüzü (SupabaseClient uyumlu). Hata → null (rapor çökmez).
 */
export async function fetchStorageImageBuffer(
  db: { storage: { from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }> } } },
  bucket: string,
  path: string,
): Promise<Buffer | null> {
  try {
    const { data, error } = await db.storage.from(bucket).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Fetch image bytes from URL with 5s timeout. Returns null on any error. */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/** Batch-fetch images (15 concurrent at a time). Returns null for failed fetches. */
export async function fetchImagesBatch(urls: (string | null)[]): Promise<(Buffer | null)[]> {
  const BATCH = 15;
  const out: (Buffer | null)[] = new Array(urls.length).fill(null);
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map((u) => (u ? fetchImageBuffer(u) : Promise.resolve(null)))
    );
    settled.forEach((r, j) => {
      out[i + j] = r.status === "fulfilled" ? r.value : null;
    });
  }
  return out;
}

/** Detect natural dimensions from PNG / JPEG buffer. Returns null if unknown. */
export function getImgDimensions(buf: Buffer): { w: number; h: number } | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      // PNG
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      // JPEG — scan for SOF0/SOF2 markers
      for (let i = 2; i < buf.length - 8; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

function detectImgType(buf: Buffer): "jpg" | "png" | "gif" | "bmp" {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "gif";
  return "jpg";
}

/**
 * Creates a centered image paragraph scaled to maxWidth (default 400px).
 * Falls back to 400×300 if natural dimensions can't be detected.
 */
export function embedImageParagraph(buf: Buffer, maxWidth = 400, maxHeight?: number): Paragraph {
  const dims = getImgDimensions(buf);
  const naturalW = dims?.w ?? 400;
  const naturalH = dims?.h ?? 300;
  // Aspect ratio korunur; asla natural boyuttan büyütülmez (min≤1). maxHeight verilirse
  // portre görsellerde sayfa taşmasını engellemek için yükseklik de sınırlanır (additive).
  const scale = Math.min(
    1,
    maxWidth / naturalW,
    maxHeight && maxHeight > 0 ? maxHeight / naturalH : 1,
  );
  const w = Math.round(naturalW * scale);
  const h = Math.round(naturalH * scale);

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: detectImgType(buf) })],
    spacing: { after: 200 },
  });
}

// ─── Callout box (additive) ───────────────────────────────────────────────────

/**
 * Print-friendly single-cell callout — soft fill + left accent border + bold label.
 * Uzman Notu / Dikkat Edilmesi Gerekenler gibi katmanları içerikten görsel olarak ayırır.
 * ADDITIVE: yeni export; mevcut helper davranışları değişmez. Metin plain TextRun
 * (docx XML-escape'ler → HTML injection yok). Nested/karmaşık layout kullanılmaz →
 * Word/LibreOffice dayanıklı.
 */
export function calloutBox(
  label: string,
  body: string,
  accentHex: string,
  fillHex: string,
): Table {
  const thin = { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" } as const;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: thin,
      bottom: thin,
      right: thin,
      left: { style: BorderStyle.SINGLE, size: 18, color: accentHex },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: fillHex, color: "auto" },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: label, bold: true, size: 20, font: REPORT_FONT, color: accentHex, allCaps: true })],
                spacing: { after: 60 },
              }),
              new Paragraph({
                children: [new TextRun({ text: body, size: 22, font: REPORT_FONT, color: C_DARK })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ─── XML-safe text (additive) ─────────────────────────────────────────────────

/**
 * OOXML'i bozan XML 1.0 ILLEGAL kontrol karakterlerini kaldırır. İzin verilenler
 * (TAB \t, LF \n, CR \r) ve Türkçe/tüm normal Unicode KORUNUR. İçerik/anlam değişmez;
 * yalnız belge XML güvenliği. (DB mutation YOK — bu yalnız render-boundary temizliğidir.)
 */
export function sanitizeXmlText(input: string): string {
  // XML 1.0 gecersiz kontrol karakterleri (asagidaki aralik) kaldirilir; TAB/LF/CR ve
  // Turkce dahil tum normal Unicode KORUNUR. RegExp ASCII-kaynak (literal kontrol char yok).
  const XML_INVALID = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]", "g");
  return input.replace(XML_INVALID, "");
}
