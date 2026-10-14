/**
 * Doğaltaş TEK MİNERAL Word raporu — saf belge oluşturucu (route'tan ayrıldı: test edilebilir).
 * Veri erişimi/yetki/Usage360 route'tadır; burada yalnız düzen.
 *
 * PREMIUM DÜZEN DÜZELTMESİ (2026-10-14) — liste raporu (lib/dogaltas/mineralReportDoc.ts) ile aynı yaklaşım:
 *   - Eski `buildTOCPage()` boş bir Word TOC alanıydı (alan güncellenmeden İçindekiler BOŞ görünürdü).
 *     Yerine STATİK + TIKLANABİLİR İçindekiler (`buildStaticToc`): her giriş gerçek başlık metni,
 *     başlıktaki yer imine iç bağlantı + PAGEREF sayfa no (`features.updateFields` ile Word günceller).
 *   - Gereksiz sayfalar kaldırıldı: ayrı "RAPOR ÖZETİ" sayfası + ayrı boş İçindekiler sayfası +
 *     "1. Genel Bilgiler" için zorunlu yeni sayfa YOK. Kapaktan sonra TEK sayfa sonu; özet + İçindekiler
 *     + bölümler doğal akışta.
 *   - "İçeren Taşlar" 4 sütunlu kompakt tablo (`compactGrid`), başlıkta adet.
 *   - Kapak, renkler, yazı tipi, alt bilgi ve TÜM alanlar aynen korunur (veri kaybı yok).
 */
import { Bookmark, BookmarkEnd, BookmarkStart, Document, HeadingLevel, Paragraph, TextRun } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  muted,
  profileLabel,
  ReportChild,
  REPORT_FONT,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import {
  bookmarkedText,
  buildCompactSummary,
  buildStaticToc,
  compactGrid,
  tocBookmarkId,
  type TocEntry,
} from "@/lib/docx/premiumToc";
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

/**
 * Renkli H1 (h1Colored ile birebir aynı görünüm) + yer imi. Sayfa sonu YOK.
 * NOT: docx v9 `Bookmark` tüm yer imlerine aynı `w:id` verir; bookmarkedText'teki gibi
 * benzersiz sayısal id (yer imi adının sıra no'su) ile yeniden kurulur.
 */
function bookmarkedH1(id: string, text: string, color: string): Paragraph {
  const bm = new Bookmark({ id, children: [new TextRun({ text, bold: true, size: 32, font: REPORT_FONT, color })] });
  const n = Number(/_(\d+)$/.exec(id)?.[1] ?? NaN);
  if (Number.isFinite(n) && n > 0) {
    (bm as unknown as { start: BookmarkStart }).start = new BookmarkStart(id, n);
    (bm as unknown as { end: BookmarkEnd }).end = new BookmarkEnd(n);
  }
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
    keepNext: true,
    keepLines: true,
    children: [bm],
  });
}

/** h2/h3 ile aynı biçim (Heading stili + REPORT_FONT) + yer imi; başlık sonraki blokla kalır. */
function bookmarkedHeading(level: 2 | 3, id: string, text: string): Paragraph {
  return new Paragraph({
    heading: level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: level === 2 ? { before: 360, after: 200 } : { before: 240, after: 100 },
    keepNext: true,
    children: [bookmarkedText(id, text)],
  });
}

/** Tek mineral raporunun gövdesi (kapak + özet + İçindekiler + bölümler). */
export function buildMineralDetailChildren(mineral: MineralRow): ReportChild[] {
  const mineralName = mineral.name || "İsimsiz Mineral";
  const today = reportGeneratedLabel();
  const filledArrays = countFilledArrays(mineral);
  const createdLabel = formatInstantDate(mineral.created_at, { fallback: "-" });

  // Yer imi kimlikleri gövde sırasıyla üretilir; TOC girişleri aynı sırada.
  let seq = 0;
  const toc: TocEntry[] = [];
  const nextId = (title: string, level: 1 | 2) => {
    const id = tocBookmarkId("mdet", seq++);
    toc.push({ id, title, level });
    return id;
  };

  // ── Bölüm gövdesi (önce kurulur → TOC girişleri gerçek başlıklardan türetilir)
  const body: ReportChild[] = [];

  // Bölüm 1: Genel Bilgiler — kapak/özet sonrası doğal akış (zorunlu yeni sayfa YOK).
  body.push(profileLabel("BÖLÜM 1", C_MINERAL));
  const s1 = "1. Genel Bilgiler";
  body.push(bookmarkedH1(nextId(s1, 1), s1, C_MINERAL));
  body.push(twoColTable([
    ["Mineral Adı",  mineralName],
    ["Kategori",     mineral.kategori || "Belirtilmemiş"],
    ["Kaynak",       mineral.source_id || "Belirtilmemiş"],
    ["Kayıt Tarihi", createdLabel],
  ]));
  if (mineral.aciklama?.trim()) {
    body.push(bookmarkedHeading(2, nextId("Açıklama", 2), "Açıklama"));
    body.push(bodyText(mineral.aciklama.trim()));
  }

  // Bölüm 2: Mineral Özellikleri
  const s2 = "2. Mineral Özellikleri";
  body.push(bookmarkedH1(nextId(s2, 1), s2, C_MINERAL));

  /** arraySection ile aynı madde paragrafları; yalnız başlık yer imli (TOC hedefi). */
  const listSection = (label: string, arr: string[] | null) => {
    const paras = arraySection(label, arr);
    if (!paras.length) return;
    body.push(bookmarkedHeading(3, nextId(label, 2), label));
    body.push(...paras.slice(1)); // [0] = düz h3 başlık → yer imli başlıkla değiştirildi
  };

  listSection("Fiziksel Özellikler",  mineral.fiziksel);
  listSection("Zihinsel Etkiler",     mineral.zihinsel);
  listSection("Fizyoloji",            mineral.fizyoloji);
  listSection("Eksiklik Belirtileri", mineral.eksiklik_belirtileri);
  listSection("Fazlalık Belirtileri", mineral.fazlalik_belirtileri);
  listSection("Doz Aşımı",            mineral.doz_asimi);

  // İçeren Taşlar — dikey madde kuyruğu yerine 4 sütunlu kompakt tablo (adet başlıkta).
  const stones = Array.isArray(mineral.iceren_taslar) ? mineral.iceren_taslar : [];
  const grid = compactGrid(stones, 4);
  if (grid) {
    const count = stones.filter((x) => typeof x === "string" && x.trim()).length;
    const title = `İçeren Taşlar (${count})`;
    body.push(bookmarkedHeading(3, nextId(title, 2), title));
    body.push(grid);
    body.push(new Paragraph({ spacing: { after: 60 } }));
  }

  listSection("Organ Etkileri", mineral.organ_etkileri);
  listSection("Çakralar",       mineral.cakralar);

  if (filledArrays === 0 && !mineral.aciklama?.trim()) {
    body.push(muted("Bu mineral kaydında henüz içerik girilmemiş."));
  }

  // ── Sıralı çıktı: kapak → (yeni sayfa) özet + İçindekiler → bölümler
  const all: ReportChild[] = [];
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   mineralName.toLocaleUpperCase("tr-TR"),
    subtitle: "Mineral Detay Raporu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Mineral Adı",  value: mineralName },
      { label: "Kategori",     value: mineral.kategori || "Belirtilmemiş" },
      { label: "Kaynak",       value: mineral.source_id || "Belirtilmemiş" },
      { label: "Dolu Bölüm",   value: `${filledArrays} / 9` },
      { label: "İçeren Taş",   value: String(mineral.iceren_taslar?.length ?? 0) },
    ],
  }));

  // Kompakt özet + DOLU İçindekiler aynı sayfa akışında (kapaktan sonraki TEK sayfa sonu).
  all.push(...buildCompactSummary([
    ["Mineral Adı",  mineralName],
    ["Kategori",     mineral.kategori || "Belirtilmemiş"],
    ["Kaynak",       mineral.source_id || "Belirtilmemiş"],
    ["Dolu Bölüm",   `${filledArrays} / 9`],
    ["İçeren Taş",   String(mineral.iceren_taslar?.length ?? 0)],
    ["Kayıt Tarihi", createdLabel],
  ], { pageBreakBefore: true }));
  all.push(...buildStaticToc(toc));
  all.push(...body);
  return all;
}

/** Tam Word belgesi (kapak + özet + İçindekiler + bölümler + bilgilendirme notu). */
export function buildMineralDetailDocument(mineral: MineralRow, expertName: string | null): Document {
  const mineralName = mineral.name || "İsimsiz Mineral";
  return new Document({
    // İçindekiler PAGEREF sayfa numaraları belge açılırken Word tarafından gerçek düzene göre güncellenir.
    features: { updateFields: true },
    // Alan sonuçları (PAGEREF sayfa no) da rapor yazı tipinde görünsün.
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Mineral Raporu · ${mineralName}`, { note: "dogaltas" }) },
      // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
      children: [...buildMineralDetailChildren(mineral), ...buildWellnessNoteSection("dogaltas", expertName)],
    }],
  });
}
