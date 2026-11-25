/**
 * Aromaterapi Word — DOCX doküman kurucusu (Document + cover + stats + TOC + body).
 * reportHelpers primitiflerini reuse eder; yeni ikinci framework YOK.
 */

import { Document, Packer } from "docx";
import {
  buildPremiumCover, buildStatsPage, buildTOCPage, buildCompactFrontMatter,
  buildFooter, buildHeader, buildWellnessNoteSection, stepsNumberingConfig, type ReportChild,
} from "@/lib/docx/reportHelpers";
import { AROMA_SYSTEM_TITLE, humanDate, type FrontMatterMode } from "./theme";
import { aromaText } from "./text";

export interface AromaDocOptions {
  /** Kapak alt başlığı (ör. "Uçucu Yağlar Kataloğu", "Karışım Reçetesi: Lavanta Blend"). */
  coverTitle2: string;
  coverSubtitle: string;
  /** Footer + header'da görünen kısa rapor adı. */
  reportName: string;
  /** Kapak istatistik satırları. */
  stats: { label: string; value: string }[];
  /** Rapor gövdesi (renderer çıktıları). */
  body: ReportChild[];
  /** Uzman/kullanıcı görünen adı (varsa kapağa eklenir). */
  expertName?: string | null;
  /**
   * Adaptif front-matter sınıfı (theme.classifyFrontMatter). Varsayılan "full".
   *  none    → Kapak → içerik (ayrı Özet/İçindekiler sayfası YOK)
   *  compact → Kapak → tek Özet+İçindekiler sayfası → içerik
   *  full    → Kapak → Sistem Özeti → İçindekiler → içerik
   */
  frontMatter?: FrontMatterMode;
  date: Date;
  /**
   * FA-16: sade "Bilgilendirme" notu (footer kısa not + rapor sonu tam not + "Hazırlayan").
   * Varsayılan AÇIK (aromaterapi karışım/katalog danışana gidebilir); false → eski çıktı.
   */
  wellnessNote?: boolean;
}

/** Tek section'lı, header+footer'lı DOCX Buffer üretir. */
export async function buildAromaDoc(opts: AromaDocOptions): Promise<Buffer> {
  const mode: FrontMatterMode = opts.frontMatter ?? "full";
  // I18N: sistem metinleri geçerli isteğin çıktı dilinden (report/text; bağlam yoksa tr → bugünkü çıktı birebir).
  const x = aromaText();
  const out = x.output;
  // Ortak motorlara `common` yalnız kaynak dil dışında verilir (TR'de motor varsayılanı = katalog TR; çıktı aynı).
  const common = out.isSource ? undefined : out.common;
  const moduleTitle = x.t("moduleTitle");
  const coverStats = [...opts.stats];
  if (opts.expertName && opts.expertName.trim()) coverStats.unshift({ label: x.t("expertStat"), value: opts.expertName.trim() });

  const statRows = opts.stats.map((s) => [s.label, s.value] as [string, string]);
  // Adaptif front-matter — sınıfa göre kapak sonrası akış (gereksiz boş sayfalar YOK).
  const frontMatter: ReportChild[] =
    mode === "full"
      ? [...(statRows.length ? buildStatsPage(statRows, undefined, common) : []), ...buildTOCPage(common)]
      : mode === "compact"
        ? buildCompactFrontMatter(statRows, true, common)
        : []; // none → kapaktan doğrudan içeriğe

  const children: ReportChild[] = [
    ...buildPremiumCover({
      title1: AROMA_SYSTEM_TITLE,
      title2: opts.coverTitle2,
      subtitle: opts.coverSubtitle,
      date: humanDate(opts.date),
      stats: coverStats,
    }),
    ...frontMatter,
    ...opts.body,
    ...(opts.wellnessNote === false ? [] : buildWellnessNoteSection("aromaterapi", opts.expertName, common)),
  ];

  const doc = new Document({
    creator: AROMA_SYSTEM_TITLE,
    title: `${moduleTitle} — ${opts.reportName}`,
    // Belge dili: TR'de dil işareti EKLENMEZ (bugünkü çıktı birebir); EN'de w:lang = en-GB.
    ...(out.docxStyles() ? { styles: out.docxStyles() } : {}),
    // Word açılışında alanları (TOC sayfa numaraları) güncellemeye zorlar → boş TOC görünmez.
    features: { updateFields: true },
    // Gerçek numbered-list (Uygulama Adımları) için abstract-numbering kaydı.
    numbering: { config: [stepsNumberingConfig()] },
    sections: [{
      headers: { default: buildHeader(`${moduleTitle} · ${opts.reportName}`) },
      footers: { default: buildFooter(opts.reportName, opts.wellnessNote === false ? (common ? { common } : undefined) : { note: "aromaterapi", common }) },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
