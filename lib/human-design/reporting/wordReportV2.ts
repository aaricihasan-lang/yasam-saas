/**
 * HD AŞAMA 4B — Profesyonel Word/DOCX v2 · SAF BELGE KURUCUSU (hd-report-2)
 * =========================================================================
 *
 * Girdi: DONMUŞ HdReportSnapshotV2 (+ indirme anında uygulanmış yetki filtresi). Çıktı: docx
 * Document / Buffer. DB / auth / ağ YOK — görseller (BodyGraph, logo) hazır Buffer olarak gelir.
 * Mevcut lib/docx/reportHelpers toolkit'i ve v1'in SAF prose dönüştürücüsü REUSE edilir.
 *
 * İki düzen: snapshot.layout === "pro-1" → profesyonel düzen (aşağıda, yeni raporlar); layout YOK →
 * eski kayıtlı raporların düzeni AYNEN (eski Word'ler değişmez). Eski düzenin bölüm sırası:
 * Kapak → Danışan ve Harita Kimliği → BodyGraph → Design / Personality →
 * Merkezler → Kanallar → Kapılar → Uzman Bilgilerim (varsa) → Sistem Yorumu (varsa) →
 * Kaynak Bilgisi. Boş bölüm OLUŞTURULMAZ. Uzman içeriği ile Sistem Yorumu AYRI başlık ve
 * kaynak etiketi taşır; birbirine karışmaz.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
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
import { HUMAN_DESIGN_GATES } from "@/lib/human-design/constants";
import { GATE_TECHNICAL_DATA } from "@/lib/human-design/gateTechnicalData";
import { crossThemeNames } from "@/lib/human-design/reporting/crossThemeTr";

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

function buildSystem(reading: SystemReadingDto | null, o: { proCross?: boolean } = {}): ReportChild[] {
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
      if (o.proCross && g.key === "cross") {
        const v = g.value ? crossThemeNames(g.value, null) : null;
        out.push(h3(v ? `Enkarnasyon Teması (Yaşam Amacı): ${v.tr} (${v.en})` : "Enkarnasyon Teması (Yaşam Amacı)", { keepNext: g.details.length > 0 }));
      } else {
        out.push(h3(g.value ? `${g.title}: ${g.value}` : g.title, { keepNext: g.details.length > 0 }));
      }
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
  if (s.layout === "pro-1") return buildHdReportV2ProChildren(s, opts);
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

// ═════════════════════════════════════════════════════════════════════════════════
// PROFESYONEL DÜZEN "pro-1" (2026-10-09) — yalnız `layout: "pro-1"` taşıyan YENİ snapshot'lar.
// Eski kayıtlı raporlar (layout yok) yukarıdaki düzenle AYNEN üretilir.
//   • Sayfa 2: kimlik kartı (ad · doğum · HD özeti) + HEMEN ALTINDA BodyGraph:
//     Design (kırmızı) | BodyGraph | Personality (siyah) — 13 + 13 aktivasyon
//   • Sayfa 3: "ENKARNASYON TEMASI (YAŞAM AMACI)" (Türkçe ad "Haç"sız + özgün İngilizce ad)
//     + Merkezler 3×3 ızgara (Tanımlı ● / Açık ○) + Kanal satırları
//   • Kapı tablosu (çoklu aktivasyon korunur; başlık her sayfada tekrar eder)
//   • "Uzman Açıklamaları" / Sistem Yorumu AYRI bölümler · sade kapanış (teknik eşleşme notu YOK)
//   • "Hazırlayan" yalnız snapshot.preparedBy doluysa (profil adı otomatik yazılmaz)
// Tüm metin ve tablolar Word'de düzenlenebilir (yalnız BodyGraph görseldir).
// ═════════════════════════════════════════════════════════════════════════════════

const W = A4.width - 2 * MARGIN; // basılabilir genişlik (twip)
const PAL = {
  ink: "1e293b",
  mid: "475569",
  soft: "64748b",
  faint: "94a3b8",
  line: "e2e8f0",
  card: "f8fafc",
  accent: "3730a3",
  design: "b91c1c",
  personality: "111827",
  definedFill: "e0e7ff",
} as const;
const NO_LINE = { style: BorderStyle.NONE, size: 0, color: "ffffff" } as const;
const NO_BORDERS = { top: NO_LINE, bottom: NO_LINE, left: NO_LINE, right: NO_LINE } as const;
const THIN = (color: string = PAL.line) => ({ style: BorderStyle.SINGLE, size: 4, color });

type PRun = { text: string; size?: number; bold?: boolean; color?: string; italics?: boolean; allCaps?: boolean };
function pr(o: PRun): TextRun {
  return new TextRun({
    text: sanitizeXmlText(o.text),
    font: REPORT_FONT,
    size: o.size ?? 20,
    bold: o.bold,
    italics: o.italics,
    allCaps: o.allCaps,
    color: o.color ?? PAL.mid,
  });
}
function pp(runs: PRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; keepNext?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: o.align,
    keepNext: o.keepNext,
    spacing: { before: o.before ?? 0, after: o.after ?? 60 },
    children: runs.map(pr),
  });
}
function cardCell(children: (Paragraph | Table)[], width: number, o: { fill?: string; borders?: Record<string, unknown>; vAlign?: "top" | "center" | "bottom"; pad?: number } = {}): TableCell {
  const pad = o.pad ?? 140;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    borders: (o.borders ?? NO_BORDERS) as never,
    verticalAlign: o.vAlign === "center" ? VerticalAlign.CENTER : o.vAlign === "bottom" ? VerticalAlign.BOTTOM : o.vAlign === "top" ? VerticalAlign.TOP : undefined,
    margins: { top: pad, bottom: pad, left: pad + 40, right: pad },
    children: children.length ? children : [new Paragraph({})],
  });
}
function fixedTable(widths: number[], rows: TableRow[]): Table {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { ...NO_BORDERS, insideHorizontal: NO_LINE, insideVertical: NO_LINE } as never,
    rows,
  });
}
/** Küçük, büyük harfli bölüm etiketi (kart başlıkları). */
function capsLabel(text: string, color: string = PAL.accent): Paragraph {
  return pp([{ text, size: 16, bold: true, color, allCaps: true }], { after: 100, keepNext: true });
}
function kv(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 70 },
    keepLines: true,
    children: [pr({ text: `${label}  `, size: 17, color: PAL.soft }), pr({ text: value, size: 21, color: PAL.ink, bold: true })],
  });
}

// ── Merkez adları: tutarlı Türkçe + parantez içinde özgün terim ──
const CENTER_NAME: Record<string, { tr: string; en: string | null }> = {
  head: { tr: "Baş Merkezi", en: "Head" },
  ajna: { tr: "Ajna Merkezi", en: null },
  throat: { tr: "Boğaz Merkezi", en: "Throat" },
  g_identity: { tr: "G / Kimlik Merkezi", en: "G Center" },
  heart_ego: { tr: "Kalp / Ego Merkezi", en: "Heart" },
  spleen: { tr: "Dalak Merkezi", en: "Spleen" },
  solar_plexus: { tr: "Solar Pleksus Merkezi", en: "Solar Plexus" },
  sacral: { tr: "Sakral Merkez", en: "Sacral" },
  root: { tr: "Kök Merkezi", en: "Root" },
};
const CENTER_GRID: string[][] = [
  ["head", "ajna", "throat"],
  ["g_identity", "heart_ego", "spleen"],
  ["solar_plexus", "sacral", "root"],
];
/** gateTechnicalData merkez adı → merkez kodu (kapı tablosu da aynı adları kullansın). */
const GATE_CENTER_CODE: Record<string, string> = {
  Taç: "head", Zihin: "ajna", Boğaz: "throat", "Benlik G": "g_identity", "Kalp-İrade": "heart_ego",
  Dalak: "spleen", "Solar Pleksus": "solar_plexus", Sakral: "sacral", Kök: "root",
};
function centerShort(code: string | null | undefined): string {
  if (!code) return "—";
  const n = CENTER_NAME[code];
  return n ? n.tr.replace(/ Merkezi?$/, "") : code;
}
function gateCenterLabel(raw: string | null): string {
  if (!raw) return "—";
  const code = GATE_CENTER_CODE[raw];
  return code ? centerShort(code) : raw;
}
function gateName(gate: number): string | null {
  const l = HUMAN_DESIGN_GATES.find((g) => g.code === gate)?.label ?? null;
  return l ? l.replace(/^\s*\d+\s*[—-]\s*/, "").trim() || null : null;
}
function channelName(label: string, code: string): string {
  return label.replace(new RegExp(`^\\s*${code.replace("-", "[-–]")}\\s*`), "").trim() || label;
}

// ── P2) Danışan ve Harita Kimliği ──
function proIdentity(s: HdReportSnapshotV2, genDate: string): ReportChild[] {
  const out: ReportChild[] = [
    pp([{ text: "Danışan ve Harita Kimliği", size: 18, bold: true, color: PAL.accent, allCaps: true }], { after: 80 }),
    pp([{ text: s.client.name, size: 44, bold: true, color: PAL.ink }], { after: 40 }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.line } },
      spacing: { before: 0, after: 240 },
      children: [pr({ text: "Human Design Profesyonel Analiz Raporu", size: 20, color: PAL.soft })],
    }),
  ];
  const birth: Paragraph[] = [capsLabel("Doğum Bilgileri")];
  if (s.client.birthDate) {
    birth.push(kv("Doğum Tarihi", formatDateOnly(s.client.birthDate, { style: "long" }) || formatDateLoose(s.client.birthDate, { style: "long" })));
  }
  if (s.client.birthTime) birth.push(kv("Doğum Saati (yerel)", s.client.birthTime));
  if (s.client.birthPlace) birth.push(kv("Doğum Yeri", s.client.birthPlace));
  if (s.client.timezone) birth.push(kv("Saat Dilimi", s.client.timezone));
  const hd: Paragraph[] = [capsLabel("Human Design Özeti")];
  if (s.identity.type) hd.push(kv("Tip", s.identity.type));
  if (s.identity.profile) hd.push(kv("Profil", s.identity.profile));
  if (s.identity.authority) hd.push(kv("İç Otorite", s.identity.authority));
  if (s.identity.definition) hd.push(kv("Tanım", s.identity.definition));
  const gap = 240;
  const half = Math.floor((W - gap) / 2);
  out.push(
    fixedTable([half, gap, W - gap - half], [
      new TableRow({
        cantSplit: true,
        children: [
          cardCell(birth, half, { fill: PAL.card, borders: { ...NO_BORDERS, top: THIN(PAL.accent) } }),
          cardCell([], gap),
          cardCell(hd, W - gap - half, { fill: PAL.card, borders: { ...NO_BORDERS, top: THIN(PAL.accent) } }),
        ],
      }),
    ]),
  );
  out.push(
    pp(
      [
        { text: `Harita kaynağı: ${s.chart.source === "computed" ? "Otomatik hesaplama (kayıtlı harita)" : "Manuel kayıt"}`, size: 16, color: PAL.faint },
        { text: `   ·   Rapor tarihi: ${genDate}`, size: 16, color: PAL.faint },
      ],
      { before: 200, after: 0 },
    ),
  );
  return out;
}

// ── P3) BodyGraph + Design / Personality (tek sayfa) ──
/** Orta sütun genişliği (twip) ve görselin azami boyutu (px @96dpi). */
const BG_COL = 5500;
const SIDE_COL = Math.floor((W - BG_COL) / 2);
export const HD_PRO_BODYGRAPH_PX = { width: Math.round((BG_COL - 100) / 15), height: 760 } as const; // 1 px = 15 twip

function activationColumn(side: "design" | "personality", list: FrozenActivation[]): Paragraph[] {
  const color = side === "design" ? PAL.design : PAL.personality;
  const head = side === "design" ? "DESIGN" : "PERSONALITY";
  const sub = side === "design" ? "Bilinçdışı · kırmızı" : "Bilinçli · siyah";
  const out: Paragraph[] = [
    pp([{ text: head, size: 22, bold: true, color }], { align: AlignmentType.CENTER, after: 0, keepNext: true }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color } },
      spacing: { before: 0, after: 120 },
      keepNext: true,
      children: [pr({ text: sub, size: 16, color: PAL.soft })],
    }),
  ];
  for (const a of list) {
    out.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: SIDE_COL - 200 }],
        spacing: { before: 0, after: 0, line: 330 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PAL.line } },
        keepLines: true,
        children: [pr({ text: planetLabelTr(a.planet), size: 17, color: PAL.mid }), pr({ text: `\t${a.gate}.${a.line}`, size: 21, bold: true, color })],
      }),
    );
  }
  out.push(pp([{ text: `${list.length} aktivasyon`, size: 15, color: PAL.faint }], { align: AlignmentType.CENTER, before: 80, after: 0 }));
  return out;
}

function bodygraphCell(s: HdReportSnapshotV2, img: Buffer | null): (Paragraph | Table)[] {
  const d = img ? getImgDimensions(img) : null;
  if (img && d) {
    const scale = Math.min(HD_PRO_BODYGRAPH_PX.width / d.w, HD_PRO_BODYGRAPH_PX.height / d.h);
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new ImageRun({ data: img, transformation: { width: Math.round(d.w * scale), height: Math.round(d.h * scale) }, type: img[0] === 0x89 ? "png" : "jpg" })],
      }),
      // Yalnız yüklenmiş harita görselinde kaynak notu (kayıtlı haritadan üretilen BodyGraph'ta açıklama YOK).
      ...(s.bodygraph.status === "uploaded_image"
        ? [pp([{ text: "Danışan profiline yüklenmiş harita görseli", size: 15, color: PAL.faint }], { align: AlignmentType.CENTER, before: 60, after: 0 })]
        : []),
    ];
  }
  return [
    pp([{ text: "BodyGraph görseli bu rapora eklenemedi.", size: 18, bold: true, color: "b45309" }], { align: AlignmentType.CENTER, before: 1200 }),
    pp([{ text: "Teknik harita verileri bu ve sonraki sayfalarda eksiksiz yer alır.", size: 17, color: PAL.soft }], { align: AlignmentType.CENTER }),
  ];
}

function proBodygraph(s: HdReportSnapshotV2, img: Buffer | null): ReportChild[] {
  // 2026-10-10 owner: BodyGraph 2. sayfada kimlik/doğum/HD özetinin HEMEN ALTINDA (sayfa sonu yok).
  const out: ReportChild[] = [h2("BodyGraph ve Aktivasyonlar", { keepNext: true })];
  if (s.activations.status !== "ok") {
    // Manuel / doğrulanamayan kayıt: aktivasyon sütunu yok; BodyGraph tek başına ortalanır.
    out.push(...bodygraphCell(s, img));
    if (s.activations.status === "invalid") out.push(bodyText("Kayıtlı aktivasyon verisi doğrulanamadığı için aktivasyonlar gösterilmiyor."));
    return out;
  }
  out.push(muted("Kapı.Çizgi biçiminde; ör. 56.2 = Kapı 56, Çizgi 2."));
  out.push(
    fixedTable([SIDE_COL, BG_COL, W - SIDE_COL - BG_COL], [
      new TableRow({
        cantSplit: true,
        children: [
          cardCell(activationColumn("design", s.activations.design), SIDE_COL, { vAlign: "center", pad: 60 }),
          cardCell(bodygraphCell(s, img), BG_COL, { vAlign: "center", pad: 40 }),
          cardCell(activationColumn("personality", s.activations.personality), W - SIDE_COL - BG_COL, { vAlign: "center", pad: 60 }),
        ],
      }),
    ]),
  );
  return out;
}

// ── P3b) Enkarnasyon Teması (Yaşam Amacı) — BodyGraph'tan SONRA, yeni sayfa başı ──
// Türkçe görünen adda "Haç" yok; özgün İngilizce terim aynen yanında (crossThemeNames).
function proIncarnation(s: HdReportSnapshotV2): ReportChild[] {
  const x = s.identity.cross;
  if (!x) return [];
  const names = crossThemeNames(x.name, x.angle);
  const card: Paragraph[] = [
    pp([{ text: names.tr, size: 30, bold: true, color: PAL.ink }], { after: 40 }),
    pp([{ text: names.en, size: 21, italics: true, color: PAL.soft }], { after: 160 }),
    new Paragraph({
      spacing: { after: 0 },
      children: [
        pr({ text: "Kapılar  ", size: 17, color: PAL.soft }),
        pr({ text: x.gates, size: 21, bold: true, color: PAL.ink }),
        ...(x.angle ? [pr({ text: "     Açı  ", size: 17, color: PAL.soft }), pr({ text: x.angle, size: 21, color: PAL.ink })] : []),
      ],
    }),
    pp([{ text: "Personality Güneş/Dünya | Design Güneş/Dünya", size: 16, color: PAL.faint }], { before: 40, after: 0 }),
  ];
  return [
    h1("ENKARNASYON TEMASI (YAŞAM AMACI)", true),
    fixedTable([W], [new TableRow({ cantSplit: true, children: [cardCell(card, W, { fill: PAL.card, borders: { ...NO_BORDERS, top: THIN(PAL.accent) } })] })]),
    new Paragraph({ spacing: { before: 0, after: 120 } }),
  ];
}

// ── P4) Merkezler (3×3) ──
function proCenters(s: HdReportSnapshotV2): ReportChild[] {
  if (s.centers.length === 0) return [];
  const byCode = new Map(s.centers.map((c) => [c.code, c]));
  const defined = s.centers.filter((c) => c.defined).length;
  const gap = 160;
  const col = Math.floor((W - 2 * gap) / 3);
  const widths = [col, gap, col, gap, W - 2 * gap - 2 * col];
  const cell = (code: string, width: number): TableCell => {
    const c = byCode.get(code);
    const n = CENTER_NAME[code] ?? { tr: c?.label ?? code, en: null };
    const isDef = c?.defined === true;
    const state = !c ? "—  Veri yok" : isDef ? "●  Tanımlı" : "○  Açık";
    return cardCell(
      [
        pp([{ text: n.tr, size: 20, bold: true, color: PAL.ink }], { after: 0 }),
        pp([{ text: n.en ?? " ", size: 15, color: PAL.faint }], { after: 60 }),
        pp([{ text: state, size: 18, bold: isDef, color: isDef ? PAL.accent : PAL.soft }], { after: 0 }),
      ],
      width,
      { fill: isDef ? PAL.definedFill : "ffffff", borders: { top: THIN(isDef ? PAL.accent : PAL.line), bottom: THIN(isDef ? PAL.accent : PAL.line), left: THIN(isDef ? PAL.accent : PAL.line), right: THIN(isDef ? PAL.accent : PAL.line) }, pad: 110 },
    );
  };
  const rows: TableRow[] = [];
  CENTER_GRID.forEach((codes, i) => {
    if (i > 0) rows.push(new TableRow({ height: { value: gap, rule: HeightRule.EXACT }, children: widths.map((w) => cardCell([], w, { pad: 0 })) }));
    rows.push(new TableRow({ cantSplit: true, children: [cell(codes[0], widths[0]), cardCell([], gap), cell(codes[1], widths[2]), cardCell([], gap), cell(codes[2], widths[4])] }));
  });
  return [
    h2("Merkezler", { keepNext: true }),
    muted(`9 merkezden ${defined} tanımlı, ${s.centers.length - defined} açık. Tanımlı merkezler dolgulu ve ● ile gösterilir.`),
    fixedTable(widths, rows),
  ];
}

// ── P4) Kanallar ──
function proChannels(s: HdReportSnapshotV2): ReportChild[] {
  if (s.channels.length === 0 && s.gates.length === 0) return [];
  const out: ReportChild[] = [h2("Kanallar", { keepNext: true })];
  if (s.channels.length === 0) {
    out.push(bodyText("Bu haritada tanımlı kanal bulunmuyor."));
    return out;
  }
  out.push(muted(`${s.channels.length} tanımlı kanal`));
  const widths = [1500, 4300, W - 5800];
  const rows = s.channels.map((c) => {
    const [a, b] = c.gates;
    const ca = gateCenterLabel(GATE_TECHNICAL_DATA[a]?.merkez ?? null);
    const cb = gateCenterLabel(GATE_TECHNICAL_DATA[b]?.merkez ?? null);
    const line = { ...NO_BORDERS, bottom: THIN() };
    return new TableRow({
      cantSplit: true,
      children: [
        cardCell([pp([{ text: `${a}–${b}`, size: 24, bold: true, color: PAL.accent }], { after: 0 })], widths[0], { borders: line, pad: 90, vAlign: "center" }),
        cardCell([pp([{ text: channelName(c.label, c.code), size: 21, bold: true, color: PAL.ink }], { after: 0 })], widths[1], { borders: line, pad: 90, vAlign: "center" }),
        cardCell([pp([{ text: `${ca} ↔ ${cb}`, size: 18, color: PAL.soft }], { after: 0 })], widths[2], { borders: line, pad: 90, vAlign: "center" }),
      ],
    });
  });
  out.push(fixedTable(widths, rows));
  return out;
}

// ── P5) Kapılar ──
function proGates(s: HdReportSnapshotV2): ReportChild[] {
  if (s.gates.length === 0) return [];
  const widths = [2700, 1700, 3700, W - 8100];
  const border = { ...NO_BORDERS, bottom: THIN() };
  const head = (t: string, w: number) =>
    cardCell([pp([{ text: t, size: 16, bold: true, color: PAL.soft, allCaps: true }], { after: 0, keepNext: true })], w, { borders: { ...NO_BORDERS, bottom: THIN(PAL.faint) }, pad: 80 });
  const rows: TableRow[] = [
    new TableRow({ tableHeader: true, cantSplit: true, children: [head("Kapı", widths[0]), head("Merkez", widths[1]), head("Aktivasyonlar", widths[2]), head("Kanal", widths[3])] }),
  ];
  for (const g of s.gates) {
    const name = gateName(g.gate);
    const acts = g.activations.length
      ? g.activations.map((a) =>
          new Paragraph({
            spacing: { before: 0, after: 10 },
            children: [
              pr({ text: a.side === "design" ? "Design" : "Personality", size: 17, bold: true, color: a.side === "design" ? PAL.design : PAL.personality }),
              pr({ text: `  ${planetLabelTr(a.planet)}  `, size: 18, color: PAL.mid }),
              pr({ text: `${g.gate}.${a.line}`, size: 19, bold: true, color: a.side === "design" ? PAL.design : PAL.personality }),
            ],
          }),
        )
      : [pp([{ text: "—", size: 18 }], { after: 0 })];
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cardCell(
            [pp([{ text: `${g.gate}. Kapı`, size: 21, bold: true, color: PAL.ink }], { after: 0 }), ...(name ? [pp([{ text: name, size: 16, color: PAL.soft }], { after: 0 })] : [])],
            widths[0],
            { borders: border, pad: 50 },
          ),
          cardCell([pp([{ text: gateCenterLabel(g.center), size: 18, color: PAL.mid }], { after: 0 })], widths[1], { borders: border, pad: 50 }),
          cardCell(acts, widths[2], { borders: border, pad: 50 }),
          cardCell([pp([{ text: g.channel ? g.channel.replace("-", "–") : "—", size: 18, bold: !!g.channel, color: g.channel ? PAL.accent : PAL.faint }], { after: 0 })], widths[3], { borders: border, pad: 50 }),
        ],
      }),
    );
  }
  return [h1("Kapılar", true), muted(`${s.gates.length} aktif kapı · Design aktivasyonları kırmızı, Personality aktivasyonları siyah.`), fixedTable(widths, rows)];
}

// ── P6) Uzman Açıklamaları ──
function proExpert(s: HdReportSnapshotV2): ReportChild[] {
  const { expert } = s.commentary;
  if (!expert.included || expert.entries.length === 0) return [];
  const out: ReportChild[] = [
    h1("Uzman Açıklamaları", true),
    muted("Bu bölümdeki açıklamalar, raporu hazırlayan uzmanın kendi Human Design Bilgi Bankası'ndan, bu haritanın özellikleriyle eşleşen kayıtlardır."),
  ];
  let current = "";
  for (const e of expert.entries as FrozenExpertEntry[]) {
    if (e.category !== current) {
      current = e.category;
      out.push(h2(current, { keepNext: true }));
    }
    out.push(h3(e.title, { keepNext: true }));
    out.push(...plainParagraphs(e.content)); // AYNEN (özet / yeniden yazım YOK)
  }
  return out;
}

// ── Son sayfa (sade) ──
function proClosing(s: HdReportSnapshotV2, genDate: string, opts: WordReportV2Options): ReportChild[] {
  const lines: string[] = [
    "Teknik harita bilgileri (tip, profil, otorite, tanım, haç, aktivasyonlar, merkezler, kanallar, kapılar) kayıtlı Human Design haritasından alınmıştır.",
  ];
  if (opts.systemReadingRedacted) lines.push("Sistem Yorumu bu çıktıda yer almamaktadır.");
  if (s.bodygraph.status === "missing") lines.push("BodyGraph görseli bu rapora eklenemedi.");
  lines.push(`Rapor, oluşturulduğu anda (${genDate}) dondurularak hazırlanmıştır; içeriği bu rapora özgüdür.`);
  lines.push("Bu rapor teşhis veya tedavi önerisi içermez.");
  return [
    divider(),
    h2("Kaynak Bilgisi", { keepNext: true }),
    ...lines.map((l) => muted(l)),
    // Hazırlayan YALNIZ uzmanın bu rapora yazdığı ad/unvan; profil adı OTOMATİK yazılmaz.
    ...buildWellnessNoteSection("human_design", s.preparedBy ?? null),
  ];
}

function buildHdReportV2ProChildren(s: HdReportSnapshotV2, opts: WordReportV2Options): { cover: ReportChild[]; body: ReportChild[] } {
  const genDate = formatInstantDate(s.generatedAt, { style: "long", fallback: "—" });
  const reading = opts.systemReadingRedacted ? null : s.commentary.system.status === "included" ? s.commentary.system.reading : null;
  return {
    cover: buildCover(s, genDate, opts.logo ?? null),
    body: [
      ...proIdentity(s, genDate),
      ...proBodygraph(s, opts.bodygraphImage ?? null),
      ...proIncarnation(s),
      ...proCenters(s),
      ...proChannels(s),
      ...proGates(s),
      ...proExpert(s),
      ...buildSystem(reading, { proCross: true }),
      ...proClosing(s, genDate, opts),
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
