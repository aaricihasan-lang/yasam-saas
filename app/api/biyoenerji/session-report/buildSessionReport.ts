/**
 * Biyoenerji Seans Word raporu — SAF belge kurucusu (DB/ağ YOK → harness gerçek DOCX test eder).
 * FA-02: created_at timestamptz → Europe/Istanbul (lib/time/reportTime); dosya adı yerel gün.
 * FA-16: sade "Bilgilendirme" notu (footer + rapor sonu) + "Hazırlayan".
 */
import { Document } from "docx";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildWellnessNoteSection,
  divider,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "@/lib/docx/premiumToc";
import { formatInstantDateTime, reportFileDate } from "@/lib/time/reportTime";
import type { ReportLocale } from "@/lib/i18n/reportLocale";
// I18N-F1-R5 RAPOR-E (P22): sistem metinleri reports.bioenergy.* (çıktı dili; TR birebir — golden). Seans içeriği çevrilmez.
import { bioTextFor } from "@/lib/biyoenerji/reportText";

const C_SEANS = "ea580c"; // biyoenerji turuncu

export type BioSessionExportMode = "all" | "selected" | "single";

export type BioSessionRow = {
  id: string;
  tenant_id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export function buildBioSessionReportDoc(input: {
  sessions: BioSessionRow[];
  exportMode: BioSessionExportMode;
  truncatedNote?: string | null;
  expertName?: string | null;
  now?: Date;
  /** I18N çıktı dili (route `resolveReportLocale`); verilmezse tr → bugünkü rapor birebir. */
  output?: ReportLocale | null;
  /** Kırpma olduysa kayıt tavanı — not metni çıktı dilinde üretilir (truncatedNote'a tercih edilir). */
  truncatedAt?: number | null;
}): { doc: Document; filename: string } {
  const { sessions, exportMode } = input;
  const B = bioTextFor(input.output);
  const C = B.t;
  const now = input.now ?? new Date();
  const today = B.generated(now);
  const dateSlug = reportFileDate(undefined, now);
  const isSingle = exportMode === "single" || (exportMode === "selected" && sessions.length === 1);

  const exportLabel =
    B.scope("session", isSingle ? "single" : exportMode === "selected" ? "selected" : "all", sessions.length, sessions[0]?.title || "");

  const categories = new Set(sessions.map((s) => s.category?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   C("common.brand"),
    title2:   C("session.title"),
    subtitle: isSingle && sessions[0]
      ? C("session.singleSubtitle", { name: sessions[0].title || C("session.nameFallback") })
      : C("session.catalogSubtitle"),
    date:     C("common.generatedOn", { date: today }),
    stats: [
      { label: C("session.stat"),     value: String(sessions.length) },
      { label: C("common.category"),  value: String(categories.size) },
      { label: C("common.scope"),     value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    [C("session.stat"),    String(sessions.length)],
    [C("common.category"), String(categories.size)],
    [C("common.scope"),    exportLabel],
  ], undefined, B.common));

  // İçindekiler: eski boş Word TOC alanı yerine STATİK + tıklanabilir girişler (gövde
  // başlıklarından toplanır, gövde bittikten sonra bu konuma yerleştirilir; başlık yoksa sayfa yok).
  const toc = new StaticTocCollector("bses");
  const tocAt = all.length;

  const truncatedNote = input.truncatedAt != null ? B.truncated(input.truncatedAt) : input.truncatedNote;
  if (truncatedNote) all.push(muted(truncatedNote));

  all.push(toc.h1Colored(C("session.heading"), C_SEANS, true));
  all.push(muted(C("session.meta", { count: sessions.length, shown: String(sessions.length) })));
  all.push(spacer());

  sessions.forEach((session, i) => {
    const title = session.title?.trim() || C("session.untitled");

    if (i > 0) all.push(divider());

    all.push(profileLabel(C("session.cardNo", { no: String(i + 1).padStart(3, "0") }), C_SEANS));
    all.push(toc.h2(title));

    all.push(twoColTable([
      [C("common.date"),     formatInstantDateTime(session.created_at, { locale: B.output.intlTag, fallback: session.created_at })],
      [C("common.category"), session.category?.trim() || C("common.notSpecified")],
      ...(session.source?.trim() ? [[C("common.source"), session.source.trim()] as [string, string]] : []),
    ]));

    if (session.content?.trim()) {
      all.push(h3(C("session.content")));
      all.push(bodyText(session.content.trim()));
    }

    if (session.note?.trim()) {
      all.push(h3(C("common.note")));
      all.push(bodyText(session.note.trim()));
    }
  });

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("biyoenerji", input.expertName, B.common));

  all.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, B.common));

  const doc = new Document({
    ...toc.documentOptions(),
    ...B.styles(),
    sections: [{
      properties: {},
      footers: { default: buildFooter(C("session.footer"), { note: "biyoenerji", common: B.common }) },
      children: all,
    }],
  });

  return { doc, filename: B.fileName("session", isSingle && sessions[0]?.title ? slugify(sessions[0].title) : null, exportMode, dateSlug) };
}
