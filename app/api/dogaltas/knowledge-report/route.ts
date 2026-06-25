import { createClient } from "@supabase/supabase-js";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";
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

const ADMIN_LIBRARY_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

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
      if (a.tags?.length)           out.push(fieldInline("Etiketler", a.tags.join(", ")));
      if (a.related_stones?.length) out.push(fieldInline("İlgili Taşlar", a.related_stones.join(", ")));
      if (a.related_minerals?.length) out.push(fieldInline("İlgili Mineraller", a.related_minerals.join(", ")));

      if (a.content?.trim()) { out.push(spacer()); out.push(...parseContent(a.content)); }
      if (a.notes?.trim())   { out.push(h3("Notlar")); out.push(bodyText(a.notes.trim())); }
    }
  }

  return out;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId, exportMode = "all", categoryName, articleIds } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    categoryName?: string;
    articleIds?: string[];
  };

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // IDOR koruması: userId bu tenant'a gerçekten ait mi? — service_role
  const { data: userRow } = await db
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!userRow)
    return Response.json({ ok: false, error: "Yetkisiz erişim." }, { status: 403 });

  // Demo hesap: export sunucu seviyesinde engellenir
  if (await isDemoAccountId(userId, db))
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  const tenants = [ADMIN_LIBRARY_TENANT_ID];
  if (tenantId !== ADMIN_LIBRARY_TENANT_ID) tenants.push(tenantId);

  const SELECT =
    "id, title, content, category, sub_category, source, source_section, notes, tags, related_stones, related_minerals, created_at";

  let q = db.from("stone_knowledge_articles")
    .select(SELECT).in("tenant_id", tenants).eq("is_active", true);

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
