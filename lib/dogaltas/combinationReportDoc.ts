/**
 * Doğaltaş TAŞ KOMBİNASYONLARI Word raporu — saf belge oluşturucu (route'tan ayrıldı: test edilebilir).
 * Veri erişimi/yetki route'tadır; burada yalnız gruplama + düzen. İçerik (tüm variantlar, kaynak,
 * notlar, taşlar) AYNEN korunur.
 */
import { Document, Footer, Header, HeadingLevel, Paragraph } from "docx";
import {
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  divider,
  fieldInline,
  h1Colored,
  h3,
  muted,
  profileLabel,
  ReportChild,
  REPORT_FONT,
  spacer,
} from "@/lib/docx/reportHelpers";
import {
  bookmarkedText,
  buildCompactSummary,
  buildStaticToc,
  premiumHeader,
  tocBookmarkId,
} from "@/lib/docx/premiumToc";
import { reportGeneratedLabel } from "@/lib/time/reportTime";

const C_COMBO = "3b0764"; // derin mor

export type CombinationExportMode = "all" | "selected" | "filtered" | "single";

export type CombinationRow = {
  id: string;
  tenant_id: string;
  source_id: string;
  issue: string;
  description: string | null;
  variant_index: number;
  source: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  notes_text_3: string | null;
  created_at: string;
};

export function buildCombinationReportDocument(
  rows: CombinationRow[],
  exportMode: CombinationExportMode,
  combinationTitle: string | undefined,
  expertName: string | null,
): Document {
  // Issue'ya göre grupla
  const groupMap = new Map<string, CombinationRow[]>();
  for (const row of rows) {
    const key = row.issue?.trim() || "İsimsiz";
    const list = groupMap.get(key);
    if (list) list.push(row); else groupMap.set(key, [row]);
  }
  const groups = Array.from(groupMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr-TR"))
    .map(([issue, groupRows]) => ({
      issue,
      rows: [...groupRows].sort((a, b) => a.variant_index - b.variant_index),
    }));

  const today = reportGeneratedLabel();
  const totalVariants = rows.length;
  const totalIssues = groups.length;

  const exportLabel =
    exportMode === "single" ? `Tek Kombinasyon — ${combinationTitle || ""}` :
    exportMode === "selected" ? `Seçili Kombinasyonlar (${totalIssues})` :
    exportMode === "filtered" ? `Filtrelenmiş Kombinasyonlar (${totalIssues})` :
    `Tüm Kombinasyonlar (${totalIssues})`;

  // Kategori istatistikleri
  const categories = new Set(rows.map((r) => r.description?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  // Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "TAŞ KOMBİNASYONLARI",
    subtitle: exportLabel,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Toplam Başlık",  value: String(totalIssues) },
      { label: "Toplam Variant", value: String(totalVariants) },
      { label: "Kategori",       value: String(categories.size) },
    ],
  }));

  // PREMIUM DÜZEN (2026-10-07): kompakt özet + DOLU, tıklanabilir İçindekiler (kombinasyon
  // başlıkları gövdeyle AYNI sırada; kategori küçük ek bilgi; variantlar TOC'u şişirmez).
  // Eski ayrı "Rapor Özeti" + boş TOC + "Genel Özet" sayfaları kaldırıldı (aynı istatistikler özet
  // tablosunda). İçerik (tüm variantlar, kaynak, notlar, taşlar) AYNEN korunur.
  const ids = groups.map((_, gi) => tocBookmarkId("kombinasyon", gi));
  all.push(...buildCompactSummary([
    ["Toplam Başlık",   String(totalIssues)],
    ["Toplam Variant",  String(totalVariants)],
    ["Kategori Sayısı", String(categories.size)],
    ["Kapsam",          exportLabel],
    ["Oluşturulma",     today],
  ], { pageBreakBefore: true }));
  all.push(...buildStaticToc(groups.map((g, gi) => ({
    id: ids[gi]!,
    title: g.issue,
    meta: [
      g.rows.find((r) => r.description?.trim())?.description?.trim(),
      g.rows.length > 1 ? `${g.rows.length} variant` : null,
    ].filter(Boolean).join(" · ") || undefined,
  }))));

  // Kombinasyonlar — yeni sayfa, sonra doğal akış
  all.push(h1Colored("Kombinasyon Listesi", C_COMBO, true));
  all.push(muted(`${totalIssues} başlık · ${totalVariants} variant`));

  groups.forEach((group, gi) => {
    all.push(spacer());
    all.push(profileLabel(`KOMBİNASYON #${String(gi + 1).padStart(3, "0")}`, C_COMBO));
    all.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 80 },
      keepNext: true,
      keepLines: true,
      children: [bookmarkedText(ids[gi]!, group.issue)],
    }));

    const desc = group.rows.find((r) => r.description?.trim())?.description;
    if (desc) all.push(fieldInline("Kategori", desc.trim()));

    // Variants
    group.rows.forEach((row, vi) => {
      if (vi > 0) all.push(divider());

      const variantLabel = group.rows.length > 1
        ? `Variant ${vi + 1}/${group.rows.length}`
        : "Kombinasyon";

      all.push(h3(variantLabel, { keepNext: true }));

      if (row.source?.trim())      all.push(fieldInline("Kaynak",  row.source.trim()));
      if (row.stones_text?.trim()) { all.push(bodyText(row.stones_text.trim())); }
      if (row.notes_text?.trim())  { all.push(fieldInline("Not 1", row.notes_text.trim())); }
      if (row.notes_text_2?.trim()) { all.push(fieldInline("Not 2", row.notes_text_2.trim())); }
      if (row.notes_text_3?.trim()) { all.push(fieldInline("Not 3", row.notes_text_3.trim())); }
    });
  });

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("dogaltas", expertName));

  return new Document({
    // İçindekiler PAGEREF sayfa numaraları belge açılırken Word tarafından gerçek düzene göre güncellenir.
    features: { updateFields: true },
    // Alan sonuçları (PAGEREF sayfa no) da rapor yazı tipinde görünsün.
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    sections: [{
      properties: { titlePage: true },
      headers: { default: premiumHeader("Yaşam Sistemi · Taş Kombinasyonları"), first: new Header({ children: [] }) },
      footers: { default: buildFooter("Taş Kombinasyonları Raporu · Yaşam Sistemi", { note: "dogaltas" }), first: new Footer({ children: [] }) },
      children: all,
    }],
  });

}
