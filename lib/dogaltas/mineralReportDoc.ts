/**
 * Doğaltaş MİNERAL BANKASI Word raporu — saf belge oluşturucu (route'tan ayrıldı: test edilebilir).
 * Veri erişimi/yetki route'tadır; burada yalnız düzen.
 */
import { Document, Footer, Header, HeadingLevel, Paragraph } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  divider,
  h1Colored,
  h3,
  muted,
  profileLabel,
  ReportChild,
  REPORT_FONT,
  SECTION_COLORS,
} from "@/lib/docx/reportHelpers";
import {
  bookmarkedText,
  buildCompactSummary,
  buildStaticToc,
  compactGrid,
  compactMeta,
  premiumHeader,
  tocBookmarkId,
} from "@/lib/docx/premiumToc";
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

// ─── Document builder ─────────────────────────────────────────────────────────
//
// PREMIUM DÜZEN (2026-10-07): içerik AYNEN korunur; yalnız yerleşim kompaktlaştırıldı.
//   - Kapak (kimlik + tarih + toplam + kapsam).
//   - Kapaktan sonraki TEK sayfa akışında: kompakt "Rapor Özeti" tablosu + DOLU, tıklanabilir
//     İçindekiler (mineral adları, PAGEREF sayfa no). Eski ayrı "Rapor Özeti" / "Genel Özet" /
//     "MİNERAL KAYITLARI" bölücü sayfaları (birkaç satır için tam sayfa) kaldırıldı — aynı istatistikler
//     özet tablosunda.
//   - "Mineral Kayıtları" yeni sayfada başlar; mineraller doğal akışta (her biri ayrı sayfa DEĞİL).
//   - Mineral adı H2 (yer imi + Gezinti Bölmesi), kaynak/tarih/kategori tek satır kompakt üst-veri.
//   - "İçeren Taşlar" çok sütunlu kompakt tablo (tek taş = tek satır dikey kuyruk yok).

export function buildMineralReportChildren(minerals: MineralRow[], exportLabel: string): ReportChild[] {
  const date = reportGeneratedLabel();
  const uniqueSources = new Set(minerals.map((m) => m.source_id).filter(Boolean)).size;
  const withTaslar = minerals.filter((m) => safeLen(m.iceren_taslar) > 0).length;
  const totalStoneLinks = minerals.reduce((n, m) => n + safeLen(m.iceren_taslar), 0);
  const color = SECTION_COLORS.minerals;
  const ids = minerals.map((_, i) => tocBookmarkId("mineral", i));

  const out: ReportChild[] = [];

  // Premium cover
  out.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "MİNERAL BANKASI",
    subtitle: "Profesyonel Mineral Referans Kataloğu",
    date:     `Oluşturulma Tarihi: ${date}`,
    stats: [
      { label: "Toplam Mineral Sayısı",      value: String(minerals.length) },
      { label: "Kaynak Sayısı",               value: String(uniqueSources) },
      { label: "Taş İçeren Mineraller",       value: String(withTaslar) },
      { label: "Kapsam",                      value: exportLabel },
    ],
  }));

  // Kompakt özet + DOLU İçindekiler (aynı sayfa akışı)
  out.push(...buildCompactSummary([
    ["Toplam Mineral",        String(minerals.length)],
    ["Kaynak Sayısı",         String(uniqueSources)],
    ["Taş İçeren Mineraller", String(withTaslar)],
    ["Taş Bağlantısı",        String(totalStoneLinks)],
    ["Kapsam",                exportLabel],
    ["Oluşturulma",           date],
  ], { pageBreakBefore: true }));
  out.push(...buildStaticToc(minerals.map((m, i) => ({
    id: ids[i]!,
    title: m.name || "İsimsiz Mineral",
    meta: m.kategori?.trim() || undefined,
  }))));

  // Mineral kayıtları — yeni sayfa, sonra doğal akış
  out.push(h1Colored("Mineral Kayıtları", color, true));
  out.push(muted(`${minerals.length} mineral · ${exportLabel}`));

  for (let i = 0; i < minerals.length; i++) {
    const m = minerals[i]!;
    if (i > 0) out.push(divider());

    out.push(profileLabel(`MİNERAL #${String(i + 1).padStart(3, "0")}`, color));
    out.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 80 },
      keepNext: true,
      keepLines: true,
      children: [bookmarkedText(ids[i]!, m.name || "İsimsiz Mineral")],
    }));

    const meta = compactMeta([
      ["Kategori", m.kategori],
      ["Kaynak", m.source_id],
      ["Tarih", m.created_at ? formatInstantDate(m.created_at) : null],
    ]);
    if (meta) out.push(meta);

    // Content sections (H3) — alanların TAMAMI korunur.
    if (m.aciklama?.trim()) { out.push(h3("Açıklama", { keepNext: true })); out.push(bodyText(m.aciklama.trim())); }
    out.push(...arraySection("Fiziksel Özellikler",   m.fiziksel));
    out.push(...arraySection("Zihinsel Etkiler",      m.zihinsel));
    out.push(...arraySection("Fizyoloji",             m.fizyoloji));
    out.push(...arraySection("Eksiklik Belirtileri",  m.eksiklik_belirtileri));
    out.push(...arraySection("Fazlalık Belirtileri",  m.fazlalik_belirtileri));
    out.push(...arraySection("Doz Aşımı",             m.doz_asimi));
    const stones = Array.isArray(m.iceren_taslar) ? m.iceren_taslar : [];
    const grid = compactGrid(stones, 4);
    if (grid) {
      out.push(h3(`İçeren Taşlar (${stones.filter((x) => typeof x === "string" && x.trim()).length})`, { keepNext: true }));
      out.push(grid);
      out.push(new Paragraph({ spacing: { after: 60 } }));
    }
    out.push(...arraySection("Organ Etkileri",        m.organ_etkileri));
    out.push(...arraySection("Çakralar",              m.cakralar));
  }

  return out;
}


/** Tam Word belgesi (kapak + özet + İçindekiler + kayıtlar + bilgilendirme notu). */
export function buildMineralReportDocument(minerals: MineralRow[], exportLabel: string, expertName: string | null): Document {
  return new Document({
    // İçindekiler PAGEREF sayfa numaraları belge açılırken Word tarafından gerçek düzene göre güncellenir.
    features: { updateFields: true },
    // Alan sonuçları (PAGEREF sayfa no) da rapor yazı tipinde görünsün.
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    sections: [{
      // Kapak sayfasında üst/alt bilgi yok; içerik sayfalarında başlık + sayfa no.
      properties: { titlePage: true },
      headers: { default: premiumHeader("Yaşam Sistemi · Mineral Bankası"), first: new Header({ children: [] }) },
      footers: { default: buildFooter("Yaşam Sistemi Mineral Bankası", { note: "dogaltas" }), first: new Footer({ children: [] }) },
      children: [...buildMineralReportChildren(minerals, exportLabel), ...buildWellnessNoteSection("dogaltas", expertName)],
    }],
  });

}
