import { createClient } from "@supabase/supabase-js";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export const runtime = "nodejs";

const ADMIN_LIBRARY_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";
const FONT = "Calibri";
const C_DARK = "1e293b";
const C_MID = "475569";
const C_LIGHT = "94a3b8";

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

type FileChild = Paragraph | Table;

// ─── Inline text with ^^ bold markers ────────────────────────────────────────

function inlineRuns(text: string, size = 22): TextRun[] {
  return text.split("^^").flatMap((part, i) => {
    if (!part) return [];
    return [new TextRun({ text: part, bold: i % 2 === 1, size, font: FONT, color: i % 2 === 1 ? C_DARK : C_MID })];
  });
}

// ─── Paragraph builders ───────────────────────────────────────────────────────

function coverLine(text: string, size: number, bold = false, color = C_MID): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: FONT, color })],
    spacing: { after: 180 },
  });
}

function h1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 280 },
    pageBreakBefore: pageBreak,
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 200 },
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
  });
}

function meta(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20, font: FONT, color: C_DARK }),
      new TextRun({ text: value, size: 20, font: FONT, color: C_MID }),
    ],
    spacing: { after: 80 },
  });
}

function muted(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 200 },
  });
}

function divider(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
    spacing: { before: 280, after: 280 },
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 180 } });
}

// ─── Article content parser ───────────────────────────────────────────────────

function parseContent(content: string): Paragraph[] {
  if (!content?.trim()) return [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: Paragraph[] = [];
  let buf: string[] = [];

  function flush() {
    const text = buf.join(" ").trim();
    if (text) {
      out.push(new Paragraph({
        children: inlineRuns(text),
        spacing: { after: 160 },
        indent: { left: 360 },
      }));
    }
    buf = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) { flush(); out.push(h3(line.slice(3).trim())); }
    else if (line.startsWith("### ")) {
      flush();
      out.push(new Paragraph({
        children: [new TextRun({ text: line.slice(4).trim(), bold: true, size: 21, font: FONT, color: C_DARK })],
        spacing: { before: 140, after: 80 },
        indent: { left: 360 },
      }));
    } else if (line.trim() === "") { flush(); }
    else { buf.push(line); }
  }
  flush();
  return out;
}

// ─── Category summary table ───────────────────────────────────────────────────

function categoryTable(groups: Map<string, ArticleRow[]>): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 5500, type: WidthType.DXA },
        children: [new Paragraph({
          children: [new TextRun({ text: "Kategori", bold: true, size: 22, font: FONT, color: "1e3a5f" })],
          spacing: { before: 100, after: 100 },
          indent: { left: 120 },
        })],
      }),
      new TableCell({
        width: { size: 3500, type: WidthType.DXA },
        children: [new Paragraph({
          children: [new TextRun({ text: "Makale Sayısı", bold: true, size: 22, font: FONT, color: "1e3a5f" })],
          spacing: { before: 100, after: 100 },
          indent: { left: 120 },
        })],
      }),
    ],
  });

  const dataRows = [...groups.entries()].map(([cat, arts]) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 5500, type: WidthType.DXA },
          children: [new Paragraph({
            children: [new TextRun({ text: cat, bold: true, size: 22, font: FONT, color: C_DARK })],
            spacing: { before: 80, after: 80 },
            indent: { left: 120 },
          })],
        }),
        new TableCell({
          width: { size: 3500, type: WidthType.DXA },
          children: [new Paragraph({
            children: [new TextRun({ text: `${arts.length} makale`, size: 22, font: FONT, color: C_MID })],
            spacing: { before: 80, after: 80 },
            indent: { left: 120 },
          })],
        }),
      ],
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ─── Full document builder ────────────────────────────────────────────────────

function buildDocument(articles: ArticleRow[], exportLabel: string): FileChild[] {
  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  const groups = new Map<string, ArticleRow[]>();
  for (const a of articles) {
    const cat = a.category || "Genel";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(a);
  }

  const out: FileChild[] = [];

  // Cover
  out.push(
    new Paragraph({ spacing: { before: 1400 } }),
    coverLine("YAŞAM SİSTEMİ", 60, true, C_DARK),
    coverLine("TAŞ BİLGİ KÜTÜPHANESİ", 44, false, C_MID),
    coverLine("Bilgi Bankası Raporu", 30, false, C_MID),
    spacer(),
    coverLine(`Oluşturulma Tarihi: ${date}`, 22, false, C_LIGHT),
    coverLine(`Toplam Makale Sayısı: ${articles.length}`, 22, false, C_LIGHT),
    coverLine(`Kapsam: ${exportLabel}`, 22, false, C_LIGHT),
  );

  // İçindekiler & Kategori Özeti
  out.push(
    h1("İçindekiler", true),
    muted(`${groups.size} kategori · ${articles.length} makale`),
    categoryTable(groups),
  );

  // Articles — each category on a new page
  for (const [category, catArticles] of groups) {
    out.push(h1(category, true));
    out.push(muted(`${catArticles.length} makale`));

    for (let i = 0; i < catArticles.length; i++) {
      const a = catArticles[i]!;
      if (i > 0) out.push(divider());

      out.push(h2(a.title || "Başlıksız Makale"));

      // Meta
      out.push(meta("Kategori", a.category));
      if (a.sub_category?.trim())                    out.push(meta("Alt Kategori", a.sub_category.trim()));
      if (a.created_at)                              out.push(meta("Tarih", new Date(a.created_at).toLocaleDateString("tr-TR")));
      if (a.source?.trim())                          out.push(meta("Kaynak", a.source.trim()));
      if (a.source_section?.trim() && a.source_section !== a.title)
                                                     out.push(meta("Kaynak Bölüm", a.source_section.trim()));
      if (a.tags?.length)                            out.push(meta("Etiketler", a.tags.join(", ")));
      if (a.related_stones?.length)                  out.push(meta("İlgili Taşlar", a.related_stones.join(", ")));
      if (a.related_minerals?.length)                out.push(meta("İlgili Mineraller", a.related_minerals.join(", ")));

      // Content
      if (a.content?.trim()) {
        out.push(spacer());
        out.push(...parseContent(a.content));
      }

      // Notes
      if (a.notes?.trim()) {
        out.push(new Paragraph({
          children: [new TextRun({ text: "Notlar:", bold: true, size: 20, font: FONT, color: C_DARK })],
          spacing: { before: 160, after: 60 },
        }));
        out.push(new Paragraph({
          children: inlineRuns(a.notes.trim(), 20),
          indent: { left: 360 },
          spacing: { after: 120 },
        }));
      }
    }
  }

  return out;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", categoryName, articleIds } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    categoryName?: string;
    articleIds?: string[];
  };

  if (!tenantId || typeof tenantId !== "string") {
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });
  }

  const db = createClient(supabaseUrl, supabaseKey);
  const tenants = [ADMIN_LIBRARY_TENANT_ID];
  if (tenantId !== ADMIN_LIBRARY_TENANT_ID) tenants.push(tenantId);

  const SELECT =
    "id, title, content, category, sub_category, source, source_section, notes, tags, related_stones, related_minerals, created_at";

  let q = db.from("stone_knowledge_articles")
    .select(SELECT)
    .in("tenant_id", tenants)
    .eq("is_active", true);

  let exportLabel = "Tüm Makaleler";

  if (exportMode === "category" && categoryName?.trim()) {
    q = q.eq("category", categoryName.trim());
    exportLabel = `Kategori: ${categoryName.trim()}`;
  } else if ((exportMode === "filtered" || exportMode === "viewed") && Array.isArray(articleIds) && articleIds.length > 0) {
    q = q.in("id", articleIds);
    exportLabel = exportMode === "viewed" ? "Görüntülenen Kayıtlar" : "Filtrelenmiş Sonuçlar";
  }

  const { data, error } = await q.order("category").order("title");

  if (error) {
    return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });
  }

  const articles = (data ?? []) as ArticleRow[];
  if (!articles.length) {
    return Response.json({ ok: false, error: "Bu seçim için makale bulunamadı." }, { status: 404 });
  }

  const allChildren = buildDocument(articles, exportLabel);

  const doc = new Document({
    sections: [{
      properties: {},
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Sayfa ", size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ text: " / ", size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ text: "  ·  Yaşam Sistemi — Taş Bilgi Kütüphanesi", size: 18, font: FONT, color: C_LIGHT }),
            ],
          })],
        }),
      },
      children: allChildren,
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
