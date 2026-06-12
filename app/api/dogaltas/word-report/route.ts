import { createClient } from "@supabase/supabase-js";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildSectionDivider,
  buildStatsPage,
  buildTOCPage,
  C_DARK,
  C_LIGHT,
  C_MID,
  divider,
  embedImageParagraph,
  extractFirstImageUrl,
  fetchImagesBatch,
  fieldInline,
  h1Colored,
  h2,
  h3,
  inlineRuns,
  muted,
  profileLabel,
  REPORT_FONT,
  ReportChild,
  SECTION_COLORS,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

const ADMIN_LIBRARY_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

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
  images: unknown;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAssignments(a: Record<string, unknown> | null): string {
  if (!a) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (Array.isArray(v)) {
      const items = v.flatMap((row) => {
        if (Array.isArray(row)) return row.map((c) => String(c ?? "")).filter(Boolean);
        return typeof row === "string" && row.trim() ? [row.trim()] : [];
      });
      if (items.length) parts.push(`${k}: ${items.join(", ")}`);
    } else if (typeof v === "string" && v.trim()) {
      parts.push(`${k}: ${v.trim()}`);
    }
  }
  return parts.join("  ·  ");
}

function parseKnowledgeContent(content: string): ReportChild[] {
  if (!content?.trim()) return [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: ReportChild[] = [];
  let buf: string[] = [];

  function flush() {
    const t = buf.join(" ").trim();
    if (t) out.push(new Paragraph({ children: inlineRuns(t), spacing: { after: 160 }, indent: { left: 360 } }));
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

// ─── Section builders ─────────────────────────────────────────────────────────

function buildSummary(counts: Record<string, number>): ReportChild[] {
  const rows: [string, string][] = [];
  if (counts.stones != null)       rows.push(["Doğaltaş Kayıtları", `${counts.stones} kayıt`]);
  if (counts.minerals != null)     rows.push(["Mineral Bankası",     `${counts.minerals} kayıt`]);
  if (counts.combinations != null) rows.push(["Kombinasyonlar",       `${counts.combinations} kayıt`]);
  if (counts.knowledge != null)    rows.push(["Taş Bilgi Kütüphanesi", `${counts.knowledge} makale`]);
  return [
    h1Colored("1. Genel Özet", SECTION_COLORS.summary, true),
    muted("Seçilen bölümlere ait Supabase verilerinden oluşturulmuştur."),
    ...(rows.length > 0 ? [twoColTable(rows), spacer()] : []),
  ];
}

function buildStonesSection(
  stones: StoneRow[],
  n: number,
  imageBuffers: (Buffer | null)[]
): ReportChild[] {
  const color = SECTION_COLORS.stones;
  const result: ReportChild[] = [
    ...buildSectionDivider("DOĞALTAŞ KAYITLARI", `${stones.length} Taş Kaydı`, color),
    h1Colored(`${n}. Doğaltaş Kayıtları`, color, true),
    muted(`Toplam ${stones.length} taş kaydı`),
  ];

  for (let i = 0; i < stones.length; i++) {
    const s = stones[i]!;
    const imgBuf = imageBuffers[i] ?? null;
    if (i > 0) result.push(divider());

    // Profile header
    result.push(profileLabel(`DOĞALTAŞ #${String(i + 1).padStart(3, "0")}`, color));
    result.push(h2(s.stone_name || "İsimsiz Taş"));

    // Image (if available)
    if (imgBuf) result.push(embedImageParagraph(imgBuf, 400));

    // Short metadata
    if (s.source_note?.trim())  result.push(fieldInline("Kaynak Not", s.source_note.trim()));
    if (s.chakras?.length)      result.push(fieldInline("Çakra Sayısı", String(s.chakras.length)));
    if (s.warning_tags?.length) result.push(fieldInline("Uyarı Etiketleri", s.warning_tags.join(", ")));

    // Content sections (H3 — Navigation Panel)
    if (s.short_description?.trim()) result.push(bodyText(s.short_description.trim()));
    if (s.general_info?.trim())      { result.push(h3("Genel Bilgi"));      result.push(bodyText(s.general_info.trim())); }
    if (s.physical_effects?.trim())  { result.push(h3("Fiziksel Etkiler")); result.push(bodyText(s.physical_effects.trim())); }
    if (s.spiritual_effects?.trim()) { result.push(h3("Ruhsal Etkiler"));   result.push(bodyText(s.spiritual_effects.trim())); }
    if (s.other_effects?.trim())     { result.push(h3("Diğer Etkiler"));    result.push(bodyText(s.other_effects.trim())); }
    if (s.feng_shui?.trim())         { result.push(h3("Feng Shui"));        result.push(bodyText(s.feng_shui.trim())); }
    if (s.meditation?.trim())        { result.push(h3("Meditasyon"));       result.push(bodyText(s.meditation.trim())); }
    if (s.care?.trim())              { result.push(h3("Bakım"));            result.push(bodyText(s.care.trim())); }
    if (s.application?.trim())       { result.push(h3("Kullanım"));         result.push(bodyText(s.application.trim())); }

    if (s.chakras?.length) {
      result.push(h3("Çakralar"));
      result.push(bodyText(s.chakras.join(", ")));
    }
    const asgn = fmtAssignments(s.assignments);
    if (asgn) {
      result.push(h3("Atamalar / Burçlar"));
      result.push(bodyText(asgn));
    }
    if (s.warning_text?.trim()) {
      result.push(h3("Uyarılar"));
      result.push(bodyText(s.warning_text.trim()));
    }
  }
  return result;
}

function buildMineralsSection(minerals: MineralRow[], n: number): ReportChild[] {
  const color = SECTION_COLORS.minerals;
  const result: ReportChild[] = [
    ...buildSectionDivider("MİNERAL BANKASI", `${minerals.length} Mineral Kaydı`, color),
    h1Colored(`${n}. Mineral Bankası`, color, true),
    muted(`Toplam ${minerals.length} mineral kaydı`),
  ];

  for (let i = 0; i < minerals.length; i++) {
    const m = minerals[i]!;
    if (i > 0) result.push(divider());
    result.push(profileLabel(`MİNERAL #${String(i + 1).padStart(3, "0")}`, color));
    result.push(h2(m.name || "İsimsiz Mineral"));
    if (m.kategori?.trim()) result.push(fieldInline("Kategori", m.kategori.trim()));
    if (m.aciklama?.trim()) { result.push(h3("Açıklama")); result.push(bodyText(m.aciklama.trim())); }
    result.push(...arraySection("Fiziksel Etkiler",     m.fiziksel));
    result.push(...arraySection("Zihinsel Etkiler",     m.zihinsel));
    result.push(...arraySection("Fizyoloji",            m.fizyoloji));
    result.push(...arraySection("Eksiklik Belirtileri", m.eksiklik_belirtileri));
    result.push(...arraySection("Fazlalık Belirtileri", m.fazlalik_belirtileri));
    result.push(...arraySection("Doz Aşımı",            m.doz_asimi));
    result.push(...arraySection("İçeren Taşlar",        m.iceren_taslar));
    result.push(...arraySection("Organ Etkileri",       m.organ_etkileri));
    result.push(...arraySection("Çakralar",             m.cakralar));
  }
  return result;
}

function buildCombinationsSection(combos: CombinationRow[], n: number): ReportChild[] {
  const color = SECTION_COLORS.combinations;
  const result: ReportChild[] = [
    ...buildSectionDivider("KOMBİNASYONLAR", `${combos.length} Kombinasyon Kaydı`, color),
    h1Colored(`${n}. Kombinasyonlar`, color, true),
    muted(`Toplam ${combos.length} kombinasyon kaydı`),
  ];

  for (let i = 0; i < combos.length; i++) {
    const c = combos[i]!;
    if (i > 0) result.push(divider());
    result.push(profileLabel(`KOMBİNASYON #${String(i + 1).padStart(3, "0")}`, color));
    result.push(h2(c.issue || "İsimsiz Kombinasyon"));
    if (c.description?.trim())  result.push(fieldInline("Amaç / Kategori", c.description.trim()));
    if (c.stones_text?.trim())  { result.push(h3("Taşlar"));           result.push(bodyText(c.stones_text.trim())); }
    if (c.notes_text?.trim())   { result.push(h3("Kullanım Önerisi")); result.push(bodyText(c.notes_text.trim())); }
    if (c.notes_text_2?.trim()) result.push(bodyText(c.notes_text_2.trim()));
    if (c.notes_text_3?.trim()) result.push(bodyText(c.notes_text_3.trim()));
    if (c.source?.trim())       result.push(fieldInline("Kaynak", c.source.trim()));
  }
  return result;
}

function buildKnowledgeSection(articles: KnowledgeRow[], n: number): ReportChild[] {
  const color = SECTION_COLORS.knowledge;
  const result: ReportChild[] = [
    ...buildSectionDivider("TAŞ BİLGİ KÜTÜPHANESİ", `${articles.length} Makale`, color),
    h1Colored(`${n}. Taş Bilgi Kütüphanesi`, color, true),
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
      if (a.sub_category?.trim())     result.push(fieldInline("Alt Kategori", a.sub_category.trim()));
      if (a.source?.trim())           result.push(fieldInline("Kaynak", a.source.trim()));
      if (a.tags?.length)             result.push(fieldInline("Etiketler", a.tags.join(", ")));
      if (a.related_stones?.length)   result.push(fieldInline("İlgili Taşlar", a.related_stones.join(", ")));
      if (a.related_minerals?.length) result.push(fieldInline("İlgili Mineraller", a.related_minerals.join(", ")));
      if (a.content?.trim())          result.push(...parseKnowledgeContent(a.content));
      if (a.notes?.trim())            { result.push(h3("Notlar")); result.push(bodyText(a.notes.trim())); }
    }
  }
  return result;
}

function buildAnalyticsSection(counts: Record<string, number>, n: number): ReportChild[] {
  const color = SECTION_COLORS.analytics;
  const rows: [string, string][] = [
    ["Rapor Tarihi", new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })],
    ["Doğaltaş Kayıtları",   counts.stones        != null ? `${counts.stones} kayıt`        : "Dahil edilmedi"],
    ["Mineral Bankası",       counts.minerals      != null ? `${counts.minerals} kayıt`      : "Dahil edilmedi"],
    ["Kombinasyonlar",        counts.combinations  != null ? `${counts.combinations} kayıt`  : "Dahil edilmedi"],
    ["Taş Bilgi Kütüphanesi", counts.knowledge     != null ? `${counts.knowledge} makale`    : "Dahil edilmedi"],
    ["Toplam Kayıt", String(Object.values(counts).reduce((a, b) => a + b, 0))],
  ];
  return [
    ...buildSectionDivider("ANALİZ ÖZETİ", "Stok & Sistem İstatistikleri", color),
    h1Colored(`${n}. Stok / Analiz Özeti`, color, true),
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

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });
  if (!sections || !Object.values(sections).some(Boolean))
    return Response.json({ ok: false, error: "En az bir bölüm seçilmeli." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);
  const knowledgeTenants = [ADMIN_LIBRARY_TENANT_ID];
  if (tenantId !== ADMIN_LIBRARY_TENANT_ID) knowledgeTenants.push(tenantId);

  // Parallel DB fetches
  const [stonesRes, mineralsRes, combinationsRes, knowledgeRes] = await Promise.all([
    sections.stones
      ? db.from("stones")
          .select("stone_name, short_description, general_info, source_note, physical_effects, spiritual_effects, other_effects, feng_shui, meditation, care, application, chakras, assignments, warning_text, warning_tags, images")
          .eq("tenant_id", tenantId).order("stone_name")
      : null,
    sections.minerals
      ? db.from("minerals")
          .select("name, aciklama, kategori, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar")
          .eq("tenant_id", tenantId).order("name")
      : null,
    sections.combinations
      ? db.from("combinations")
          .select("issue, description, source, stones_text, notes_text, notes_text_2, notes_text_3")
          .eq("tenant_id", tenantId).order("issue")
      : null,
    sections.knowledge
      ? db.from("stone_knowledge_articles")
          .select("title, content, category, sub_category, source, tags, related_stones, related_minerals, notes")
          .in("tenant_id", knowledgeTenants).eq("is_active", true)
          .order("category").order("title")
      : null,
  ]);

  const stonesRows    = (stonesRes?.data       ?? []) as StoneRow[];
  const mineralRows   = (mineralsRes?.data     ?? []) as MineralRow[];
  const comboRows     = (combinationsRes?.data ?? []) as CombinationRow[];
  const knowledgeRows = (knowledgeRes?.data    ?? []) as KnowledgeRow[];

  const counts: Record<string, number> = {};
  if (sections.stones)       counts.stones       = stonesRows.length;
  if (sections.minerals)     counts.minerals     = mineralRows.length;
  if (sections.combinations) counts.combinations = comboRows.length;
  if (sections.knowledge)    counts.knowledge    = knowledgeRows.length;

  // Fetch stone images in parallel batches (non-blocking — failures → null)
  let stoneImageBuffers: (Buffer | null)[] = stonesRows.map(() => null);
  if (sections.stones && stonesRows.length > 0) {
    const urls = stonesRows.map((s) => extractFirstImageUrl(s.images));
    stoneImageBuffers = await fetchImagesBatch(urls);
  }

  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  // Premium cover stats
  const coverStats: { label: string; value: string }[] = [];
  if (counts.stones != null)       coverStats.push({ label: "Toplam Taş Sayısı",        value: String(counts.stones) });
  if (counts.minerals != null)     coverStats.push({ label: "Toplam Mineral Sayısı",    value: String(counts.minerals) });
  if (counts.combinations != null) coverStats.push({ label: "Toplam Kombinasyon Sayısı", value: String(counts.combinations) });
  if (counts.knowledge != null)    coverStats.push({ label: "Toplam Makale Sayısı",     value: String(counts.knowledge) });

  const allChildren: ReportChild[] = [
    // 1. Premium cover
    ...buildPremiumCover({
      title1:   "YAŞAM SİSTEMİ",
      title2:   "DOĞALTAŞ ANSİKLOPEDİSİ",
      subtitle: "Profesyonel Bilgi ve Referans Kataloğu",
      date:     `Oluşturulma Tarihi: ${date}`,
      stats:    coverStats,
    }),
    // 2. Stats page
    ...buildStatsPage(
      Object.entries(counts).map(([k, v]) => {
        const labels: Record<string, string> = {
          stones: "Doğaltaş Kayıtları", minerals: "Mineral Bankası",
          combinations: "Kombinasyonlar", knowledge: "Taş Bilgi Kütüphanesi",
        };
        return [(labels[k] ?? k), `${v} kayıt`] as [string, string];
      })
    ),
    // 3. TOC
    ...buildTOCPage(),
    // 4. Genel Özet
    ...buildSummary(counts),
  ];

  let sec = 2;
  if (sections.stones)       allChildren.push(...buildStonesSection(stonesRows, sec++, stoneImageBuffers));
  if (sections.minerals)     allChildren.push(...buildMineralsSection(mineralRows, sec++));
  if (sections.combinations) allChildren.push(...buildCombinationsSection(comboRows, sec++));
  if (sections.knowledge)    allChildren.push(...buildKnowledgeSection(knowledgeRows, sec++));
  if (sections.analytics)    allChildren.push(...buildAnalyticsSection(counts, sec));

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Yaşam Sistemi Doğaltaş Ansiklopedisi") },
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
