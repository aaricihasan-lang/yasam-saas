/**
 * Doğaltaş TEK MİNERAL Word raporu — saf belge oluşturucu (route'tan ayrıldı: test edilebilir).
 * Veri erişimi/yetki/Usage360 route'tadır; burada yalnız düzen.
 *
 * PREMIUM DÜZEN (2026-11-06) — Mineral Bankası raporuyla (lib/dogaltas/mineralReportDoc.ts) aynı görsel dil;
 * kod bilerek ayrı tutulur (çalışan liste raporunda regresyon riski yok).
 *   Kök neden (eski düzen): kapak HER ZAMAN tek başına bir sayfaydı; ardından pageBreakBefore ile
 *   "Rapor Özeti + İçindekiler" sayfası geliyordu → kısa bir mineral bile 2–3 sayfa, ilk sayfanın
 *   üçte biri boş. Tek mineral için İçindekiler yalnız bölüm başlıklarını tekrar ediyordu; başlıklar
 *   Word'ün varsayılan mavi stilindeydi; bilgilendirme bloğu sayfa sonunda bölünebiliyordu.
 *   Yeni düzen:
 *     - Kapak / İçindekiler / sayfa sonu YOK. İlk sayfanın üstünde kimlik bandı (marka, mineral adı,
 *       rapor adı, altın çizgi, tarih) + "Rapor Özeti" şeridi; bölümler hemen altından akar.
 *     - Bölüm yapısı ve TÜM alanlar aynen: 1. Genel Bilgiler (Mineral Adı / Kategori / Kaynak / Kayıt
 *       Tarihi + Açıklama), 2. Mineral Özellikleri (listeler, İçeren Taşlar tablosu, Organ, Çakralar).
 *     - Başlıklar gerçek Heading stilinde + yer imli (Gezinti Bölmesi); sayfa dibinde yalnız kalmaz.
 *     - Kısa listeler iki sütunda, uzun listeler tam genişlikte; taş tablosu satırları bölünmez.
 *     - Bilgilendirme bloğu bölünmez; metin ortak kaynaktan (wellnessNote("dogaltas")) aynen.
 *     - Alt bilgi (sayfa no + not) eski düzenle aynı oluşturucudan.
 */
import {
  BorderStyle,
  Bookmark,
  BookmarkEnd,
  BookmarkStart,
  Document,
  HeadingLevel,
  LineRuleType,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { buildFooter, C_DARK, C_LIGHT, C_MID, ReportChild, REPORT_FONT } from "@/lib/docx/reportHelpers";
import { tocBookmarkId } from "@/lib/docx/premiumToc";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import { safeLen } from "@/lib/dogaltas/reportSafe";
import { formatInstantDate, reportGeneratedLabel } from "@/lib/time/reportTime";

export const C_MINERAL = "064e3b"; // koyu yeşil — mineral rengi

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

export function countFilledArrays(mineral: MineralRow): number {
  const arrays = [
    mineral.fiziksel, mineral.zihinsel, mineral.fizyoloji,
    mineral.eksiklik_belirtileri, mineral.fazlalik_belirtileri,
    mineral.doz_asimi, mineral.iceren_taslar, mineral.organ_etkileri, mineral.cakralar,
  ];
  return arrays.filter((a) => safeLen(a) > 0).length;
}

/** A4 içerik genişliği (11906 − 2×1440 kenar boşluğu). */
const CONTENT_WIDTH = 9026;

// Yaşam Sistemi marka paleti (zümrüt yeşili + altın vurgu; slate metin).
const G_DEEP = C_MINERAL;
const G_MAIN = "047857";
const G_TINT = "f0fdf4";
const G_LINE = "d1fae5";
const GOLD = "b08d57";

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

type RunOpts = { size?: number; bold?: boolean; italics?: boolean; color?: string; spacing?: number; allCaps?: boolean };

function run(text: string, o: RunOpts = {}): TextRun {
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

/**
 * Yer imli başlık (Gezinti Bölmesi hedefi). docx v9 `Bookmark` tüm yer imlerine aynı `w:id` verir;
 * benzersiz sayısal id (yer imi adının sıra no'su) ile yeniden kurulur.
 */
function bookmarked(id: string, text: string, o: RunOpts): Bookmark {
  const bm = new Bookmark({ id, children: [run(text, o)] });
  const n = Number(/_(\d+)$/.exec(id)?.[1] ?? NaN);
  if (Number.isFinite(n) && n > 0) {
    (bm as unknown as { start: BookmarkStart }).start = new BookmarkStart(id, n);
    (bm as unknown as { end: BookmarkEnd }).end = new BookmarkEnd(n);
  }
  return bm;
}

/**
 * Başlık paragrafı. Akışta sonraki blokla birlikte kalır (keepNext). Tablo hücresinde keepNext
 * KULLANILMAZ: Word'de hücre içi keepNext satırları birbirine bağlayıp tabloyu tek blok yapar
 * (sayfa dibinde büyük boşluk); orada satırın bölünmezliği yeterlidir.
 */
function heading(level: 1 | 2 | 3, id: string, text: string, opts: { inCell?: boolean } = {}): Paragraph {
  const style = level === 1
    ? { heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 60 }, run: { size: 28, bold: true, color: G_DEEP } }
    : level === 2
      ? { heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 30 }, run: { size: 21, bold: true, color: G_DEEP } }
      : { heading: HeadingLevel.HEADING_3, spacing: { before: 110, after: 30 }, run: { size: 19, bold: true, color: G_DEEP } };
  return new Paragraph({
    heading: style.heading,
    keepNext: !opts.inCell,
    keepLines: true,
    spacing: style.spacing,
    ...(level === 1 ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: G_LINE, space: 4 } } } : {}),
    children: [bookmarked(id, text, style.run)],
  });
}

// ─── Üst bölüm ────────────────────────────────────────────────────────────────

function masthead(mineralName: string, date: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [run("YAŞAM SİSTEMİ", { size: 17, bold: true, color: G_MAIN, spacing: 60 })],
    }),
    new Paragraph({
      spacing: { after: 20 },
      keepLines: true,
      children: [run(mineralName, { size: 44, bold: true, color: G_DEEP })],
    }),
    new Paragraph({
      spacing: { after: 140 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
      children: [run("Mineral Detay Raporu", { size: 21, italics: true, color: C_MID })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [run("Oluşturulma Tarihi: ", { size: 18, bold: true, color: C_MID }), run(date, { size: 18, color: C_MID })],
    }),
  ];
}

/** "Rapor Özeti" — tek satırlık kutulu şerit (ayrı özet sayfası YOK). */
function summaryStrip(items: [string, string][]): (Paragraph | Table)[] {
  const w = Math.floor(CONTENT_WIDTH / items.length);
  const white = { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" };
  return [
    new Paragraph({
      keepNext: true,
      spacing: { after: 80 },
      children: [run("Rapor Özeti", { size: 16, bold: true, color: G_MAIN, spacing: 40, allCaps: true })],
    }),
    new Table({
      width: { size: w * items.length, type: WidthType.DXA },
      columnWidths: items.map(() => w),
      borders: { top: white, bottom: white, left: white, right: white, insideHorizontal: white, insideVertical: white },
      rows: [new TableRow({
        cantSplit: true,
        children: items.map(([label, value]) => new TableCell({
          width: { size: w, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: G_TINT },
          margins: { top: 80, bottom: 80, left: 150, right: 100 },
          children: [
            new Paragraph({ spacing: { after: 10 }, children: [run(value, { size: value.length > 12 ? 24 : 32, bold: true, color: G_DEEP })] }),
            new Paragraph({ children: [run(label, { size: 16, color: C_MID })] }),
          ],
        })),
      })],
    }),
  ];
}

/** Genel Bilgiler: etiket | değer | etiket | değer — iki satır, açık zeminli etiket hücreleri. */
function infoTable(rows: [string, string][]): Table {
  const line = { style: BorderStyle.SINGLE, size: 4, color: G_LINE };
  const LW = 1500;
  const VW = Math.floor((CONTENT_WIDTH - 2 * LW) / 2);
  const cell = (text: string, label: boolean) => new TableCell({
    width: { size: label ? LW : VW, type: WidthType.DXA },
    shading: label ? { type: ShadingType.CLEAR, color: "auto", fill: G_TINT } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 90 },
    children: [new Paragraph({ children: [run(text, label ? { size: 17, bold: true, color: C_DARK } : { size: 20, color: C_MID })] })],
  });
  const pairs: [string, string][][] = [];
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2));
  return new Table({
    width: { size: 2 * (LW + VW), type: WidthType.DXA },
    columnWidths: [LW, VW, LW, VW],
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: pairs.map((pair) => new TableRow({
      cantSplit: true,
      children: [cell(pair[0]![0], true), cell(pair[0]![1], false), cell(pair[1]?.[0] ?? "", true), cell(pair[1]?.[1] ?? "", false)],
    })),
  });
}

/** Ardışık iki tablonun Word'de birleşmemesi için ince ayırıcı paragraf. */
function tableGap(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0, line: 120, lineRule: LineRuleType.EXACT }, children: [] });
}

// ─── Mineral özellikleri ──────────────────────────────────────────────────────

type ListField = { id: string; label: string; items: string[] };

function listParagraphs(f: ListField, opts: { inCell?: boolean } = {}): Paragraph[] {
  return [
    heading(3, f.id, f.label, opts),
    ...f.items.map((item) => new Paragraph({
      indent: { left: 420, hanging: 220 },
      spacing: { after: 10, line: 252 },
      widowControl: true,
      children: [run("•", { size: 18, bold: true, color: G_MAIN }), run(`  ${item}`, { size: 20, color: C_MID })],
    })),
  ];
}

/**
 * Liste alanları soldan sağa iki sütunlu kenarlıksız bloklarda (eski sıra korunur). Uzun maddeler
 * dar sütunda uzayacağından tam genişlikte tek sütun kullanılır. Kısa satırlar sayfa arasında
 * bölünmez; sayfaya sığmayabilecek uzun satırda Word'ün bölmesine izin verilir.
 */
function listColumns(list: ListField[]): (Paragraph | Table)[] {
  if (!list.length) return [];
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
        margins: { top: 0, bottom: 20, left: 0, right: 160 },
        children: f ? listParagraphs(f, { inCell: true }) : [new Paragraph({ children: [] })],
      })),
    }));
  }
  return [new Table({ width: { size: half * 2, type: WidthType.DXA }, columnWidths: [half, half], borders: NO_BORDERS, rows })];
}

/** "İçeren Taşlar": başlığın hemen ardından 4 sütunlu (en fazla) tablo; satırlar bölünmez. */
function stoneGrid(id: string, stones: string[]): (Paragraph | Table)[] {
  const clean = stones.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (!clean.length) return [];
  const cols = Math.max(1, Math.min(4, clean.length));
  const w = Math.floor(CONTENT_WIDTH / cols);
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
        children: [new Paragraph({ children: text ? [run(text, { size: 18, color: C_DARK })] : [] })],
      })),
    }));
  }
  return [
    heading(3, id, `İçeren Taşlar (${clean.length})`),
    new Table({
      width: { size: w * cols, type: WidthType.DXA },
      columnWidths: Array.from({ length: cols }, () => w),
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows,
    }),
    tableGap(),
  ];
}

/** Kapanış "Bilgilendirme" bloğu — metin ortak kaynaktan AYNEN; blok bölünmez. */
function closingNote(expertName: string | null): Paragraph[] {
  const name = expertName?.trim();
  const out: Paragraph[] = [
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: 200, after: 40 },
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
    out.push(new Paragraph({ keepLines: true, spacing: { after: 60 }, children: [run(`Hazırlayan: ${name}`, { size: 16, color: C_MID })] }));
  }
  return out;
}

// ─── Belge ────────────────────────────────────────────────────────────────────

/** Tek mineral raporunun gövdesi (kimlik bandı + özet şeridi + bölümler; kapak / İçindekiler yok). */
export function buildMineralDetailChildren(mineral: MineralRow): ReportChild[] {
  const mineralName = mineral.name || "İsimsiz Mineral";
  const filledArrays = countFilledArrays(mineral);
  const createdLabel = formatInstantDate(mineral.created_at, { fallback: "-" });
  const stoneCount = Array.isArray(mineral.iceren_taslar)
    ? mineral.iceren_taslar.filter((x) => typeof x === "string" && x.trim()).length
    : 0;

  // Yer imi kimlikleri gövde sırasıyla (Gezinti Bölmesi / iç bağlantı hedefleri).
  let seq = 0;
  const nextId = () => tocBookmarkId("mdet", seq++);

  const out: ReportChild[] = [];
  out.push(...masthead(mineralName, reportGeneratedLabel()));
  out.push(...summaryStrip([
    ["Dolu Bölüm", `${filledArrays} / 9`],
    ["İçeren Taş", String(stoneCount)],
    ["Kayıt Tarihi", createdLabel],
  ]));

  // 1. Genel Bilgiler
  out.push(heading(1, nextId(), "1. Genel Bilgiler"));
  out.push(infoTable([
    ["Mineral Adı",  mineralName],
    ["Kategori",     mineral.kategori || "Belirtilmemiş"],
    ["Kaynak",       mineral.source_id || "Belirtilmemiş"],
    ["Kayıt Tarihi", createdLabel],
  ]));
  if (mineral.aciklama?.trim()) {
    out.push(heading(2, nextId(), "Açıklama"));
    out.push(new Paragraph({
      spacing: { after: 60, line: 276 },
      widowControl: true,
      children: [run(mineral.aciklama.trim(), { size: 20, color: C_MID })],
    }));
  } else {
    out.push(tableGap());
  }

  // 2. Mineral Özellikleri — alanların TAMAMI, eski sırayla.
  out.push(heading(1, nextId(), "2. Mineral Özellikleri"));
  const field = (label: string, arr: string[] | null): ListField | null => {
    const items = (Array.isArray(arr) ? arr : []).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    return items.length ? { id: nextId(), label, items } : null;
  };
  const groupA = [
    field("Fiziksel Özellikler",  mineral.fiziksel),
    field("Zihinsel Etkiler",     mineral.zihinsel),
    field("Fizyoloji",            mineral.fizyoloji),
    field("Eksiklik Belirtileri", mineral.eksiklik_belirtileri),
    field("Fazlalık Belirtileri", mineral.fazlalik_belirtileri),
    field("Doz Aşımı",            mineral.doz_asimi),
  ].filter((f): f is ListField => f !== null);
  out.push(...listColumns(groupA));
  if (stoneCount) {
    if (groupA.length) out.push(tableGap());
    out.push(...stoneGrid(nextId(), mineral.iceren_taslar ?? []));
  }
  const groupB = [
    field("Organ Etkileri", mineral.organ_etkileri),
    field("Çakralar",       mineral.cakralar),
  ].filter((f): f is ListField => f !== null);
  if (groupB.length && groupA.length && !stoneCount) out.push(tableGap());
  out.push(...listColumns(groupB));

  if (filledArrays === 0 && !mineral.aciklama?.trim()) {
    out.push(new Paragraph({
      spacing: { before: 100, after: 60 },
      children: [run("Bu mineral kaydında henüz içerik girilmemiş.", { size: 20, italics: true, color: C_LIGHT })],
    }));
  }
  return out;
}

/** Tam Word belgesi (kimlik bandı + özet + bölümler + bilgilendirme notu). */
export function buildMineralDetailDocument(mineral: MineralRow, expertName: string | null): Document {
  const mineralName = mineral.name || "İsimsiz Mineral";
  return new Document({
    // İçindekiler / PAGEREF yok → updateFields gerekmez (açılışta alan güncelleme sorusu çıkmaz);
    // alt bilgideki Sayfa X / Y alanlarını Word kendiliğinden günceller.
    styles: {
      default: {
        document: { run: { font: REPORT_FONT, language: { value: "tr-TR" } } },
        heading1: { run: { font: REPORT_FONT, size: 28, bold: true, color: G_DEEP } },
        heading2: { run: { font: REPORT_FONT, size: 21, bold: true, color: G_DEEP } },
        heading3: { run: { font: REPORT_FONT, size: 19, bold: true, color: G_DEEP } },
      },
    },
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Mineral Raporu · ${mineralName}`, { note: "dogaltas" }) },
      // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
      children: [...buildMineralDetailChildren(mineral), ...closingNote(expertName)],
    }],
  });
}
