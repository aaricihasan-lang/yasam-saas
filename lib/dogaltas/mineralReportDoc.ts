/**
 * Doğaltaş MİNERAL BANKASI Word raporu — saf belge oluşturucu (route'tan ayrıldı: test edilebilir).
 * Veri erişimi/yetki route'tadır; burada yalnız düzen.
 */
import {
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  type IParagraphOptions,
  LineRuleType,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  buildFooter,
  C_DARK,
  C_LIGHT,
  C_MID,
  ReportChild,
  REPORT_FONT,
} from "@/lib/docx/reportHelpers";
import { bookmarkedText, buildStaticToc, premiumHeader, tocBookmarkId } from "@/lib/docx/premiumToc";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import { safeLen } from "@/lib/dogaltas/reportSafe";
import { formatInstantDate, reportGeneratedLabel } from "@/lib/time/reportTime";

export type MineralRow = {
  id: string;
  name: string;
  aciklama: string | null;
  kategori: string | null;
  source_id: string | null;
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  organ_etkileri: string[] | null;
  cakralar: string[] | null;
  created_at: string | null;
};

// ─── Düzen ────────────────────────────────────────────────────────────────────
//
// PREMIUM KATALOG DÜZENİ (2026-11-06): içerik ve alanlar AYNEN korunur; yalnız sunum değişti.
//   Kök neden (eski düzen): kapak HER ZAMAN tek başına bir sayfa, "Rapor Özeti + İçindekiler"
//   pageBreakBefore ile ikinci sayfa, "Mineral Kayıtları" yine pageBreakBefore ile üçüncü sayfa →
//   tek kısa mineral bile 3 sayfa, ilk iki sayfa neredeyse boş. Başlıklar Word'ün varsayılan mavi
//   "Heading" stilinde kalıyordu (belgede stil tanımı yoktu).
//   Yeni düzen içerik miktarına göre seçilir:
//     - KOMPAKT (≤ 5 mineral): kapak / İçindekiler yok. İlk sayfanın üstünde kimlik bandı + özet
//       şeridi, kayıtlar hemen altında akar.
//     - KATALOG (6–24 mineral): aynı üst bölüm + tıklanabilir İçindekiler, kayıtlar akışta devam eder.
//     - BÜYÜK KATALOG (≥ 25 mineral): ayrı kapak (kimlik + özet), ardından İçindekiler; kayıtlar
//       İçindekiler'in hemen ardından akar (son İçindekiler sayfası yarı boş kalmaz).
//   Her mineral bir "kart": sol kenarı vurgulu başlık bandı (etiket + ad + üst-veri) ve kompakt
//   alan blokları. Bant ve ilk alan birlikte tutulur (sayfa dibinde yalnız başlık kalmaz); taş
//   tablosu satırları sayfa arasında bölünmez. Tek sayfa sonu büyük katalogda kapaktan sonradır;
//   mineral başına sayfa sonu yoktur.

/** Bu sayıdan itibaren İçindekiler gösterilir (daha az kayıtta TOC sayfa israfı + bilgi değeri düşük). */
export const MINERAL_TOC_MIN = 6;
/** Bu sayıdan itibaren ayrı kapak sayfası (büyük katalog). */
export const MINERAL_COVER_MIN = 25;

export type MineralReportLayout = "compact" | "catalog" | "large";

export function mineralReportLayout(count: number): MineralReportLayout {
  if (count >= MINERAL_COVER_MIN) return "large";
  if (count >= MINERAL_TOC_MIN) return "catalog";
  return "compact";
}

/** A4 içerik genişliği (11906 − 2×1440 kenar boşluğu). */
const CONTENT_WIDTH = 9026;

// Yaşam Sistemi marka paleti (zümrüt yeşili + sıcak altın vurgu; slate metin).
const G_DEEP = "064e3b";
const G_MAIN = "047857";
const G_TINT = "f0fdf4";
const G_LINE = "d1fae5";
const GOLD = "b08d57";

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

function run(text: string, o: { size?: number; bold?: boolean; italics?: boolean; color?: string; spacing?: number; allCaps?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    font: REPORT_FONT,
    size: o.size ?? 20,
    bold: o.bold,
    italics: o.italics,
    color: o.color ?? C_MID,
    ...(o.allCaps ? { allCaps: true } : {}),
    ...(o.spacing ? { characterSpacing: o.spacing } : {}),
  });
}

// ─── Üst bölüm (kimlik bandı + özet şeridi) ──────────────────────────────────

type Stats = { total: number; sources: number; withStones: number; stoneLinks: number };

/** Sol hizalı kimlik bandı: marka, rapor adı, alt başlık, altın çizgi, tarih + kapsam satırı. */
function masthead(date: string, exportLabel: string, opts: { cover?: boolean } = {}): Paragraph[] {
  const big = opts.cover;
  return [
    new Paragraph({
      spacing: { before: big ? 2600 : 0, after: big ? 120 : 40 },
      children: [run("YAŞAM SİSTEMİ", { size: big ? 22 : 17, bold: true, color: G_MAIN, spacing: 60 })],
    }),
    new Paragraph({
      spacing: { after: big ? 80 : 20 },
      children: [run("Mineral Bankası", { size: big ? 72 : 46, bold: true, color: G_DEEP })],
    }),
    new Paragraph({
      spacing: { after: big ? 320 : 140 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: big ? 14 : 8 } },
      children: [run("Profesyonel Mineral Referans Kataloğu", { size: big ? 28 : 21, italics: true, color: C_MID })],
    }),
    new Paragraph({
      spacing: { after: big ? 360 : 160 },
      children: [
        run("Oluşturulma Tarihi: ", { size: 18, bold: true, color: C_MID }),
        run(date, { size: 18, color: C_MID }),
        run("     ·     ", { size: 18, color: C_LIGHT }),
        run("Kapsam: ", { size: 18, bold: true, color: C_MID }),
        run(exportLabel, { size: 18, color: C_MID }),
      ],
    }),
  ];
}

/** "Rapor Özeti" — tek satır, dört kutulu özet şeridi (koca özet sayfası YOK). */
function summaryStrip(s: Stats): (Paragraph | Table)[] {
  const items: [string, number][] = [
    ["Toplam Mineral", s.total],
    ["Kaynak Sayısı", s.sources],
    ["Taş İçeren Mineraller", s.withStones],
    ["Taş Bağlantısı", s.stoneLinks],
  ];
  const w = Math.floor(CONTENT_WIDTH / items.length);
  const white = { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" };
  return [
    new Paragraph({
      keepNext: true,
      spacing: { after: 80 },
      children: [run("Rapor Özeti", { size: 16, bold: true, color: G_MAIN, spacing: 40, allCaps: true })],
    }),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: items.map(() => w),
      borders: { top: white, bottom: white, left: white, right: white, insideHorizontal: white, insideVertical: white },
      rows: [new TableRow({
        cantSplit: true,
        children: items.map(([label, value]) => new TableCell({
          width: { size: w, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: G_TINT },
          margins: { top: 110, bottom: 110, left: 150, right: 100 },
          children: [
            new Paragraph({ spacing: { after: 10 }, children: [run(String(value), { size: 32, bold: true, color: G_DEEP })] }),
            new Paragraph({ children: [run(label, { size: 16, color: C_MID })] }),
          ],
        })),
      })],
    }),
  ];
}

/** Bölüm başlığı (Heading 1 — Gezinti Bölmesi). */
function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    keepLines: true,
    spacing: { before: 280, after: 40 },
    children: [run(text, { size: 30, bold: true, color: G_DEEP })],
  });
}

// ─── Mineral kartı ────────────────────────────────────────────────────────────

/** Başlık bandı paragrafı: açık yeşil zemin + kalın sol vurgu. Ardışık bant paragrafları Word'de tek blok olur. */
function bandParagraph(o: IParagraphOptions): Paragraph {
  return new Paragraph({
    ...o,
    keepNext: true,
    keepLines: true,
    shading: { type: ShadingType.CLEAR, color: "auto", fill: G_TINT },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: G_MAIN, space: 10 } },
    indent: { left: 200, right: 120 },
  });
}

function mineralBand(m: MineralRow, index: number, bookmarkId: string): Paragraph[] {
  const out: Paragraph[] = [
    bandParagraph({
      spacing: { before: index === 0 ? 120 : 360, after: 0 },
      children: [run(`MİNERAL #${String(index + 1).padStart(3, "0")}`, { size: 15, bold: true, color: G_MAIN, spacing: 30 })],
    }),
    bandParagraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 20, after: 20 },
      children: [bookmarkedText(bookmarkId, m.name || "İsimsiz Mineral")],
    }),
  ];
  const meta: [string, string | null | undefined][] = [
    ["Kategori", m.kategori],
    ["Kaynak", m.source_id],
    ["Tarih", m.created_at ? formatInstantDate(m.created_at) : null],
  ];
  const items = meta.filter(([, v]) => typeof v === "string" && v.trim().length > 0) as [string, string][];
  const children: TextRun[] = [];
  items.forEach(([label, value], i) => {
    if (i > 0) children.push(run("   ·   ", { size: 17, color: C_LIGHT }));
    children.push(run(`${label}: `, { size: 17, bold: true, color: C_MID }));
    children.push(run(value.trim(), { size: 17, color: C_MID }));
  });
  out.push(bandParagraph({ spacing: { before: 0, after: 0 }, children: children.length ? children : [run(" ", { size: 8 })] }));
  return out;
}

/**
 * Alan başlığı (Heading 3 — yalnız Gezinti Bölmesi; İçindekiler'e girmez). Akışta ilk satırla birlikte
 * kalır. Tablo hücresinde keepNext KULLANILMAZ: Word'de hücre içi keepNext satırları birbirine bağlayıp
 * bütün tabloyu tek blok yapar (sayfa dibinde büyük boşluk); orada satırın bölünmezliği yeterlidir.
 */
function fieldTitle(text: string, opts: { inCell?: boolean } = {}): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: !opts.inCell,
    keepLines: true,
    spacing: { before: 150, after: 40 },
    indent: { left: 120 },
    children: [run(text, { size: 19, bold: true, color: G_DEEP })],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    indent: { left: 120 },
    spacing: { after: 60, line: 276 },
    widowControl: true,
    children: [run(text, { size: 20, color: C_MID })],
  });
}

type ListField = { label: string; items: string[] };

/** Boş / dizi olmayan değer → alan yok (bozuk eski kayıt raporu çökertmez). */
function listField(label: string, arr: string[] | null): ListField | null {
  const items = (Array.isArray(arr) ? arr : []).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  return items.length ? { label, items } : null;
}

function listParagraphs(f: ListField, opts: { inCell?: boolean } = {}): Paragraph[] {
  return [
    fieldTitle(f.label, opts),
    ...f.items.map((item) => new Paragraph({
      indent: { left: 420, hanging: 220 },
      spacing: { after: 30, line: 264 },
      widowControl: true,
      children: [run("•", { size: 18, bold: true, color: G_MAIN }), run(`\u00a0\u00a0${item}`, { size: 20, color: C_MID })],
    })),
  ];
}

/**
 * Liste alanlarını iki sütunlu, kenarlıksız bloklara yerleştirir (soldan sağa, eski sırayla):
 * sayfa genişliği boşa gitmez, kısa listeler alt alta uzun bir sütun oluşturmaz. Kısa satırlar
 * sayfa arasında bölünmez; çok uzun satır (sayfaya sığmayabilecek) Word'ün bölmesine izin verir.
 */
function listColumns(fields: (ListField | null)[]): (Paragraph | Table)[] {
  const list = fields.filter((f): f is ListField => f !== null);
  if (!list.length) return [];
  // Uzun maddeler dar sütunda uzar → tam genişlikte tek sütun daha az yer tutar.
  const all = list.flatMap((f) => f.items);
  const avg = all.reduce((n, x) => n + x.length, 0) / all.length;
  if (list.length === 1 || avg > 45 || all.some((x) => x.length > 90)) return list.flatMap((f) => listParagraphs(f));
  const half = Math.floor(CONTENT_WIDTH / 2);
  const rows: TableRow[] = [];
  for (let i = 0; i < list.length; i += 2) {
    const pair = [list[i]!, list[i + 1] ?? null];
    const size = pair.reduce((n, f) => n + (f ? f.items.join(" ").length + f.items.length * 40 : 0), 0);
    rows.push(new TableRow({
      cantSplit: size < 1400,
      children: pair.map((f) => new TableCell({
        width: { size: half, type: WidthType.DXA },
        margins: { top: 0, bottom: 40, left: 0, right: 160 },
        children: f ? listParagraphs(f, { inCell: true }) : [new Paragraph({ children: [] })],
      })),
    }));
  }
  return [new Table({
    width: { size: half * 2, type: WidthType.DXA },
    columnWidths: [half, half],
    borders: NO_BORDERS,
    rows,
  })];
}

/** "İçeren Taşlar": 4 sütunlu yumuşak tablo; satırlar sayfa arasında bölünmez. */
function stoneGrid(stones: string[]): (Paragraph | Table)[] {
  const clean = stones.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (!clean.length) return [];
  const cols = Math.max(1, Math.min(4, clean.length));
  const w = Math.floor((CONTENT_WIDTH - 120) / cols);
  const line = { style: BorderStyle.SINGLE, size: 4, color: G_LINE };
  const rows: TableRow[] = [];
  for (let i = 0; i < clean.length; i += cols) {
    const slice = clean.slice(i, i + cols);
    while (slice.length < cols) slice.push("");
    rows.push(new TableRow({
      cantSplit: true,
      children: slice.map((text) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        margins: { top: 50, bottom: 50, left: 100, right: 80 },
        children: [new Paragraph({ children: [run(text, { size: 18, color: C_DARK })] })],
      })),
    }));
  }
  return [
    fieldTitle(`İçeren Taşlar (${clean.length})`),
    new Table({
      width: { size: CONTENT_WIDTH - 120, type: WidthType.DXA },
      columnWidths: Array.from({ length: cols }, () => w),
      indent: { size: 120, type: WidthType.DXA },
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows,
    }),
    // Ayırıcı (ardışık tablolar Word'de birleşmesin); yüksekliği küçük tutulur.
    new Paragraph({ spacing: { before: 0, after: 0, line: 120, lineRule: LineRuleType.EXACT }, children: [] }),
  ];
}

function mineralCard(m: MineralRow, index: number, bookmarkId: string): ReportChild[] {
  const body: ReportChild[] = [];
  // Alanların TAMAMI korunur; sıra eski raporla aynı.
  if (m.aciklama?.trim()) { body.push(fieldTitle("Açıklama"), bodyParagraph(m.aciklama.trim())); }
  body.push(...listColumns([
    listField("Fiziksel Özellikler", m.fiziksel),
    listField("Zihinsel Etkiler", m.zihinsel),
    listField("Fizyoloji", m.fizyoloji),
    listField("Eksiklik Belirtileri", m.eksiklik_belirtileri),
    listField("Fazlalık Belirtileri", m.fazlalik_belirtileri),
    listField("Doz Aşımı", m.doz_asimi),
  ]));
  body.push(...stoneGrid(Array.isArray(m.iceren_taslar) ? m.iceren_taslar : []));
  body.push(...listColumns([
    listField("Organ Etkileri", m.organ_etkileri),
    listField("Çakralar", m.cakralar),
  ]));
  if (!body.length) {
    body.push(new Paragraph({
      indent: { left: 120 },
      spacing: { before: 100, after: 60 },
      children: [run("Bu kayıtta ek alan bilgisi bulunmuyor.", { size: 18, italics: true, color: C_LIGHT })],
    }));
  }
  return [...mineralBand(m, index, bookmarkId), ...body];
}

// ─── Belge ────────────────────────────────────────────────────────────────────

export function buildMineralReportChildren(minerals: MineralRow[], exportLabel: string): ReportChild[] {
  const date = reportGeneratedLabel();
  const stats: Stats = {
    total: minerals.length,
    sources: new Set(minerals.map((m) => m.source_id).filter(Boolean)).size,
    withStones: minerals.filter((m) => safeLen(m.iceren_taslar) > 0).length,
    stoneLinks: minerals.reduce((n, m) => n + safeLen(m.iceren_taslar), 0),
  };
  const layout = mineralReportLayout(minerals.length);
  const ids = minerals.map((_, i) => tocBookmarkId("mineral", i));

  const out: ReportChild[] = [];
  out.push(...masthead(date, exportLabel, { cover: layout === "large" }));
  out.push(...summaryStrip(stats));

  if (layout !== "compact") {
    // Büyük katalogda İçindekiler kapaktan sonra yeni sayfada başlar.
    const toc = buildStaticToc(minerals.map((m, i) => ({
      id: ids[i]!,
      title: m.name || "İsimsiz Mineral",
      meta: m.kategori?.trim() || undefined,
    })));
    if (layout === "large") out.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 0 }, children: [] }));
    out.push(...toc);
  }

  out.push(sectionTitle("Mineral Kayıtları"));
  out.push(new Paragraph({
    keepNext: true,
    spacing: { after: 60 },
    children: [run(`${minerals.length} mineral · ${exportLabel}`, { size: 18, italics: true, color: C_LIGHT })],
  }));

  minerals.forEach((m, i) => out.push(...mineralCard(m, i, ids[i]!)));

  return out;
}

/**
 * Kapanış "Bilgilendirme" bloğu — metin ortak kaynaktan (wellnessNote("dogaltas")) AYNEN; yalnız
 * düzen: üstte ince ayraç ve blok bölünmez (sayfa başında tek başına "Hazırlayan" satırı kalmaz).
 */
function closingNote(expertName: string | null): Paragraph[] {
  const name = expertName?.trim();
  const out: Paragraph[] = [
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: 320, after: 60 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: G_LINE, space: 10 } },
      children: [run("Bilgilendirme", { size: 18, bold: true, color: C_MID })],
    }),
    new Paragraph({
      keepNext: !!name,
      keepLines: true,
      spacing: { after: 80 },
      children: [run(wellnessNote("dogaltas").full, { size: 16, italics: true, color: C_LIGHT })],
    }),
  ];
  if (name) {
    out.push(new Paragraph({
      keepLines: true,
      spacing: { after: 60 },
      children: [run(`Hazırlayan: ${name}`, { size: 16, color: C_MID })],
    }));
  }
  return out;
}

/** Tam Word belgesi (içerik miktarına göre kompakt / katalog / büyük katalog düzeni + bilgilendirme notu). */
export function buildMineralReportDocument(minerals: MineralRow[], exportLabel: string, expertName: string | null): Document {
  const layout = mineralReportLayout(minerals.length);
  const footer = () => buildFooter("Yaşam Sistemi Mineral Bankası", { note: "dogaltas" });
  return new Document({
    // İçindekiler PAGEREF sayfa numaraları yalnız İçindekiler varken gerekir; Word açılışta günceller.
    // Kompakt raporda alan güncelleme sorusu çıkmaz (Sayfa X / Y alanları Word'de kendiliğinden güncel).
    ...(layout === "compact" ? {} : { features: { updateFields: true } }),
    styles: {
      default: {
        document: { run: { font: REPORT_FONT, language: { value: "tr-TR" } } },
        heading1: { run: { font: REPORT_FONT, size: 30, bold: true, color: G_DEEP }, paragraph: { spacing: { before: 240, after: 40 } } },
        heading2: { run: { font: REPORT_FONT, size: 30, bold: true, color: G_DEEP }, paragraph: { spacing: { before: 20, after: 20 } } },
        heading3: { run: { font: REPORT_FONT, size: 19, bold: true, color: G_DEEP }, paragraph: { spacing: { before: 150, after: 40 } } },
      },
    },
    sections: [{
      // İlk sayfada üst bilgi yok (kimlik bandı / kapak zaten orada). Alt bilgi (sayfa no + not)
      // kompakt/katalogda ilk sayfada da görünür; büyük katalog kapağında görünmez.
      properties: { titlePage: true },
      headers: { default: premiumHeader("Yaşam Sistemi · Mineral Bankası"), first: new Header({ children: [] }) },
      footers: { default: footer(), first: layout === "large" ? new Footer({ children: [] }) : footer() },
      children: [...buildMineralReportChildren(minerals, exportLabel), ...closingNote(expertName)],
    }],
  });
}
