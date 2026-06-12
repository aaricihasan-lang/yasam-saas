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

type Sections = {
  stones?: boolean;
  minerals?: boolean;
  combinations?: boolean;
  knowledge?: boolean;
  analytics?: boolean;
};

type StoneRow = {
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, unknown> | null;
  warning_text: string | null;
  warning_tags: string[] | null;
};

type MineralRow = {
  name: string;
  aciklama: string | null;
  kategori: string | null;
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  organ_etkileri: string[] | null;
  cakralar: string[] | null;
};

type CombinationRow = {
  issue: string;
  description: string | null;
  source: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  notes_text_3: string | null;
};

type KnowledgeRow = {
  title: string;
  content: string;
  category: string;
  sub_category: string | null;
  source: string | null;
  tags: string[] | null;
  related_stones: string[] | null;
  related_minerals: string[] | null;
  notes: string | null;
};

type FileChild = Paragraph | Table;

// ─── Paragraph helpers ────────────────────────────────────────────────────────

function coverLine(text: string, size: number, bold = false, color = C_MID): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: FONT, color })],
    spacing: { after: 160 },
  });
}

function h1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
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

function fieldInline(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: FONT, color: C_DARK }),
      new TextRun({ text: value, size: 22, font: FONT, color: C_MID }),
    ],
    spacing: { after: 100 },
  });
}

function fieldLabel(label: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label}:`, bold: true, size: 22, font: FONT, color: C_DARK })],
    spacing: { before: 160, after: 60 },
  });
}

function bodyText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: FONT, color: C_MID })],
    indent: { left: 360 },
    spacing: { after: 120 },
  });
}

function muted(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 240 },
  });
}

function divider(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
    spacing: { before: 280, after: 280 },
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 200 } });
}

// ─── Table builder ────────────────────────────────────────────────────────────

function twoColTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 22, font: FONT, color: C_DARK })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
            })],
          }),
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: value, size: 22, font: FONT, color: C_MID })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
            })],
          }),
        ],
      })
    ),
  });
}

// ─── Assignments formatter ─────────────────────────────────────────────────────

function fmtAssignments(a: Record<string, unknown> | null): string {
  if (!a) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (Array.isArray(v)) {
      const items = v.flatMap((row) => {
        if (Array.isArray(row)) return row.map((c) => String(c ?? "")).filter(Boolean);
        if (typeof row === "string" && row.trim()) return [row.trim()];
        return [];
      });
      if (items.length) parts.push(`${k}: ${items.join(", ")}`);
    } else if (typeof v === "string" && v.trim()) {
      parts.push(`${k}: ${v.trim()}`);
    }
  }
  return parts.join("  ·  ");
}

// ─── Knowledge content parser ─────────────────────────────────────────────────

function parseContent(content: string): Paragraph[] {
  if (!content?.trim()) return [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: Paragraph[] = [];
  let buf: string[] = [];

  function flush() {
    const t = buf.join(" ").trim();
    if (t) out.push(bodyText(t));
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

// ─── Section builders ─────────────────────────────────────────────────────────

function buildCover(date: string, sections: Sections, counts: Record<string, number>): FileChild[] {
  const included: string[] = [];
  if (sections.stones)      included.push(`Doğaltaş Kayıtları (${counts.stones ?? 0} kayıt)`);
  if (sections.minerals)    included.push(`Mineral Bankası (${counts.minerals ?? 0} kayıt)`);
  if (sections.combinations) included.push(`Kombinasyonlar (${counts.combinations ?? 0} kayıt)`);
  if (sections.knowledge)   included.push(`Taş Bilgi Kütüphanesi (${counts.knowledge ?? 0} makale)`);
  if (sections.analytics)   included.push("Stok / Analiz Özeti");

  return [
    new Paragraph({ spacing: { before: 1600 } }),
    coverLine("YAŞAM SİSTEMİ", 60, true, C_DARK),
    coverLine("DOĞALTAŞ YÖNETİM RAPORU", 40, false, C_MID),
    spacer(),
    coverLine(`Oluşturulma Tarihi: ${date}`, 22, false, C_LIGHT),
    spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Rapora Dahil Edilen Bölümler:", bold: true, size: 22, font: FONT, color: C_DARK })],
      spacing: { after: 120 },
    }),
    ...included.map((line) => new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `· ${line}`, size: 22, font: FONT, color: C_MID })],
      spacing: { after: 80 },
    })),
  ];
}

function buildSummary(counts: Record<string, number>): FileChild[] {
  const rows: [string, string][] = [];
  if (counts.stones != null)       rows.push(["Doğaltaş Kayıtları", `${counts.stones} kayıt`]);
  if (counts.minerals != null)     rows.push(["Mineral Bankası", `${counts.minerals} kayıt`]);
  if (counts.combinations != null) rows.push(["Kombinasyonlar", `${counts.combinations} kayıt`]);
  if (counts.knowledge != null)    rows.push(["Taş Bilgi Kütüphanesi", `${counts.knowledge} makale`]);

  return [
    h1("1. Genel Özet", true),
    muted("Seçilen bölümlere ait Supabase verilerinden oluşturulmuştur."),
    ...(rows.length > 0 ? [twoColTable(rows), spacer()] : []),
  ];
}

function buildStonesSection(stones: StoneRow[], n: number): FileChild[] {
  const result: FileChild[] = [
    h1(`${n}. Doğaltaş Kayıtları`, true),
    muted(`Toplam ${stones.length} taş kaydı`),
  ];

  for (let i = 0; i < stones.length; i++) {
    const s = stones[i]!;
    if (i > 0) result.push(divider());
    result.push(h2(s.stone_name || "İsimsiz Taş"));
    if (s.short_description?.trim()) result.push(bodyText(s.short_description.trim()));
    if (s.general_info?.trim())        { result.push(fieldLabel("Genel Bilgi")); result.push(bodyText(s.general_info.trim())); }
    if (s.physical_effects?.trim())    { result.push(fieldLabel("Fiziksel Etkiler")); result.push(bodyText(s.physical_effects.trim())); }
    if (s.spiritual_effects?.trim())   { result.push(fieldLabel("Ruhsal Etkiler")); result.push(bodyText(s.spiritual_effects.trim())); }
    if (s.other_effects?.trim())       { result.push(fieldLabel("Diğer Etkiler")); result.push(bodyText(s.other_effects.trim())); }
    if (s.feng_shui?.trim())           { result.push(fieldLabel("Feng Shui")); result.push(bodyText(s.feng_shui.trim())); }
    if (s.meditation?.trim())          { result.push(fieldLabel("Meditasyon")); result.push(bodyText(s.meditation.trim())); }
    if (s.care?.trim())                { result.push(fieldLabel("Bakım")); result.push(bodyText(s.care.trim())); }
    if (s.application?.trim())         { result.push(fieldLabel("Kullanım")); result.push(bodyText(s.application.trim())); }
    if (s.chakras?.length)             result.push(fieldInline("Çakralar", s.chakras.join(", ")));
    const asgn = fmtAssignments(s.assignments);
    if (asgn)                          result.push(fieldInline("Atamalar / Burçlar", asgn));
    if (s.warning_text?.trim())        result.push(fieldInline("Uyarı", s.warning_text.trim()));
    if (s.warning_tags?.length)        result.push(fieldInline("Uyarı Etiketleri", s.warning_tags.join(", ")));
    if (s.source_note?.trim())         result.push(fieldInline("Kaynak Not", s.source_note.trim()));
  }

  return result;
}

function buildMineralsSection(minerals: MineralRow[], n: number): FileChild[] {
  const result: FileChild[] = [
    h1(`${n}. Mineral Bankası`, true),
    muted(`Toplam ${minerals.length} mineral kaydı`),
  ];

  function arrLine(label: string, arr: string[] | null): FileChild[] {
    if (!arr?.length) return [];
    return [fieldInline(label, arr.join(" · "))];
  }

  for (let i = 0; i < minerals.length; i++) {
    const m = minerals[i]!;
    if (i > 0) result.push(divider());
    result.push(h2(m.name || "İsimsiz Mineral"));
    if (m.kategori?.trim())  result.push(fieldInline("Kategori", m.kategori.trim()));
    if (m.aciklama?.trim())  { result.push(fieldLabel("Açıklama")); result.push(bodyText(m.aciklama.trim())); }
    result.push(...arrLine("Fiziksel Etkiler", m.fiziksel));
    result.push(...arrLine("Zihinsel Etkiler", m.zihinsel));
    result.push(...arrLine("Fizyoloji", m.fizyoloji));
    result.push(...arrLine("Eksiklik Belirtileri", m.eksiklik_belirtileri));
    result.push(...arrLine("Fazlalık Belirtileri", m.fazlalik_belirtileri));
    result.push(...arrLine("Doz Aşımı", m.doz_asimi));
    result.push(...arrLine("İçeren Taşlar", m.iceren_taslar));
    result.push(...arrLine("Organ Etkileri", m.organ_etkileri));
    result.push(...arrLine("Çakralar", m.cakralar));
  }

  return result;
}

function buildCombinationsSection(combos: CombinationRow[], n: number): FileChild[] {
  const result: FileChild[] = [
    h1(`${n}. Kombinasyonlar`, true),
    muted(`Toplam ${combos.length} kombinasyon kaydı`),
  ];

  for (let i = 0; i < combos.length; i++) {
    const c = combos[i]!;
    if (i > 0) result.push(divider());
    result.push(h2(c.issue || "İsimsiz Kombinasyon"));
    if (c.description?.trim())  result.push(fieldInline("Amaç / Kategori", c.description.trim()));
    if (c.stones_text?.trim())  { result.push(fieldLabel("Taşlar")); result.push(bodyText(c.stones_text.trim())); }
    if (c.notes_text?.trim())   { result.push(fieldLabel("Kullanım Önerisi")); result.push(bodyText(c.notes_text.trim())); }
    if (c.notes_text_2?.trim()) result.push(bodyText(c.notes_text_2.trim()));
    if (c.notes_text_3?.trim()) result.push(bodyText(c.notes_text_3.trim()));
    if (c.source?.trim())       result.push(fieldInline("Kaynak", c.source.trim()));
  }

  return result;
}

function buildKnowledgeSection(articles: KnowledgeRow[], n: number): FileChild[] {
  const result: FileChild[] = [
    h1(`${n}. Taş Bilgi Kütüphanesi`, true),
    muted(`Toplam ${articles.length} makale`),
  ];

  const grouped = new Map<string, KnowledgeRow[]>();
  for (const a of articles) {
    const cat = a.category || "Genel";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(a);
  }

  let firstCat = true;
  for (const [category, catArticles] of grouped) {
    if (!firstCat) result.push(divider());
    firstCat = false;
    result.push(h3(`— ${category} —`));

    for (const a of catArticles) {
      result.push(h2(a.title || "Başlıksız Makale"));
      if (a.sub_category?.trim())         result.push(fieldInline("Alt Kategori", a.sub_category.trim()));
      if (a.source?.trim())               result.push(fieldInline("Kaynak", a.source.trim()));
      if (a.tags?.length)                 result.push(fieldInline("Etiketler", a.tags.join(", ")));
      if (a.related_stones?.length)       result.push(fieldInline("İlgili Taşlar", a.related_stones.join(", ")));
      if (a.related_minerals?.length)     result.push(fieldInline("İlgili Mineraller", a.related_minerals.join(", ")));
      if (a.content?.trim())              result.push(...parseContent(a.content));
      if (a.notes?.trim())                { result.push(fieldLabel("Notlar")); result.push(bodyText(a.notes.trim())); }
    }
  }

  return result;
}

function buildAnalyticsSection(counts: Record<string, number>, n: number): FileChild[] {
  const now = new Date();
  const rows: [string, string][] = [
    ["Rapor Tarihi", now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })],
    ["Doğaltaş Kayıtları", counts.stones != null ? `${counts.stones} kayıt` : "Dahil edilmedi"],
    ["Mineral Bankası", counts.minerals != null ? `${counts.minerals} kayıt` : "Dahil edilmedi"],
    ["Kombinasyonlar", counts.combinations != null ? `${counts.combinations} kayıt` : "Dahil edilmedi"],
    ["Taş Bilgi Kütüphanesi", counts.knowledge != null ? `${counts.knowledge} makale` : "Dahil edilmedi"],
    ["Toplam Kayıt", String(Object.values(counts).reduce((a, b) => a + b, 0))],
  ];

  return [
    h1(`${n}. Stok / Analiz Özeti`, true),
    muted("Seçilen bölümlerin istatistikleri"),
    twoColTable(rows),
  ];
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, sections } = body as { tenantId?: string; sections?: Sections };

  if (!tenantId || typeof tenantId !== "string") {
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });
  }
  if (!sections || !Object.values(sections).some(Boolean)) {
    return Response.json({ ok: false, error: "En az bir bölüm seçilmeli." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const knowledgeTenants = [ADMIN_LIBRARY_TENANT_ID];
  if (tenantId !== ADMIN_LIBRARY_TENANT_ID) knowledgeTenants.push(tenantId);

  const [stonesRes, mineralsRes, combinationsRes, knowledgeRes] = await Promise.all([
    sections.stones
      ? db.from("stones")
          .select("stone_name, short_description, general_info, source_note, physical_effects, spiritual_effects, other_effects, feng_shui, meditation, care, application, chakras, assignments, warning_text, warning_tags")
          .eq("tenant_id", tenantId)
          .order("stone_name")
      : null,
    sections.minerals
      ? db.from("minerals")
          .select("name, aciklama, kategori, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar")
          .eq("tenant_id", tenantId)
          .order("name")
      : null,
    sections.combinations
      ? db.from("combinations")
          .select("issue, description, source, stones_text, notes_text, notes_text_2, notes_text_3")
          .eq("tenant_id", tenantId)
          .order("issue")
      : null,
    sections.knowledge
      ? db.from("stone_knowledge_articles")
          .select("title, content, category, sub_category, source, tags, related_stones, related_minerals, notes")
          .in("tenant_id", knowledgeTenants)
          .eq("is_active", true)
          .order("category")
          .order("title")
      : null,
  ]);

  const stonesRows    = (stonesRes?.data      ?? []) as StoneRow[];
  const mineralRows   = (mineralsRes?.data    ?? []) as MineralRow[];
  const comboRows     = (combinationsRes?.data ?? []) as CombinationRow[];
  const knowledgeRows = (knowledgeRes?.data   ?? []) as KnowledgeRow[];

  const counts: Record<string, number> = {};
  if (sections.stones)       counts.stones       = stonesRows.length;
  if (sections.minerals)     counts.minerals     = mineralRows.length;
  if (sections.combinations) counts.combinations = comboRows.length;
  if (sections.knowledge)    counts.knowledge    = knowledgeRows.length;

  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const allChildren: FileChild[] = [];

  allChildren.push(...buildCover(date, sections, counts));
  allChildren.push(...buildSummary(counts));

  let sec = 2;
  if (sections.stones)       allChildren.push(...buildStonesSection(stonesRows, sec++));
  if (sections.minerals)     allChildren.push(...buildMineralsSection(mineralRows, sec++));
  if (sections.combinations) allChildren.push(...buildCombinationsSection(comboRows, sec++));
  if (sections.knowledge)    allChildren.push(...buildKnowledgeSection(knowledgeRows, sec++));
  if (sections.analytics)    allChildren.push(...buildAnalyticsSection(counts, sec));

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
              new TextRun({ text: "  ·  Yaşam Sistemi Doğaltaş Raporu", size: 18, font: FONT, color: C_LIGHT }),
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
      "Content-Disposition": `attachment; filename="yasam-sistemi-dogaltas-raporu-${dateSlug}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
