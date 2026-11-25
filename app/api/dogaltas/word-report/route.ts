import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { trackUsage } from "@/lib/usage/trackUsage";
import { safeJoin, safeLen, sanitizeMineralRowsForReport } from "@/lib/dogaltas/reportSafe";
import { fetchAllRows, fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";
import { badSelectionResponse, missingSelectionResponse, parseReportIds, sortByTrField } from "@/lib/dogaltas/reportIds";
import { serverErrorResponse } from "@/lib/http/apiError";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { hydrateCombinationStoneNames } from "@/lib/dogaltas/combinationStonesRead";
import { STONE_PHOTO_BUCKET, isOwnedStonePhotoPath } from "@/lib/dogaltas/stonePhoto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  buildSectionDivider,
  buildStatsPage,
  C_DARK,
  C_LIGHT,
  C_MID,
  divider,
  embedImageParagraph,
  extractFirstImageRef,
  fetchStorageImageBuffer,
  fieldInline,
  h3,
  inlineRuns,
  muted as mutedParagraph,
  profileLabel,
  REPORT_FONT,
  ReportChild,
  SECTION_COLORS,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, PLAIN_HEADINGS, StaticTocCollector, type TocHeadingFns } from "@/lib/docx/premiumToc";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { reportFileDate } from "@/lib/time/reportTime";
import { loadExtraSourcesForStones } from "@/lib/dogaltas/stoneSourcesServer";
import { pickSourceFields, type SourceTextField } from "@/lib/dogaltas/stoneSources";
import { bulletParagraphs, entryParagraphs, reportChakraEntries, reportEntriesByField, reportSourceNames, sourceAttribution, type ReportSource } from "@/lib/dogaltas/stoneSourceReport";
import { loadEntriesForStones } from "@/lib/dogaltas/stoneEntriesServer";
import { resolveReportLocale } from "@/lib/i18n/reportLocale";
import { encyclopediaBridgeText, stonesSourceName, stonesText, stonesTextFor, withStonesOutput } from "@/lib/dogaltas/reportText";

export const runtime = "nodejs";

// I18N-F1-R5 RAPOR-E: sistem metinleri `reports.stones.encyclopedia.*` (çıktı dili; TR birebir — golden kilitli).
// Kurucular POST içinde `withStonesOutput(output, …)` bağlamında çalışır; içerik (taş/mineral/makale) DB kaydıdır, çevrilmez.
const T = (key: string, values?: Record<string, string | number>): string => stonesText().t(`encyclopedia.${key}`, values);
const count = (key: string, n: number): string => T(key, { count: n, shown: String(n) });
/** Özet satırları (mod-b #843 birleşmesine kadar rota satırında sabit TR) çıktı diline köprülenir — bkz. encyclopediaBridgeText. */
const muted = (text: string) => mutedParagraph(encyclopediaBridgeText(text));

// ─── Types ────────────────────────────────────────────────────────────────────

type Sections = {
  stones?: boolean;
  minerals?: boolean;
  combinations?: boolean;
  knowledge?: boolean;
  analytics?: boolean;
};

type StoneRow = {
  id: string;
  /** WT9: birincil kaynağın adı (NULL = belirtilmemiş). */
  primary_source_name?: string | null;
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
  id: string;
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

function buildSummary(counts: Record<string, number>, hd: TocHeadingFns = PLAIN_HEADINGS): ReportChild[] {
  const rows: [string, string][] = [];
  if (counts.stones != null)       rows.push([T("section.stones"),       count("records", counts.stones)]);
  if (counts.minerals != null)     rows.push([T("section.minerals"),     count("records", counts.minerals)]);
  if (counts.combinations != null) rows.push([T("section.combinations"), count("records", counts.combinations)]);
  if (counts.knowledge != null)    rows.push([T("section.knowledge"),    count("articles", counts.knowledge)]);
  return [
    hd.h1Colored("1. Genel Özet", SECTION_COLORS.summary, true),
    muted("Seçilen bölümlere ait kayıtlarınızdan oluşturulmuştur."),
    ...(rows.length > 0 ? [twoColTable(rows), spacer()] : []),
  ];
}

/**
 * Madde 14: çok kaynaklı taşın içerik alanları — her alan kendi başlığıyla, altında kaynak kaynak
 * ("Kaynak: <ad>" + o kaynağın metni; aynen). Tek kaynaklı taş bu yolu KULLANMAZ (eski düzen).
 */
function multiSourceList(s: StoneRow, extras: readonly Record<string, unknown>[]): ReportSource[] {
  return [
    { name: (s.primary_source_name ?? "").trim() || null, fields: pickSourceFields(s as unknown as Record<string, unknown>) },
    ...extras.map((row) => ({ name: typeof row.source_name === "string" ? row.source_name : null, fields: pickSourceFields(row) })),
  ];
}

function buildMultiSourceStoneFields(s: StoneRow, extras: readonly Record<string, unknown>[], entryRows: readonly Record<string, unknown>[], color: string): ReportChild[] {
  const sources = multiSourceList(s, extras);
  const byField = reportEntriesByField(sources, entryRows);
  const out: ReportChild[] = [];
  const field = (label: string, f: SourceTextField) => {
    const entries = byField[f];
    if (entries.length === 0) return;
    out.push(h3(label));
    for (const e of entries) out.push(...entryParagraphs(e.content, e.sourceName, color));
  };
  field(T("stones.field.shortDescription"), "short_description");
  field(T("stones.field.generalInfo"), "general_info");
  field(T("stones.field.sourceNote"), "source_note");
  field(T("stones.field.physical"), "physical_effects");
  field(T("stones.field.spiritual"), "spiritual_effects");
  field(T("stones.field.other"), "other_effects");
  field(T("stones.field.fengShui"), "feng_shui");
  field(T("stones.field.meditation"), "meditation");
  field(T("stones.field.care"), "care");
  field(T("stones.field.application"), "application");
  const chakras = reportChakraEntries(sources);
  if (chakras.length) {
    out.push(h3(T("stones.field.chakras")));
    for (const e of chakras) {
      out.push(sourceAttribution(e.name, color));
      out.push(...bulletParagraphs(e.chakras));
    }
  }
  const asgn = fmtAssignments(s.assignments);
  if (asgn) {
    out.push(h3(T("stones.field.assignments")));
    out.push(bodyText(asgn));
  }
  field(T("stones.field.warnings"), "warning_text");
  return out;
}

function buildStonesSection(
  stones: StoneRow[],
  n: number,
  imageBuffers: (Buffer | null)[],
  extraSources: ReadonlyMap<string, readonly Record<string, unknown>[]> = new Map(),
  hd: TocHeadingFns = PLAIN_HEADINGS,
  stoneEntries: ReadonlyMap<string, readonly Record<string, unknown>[]> = new Map(),
): ReportChild[] {
  const color = SECTION_COLORS.stones;
  const result: ReportChild[] = [
    ...buildSectionDivider(T("stones.divider"), count("stones.dividerSub", stones.length), color),
    hd.h1Colored(T("stones.heading", { n }), color, true),
    muted(count("stones.total", stones.length)),
  ];

  for (let i = 0; i < stones.length; i++) {
    const s = stones[i]!;
    const imgBuf = imageBuffers[i] ?? null;
    if (i > 0) result.push(divider());

    // Profile header
    result.push(profileLabel(T("stones.cardNo", { no: String(i + 1).padStart(3, "0") }), color));
    result.push(hd.h2(s.stone_name || T("stones.unnamed")));

    // Image (if available)
    if (imgBuf) result.push(embedImageParagraph(imgBuf, 400));

    // WT9: tek kaynaklı taşta kaynak bilgisi varsa birincil kaynak etiketlenir (metinler ona aittir).
    // Madde 14: çok kaynaklı taşta tüm kaynak adları listelenir; her metin kendi kaynağıyla basılır.
    const extras = extraSources.get(s.id) ?? [];
    const entryRows = stoneEntries.get(s.id) ?? [];
    if (extras.length > 0 || entryRows.length > 0) {
      const names = reportSourceNames(reportEntriesByField(multiSourceList(s, extras), entryRows));
      if (names.length) result.push(fieldInline(T("stones.sourcesInline"), names.join(" · ")));
      if (safeLen(s.warning_tags)) result.push(fieldInline(T("stones.warningTags"), safeJoin(s.warning_tags)));
      result.push(...buildMultiSourceStoneFields(s, extras, entryRows, color));
      continue;
    }
    if ((s.primary_source_name ?? "").trim()) {
      result.push(fieldInline(T("stones.sourceInline"), stonesSourceName(s.primary_source_name)));
    }

    // Short metadata
    if (s.source_note?.trim())  result.push(fieldInline(T("stones.sourceNoteInline"), s.source_note.trim()));
    // F-011: chakras/warning_tags legacy/transfer satırlarında non-array olabilir → guard'lı okuma.
    if (safeLen(s.chakras))      result.push(fieldInline(T("stones.chakraCount"), String(safeLen(s.chakras))));
    if (safeLen(s.warning_tags)) result.push(fieldInline(T("stones.warningTags"), safeJoin(s.warning_tags)));

    // Content sections (H3 — Navigation Panel)
    if (s.short_description?.trim()) result.push(bodyText(s.short_description.trim()));
    if (s.general_info?.trim())      { result.push(h3(T("stones.field.generalInfo"))); result.push(bodyText(s.general_info.trim())); }
    if (s.physical_effects?.trim())  { result.push(h3(T("stones.field.physical")));    result.push(bodyText(s.physical_effects.trim())); }
    if (s.spiritual_effects?.trim()) { result.push(h3(T("stones.field.spiritual")));   result.push(bodyText(s.spiritual_effects.trim())); }
    if (s.other_effects?.trim())     { result.push(h3(T("stones.field.other")));       result.push(bodyText(s.other_effects.trim())); }
    if (s.feng_shui?.trim())         { result.push(h3(T("stones.field.fengShui")));    result.push(bodyText(s.feng_shui.trim())); }
    if (s.meditation?.trim())        { result.push(h3(T("stones.field.meditation")));  result.push(bodyText(s.meditation.trim())); }
    if (s.care?.trim())              { result.push(h3(T("stones.field.care")));        result.push(bodyText(s.care.trim())); }
    if (s.application?.trim())       { result.push(h3(T("stones.field.application"))); result.push(bodyText(s.application.trim())); }

    if (safeLen(s.chakras)) {
      result.push(h3(T("stones.field.chakras")));
      result.push(bodyText(safeJoin(s.chakras)));
    }
    const asgn = fmtAssignments(s.assignments);
    if (asgn) {
      result.push(h3(T("stones.field.assignments")));
      result.push(bodyText(asgn));
    }
    if (s.warning_text?.trim()) {
      result.push(h3(T("stones.field.warnings")));
      result.push(bodyText(s.warning_text.trim()));
    }
  }
  return result;
}

function buildMineralsSection(minerals: MineralRow[], n: number, hd: TocHeadingFns = PLAIN_HEADINGS): ReportChild[] {
  const color = SECTION_COLORS.minerals;
  const result: ReportChild[] = [
    ...buildSectionDivider(T("minerals.divider"), count("minerals.dividerSub", minerals.length), color),
    hd.h1Colored(T("minerals.heading", { n }), color, true),
    muted(count("minerals.total", minerals.length)),
  ];

  for (let i = 0; i < minerals.length; i++) {
    const m = minerals[i]!;
    if (i > 0) result.push(divider());
    result.push(profileLabel(T("minerals.cardNo", { no: String(i + 1).padStart(3, "0") }), color));
    result.push(hd.h2(m.name || T("minerals.unnamed")));
    if (m.kategori?.trim()) result.push(fieldInline(T("minerals.category"), m.kategori.trim()));
    if (m.aciklama?.trim()) { result.push(h3(T("minerals.description"))); result.push(bodyText(m.aciklama.trim())); }
    result.push(...arraySection(T("minerals.field.physical"),         m.fiziksel));
    result.push(...arraySection(T("minerals.field.mental"),           m.zihinsel));
    result.push(...arraySection(T("minerals.field.physiology"),       m.fizyoloji));
    result.push(...arraySection(T("minerals.field.deficiency"),       m.eksiklik_belirtileri));
    result.push(...arraySection(T("minerals.field.excess"),           m.fazlalik_belirtileri));
    result.push(...arraySection(T("minerals.field.overdose"),         m.doz_asimi));
    result.push(...arraySection(T("minerals.field.containingStones"), m.iceren_taslar));
    result.push(...arraySection(T("minerals.field.organs"),           m.organ_etkileri));
    result.push(...arraySection(T("minerals.field.chakras"),          m.cakralar));
  }
  return result;
}

function buildCombinationsSection(combos: CombinationRow[], n: number, hd: TocHeadingFns = PLAIN_HEADINGS): ReportChild[] {
  const color = SECTION_COLORS.combinations;
  const result: ReportChild[] = [
    ...buildSectionDivider(T("combinations.divider"), count("combinations.dividerSub", combos.length), color),
    hd.h1Colored(T("combinations.heading", { n }), color, true),
    muted(count("combinations.total", combos.length)),
  ];

  for (let i = 0; i < combos.length; i++) {
    const c = combos[i]!;
    if (i > 0) result.push(divider());
    result.push(profileLabel(T("combinations.cardNo", { no: String(i + 1).padStart(3, "0") }), color));
    result.push(hd.h2(c.issue || T("combinations.unnamed")));
    if (c.description?.trim())  result.push(fieldInline(T("combinations.purpose"), c.description.trim()));
    if (c.stones_text?.trim())  { result.push(h3(T("combinations.stones"))); result.push(bodyText(c.stones_text.trim())); }
    if (c.notes_text?.trim())   { result.push(h3(T("combinations.usage")));  result.push(bodyText(c.notes_text.trim())); }
    if (c.notes_text_2?.trim()) result.push(bodyText(c.notes_text_2.trim()));
    if (c.notes_text_3?.trim()) result.push(bodyText(c.notes_text_3.trim()));
    if (c.source?.trim())       result.push(fieldInline(T("combinations.source"), c.source.trim()));
  }
  return result;
}

function buildKnowledgeSection(articles: KnowledgeRow[], n: number, hd: TocHeadingFns = PLAIN_HEADINGS): ReportChild[] {
  const color = SECTION_COLORS.knowledge;
  const result: ReportChild[] = [
    ...buildSectionDivider(T("knowledge.divider"), count("knowledge.dividerSub", articles.length), color),
    hd.h1Colored(T("knowledge.heading", { n }), color, true),
    muted(count("knowledge.total", articles.length)),
  ];

  const grouped = new Map<string, KnowledgeRow[]>();
  for (const a of articles) {
    const cat = a.category || T("knowledge.generalCategory");
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(a);
  }

  let firstCat = true;
  for (const [category, catArticles] of grouped) {
    if (!firstCat) result.push(divider());
    firstCat = false;
    result.push(h3(`— ${category} —`));
    for (const a of catArticles) {
      result.push(hd.h2(a.title || T("knowledge.untitled")));
      if (a.sub_category?.trim())     result.push(fieldInline(T("knowledge.subCategory"), a.sub_category.trim()));
      if (a.source?.trim())           result.push(fieldInline(T("knowledge.source"), a.source.trim()));
      // F-011: tags/related_* legacy satırlarında non-array olabilir → guard'lı okuma.
      if (safeLen(a.tags))             result.push(fieldInline(T("knowledge.tags"), safeJoin(a.tags)));
      if (safeLen(a.related_stones))   result.push(fieldInline(T("knowledge.relatedStones"), safeJoin(a.related_stones)));
      if (safeLen(a.related_minerals)) result.push(fieldInline(T("knowledge.relatedMinerals"), safeJoin(a.related_minerals)));
      if (a.content?.trim())          result.push(...parseKnowledgeContent(a.content));
      if (a.notes?.trim())            { result.push(h3(T("knowledge.notes"))); result.push(bodyText(a.notes.trim())); }
    }
  }
  return result;
}

function buildAnalyticsSection(counts: Record<string, number>, n: number, hd: TocHeadingFns = PLAIN_HEADINGS): ReportChild[] {
  const color = SECTION_COLORS.analytics;
  const rows: [string, string][] = [
    [T("analytics.reportDate"), stonesText().generatedLabel()],
    [T("section.stones"),       counts.stones        != null ? count("records", counts.stones)        : T("analytics.notIncluded")],
    [T("section.minerals"),     counts.minerals      != null ? count("records", counts.minerals)      : T("analytics.notIncluded")],
    [T("section.combinations"), counts.combinations  != null ? count("records", counts.combinations)  : T("analytics.notIncluded")],
    [T("section.knowledge"),    counts.knowledge     != null ? count("articles", counts.knowledge)    : T("analytics.notIncluded")],
    [T("analytics.totalRecords"), String(Object.values(counts).reduce((a, b) => a + b, 0))],
  ];
  return [
    ...buildSectionDivider(T("analytics.divider"), T("analytics.dividerSub"), color),
    hd.h1Colored(T("analytics.heading", { n }), color, true),
    muted(T("analytics.note")),
    twoColTable(rows),
  ];
}

/**
 * Taş görsel buffer'larını çözer.
 *
 * GÜVENLİK (SSRF kapanışı): YALNIZCA canonical private dogaltas-photos file_path
 * modeli kullanılır ve her path, oturum tenant'ına ait olduğu `isOwnedStonePhotoPath`
 * ile doğrulanır (traversal / mutlak-URL / yabancı-tenant reddi). Legacy remote
 * `images[].url` ARTIK FETCH EDİLMEZ → sunucu-taraflı dış istek (SSRF) yolu kapalı.
 * Geçersiz/eksik görsel raporu patlatmaz; kontrollü olarak null (görselsiz) döner.
 * 15'li batch (Promise.allSettled) → ölçeklenebilir, N+1 yok.
 */
async function resolveStoneImageBuffers(
  db: SupabaseClient,
  stones: StoneRow[],
  tenantId: string,
): Promise<(Buffer | null)[]> {
  const refs = stones.map((s) => extractFirstImageRef(s.images));
  const BATCH = 15;
  const out: (Buffer | null)[] = new Array(refs.length).fill(null);
  for (let i = 0; i < refs.length; i += BATCH) {
    const slice = refs.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map(async (r) => {
        if (!r) return null;
        // Yalnız tenant'a ait canonical storage path'i indirilir; url yolu yok.
        if (isOwnedStonePhotoPath(r.file_path, tenantId)) {
          return await fetchStorageImageBuffer(db, STONE_PHOTO_BUCKET, r.file_path);
        }
        return null;
      }),
    );
    settled.forEach((res, j) => { out[i + j] = res.status === "fulfilled" ? res.value : null; });
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
  const output = await resolveReportLocale(req, { db, tenantId, userId: auth.userId });

  const { sections, selectedStoneIds, includeImages = true } = body as {
    sections?: Sections;
    selectedStoneIds?: string[];
    includeImages?: boolean;
  };

  if (!sections || !Object.values(sections).some(Boolean))
    return Response.json({ ok: false, error: "En az bir bölüm seçilmeli." }, { status: 400 });

  // P2-02: seçili taş id'leri DB'ye gitmeden doğrulanır (UUID + üst sınır + tekrar ayıklama).
  const parsedIds = parseReportIds(selectedStoneIds);
  if (!parsedIds.ok) return badSelectionResponse(parsedIds.error);
  const stoneIds = parsedIds.ids;

  // Shared-library kaldırma: bilgi bölümü YALNIZ uzmanın kendi tenant kayıtları
  // (admin kütüphanesi UNION edilmez — stones/minerals/combinations ile tutarlı).
  // P2-07: her bölüm sayfalı okunur (1000-satır tavanı yok; tenant filtresi her sayfada).
  const STONE_SELECT = "id, primary_source_name, stone_name, short_description, general_info, source_note, physical_effects, spiritual_effects, other_effects, feng_shui, meditation, care, application, chakras, assignments, warning_text, warning_tags, images";
  const [stonesRes, mineralsRes, combinationsRes, knowledgeRes] = await Promise.all([
    sections.stones
      ? stoneIds
        ? fetchAllRowsByIds<StoneRow>(stoneIds, (chunk, from, to) =>
            db.from("stones").select(STONE_SELECT).eq("tenant_id", tenantId).in("id", chunk)
              .order("stone_name").order("id").range(from, to))
        : fetchAllRows<StoneRow>((from, to) =>
            db.from("stones").select(STONE_SELECT).eq("tenant_id", tenantId)
              .order("stone_name").order("id").range(from, to))
      : null,
    sections.minerals
      ? fetchAllRows<MineralRow>((from, to) =>
          db.from("minerals")
            .select("id, name, aciklama, kategori, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar")
            .eq("tenant_id", tenantId).order("name").order("id").range(from, to))
      : null,
    sections.combinations
      ? fetchAllRows<CombinationRow>((from, to) =>
          db.from("combinations")
            .select("id, issue, description, source, stones_text, notes_text, notes_text_2, notes_text_3")
            .eq("tenant_id", tenantId).order("issue").order("id").range(from, to))
      : null,
    sections.knowledge
      ? fetchAllRows<KnowledgeRow>((from, to) =>
          db.from("stone_knowledge_articles")
            .select("id, title, content, category, sub_category, source, tags, related_stones, related_minerals, notes")
            .eq("tenant_id", tenantId).eq("is_active", true)
            .order("category").order("title").order("id").range(from, to))
      : null,
  ]);

  // P2-02: herhangi bir bölüm okunamadıysa Word ÜRETİLMEZ (eskiden hata yutulup boş/eksik
  // rapor 200 ile iniyordu). Ham DB hatası istemciye dönmez; sunucu loguna ref ile yazılır.
  for (const [label, r] of [["stones", stonesRes], ["minerals", mineralsRes], ["combinations", combinationsRes], ["knowledge", knowledgeRes]] as const) {
    if (r && !r.ok) {
      return serverErrorResponse({ route: "dogaltas/word-report", action: `POST:${label}`, tenantId, cause: r.error, usage: { guard: { ...auth, is_demo_account: false }, req, module: "stones", failedAction: "report_generated", subEntity: null } });
    }
  }
  // P2-02: seçilen taşlardan biri bile bu tenant'ta yoksa (silinmiş / başka tenant / kütüphane)
  // rapor ÜRETİLMEZ — hangi id'nin eksik olduğu söylenmez (IDOR'da var/yok sızmaz).
  if (sections.stones && stoneIds && (stonesRes?.rows.length ?? 0) !== stoneIds.length) {
    return missingSelectionResponse();
  }

  // RPT-XML: rapor motoruna girmeden önce tüm DB string'leri XML 1.0 güvenli
  // hale getirilir (illegal kontrol karakteri temizliği; TR/Unicode/emoji korunur).
  const stoneRowsRaw  = stonesRes?.rows ?? [];
  const stonesRows    = sanitizeXmlDeep(stoneIds && stoneIds.length > 150 ? sortByTrField(stoneRowsRaw, "stone_name") : stoneRowsRaw);
  // P2-01: bozuk/legacy mineral dizi alanı tüm raporu çökertmez (normalize + teknik log).
  const mineralRows   = sanitizeMineralRowsForReport(sanitizeXmlDeep(mineralsRes?.rows ?? []), { route: "dogaltas/word-report", tenantId }).rows;
  // F-02 READ: yapısal kombinasyonlar junction'dan resolve (güncel ad; silinende
  // snapshot); legacy stones_text fallback. Salt-okuma + batch. Sonra XML sanitize.
  const comboHydrated = await hydrateCombinationStoneNames(db, tenantId, combinationsRes?.rows ?? []);
  const comboRows     = sanitizeXmlDeep(comboHydrated as CombinationRow[]);
  const knowledgeRows = sanitizeXmlDeep(knowledgeRes?.rows ?? []);

  // WT9: seçilen taşların ek kaynakları (yalnız bu tenant; migration yoksa boş → eski düzen).
  let stoneExtraSources = new Map<string, Record<string, unknown>[]>();
  let stoneEntries = new Map<string, Record<string, unknown>[]>();
  if (sections.stones && stonesRows.length > 0) {
    try {
      const loaded = await loadExtraSourcesForStones(db, tenantId, stonesRows.map((s) => s.id));
      stoneExtraSources = new Map([...loaded].map(([k, v]) => [k, sanitizeXmlDeep(v)]));
      const entries = await loadEntriesForStones(db, tenantId, stonesRows.map((s) => s.id));
      stoneEntries = new Map([...entries].map(([k, v]) => [k, sanitizeXmlDeep(v)]));
    } catch (e) {
      return serverErrorResponse({ route: "dogaltas/word-report", action: "POST:stone_sources", tenantId, cause: e, usage: { guard: { ...auth, is_demo_account: false }, req, module: "stones", failedAction: "report_generated", subEntity: null } });
    }
  }

  // P2-02: seçili VERİ bölümlerinin hepsi boşsa "boş" Word indirtilmez → anlaşılır 404.
  const dataSections = (["stones", "minerals", "combinations", "knowledge"] as const).filter((k) => sections[k]);
  const dataTotal = stonesRows.length + mineralRows.length + comboRows.length + knowledgeRows.length;
  if (dataSections.length > 0 && dataTotal === 0) {
    return Response.json(
      { ok: false, code: "empty_report", error: "Seçilen bölümlerde rapora eklenecek kayıt bulunamadı." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const counts: Record<string, number> = {};
  if (sections.stones)       counts.stones       = stonesRows.length;
  if (sections.minerals)     counts.minerals     = mineralRows.length;
  if (sections.combinations) counts.combinations = comboRows.length;
  if (sections.knowledge)    counts.knowledge    = knowledgeRows.length;

  // Fetch stone images (non-blocking — failures → null). SSRF kapanışı: yalnız
  // tenant'a ait canonical dogaltas-photos file_path (service_role download);
  // legacy remote url artık fetch edilmez. 15'li batch → N+1 yok.
  let stoneImageBuffers: (Buffer | null)[] = stonesRows.map(() => null);
  if (sections.stones && stonesRows.length > 0 && includeImages !== false) {
    stoneImageBuffers = await resolveStoneImageBuffers(db, stonesRows, tenantId);
  }

  // Belge kurucusu çıktı dili bağlamında (stonesText); blok girintisi rota diff'ini küçük tutmak için korunmuştur.
  const doc = withStonesOutput(output, () => {
  const X = stonesText();
  const date = X.generatedLabel();

  // Premium cover stats — RPT (boş sayaç): yalnız SEÇİLİ bölümler için sayaç
  // eklenir (counts.X yalnız o bölüm seçiliyse set edilir → 0 dahil gerçek sayı
  // gösterilir, seçilmeyen bölüm hiç eklenmez). Ek savunma: boş/whitespace değerli
  // sayaç render edilmez → "Label: " gibi boş etiket asla oluşmaz.
  const coverStatsRaw: { label: string; value: string }[] = [];
  if (counts.stones != null)       coverStatsRaw.push({ label: T("stat.stones"),       value: String(counts.stones) });
  if (counts.minerals != null)     coverStatsRaw.push({ label: T("stat.minerals"),     value: String(counts.minerals) });
  if (counts.combinations != null) coverStatsRaw.push({ label: T("stat.combinations"), value: String(counts.combinations) });
  if (counts.knowledge != null)    coverStatsRaw.push({ label: T("stat.knowledge"),    value: String(counts.knowledge) });
  const coverStats = coverStatsRaw.filter((s) => s.value.trim().length > 0);

  const allChildren: ReportChild[] = [
    // 1. Premium cover
    ...buildPremiumCover({
      title1:   X.t("brand"),
      title2:   T("coverTitle"),
      subtitle: T("coverSubtitle"),
      date:     X.t("generatedOnDate", { date }),
      stats:    coverStats,
    }),
    // 2. Stats page
    ...buildStatsPage(
      Object.entries(counts).map(([k, v]) => {
        const labels: Record<string, string> = {
          stones: T("section.stones"), minerals: T("section.minerals"),
          combinations: T("section.combinations"), knowledge: T("section.knowledge"),
        };
        return [(labels[k] ?? k), count("records", v)] as [string, string];
      }),
      undefined,
      X.common,
    ),
  ];

  // 3. İçindekiler: eski boş Word TOC alanı yerine STATİK + tıklanabilir girişler (gövde
  // başlıklarından toplanır, gövde bittikten sonra bu konuma yerleştirilir; başlık yoksa sayfa yok).
  const toc = new StaticTocCollector("dtas");
  const tocAt = allChildren.length;
  // 4. Genel Özet
  // Özet başlığı (rota satırında sabit TR; mod-b #843) çıktı diline köprülenir — TOC girişi de aynı metinle.
  allChildren.push(...buildSummary(counts, { h1Colored: (text, color, pageBreak) => toc.h1Colored(encyclopediaBridgeText(text), color, pageBreak), h2: toc.h2 }));

  let sec = 2;
  if (sections.stones)       allChildren.push(...buildStonesSection(stonesRows, sec++, stoneImageBuffers, stoneExtraSources, toc, stoneEntries));
  if (sections.minerals)     allChildren.push(...buildMineralsSection(mineralRows, sec++, toc));
  if (sections.combinations) allChildren.push(...buildCombinationsSection(comboRows, sec++, toc));
  if (sections.knowledge)    allChildren.push(...buildKnowledgeSection(knowledgeRows, sec++, toc));
  if (sections.analytics)    allChildren.push(...buildAnalyticsSection(counts, sec, toc));

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  allChildren.push(...buildWellnessNoteSection("dogaltas", expertDisplayName(auth.profile), X.common));

  allChildren.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, X.common));

  const styles = X.output.docxStyles();
  return new Document({
    ...toc.documentOptions(),
    ...(styles ? { styles } : {}),
    sections: [{
      properties: {},
      footers: { default: buildFooter(T("footer"), { note: "dogaltas", common: X.common }) },
      children: allChildren,
    }],
  });
  });

  const buffer = await Packer.toBuffer(doc);
  const dateSlug = reportFileDate();

  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı. Çok-bölümlü modül
  // ansiklopedisi (taş/mineral/kombinasyon/bilgi) → tek bir konu alt-varlığı yok (null).
  // Demo hesap requireDogaltasReportAccess'te zaten engellenir.
  await trackUsage({ ...auth, is_demo_account: false }, req, {
    module: "stones",
    action: "report_generated",
    subEntity: null,
    resourceId: `encyclopedia:${Object.keys(sections).filter((k) => sections[k as keyof Sections]).sort().join("|")}:${Array.isArray(selectedStoneIds) ? [...selectedStoneIds].map(String).sort().join(",") : "all"}`,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${stonesTextFor(output).t("encyclopedia.file")}-${dateSlug}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
