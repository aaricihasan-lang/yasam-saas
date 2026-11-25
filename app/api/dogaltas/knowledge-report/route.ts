import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { serverErrorResponse } from "@/lib/http/apiError";
import { fetchAllRows, fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";
import { badSelectionResponse, missingSelectionResponse, parseReportIds, sortByTrField } from "@/lib/dogaltas/reportIds";
import { trackUsage } from "@/lib/usage/trackUsage";
import { safeJoin, safeLen } from "@/lib/dogaltas/reportSafe";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { Document, Packer, Paragraph, TextRun } from "docx";
import {
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  buildSectionDivider,
  buildStatsPage,
  C_DARK,
  divider,
  fieldInline,
  h3,
  inlineRuns,
  muted,
  REPORT_FONT,
  ReportChild,
  SECTION_COLORS,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "@/lib/docx/premiumToc";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { reportFileDate } from "@/lib/time/reportTime";
import { resolveReportLocale, type ReportLocale } from "@/lib/i18n/reportLocale";
import { stonesText, stonesTextFor, upperContent, withStonesOutput } from "@/lib/dogaltas/reportText";

export const runtime = "nodejs";

// I18N-F1-R5 RAPOR-E (P15): sistem metinleri `reports.stones.knowledge.*` (TR birebir — golden kilitli).
// Makale içeriği (başlık, kategori, kaynak, etiket, metin) uzman kaydıdır → çevrilmez.
const T = (key: string, values?: Record<string, string | number>): string => stonesText().t(`knowledge.${key}`, values);

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportMode = "all" | "category" | "filtered" | "viewed";

type ArticleRow = {
  id: string;
  title: string;
  content: string;
  category: string;
  sub_category: string | null;
  source: string | null;
  source_section: string | null;
  notes: string | null;
  tags: string[] | null;
  related_stones: string[] | null;
  related_minerals: string[] | null;
  created_at: string | null;
};

// ─── Content parser ───────────────────────────────────────────────────────────

function parseContent(content: string): ReportChild[] {
  if (!content?.trim()) return [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: ReportChild[] = [];
  let buf: string[] = [];

  function flush() {
    const text = buf.join(" ").trim();
    if (text) out.push(new Paragraph({ children: inlineRuns(text), spacing: { after: 160 }, indent: { left: 360 } }));
    buf = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("## "))       { flush(); out.push(h3(line.slice(3).trim())); }
    else if (line.startsWith("### ")) {
      flush();
      out.push(new Paragraph({
        children: [new TextRun({ text: line.slice(4).trim(), bold: true, size: 21, font: REPORT_FONT, color: C_DARK })],
        spacing: { before: 140, after: 80 },
        indent: { left: 360 },
      }));
    }
    else if (line.trim() === "") { flush(); }
    else { buf.push(line); }
  }
  flush();
  return out;
}

// ─── Document builder ─────────────────────────────────────────────────────────

/** Kapsam etiketi (çıktı dilinde; kategori adı kayıt içeriğidir → aynen). */
function knowledgeExportLabel(category: string, hasIds: boolean, exportMode: ExportMode, output?: ReportLocale | null): string {
  const t = stonesTextFor(output).t;
  if (category) return t("knowledge.scope.category", { name: category });
  if (hasIds) return exportMode === "viewed" ? t("knowledge.scope.viewed") : t("knowledge.scope.filtered");
  return t("knowledge.scope.all");
}

/** Dosya adı (sistem kısmı çıktı dilinde). */
function knowledgeReportFileName(dateSlug: string, output?: ReportLocale | null): string {
  return `${stonesTextFor(output).t("knowledge.file")}-${dateSlug}.docx`;
}

function buildDocument(articles: ArticleRow[], exportLabel: string, toc: StaticTocCollector): ReportChild[] {
  const X = stonesText();
  const date = X.generatedLabel();
  const color = SECTION_COLORS.knowledge;
  const n = (key: string, count: number) => T(key, { count, shown: String(count) });

  const groups = new Map<string, ArticleRow[]>();
  for (const a of articles) {
    const cat = a.category || T("generalCategory");
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(a);
  }

  const categoryRows: [string, string][] = [...groups.entries()].map(
    ([cat, arts]) => [cat, n("articles", arts.length)]
  );

  const out: ReportChild[] = [];

  // Premium cover
  out.push(...buildPremiumCover({
    title1:   X.t("brand"),
    title2:   T("coverTitle"),
    subtitle: T("coverSubtitle"),
    date:     X.t("generatedOnDate", { date }),
    stats: [
      { label: T("stat.totalArticles"), value: String(articles.length) },
      { label: T("stat.categoryCount"), value: String(groups.size) },
      { label: T("stat.scope"),         value: exportLabel },
    ],
  }));

  // Stats page
  out.push(...buildStatsPage(
    [[T("summary.totalArticles"), String(articles.length)], [T("summary.categoryCount"), String(groups.size)]],
    [...groups.entries()].map(([cat, arts]) => T("categoryArticles", { category: cat, count: arts.length, shown: String(arts.length) })),
    X.common,
  ));

  // İçindekiler: eski boş Word TOC alanı yerine STATİK + tıklanabilir girişler (gövde
  // başlıklarından toplanır, gövde bittikten sonra bu konuma yerleştirilir; başlık yoksa sayfa yok).
  const tocAt = out.length;

  // Genel Özet
  out.push(
    toc.h1Colored(T("summaryTitle"), color, true),
    muted(T("summaryMeta", { categories: groups.size, categoriesShown: String(groups.size), articles: articles.length, articlesShown: String(articles.length) })),
    twoColTable(categoryRows),
  );

  // Articles — each category as a section with divider
  let catIndex = 2;
  for (const [category, catArticles] of groups) {
    out.push(
      // Kategori adı kayıt içeriğidir (TR büyük harf kuralı); boş kategori yedeği sistem metnidir (çıktı dilinin kuralı).
      ...buildSectionDivider(upperContent(category, catArticles.every((a) => !a.category)), n("dividerSub", catArticles.length), color),
      toc.h1Colored(`${catIndex}. ${category}`, color, true),
      muted(n("articles", catArticles.length)),
    );
    catIndex++;

    for (let i = 0; i < catArticles.length; i++) {
      const a = catArticles[i]!;
      if (i > 0) out.push(divider());

      out.push(toc.h2(a.title || T("untitled")));

      if (a.sub_category?.trim())   out.push(fieldInline(T("field.subCategory"), a.sub_category.trim()));
      if (a.created_at)             out.push(fieldInline(T("field.date"), X.date(a.created_at)));
      if (a.source?.trim())         out.push(fieldInline(T("field.source"), a.source.trim()));
      if (a.source_section?.trim() && a.source_section !== a.title)
                                    out.push(fieldInline(T("field.sourceSection"), a.source_section.trim()));
      if (safeLen(a.tags))           out.push(fieldInline(T("field.tags"), safeJoin(a.tags)));
      if (safeLen(a.related_stones)) out.push(fieldInline(T("field.relatedStones"), safeJoin(a.related_stones)));
      if (safeLen(a.related_minerals)) out.push(fieldInline(T("field.relatedMinerals"), safeJoin(a.related_minerals)));

      if (a.content?.trim()) { out.push(spacer()); out.push(...parseContent(a.content)); }
      if (a.notes?.trim())   { out.push(h3(T("field.notes"))); out.push(bodyText(a.notes.trim())); }
    }
  }

  out.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, X.common));
  return out;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  // F-018: doğrulanmış oturum kapısı — tenantId/userId SUNUCUDAN (body'den DEĞİL).
  const auth = await requireDogaltasReportAccess(req);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;
  // Usage360 kimliği yalnız doğrulanmış rapor kapısından; demo orada zaten 403.
  const usageGuard = { ...auth, is_demo_account: false };

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", categoryName, articleIds } = body as {
    exportMode?: ExportMode;
    categoryName?: string;
    articleIds?: string[];
  };

  // Shared-library kaldırma: rapor YALNIZ uzmanın kendi tenant kayıtlarını içerir
  // (admin kütüphanesi UNION edilmez — liste görünümüyle tutarlı).
  const SELECT =
    "id, title, content, category, sub_category, source, source_section, notes, tags, related_stones, related_minerals, created_at";

  // P2-02: seçili id listesi doğrulanır; P2-07: sayfalı okuma (tenant filtresi her sayfada).
  const wantsSubset = exportMode === "filtered" || exportMode === "viewed";
  const parsedIds = wantsSubset ? parseReportIds(articleIds) : ({ ok: true, ids: null } as const);
  if (!parsedIds.ok) return badSelectionResponse(parsedIds.error);
  const ids = parsedIds.ids;
  const category = exportMode === "category" ? categoryName?.trim() ?? "" : "";

  const output = await resolveReportLocale(req, { db, tenantId, userId: auth.userId });
  const exportLabel = knowledgeExportLabel(category, !!ids, exportMode, output);

  const res = ids
    ? await fetchAllRowsByIds<ArticleRow>(ids, (chunk, from, to) =>
        db.from("stone_knowledge_articles").select(SELECT).eq("tenant_id", tenantId).eq("is_active", true)
          .in("id", chunk).order("category").order("title").order("id").range(from, to))
    : await fetchAllRows<ArticleRow>((from, to) => {
        let q = db.from("stone_knowledge_articles").select(SELECT).eq("tenant_id", tenantId).eq("is_active", true);
        if (category) q = q.eq("category", category);
        return q.order("category").order("title").order("id").range(from, to);
      });
  if (!res.ok) return serverErrorResponse({ route: "dogaltas/knowledge-report", action: "POST", tenantId, cause: res.error, usage: { guard: usageGuard, req, module: "stones", failedAction: "report_generated", subEntity: "knowledge" } });
  if (ids && res.rows.length !== ids.length) return missingSelectionResponse();
  const data = ids && ids.length > 150 ? sortByTrField(sortByTrField(res.rows, "title"), "category") : res.rows;

  const articles = sanitizeXmlDeep((data ?? []) as ArticleRow[]); // RPT-XML
  if (!articles.length) return Response.json({ ok: false, error: "Bu seçim için makale bulunamadı." }, { status: 404 });

  const doc = withStonesOutput(output, () => {
    const X = stonesText();
    const toc = new StaticTocCollector("tbk");
    const docBody = buildDocument(articles, exportLabel, toc);
    const styles = X.output.docxStyles();
    return new Document({
      ...toc.documentOptions(),
      ...(styles ? { styles } : {}),
      sections: [{
        properties: {},
        footers: { default: buildFooter(T("footer"), { note: "dogaltas", common: X.common }) },
        children: [...docBody, ...buildWellnessNoteSection("dogaltas", expertDisplayName(auth.profile), X.common)],
      }],
    });
  });

  const buffer = await Packer.toBuffer(doc);
  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: knowledge; çoklu → itemCount).
  await trackUsage(usageGuard, req, {
    module: "stones",
    action: "report_generated",
    subEntity: "knowledge",
    resourceId: articles.map((r) => r.id).sort().join(","),
    itemCount: articles.length,
  });
  const dateSlug = reportFileDate();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${knowledgeReportFileName(dateSlug, output)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
