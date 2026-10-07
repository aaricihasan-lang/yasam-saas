/**
 * Premium Word düzeni yardımcıları — Doğaltaş Mineral + Kombinasyon raporları (2026-10-07).
 *
 * NEDEN: `buildTOCPage()` (reportHelpers) yalnız boş bir Word TOC FIELD'ı üretir; Word alanları
 * güncelleyene kadar (LibreOffice'te hiç) İçindekiler BOŞ görünür. Buradaki İçindekiler:
 *   - STATİK ve her zaman DOLU: her giriş başlığın gerçek metnidir,
 *   - TIKLANABİLİR: girişler başlıktaki Word yer imine (bookmark) iç bağlantıdır,
 *   - SAYFA NUMARASI: PAGEREF alanı (yer imine bağlı). Word belgeyi açarken alanları günceller
 *     (`features.updateFields`), sayfa numaraları GERÇEK düzene göre hesaplanır. Sahte/tahmini
 *     sayfa numarası YAZILMAZ.
 * Başlıklar gerçek Heading stilleridir (Word Gezinti Bölmesi görür).
 *
 * Paylaşılan `reportHelpers` DEĞİŞTİRİLMEZ (diğer modüllerin raporları etkilenmez).
 */
import {
  AlignmentType,
  Bookmark,
  BookmarkEnd,
  BookmarkStart,
  BorderStyle,
  Header,
  InternalHyperlink,
  LeaderType,
  PageReference,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import { C_DARK, C_LIGHT, C_MID, REPORT_FONT } from "./reportHelpers";
/** A4 içerik genişliği (11906 − 2×1440 kenar boşluğu) ≈ 9026 twip. */
const CONTENT_WIDTH = 9026;

export type TocEntry = {
  /** Yer imi kimliği (tocBookmarkId ile üretilir). */
  id: string;
  title: string;
  /** Başlığın yanında küçük, soluk ek bilgi (ör. kategori). */
  meta?: string;
  level?: 1 | 2;
};

/** Word yer imi adı kuralı: harfle başlar, ≤40 karakter, yalnız harf/rakam/alt çizgi. */
export function tocBookmarkId(prefix: string, index: number): string {
  const safe = prefix.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20) || "toc";
  return `${/^[A-Za-z]/.test(safe) ? safe : `t${safe}`}_${String(index + 1).padStart(4, "0")}`;
}

/**
 * Başlık metnini yer imiyle sarar (heading paragrafının children'ı olarak kullanılır).
 * NOT: docx v9 `Bookmark` her örnek için ayrı sayaç kullanır → tüm yer imleri `w:id="1"` olur
 * (OOXML benzersiz id ister). Bu yüzden start/end benzersiz bir sayısal id ile yeniden kurulur:
 * varsayılan = yer imi adının sonundaki sıra numarası (tocBookmarkId → `_0001`).
 */
export function bookmarkedText(id: string, text: string, linkId?: number): Bookmark {
  const bm = new Bookmark({ id, children: [new TextRun({ text, font: REPORT_FONT })] });
  const n = linkId ?? Number(/_(\d+)$/.exec(id)?.[1] ?? NaN);
  if (Number.isFinite(n) && n > 0) {
    (bm as unknown as { start: BookmarkStart }).start = new BookmarkStart(id, n);
    (bm as unknown as { end: BookmarkEnd }).end = new BookmarkEnd(n);
  }
  return bm;
}

/** Küçük, başlık-stili OLMAYAN bölüm etiketi (TOC'a kendini eklemez). */
function plainTitle(text: string, pageBreakBefore = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 30, font: REPORT_FONT, color: C_DARK, allCaps: true })],
    spacing: { before: pageBreakBefore ? 240 : 360, after: 160 },
    pageBreakBefore,
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "cbd5e1", space: 4 } },
  });
}

/**
 * Kompakt "Rapor Özeti": tek bir 4 sütunlu (etiket|değer|etiket|değer) tablo — koca boş sayfa YOK.
 * `pageBreakBefore` ile kapaktan sonra yeni sayfanın başında yer alır; ardından İçindekiler aynı
 * sayfada akar.
 */
export function buildCompactSummary(rows: [string, string][], opts: { pageBreakBefore?: boolean } = {}): (Paragraph | Table)[] {
  const pairs: [string, string][][] = [];
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2));
  const cell = (text: string, label: boolean, w: number) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: label ? { type: ShadingType.CLEAR, color: "auto", fill: "f1f5f9" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: label, size: label ? 18 : 20, font: REPORT_FONT, color: label ? C_DARK : C_MID })],
      })],
    });
  const border = { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" };
  const table = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: pairs.map((pair) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell(pair[0]![0], true, 2000), cell(pair[0]![1], false, 2513),
          cell(pair[1]?.[0] ?? "", true, 2000), cell(pair[1]?.[1] ?? "", false, 2513),
        ],
      }),
    ),
  });
  return [plainTitle("Rapor Özeti", opts.pageBreakBefore ?? false), table];
}

/**
 * STATİK + TIKLANABİLİR + PAGEREF sayfa numaralı İçindekiler. Her zaman dolu.
 */
export function buildStaticToc(entries: TocEntry[], opts: { title?: string } = {}): Paragraph[] {
  const out: Paragraph[] = [
    plainTitle(opts.title ?? "İçindekiler"),
    new Paragraph({
      children: [new TextRun({
        text: "Başlığa tıklayarak ilgili bölüme gidebilirsiniz. Sayfa numaralarını Word, belge açılırken günceller.",
        italics: true, size: 16, font: REPORT_FONT, color: C_LIGHT,
      })],
      spacing: { after: 120 },
    }),
  ];
  for (const e of entries) {
    const lvl1 = (e.level ?? 2) === 1;
    out.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH, leader: LeaderType.DOT }],
      indent: { left: lvl1 ? 0 : 240 },
      spacing: { before: lvl1 ? 120 : 0, after: 30 },
      keepNext: lvl1,
      children: [
        new InternalHyperlink({
          anchor: e.id,
          children: [new TextRun({ text: e.title, size: lvl1 ? 21 : 19, bold: lvl1, font: REPORT_FONT, color: C_DARK })],
        }),
        ...(e.meta ? [new TextRun({ text: `  · ${e.meta}`, size: 16, font: REPORT_FONT, color: C_LIGHT })] : []),
        new TextRun({ children: [new Tab()], size: 19, font: REPORT_FONT }),
        new PageReference(e.id, { hyperlink: true }),
      ],
    }));
  }
  return out;
}

/**
 * Çok sütunlu kompakt liste (ör. "İçeren Taşlar"): satır başına `columns` öğe, ince kenarlıklı
 * tablo. Her öğe kendi hücresinde (isimler karışmaz, uzun ad hücre içinde kırılır, yüzde/oran
 * metni olduğu gibi korunur, metin kopyalanabilir). Satırlar sayfa arasında bölünmez.
 */
export function compactGrid(items: string[], columns = 4): Table | null {
  const clean = items.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (!clean.length) return null;
  const cols = Math.max(1, Math.min(columns, clean.length));
  const w = Math.floor(CONTENT_WIDTH / cols);
  const border = { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" };
  const rows: TableRow[] = [];
  for (let i = 0; i < clean.length; i += cols) {
    const slice = clean.slice(i, i + cols);
    while (slice.length < cols) slice.push("");
    rows.push(new TableRow({
      cantSplit: true,
      children: slice.map((text) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 90, right: 90 },
        children: [new Paragraph({ children: [new TextRun({ text, size: 18, font: REPORT_FONT, color: C_MID })] })],
      })),
    }));
  }
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows,
  });
}

/** Tek satır kompakt üst-veri: "Kategori: X · Kaynak: Y · Tarih: Z" (başlık DEĞİL). */
export function compactMeta(parts: [string, string | null | undefined][]): Paragraph | null {
  const items = parts.filter(([, v]) => typeof v === "string" && v.trim().length > 0) as [string, string][];
  if (!items.length) return null;
  const children: TextRun[] = [];
  items.forEach(([label, value], i) => {
    if (i > 0) children.push(new TextRun({ text: "   ·   ", size: 17, font: REPORT_FONT, color: C_LIGHT }));
    children.push(new TextRun({ text: `${label}: `, bold: true, size: 17, font: REPORT_FONT, color: C_MID }));
    children.push(new TextRun({ text: value.trim(), size: 17, font: REPORT_FONT, color: C_MID }));
  });
  return new Paragraph({ children, spacing: { after: 120 }, keepNext: true });
}

/** İçerik sayfaları için ince üst bilgi (kapakta görünmez: section `titlePage`). */
export function premiumHeader(text: string): Header {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0", space: 4 } },
      children: [new TextRun({ text, size: 16, font: REPORT_FONT, color: C_LIGHT })],
    })],
  });
}
