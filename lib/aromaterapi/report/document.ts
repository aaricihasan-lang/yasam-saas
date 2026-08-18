/**
 * Aromaterapi Word — DOCX doküman kurucusu (Document + cover + stats + TOC + body).
 * reportHelpers primitiflerini reuse eder; yeni ikinci framework YOK.
 */

import { Document, Packer } from "docx";
import {
  buildPremiumCover, buildStatsPage, buildTOCPage, buildCompactFrontMatter,
  buildFooter, buildHeader, stepsNumberingConfig, type ReportChild,
} from "@/lib/docx/reportHelpers";
import { AROMA_MODULE_TITLE, AROMA_SYSTEM_TITLE, humanDate, type FrontMatterMode } from "./theme";

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
}

/** Tek section'lı, header+footer'lı DOCX Buffer üretir. */
export async function buildAromaDoc(opts: AromaDocOptions): Promise<Buffer> {
  const mode: FrontMatterMode = opts.frontMatter ?? "full";
  const coverStats = [...opts.stats];
  if (opts.expertName && opts.expertName.trim()) coverStats.unshift({ label: "Uzman", value: opts.expertName.trim() });

  const statRows = opts.stats.map((s) => [s.label, s.value] as [string, string]);
  // Adaptif front-matter — sınıfa göre kapak sonrası akış (gereksiz boş sayfalar YOK).
  const frontMatter: ReportChild[] =
    mode === "full"
      ? [...(statRows.length ? buildStatsPage(statRows) : []), ...buildTOCPage()]
      : mode === "compact"
        ? buildCompactFrontMatter(statRows, true)
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
  ];

  const doc = new Document({
    creator: AROMA_SYSTEM_TITLE,
    title: `${AROMA_MODULE_TITLE} — ${opts.reportName}`,
    // Word açılışında alanları (TOC sayfa numaraları) güncellemeye zorlar → boş TOC görünmez.
    features: { updateFields: true },
    // Gerçek numbered-list (Uygulama Adımları) için abstract-numbering kaydı.
    numbering: { config: [stepsNumberingConfig()] },
    sections: [{
      headers: { default: buildHeader(`${AROMA_MODULE_TITLE} · ${opts.reportName}`) },
      footers: { default: buildFooter(opts.reportName) },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
