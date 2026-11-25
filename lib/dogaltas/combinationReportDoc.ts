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
import type { ReportLocale } from "@/lib/i18n/reportLocale";
import { stonesText, withStonesOutput } from "@/lib/dogaltas/reportText";

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
  output?: ReportLocale | null,
): Document {
  return withStonesOutput(output, () => combinationReportDocument(rows, exportMode, combinationTitle, expertName));
}

/**
 * Kombinasyon raporu dosya adı (route'tan taşındı; I18N): sistem parçaları çıktı dilinde, tek kombinasyonda başlık
 * slug'ı (kullanıcı/katalog içeriği) aynen. TR: kombinasyon-<tumu|secili|filtreli|slug>-<tarih>.docx
 */
export function combinationReportFileName(
  exportMode: CombinationExportMode, combinationTitle: string | undefined, titleSlug: (t: string) => string, dateSlug: string, output?: ReportLocale | null,
): string {
  return withStonesOutput(output, () => {
    const t = stonesText().t;
    const modeSlug =
      exportMode === "single" && combinationTitle ? titleSlug(combinationTitle) :
      exportMode === "selected" ? t("combo.file.selected") :
      exportMode === "filtered" ? t("combo.file.filtered") : t("combo.file.all");
    return `${t("combo.file.prefix")}-${modeSlug}-${dateSlug}.docx`;
  });
}

function combinationReportDocument(
  rows: CombinationRow[],
  exportMode: CombinationExportMode,
  combinationTitle: string | undefined,
  expertName: string | null,
): Document {
  const x = stonesText();
  const t = x.t;
  // Issue'ya göre grupla (sıralama içerik düzenidir → dilden bağımsız tr-TR karşılaştırması korunur)
  const groupMap = new Map<string, CombinationRow[]>();
  for (const row of rows) {
    const key = row.issue?.trim() || t("combo.unnamed");
    const list = groupMap.get(key);
    if (list) list.push(row); else groupMap.set(key, [row]);
  }
  const groups = Array.from(groupMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr-TR"))
    .map(([issue, groupRows]) => ({
      issue,
      rows: [...groupRows].sort((a, b) => a.variant_index - b.variant_index),
    }));

  const today = x.generatedLabel();
  const totalVariants = rows.length;
  const totalIssues = groups.length;

  const exportLabel =
    exportMode === "single" ? t("combo.scope.single", { title: combinationTitle || "" }) :
    exportMode === "selected" ? t("combo.scope.selected", { count: String(totalIssues) }) :
    exportMode === "filtered" ? t("combo.scope.filtered", { count: String(totalIssues) }) :
    t("combo.scope.all", { count: String(totalIssues) });

  // Kategori istatistikleri
  const categories = new Set(rows.map((r) => r.description?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  // Premium kapak
  all.push(...buildPremiumCover({
    title1:   t("brand"),
    title2:   t("combo.coverTitle"),
    subtitle: exportLabel,
    date:     t("combo.generatedOn", { date: today }),
    stats: [
      { label: t("combo.stat.totalTitles"),  value: String(totalIssues) },
      { label: t("combo.stat.totalVariants"), value: String(totalVariants) },
      { label: t("combo.stat.category"),       value: String(categories.size) },
    ],
  }));

  // PREMIUM DÜZEN (2026-10-07): kompakt özet + DOLU, tıklanabilir İçindekiler (kombinasyon
  // başlıkları gövdeyle AYNI sırada; kategori küçük ek bilgi; variantlar TOC'u şişirmez).
  // Eski ayrı "Rapor Özeti" + boş TOC + "Genel Özet" sayfaları kaldırıldı (aynı istatistikler özet
  // tablosunda). İçerik (tüm variantlar, kaynak, notlar, taşlar) AYNEN korunur.
  const ids = groups.map((_, gi) => tocBookmarkId("kombinasyon", gi));
  all.push(...buildCompactSummary([
    [t("combo.stat.totalTitles"),   String(totalIssues)],
    [t("combo.stat.totalVariants"),  String(totalVariants)],
    [t("combo.stat.categoryCount"), String(categories.size)],
    [t("combo.stat.scope"),          exportLabel],
    [t("combo.stat.generated"),     today],
  ], { pageBreakBefore: true, common: x.common }));
  all.push(...buildStaticToc(groups.map((g, gi) => ({
    id: ids[gi]!,
    title: g.issue,
    meta: [
      g.rows.find((r) => r.description?.trim())?.description?.trim(),
      g.rows.length > 1 ? t("combo.variantCount", { count: g.rows.length, shown: String(g.rows.length) }) : null,
    ].filter(Boolean).join(" · ") || undefined,
  })), { common: x.common }));

  // Kombinasyonlar — yeni sayfa, sonra doğal akış
  all.push(h1Colored(t("combo.listTitle"), C_COMBO, true));
  all.push(muted(t("combo.listMeta", { titles: totalIssues, titlesShown: String(totalIssues), variants: totalVariants, variantsShown: String(totalVariants) })));

  groups.forEach((group, gi) => {
    all.push(spacer());
    all.push(profileLabel(t("combo.cardNo", { no: String(gi + 1).padStart(3, "0") }), C_COMBO));
    all.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 80 },
      keepNext: true,
      keepLines: true,
      children: [bookmarkedText(ids[gi]!, group.issue)],
    }));

    const desc = group.rows.find((r) => r.description?.trim())?.description;
    if (desc) all.push(fieldInline(t("combo.field.category"), desc.trim()));

    // Variants
    group.rows.forEach((row, vi) => {
      if (vi > 0) all.push(divider());

      const variantLabel = group.rows.length > 1
        ? t("combo.variant", { n: String(vi + 1), total: String(group.rows.length) })
        : t("combo.single");

      all.push(h3(variantLabel, { keepNext: true }));

      if (row.source?.trim())      all.push(fieldInline(t("combo.field.source"),  row.source.trim()));
      if (row.stones_text?.trim()) { all.push(bodyText(row.stones_text.trim())); }
      if (row.notes_text?.trim())  { all.push(fieldInline(t("combo.field.note", { n: "1" }), row.notes_text.trim())); }
      if (row.notes_text_2?.trim()) { all.push(fieldInline(t("combo.field.note", { n: "2" }), row.notes_text_2.trim())); }
      if (row.notes_text_3?.trim()) { all.push(fieldInline(t("combo.field.note", { n: "3" }), row.notes_text_3.trim())); }
    });
  });

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("dogaltas", expertName, x.common));

  return new Document({
    // İçindekiler PAGEREF sayfa numaraları belge açılırken Word tarafından gerçek düzene göre güncellenir.
    features: { updateFields: true },
    // Alan sonuçları (PAGEREF sayfa no) da rapor yazı tipinde görünsün.
    styles: { default: { document: { run: { font: REPORT_FONT, ...(x.output.isSource ? {} : { language: { value: x.documentLang } }) } } } },
    sections: [{
      properties: { titlePage: true },
      headers: { default: premiumHeader(t("combo.header")), first: new Header({ children: [] }) },
      footers: { default: buildFooter(t("combo.footer"), { note: "dogaltas", common: x.common }), first: new Footer({ children: [] }) },
      children: all,
    }],
  });

}
