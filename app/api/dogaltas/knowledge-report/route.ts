import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { safeJoin, safeLen } from "@/lib/dogaltas/reportSafe";
import { Document, Packer, Paragraph, TextRun } from "docx";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildSectionDivider,
  buildStatsPage,
  buildTOCPage,
  C_DARK,
  divider,
  fieldInline,
  h1Colored,
  h2,
  h3,
  inlineRuns,
  muted,
  REPORT_FONT,
  ReportChild,
  SECTION_COLORS,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

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

function buildDocument(articles: ArticleRow[], exportLabel: string): ReportChild[] {
  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const color = SECTION_COLORS.knowledge;

  const groups = new Map<string, ArticleRow[]>();
  for (const a of articles) {
    const cat = a.category || "Genel";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(a);
  }

  const categoryRows: [string, string][] = [...groups.entries()].map(
    ([cat, arts]) => [cat, `${arts.length} makale`]
  );

  const out: ReportChild[] = [];

  // Premium cover
  out.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "TAŞ BİLGİ KÜTÜPHANESİ",
    subtitle: "Bilgi Bankası Referans Kataloğu",
    date:     `Oluşturulma Tarihi: ${date}`,
    stats: [
      { label: "Toplam Makale Sayısı", value: String(articles.length) },
      { label: "Kategori Sayısı",      value: String(groups.size) },
      { label: "Kapsam",               value: exportLabel },
    ],
  }));

  // Stats page
  out.push(...buildStatsPage(
    [["Toplam Makale", String(articles.length)], ["Kategori Sayısı", String(groups.size)]],
    [...groups.entries()].map(([cat, arts]) => `${cat}: ${arts.length} makale`)
  ));

  // TOC
  out.push(...buildTOCPage());

  // Genel Özet
  out.push(
    h1Colored("1. Genel Özet", color, true),
    muted(`${groups.size} kategori · ${articles.length} makale`),
    twoColTable(categoryRows),
  );

  // Articles — each category as a section with divider
  let catIndex = 2;
  for (const [category, catArticles] of groups) {
    out.push(
      ...buildSectionDivider(category.toUpperCase(), `${catArticles.length} Makale`, color),
      h1Colored(`${catIndex}. ${category}`, color, true),
      muted(`${catArticles.length} makale`),
    );
    catIndex++;

    for (let i = 0; i < catArticles.length; i++) {
      const a = catArticles[i]!;
      if (i > 0) out.push(divider());

      out.push(h2(a.title || "Başlıksız Makale"));

      if (a.sub_category?.trim())   out.push(fieldInline("Alt Kategori", a.sub_category.trim()));
      if (a.created_at)             out.push(fieldInline("Tarih", new Date(a.created_at).toLocaleDateString("tr-TR")));
      if (a.source?.trim())         out.push(fieldInline("Kaynak", a.source.trim()));
      if (a.source_section?.trim() && a.source_section !== a.title)
                                    out.push(fieldInline("Kaynak Bölüm", a.source_section.trim()));
      if (safeLen(a.tags))           out.push(fieldInline("Etiketler", safeJoin(a.tags)));
      if (safeLen(a.related_stones)) out.push(fieldInline("İlgili Taşlar", safeJoin(a.related_stones)));
      if (safeLen(a.related_minerals)) out.push(fieldInline("İlgili Mineraller", safeJoin(a.related_minerals)));

      if (a.content?.trim()) { out.push(spacer()); out.push(...parseContent(a.content)); }
      if (a.notes?.trim())   { out.push(h3("Notlar")); out.push(bodyText(a.notes.trim())); }
    }
  }

  return out;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  // F-018: doğrulanmış oturum kapısı — tenantId/userId SUNUCUDAN (body'den DEĞİL).
  const auth = await requireDogaltasReportAccess(req);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;

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

  let q = db.from("stone_knowledge_articles")
    .select(SELECT).eq("tenant_id", tenantId).eq("is_active", true);

  let exportLabel = "Tüm Makaleler";
  if (exportMode === "category" && categoryName?.trim()) {
    q = q.eq("category", categoryName.trim());
    exportLabel = `Kategori: ${categoryName.trim()}`;
  } else if ((exportMode === "filtered" || exportMode === "viewed") &&
             Array.isArray(articleIds) && articleIds.length > 0) {
    q = q.in("id", articleIds);
    exportLabel = exportMode === "viewed" ? "Görüntülenen Kayıtlar" : "Filtrelenmiş Sonuçlar";
  }

  const { data, error } = await q.order("category").order("title");
  if (error) return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });

  const articles = (data ?? []) as ArticleRow[];
  if (!articles.length) return Response.json({ ok: false, error: "Bu seçim için makale bulunamadı." }, { status: 404 });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Yaşam Sistemi — Taş Bilgi Kütüphanesi") },
      children: buildDocument(articles, exportLabel),
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const dateSlug = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="tas-bilgi-kutuphanesi-raporu-${dateSlug}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
