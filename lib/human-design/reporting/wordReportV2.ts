/**
 * HD AŞAMA 4B — Profesyonel Word/DOCX v2 · SAF BELGE KURUCUSU (hd-report-2)
 * =========================================================================
 *
 * Girdi: DONMUŞ HdReportSnapshotV2 (+ indirme anında uygulanmış yetki filtresi). Çıktı: docx
 * Document / Buffer. DB / auth / ağ YOK — görseller (BodyGraph, logo) hazır Buffer olarak gelir.
 * Mevcut lib/docx/reportHelpers toolkit'i ve v1'in SAF prose dönüştürücüsü REUSE edilir.
 *
 * Bölüm sırası: Kapak → Danışan ve Harita Kimliği → BodyGraph → Design / Personality →
 * Merkezler → Kanallar → Kapılar → Uzman Bilgilerim (varsa) → Sistem Yorumu (varsa) →
 * Kaynak Bilgisi. Boş bölüm OLUŞTURULMAZ. Uzman içeriği ile Sistem Yorumu AYRI başlık ve
 * kaynak etiketi taşır; birbirine karışmaz.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  buildFooter,
  buildHeader,
  buildWellnessNoteSection,
  bodyText,
  calloutBox,
  divider,
  embedImageParagraph,
  getImgDimensions,
  h1,
  h2,
  h3,
  muted,
  sanitizeXmlText,
  twoColTable,
  REPORT_FONT,
  C_DARK,
  C_LIGHT,
  C_MID,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import { formatDateOnly, formatDateLoose, formatInstantDate } from "@/lib/time/reportTime";
import {
  planetLabelTr,
  type FrozenActivation,
  type FrozenExpertEntry,
  type HdReportSnapshotV2,
} from "./reportSnapshotV2";
import type { SystemReadingDetail, SystemReadingDto } from "@/lib/human-design/providers/roxy/systemReading";
import { toPlanetName } from "@/lib/human-design/providers/roxy/normalize";

const REPORT_NAME = "Human Design Profesyonel Analiz Raporu · yasamsistemi.com";
const HEADER_TEXT = "Human Design · Yaşam Sistemi";
export const HD_REPORT_SITE = "yasamsistemi.com";

/** A4 (twip) + 2 cm kenar boşluğu → basılabilir genişlik ≈ 16,7 cm. */
const A4 = { width: 11906, height: 16838 } as const;
const MARGIN = 1134;
/** BodyGraph: basılabilir alan içinde, başlıkla aynı sayfaya sığan en büyük boyut (px @96dpi). */
export const HD_BODYGRAPH_DOC_MAX = { width: 600, height: 800 } as const;

const SIDE_TR = { design: "Design", personality: "Personality" } as const;

export type WordReportV2Options = {
  /** Sunucuda doğrulanmış BodyGraph görseli (PNG/JPG buffer). */
  bodygraphImage?: Buffer | null;
  /** Yaşam Sistemi logosu (şeffaf PNG). */
  logo?: Buffer | null;
  expertName?: string | null;
  /** İndirme anında Sistem Yorumu güncel yetki nedeniyle çıkarıldı mı? */
  systemReadingRedacted?: boolean;
};

// ── Küçük yardımcılar ────────────────────────────────────────────────────────────
function run(text: string, o: { size?: number; bold?: boolean; color?: string; italics?: boolean; allCaps?: boolean } = {}): TextRun {
  return new TextRun({
    text: sanitizeXmlText(text),
    font: REPORT_FONT,
    size: o.size ?? 22,
    bold: o.bold,
    italics: o.italics,
    allCaps: o.allCaps,
    color: o.color ?? C_MID,
  });
}

function centered(text: string, o: Parameters<typeof run>[1] & { before?: number; after?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: o.before ?? 0, after: o.after ?? 120 },
    children: [run(text, o)],
  });
}

function labelLine(label: string): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 140, after: 60 },
    children: [run(label, { bold: true, size: 21, color: C_DARK })],
  });
}

/**
 * Düz metin → paragraflar (YORUMLANMAZ: markdown/liste dönüşümü YOK, metin aynen korunur).
 * Boş satır = yeni paragraf; tek satır sonu = aynı paragrafta satır sonu (uygulamadaki
 * whitespace-pre-wrap görünümüyle aynı).
 */
function plainParagraphs(text: string): Paragraph[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        new Paragraph({
          spacing: { after: 120, line: 300 },
          widowControl: true,
          children: p.split("\n").map(
            (line, i) =>
              new TextRun({ text: sanitizeXmlText(line), break: i > 0 ? 1 : undefined, font: REPORT_FONT, size: 22, color: C_MID }),
          ),
        }),
    );
}

/** Sağlayıcı gezegen etiketi Türkçe değilse (ör. "Pluto") uygulama sözlüğüyle Türkçeleştir. */
function systemPlanetLabel(raw: string | null): string {
  if (!raw) return "—";
  const p = toPlanetName(raw);
  return p ? planetLabelTr(p) : raw;
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" } as const;

/**
 * Okunaklı veri tablosu: başlık satırı her sayfada tekrar eder, satırlar bölünmez, hücreler
 * çok satır (string[]) taşıyabilir. Genişlikler yüzde; tablo sayfa genişliğini aşmaz.
 */
function dataTable(headers: string[], widthsPct: number[], rows: (string | string[])[][]): Table {
  const cell = (content: string | string[], i: number, header: boolean) =>
    new TableCell({
      width: { size: widthsPct[i], type: WidthType.PERCENTAGE },
      shading: header ? { fill: "f1f5f9" } : undefined,
      borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
      children: (Array.isArray(content) ? (content.length ? content : [""]) : [content]).map(
        (line) =>
          new Paragraph({
            keepNext: header,
            spacing: { before: 60, after: 60 },
            indent: { left: 100, right: 60 },
            children: [run(line, header ? { bold: true, size: 20, color: C_DARK } : { size: 20 })],
          }),
      ),
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
    ],
  });
}

function scaledImage(buf: Buffer, maxW: number, maxH: number): Paragraph {
  const d = getImgDimensions(buf);
  if (!d) return embedImageParagraph(buf, maxW, maxH);
  // Yüksek çözünürlüklü kaynak: doküman boyutu sınırlar içinde KÜÇÜLTÜLÜR (piksel verisi korunur
  // → baskıda net). Oran bozulmaz; kaynak küçükse büyütülmez.
  const scale = Math.min(1, maxW / d.w, maxH / d.h);
  const w = Math.round(d.w * scale);
  const h = Math.round(d.h * scale);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: buf[0] === 0x89 ? "png" : "jpg" })],
  });
}

// ── 1) Kapak ────────────────────────────────────────────────────────────────────
function buildCover(s: HdReportSnapshotV2, genDate: string, logo: Buffer | null): ReportChild[] {
  const out: ReportChild[] = [new Paragraph({ spacing: { before: 600 } })];
  if (logo && getImgDimensions(logo)) out.push(scaledImage(logo, 240, 180));
  out.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "cbd5e1" } },
      spacing: { before: 360, after: 480 },
    }),
    centered("YAŞAM SİSTEMİ", { size: 56, bold: true, color: C_DARK, after: 160 }),
    centered("HUMAN DESIGN", { size: 40, color: C_MID, after: 120 }),
    centered("PROFESYONEL ANALİZ RAPORU", { size: 26, color: C_LIGHT, after: 720 }),
    centered(s.client.name, { size: 36, bold: true, color: C_DARK, after: 200 }),
    centered(`Rapor Tarihi: ${genDate}`, { size: 22, after: 1400 }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "cbd5e1" } },
      spacing: { before: 0, after: 200 },
    }),
    centered(HD_REPORT_SITE, { size: 22, color: C_MID, after: 0 }),
  );
  return out;
}

// ── 2) Kimlik ───────────────────────────────────────────────────────────────────
function buildIdentity(s: HdReportSnapshotV2, genDate: string): ReportChild[] {
  const rows: [string, string][] = [["Ad Soyad", s.client.name]];
  if (s.client.birthDate) {
    rows.push(["Doğum Tarihi", formatDateOnly(s.client.birthDate, { style: "long" }) || formatDateLoose(s.client.birthDate, { style: "long" })]);
  }
  if (s.client.birthTime) rows.push(["Doğum Saati (yerel)", s.client.birthTime]);
  if (s.client.birthPlace) rows.push(["Doğum Yeri", s.client.birthPlace]);
  if (s.client.timezone) rows.push(["Saat Dilimi", s.client.timezone]);
  if (s.identity.type) rows.push(["Tip", s.identity.type]);
  if (s.identity.profile) rows.push(["Profil", s.identity.profile]);
  if (s.identity.authority) rows.push(["İç Otorite", s.identity.authority]);
  if (s.identity.definition) rows.push(["Tanım", s.identity.definition]);
  if (s.identity.cross) rows.push(["Enkarnasyon Haçı", `${s.identity.cross.name} · ${s.identity.cross.gates}`]);
  rows.push(["Harita Kaynağı", s.chart.source === "computed" ? "Otomatik hesaplama" : "Manuel kayıt"]);
  rows.push(["Rapor Tarihi", genDate]);
  // Gövde ayrı bölümde (yeni sayfa) başlar → burada ek sayfa sonu YOK (boş sayfa oluşmaz).
  return [h1("Danışan ve Harita Kimliği"), twoColTable(rows)];
}

// ── 3) BodyGraph ────────────────────────────────────────────────────────────────
function buildBodygraph(s: HdReportSnapshotV2, img: Buffer | null): ReportChild[] {
  const out: ReportChild[] = [h1("BodyGraph", true)];
  if (img && getImgDimensions(img)) {
    out.push(scaledImage(img, HD_BODYGRAPH_DOC_MAX.width, HD_BODYGRAPH_DOC_MAX.height));
    out.push(
      muted(
        s.bodygraph.status === "uploaded_image"
          ? "Danışan profiline yüklenmiş Human Design harita görseli."
          : "Kayıtlı haritadan üretilmiş Human Design BodyGraph görseli.",
      ),
    );
  } else {
    out.push(
      calloutBox(
        "BodyGraph görseli eklenemedi",
        "Bu rapor oluşturulurken BodyGraph görseli üretilemedi ve danışan profilinde kayıtlı bir harita görseli bulunmadı. Teknik harita verileri aşağıdaki bölümlerde eksiksiz yer almaktadır.",
        "b45309",
        "fffbeb",
      ),
    );
  }
  return out;
}

// ── 4) Design / Personality ─────────────────────────────────────────────────────
function activationRows(list: FrozenActivation[]): string[][] {
  return list.map((a) => [planetLabelTr(a.planet), `${a.gate}.${a.line}`]);
}

function buildActivations(s: HdReportSnapshotV2): ReportChild[] {
  if (s.activations.status === "unavailable") return []; // manuel kayıt: bölüm yok
  const out: ReportChild[] = [h1("Design / Personality Aktivasyonları", true)];
  if (s.activations.status === "invalid") {
    out.push(bodyText("Kayıtlı aktivasyon verisi doğrulanamadığı için bu bölüm gösterilmiyor."));
    return out;
  }
  out.push(muted("Kapı.Çizgi biçiminde; ör. 56.2 = Kapı 56, Çizgi 2."));
  out.push(h2("Design (bilinçdışı) — 13 aktivasyon", { keepNext: true }));
  out.push(dataTable(["Gezegen", "Kapı.Çizgi"], [60, 40], activationRows(s.activations.design)));
  out.push(h2("Personality (bilinçli) — 13 aktivasyon", { keepNext: true }));
  out.push(dataTable(["Gezegen", "Kapı.Çizgi"], [60, 40], activationRows(s.activations.personality)));
  return out;
}

// ── 5–7) Merkezler / Kanallar / Kapılar ──────────────────────────────────────────
function buildCenters(s: HdReportSnapshotV2): ReportChild[] {
  if (s.centers.length === 0) return [];
  const defined = s.centers.filter((c) => c.defined).length;
  return [
    h1("Merkezler", true),
    muted(`${defined} tanımlı · ${s.centers.length - defined} açık merkez`),
    dataTable(["Merkez", "Durum"], [65, 35], s.centers.map((c) => [c.label, c.defined ? "Tanımlı" : "Açık"])),
  ];
}

function buildChannels(s: HdReportSnapshotV2): ReportChild[] {
  if (s.channels.length === 0 && s.gates.length === 0) return [];
  const out: ReportChild[] = [h1("Kanallar")];
  if (s.channels.length === 0) {
    out.push(bodyText("Bu haritada tanımlı kanal bulunmuyor."));
  } else {
    out.push(dataTable(["Kanal", "Kapılar"], [70, 30], s.channels.map((c) => [c.label, `${c.gates[0]} – ${c.gates[1]}`])));
  }
  return out;
}

function buildGates(s: HdReportSnapshotV2): ReportChild[] {
  if (s.gates.length === 0) return [];
  const rows = s.gates.map((g) => [
    g.label,
    g.center ?? "—",
    g.activations.length
      ? g.activations.map((a) => `${SIDE_TR[a.side]} · ${planetLabelTr(a.planet)} · ${g.gate}.${a.line}`)
      : ["—"],
    g.channel ?? "—",
  ]);
  return [h1("Kapılar"), muted(`${s.gates.length} aktif kapı`), dataTable(["Kapı", "Merkez", "Aktivasyon", "Kanal"], [34, 18, 34, 14], rows)];
}

// ── 8) Uzman Bilgilerim ─────────────────────────────────────────────────────────
function buildExpert(s: HdReportSnapshotV2): ReportChild[] {
  const { expert } = s.commentary;
  if (!expert.included || expert.entries.length === 0) return [];
  const out: ReportChild[] = [
    h1("Uzman Bilgilerim", true),
    muted("Kaynak: Raporu hazırlayan uzmanın kendi Human Design Bilgi Bankası. Bu haritanın başlıklarıyla eşleşen kayıtlar aşağıdadır."),
  ];
  let current = "";
  for (const e of expert.entries as FrozenExpertEntry[]) {
    if (e.category !== current) {
      current = e.category;
      out.push(h2(current, { keepNext: true }));
    }
    out.push(h3(e.title, { keepNext: true }));
    // Uzman metni AYNEN (kısaltma/markdown dönüşümü yok; numaralar, satırlar korunur).
    out.push(...plainParagraphs(e.content));
  }
  return out;
}

// ── 9) Sistem Yorumu ────────────────────────────────────────────────────────────
function detailBlocks(details: SystemReadingDetail[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const d of details) {
    out.push(labelLine(d.label));
    out.push(...plainParagraphs(d.text));
  }
  return out;
}

function buildSystem(reading: SystemReadingDto | null): ReportChild[] {
  if (!reading) return [];
  const out: ReportChild[] = [
    h1("Sistem Yorumu", true),
    muted(
      "Kaynak: Harita hesaplanırken hesaplama servisinden alınıp kaydedilmiş sistem açıklamaları. Bu bölüm uzman yorumu değildir; raporu hazırlayan uzmanın bilgileri ayrı bölümdedir.",
    ),
  ];

  const general = reading.general.filter((g) => g.value || g.details.length);
  if (general.length) {
    out.push(h2("Genel Human Design Açıklamaları", { keepNext: true }));
    for (const g of general) {
      out.push(h3(g.value ? `${g.title}: ${g.value}` : g.title, { keepNext: g.details.length > 0 }));
      out.push(...detailBlocks(g.details));
    }
  }

  const centers = reading.centers.filter((c) => c.theme || c.notSelfQuestion || c.biology);
  if (centers.length) {
    out.push(h2("Merkez Açıklamaları", { keepNext: true }));
    for (const c of centers) {
      const state = c.defined === null ? "" : c.defined ? " — Tanımlı" : " — Açık";
      out.push(h3(`${c.name}${state}`, { keepNext: true }));
      out.push(
        ...detailBlocks(
          [
            c.theme ? { label: "Tema", text: c.theme } : null,
            c.notSelfQuestion ? { label: "Benlik-dışı soru", text: c.notSelfQuestion } : null,
            c.biology ? { label: "Biyoloji", text: c.biology } : null,
          ].filter((d): d is SystemReadingDetail => d !== null),
        ),
      );
    }
  }

  const channels = reading.channels.filter((c) => c.description || c.circuitDescription);
  if (channels.length) {
    out.push(h2("Kanal Açıklamaları", { keepNext: true }));
    for (const c of channels) {
      const head = [c.id ? `Kanal ${c.id}` : "Kanal", c.name].filter(Boolean).join(" — ");
      out.push(h3(head, { keepNext: true }));
      out.push(
        ...detailBlocks(
          [
            c.circuit ? { label: "Devre", text: c.circuit } : null,
            c.description ? { label: "Açıklama", text: c.description } : null,
            c.circuitDescription ? { label: "Devre açıklaması", text: c.circuitDescription } : null,
          ].filter((d): d is SystemReadingDetail => d !== null),
        ),
      );
    }
  }

  const acts = reading.activations.filter((a) => a.gateDescription || a.lineMeaning || a.planetDescription);
  if (acts.length) {
    out.push(h2("Kapı / Çizgi / Gezegen Açıklamaları", { keepNext: true }));
    for (const a of acts) {
      const head = `${SIDE_TR[a.side]} · ${systemPlanetLabel(a.planet)} · ${a.gate}.${a.line}${a.gateName ? ` — ${a.gateName}` : ""}`;
      out.push(h3(head, { keepNext: true }));
      out.push(
        ...detailBlocks(
          [
            a.gateDescription ? { label: "Kapı", text: a.gateDescription } : null,
            a.lineMeaning ? { label: "Çizgi", text: a.lineMeaning } : null,
            a.planetDescription ? { label: "Gezegen", text: a.planetDescription } : null,
          ].filter((d): d is SystemReadingDetail => d !== null),
        ),
      );
    }
  }
  return out;
}

// ── 10) Kaynak bilgisi / kapanış ─────────────────────────────────────────────────
function buildClosing(s: HdReportSnapshotV2, genDate: string, opts: WordReportV2Options): ReportChild[] {
  const { expert, system } = s.commentary;
  const lines: string[] = [
    "Teknik harita bilgileri (tip, profil, otorite, tanım, haç, aktivasyonlar, merkezler, kanallar, kapılar) kayıtlı Human Design haritasından alınmıştır.",
  ];
  if (expert.included) {
    lines.push(
      expert.entries.length
        ? `Uzman Bilgilerim: raporu hazırlayan uzmanın kendi Bilgi Bankası'ndan ${expert.entries.length} eşleşen kayıt.`
        : "Uzman Bilgilerim: uzmanın Bilgi Bankası'nda bu haritayla eşleşen kayıt bulunmadığından bu raporda uzman yorumu yer almıyor.",
    );
  }
  if (opts.systemReadingRedacted) {
    lines.push("Sistem Yorumu: bu çıktıda, hesabınızın güncel yetkisi nedeniyle çıkarılmıştır (rapor kaydı değiştirilmemiştir).");
  } else if (system.status === "included") {
    lines.push("Sistem Yorumu: harita hesaplanırken kaydedilmiş sistem açıklamaları; uzman yorumundan ayrı bölümde verilmiştir.");
  } else if (system.status === "unavailable") {
    lines.push("Sistem Yorumu: bu haritada kayıtlı sistem açıklaması bulunmadığından rapora eklenmemiştir.");
  }
  if (s.bodygraph.status === "missing") lines.push("BodyGraph görseli bu rapora eklenemedi.");
  lines.push(`Rapor, oluşturulduğu anda (${genDate}) dondurularak hazırlanmıştır; içeriği bu rapora özgüdür.`);
  lines.push("Bu rapor teşhis veya tedavi önerisi içermez.");

  return [
    divider(),
    h2("Kaynak Bilgisi", { keepNext: true }),
    ...lines.map((l) => muted(l)),
    ...buildWellnessNoteSection("human_design", opts.expertName ?? null),
  ];
}

// ── Belge ───────────────────────────────────────────────────────────────────────
export function buildHdReportV2Children(s: HdReportSnapshotV2, opts: WordReportV2Options = {}): { cover: ReportChild[]; body: ReportChild[] } {
  const genDate = formatInstantDate(s.generatedAt, { style: "long", fallback: "—" });
  const reading = opts.systemReadingRedacted ? null : s.commentary.system.status === "included" ? s.commentary.system.reading : null;
  return {
    cover: buildCover(s, genDate, opts.logo ?? null),
    body: [
      ...buildIdentity(s, genDate),
      ...buildBodygraph(s, opts.bodygraphImage ?? null),
      ...buildActivations(s),
      ...buildCenters(s),
      ...buildChannels(s),
      ...buildGates(s),
      ...buildExpert(s),
      ...buildSystem(reading),
      ...buildClosing(s, genDate, opts),
    ],
  };
}

export function buildHdReportV2Document(s: HdReportSnapshotV2, opts: WordReportV2Options = {}): Document {
  const { cover, body } = buildHdReportV2Children(s, opts);
  const page = { size: A4, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } };
  return new Document({
    creator: "Yaşam Sistemi",
    title: `Human Design Profesyonel Analiz Raporu — ${s.client.name}`,
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    sections: [
      // Kapak: üst/alt bilgi YOK (sade kurumsal kapak).
      { properties: { page }, children: cover },
      {
        properties: { page },
        headers: { default: buildHeader(HEADER_TEXT) },
        footers: { default: buildFooter(REPORT_NAME) },
        children: body,
      },
    ],
  });
}

export async function renderHdReportV2Buffer(s: HdReportSnapshotV2, opts: WordReportV2Options = {}): Promise<Buffer> {
  return Packer.toBuffer(buildHdReportV2Document(s, opts));
}
