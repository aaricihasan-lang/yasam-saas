import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PassageDetail,
  PassageEditorialLayer,
  PassageListItem,
  PassageTranslationLayer,
  SourceDetail,
  SourceListItem,
} from "@/lib/aromaterapi/readTypes";
import {
  buildSearchNormIlike,
  type ParsedListParams,
} from "@/lib/aromaterapi/service/readValidation";

/**
 * Aromaterapi V2 — C3C Kaynaklar (kaynak → pasaj → katmanlar) okuma servisi.
 *
 * server-only + tenant-scoped SELECT (mutation YOK). Pasaj katmanları API
 * çıktısında AYRI tutulur ve birbirinin yerine fallback YAPMAZ:
 *   1) Özgün Kaynak Metni  → source_passages.original_text
 *   2) Sadık Çeviriler      → passage_translations (fidelity literal/faithful)
 *   3) Editoryal Açıklamalar→ editorial_class = 'editorial_explanation'
 *   4/5) Editoryal Yorum/Uzman Notu → editorial_class = 'editorial_interpretation'
 */

const SOURCES_TABLE = "aromatherapy_sources";
const PASSAGES_TABLE = "aromatherapy_source_passages";
const TRANSLATIONS_TABLE = "aromatherapy_passage_translations";
const NOTE_SERIES_TABLE = "aromatherapy_passage_editorial_note_series";
const NOTES_TABLE = "aromatherapy_passage_editorial_notes";
const CLAIM_SOURCES_TABLE = "aromatherapy_claim_sources";

export const SOURCE_TYPES = [
  "book",
  "journal_article",
  "regulatory_document",
  "monograph",
  "standard",
  "database_record",
  "website",
  "other",
] as const;
export const SOURCE_STATUS = ["draft", "verified", "archived"] as const;

// Arama: generated `search_norm` = normalize(title, authors, organization, doi,
// pmid, isbn, url, document_no) — migration 20261003000000. Kapsam korunur.
// Passage araması ise locator_label'ı normalize eden kendi search_norm'unu kullanır.

const SOURCE_LIST_COLS =
  "id, title, source_type, status, authors, organization, publication_year, updated_at";
const SOURCE_DETAIL_COLS = `${SOURCE_LIST_COLS}, doi, pmid, isbn, url, document_no, notes, created_at`;
const PASSAGE_LIST_COLS =
  "id, source_id, locator_label, passage_kind, original_lang, rights_status, status, sort_key, original_text";

// ------------------------------------------------------------------
// Kaynak listesi (+ pasaj sayısı)
// ------------------------------------------------------------------

export async function listSources(
  db: SupabaseClient,
  tenantId: string,
  p: ParsedListParams,
): Promise<{ rows: SourceListItem[]; total: number }> {
  let query = db
    .from(SOURCES_TABLE)
    .select(SOURCE_LIST_COLS, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (p.q) query = query.or(buildSearchNormIlike(p.q));
  for (const [col, val] of Object.entries(p.equals)) query = query.eq(col, val);
  if (p.year !== null) query = query.eq("publication_year", p.year);

  const { data, error, count } = await query
    .order(p.sort.column, { ascending: p.sort.ascending })
    .order("id", { ascending: true })
    .range(p.offset, p.offset + p.limit - 1);
  if (error) throw error;

  const base = (data ?? []) as unknown as Omit<SourceListItem, "passage_count">[];
  const counts = await passageCountBySource(
    db,
    tenantId,
    base.map((r) => r.id),
  );
  const rows = base.map((r) => ({ ...r, passage_count: counts.get(r.id) ?? 0 }));
  return { rows, total: count ?? 0 };
}

// ------------------------------------------------------------------
// Kaynak detay (künye + pasaj sayısı + bağlı bilgi kaydı sayısı)
// ------------------------------------------------------------------

export async function getSource(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<SourceDetail | null> {
  const { data, error } = await db
    .from(SOURCES_TABLE)
    .select(SOURCE_DETAIL_COLS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [{ count: passageCount, error: pErr }, { count: krCount, error: kErr }] =
    await Promise.all([
      db
        .from(PASSAGES_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("source_id", id),
      db
        .from(CLAIM_SOURCES_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("source_id", id),
    ]);
  if (pErr) throw pErr;
  if (kErr) throw kErr;

  return {
    ...(data as unknown as Omit<SourceDetail, "passage_count" | "knowledge_record_count">),
    passage_count: passageCount ?? 0,
    knowledge_record_count: krCount ?? 0,
  };
}

// ------------------------------------------------------------------
// Kaynağa bağlı pasaj listesi
// ------------------------------------------------------------------

export async function listSourcePassages(
  db: SupabaseClient,
  tenantId: string,
  sourceId: string,
  p: ParsedListParams,
  language?: string | null,
): Promise<{ rows: PassageListItem[]; total: number } | null> {
  // Kaynak aynı tenant'ta yoksa 404 sözleşmesi (varlık sızdırma).
  const { data: src, error: srcErr } = await db
    .from(SOURCES_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", sourceId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!src) return null;

  let query = db
    .from(PASSAGES_TABLE)
    .select(PASSAGE_LIST_COLS, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("source_id", sourceId);

  if (p.q) query = query.or(buildSearchNormIlike(p.q));
  if (language) query = query.eq("original_lang", language);

  const { data, error, count } = await query
    .order("sort_key", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(p.offset, p.offset + p.limit - 1);
  if (error) throw error;

  const rows: PassageListItem[] = (
    (data ?? []) as unknown as (Omit<PassageListItem, "has_original_text"> & {
      original_text: string | null;
    })[]
  ).map(({ original_text, ...rest }) => ({
    ...rest,
    has_original_text: typeof original_text === "string" && original_text.trim() !== "",
  }));
  return { rows, total: count ?? 0 };
}

// ------------------------------------------------------------------
// Pasaj detay — katmanlar AYRI (özgün / sadık çeviri / açıklama / yorum)
// ------------------------------------------------------------------

export async function getPassage(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<PassageDetail | null> {
  const { data, error } = await db
    .from(PASSAGES_TABLE)
    .select(
      "id, source_id, locator_label, passage_kind, original_lang, rights_status, rights_note, status, original_text, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Sadık çeviriler (revision'a göre en yeni önce).
  const { data: translations, error: tErr } = await db
    .from(TRANSLATIONS_TABLE)
    .select(
      "id, target_lang, source_lang, translated_text, fidelity, translation_method, translation_source, translator_name, status, review_status, revision",
    )
    .eq("tenant_id", tenantId)
    .eq("passage_id", id)
    .order("target_lang", { ascending: true })
    .order("revision", { ascending: false })
    .order("id", { ascending: true });
  if (tErr) throw tErr;

  const editorial = await passageEditorialLayers(db, tenantId, id);

  return {
    ...(data as unknown as Omit<
      PassageDetail,
      "translations" | "editorial_explanations" | "editorial_interpretations"
    >),
    translations: (translations ?? []) as unknown as PassageTranslationLayer[],
    editorial_explanations: editorial.explanations,
    editorial_interpretations: editorial.interpretations,
  };
}

// ------------------------------------------------------------------
// Yardımcılar
// ------------------------------------------------------------------

async function passageCountBySource(
  db: SupabaseClient,
  tenantId: string,
  sourceIds: string[],
): Promise<Map<string, number>> {
  const unique = Array.from(new Set(sourceIds.filter(Boolean)));
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const { data, error } = await db
    .from(PASSAGES_TABLE)
    .select("source_id")
    .eq("tenant_id", tenantId)
    .in("source_id", unique);
  if (error) throw error;

  for (const r of (data ?? []) as { source_id: string }[]) {
    map.set(r.source_id, (map.get(r.source_id) ?? 0) + 1);
  }
  return map;
}

/**
 * Bir pasajın editoryal katmanlarını (seri kimliği + en güncel not metni)
 * açıklama/yorum ayrımıyla döndürür. Seri append-only kimliği (note_type/
 * editorial_class/note_lang) taşır; metin ve durum en yüksek revision'dan alınır.
 */
async function passageEditorialLayers(
  db: SupabaseClient,
  tenantId: string,
  passageId: string,
): Promise<{ explanations: PassageEditorialLayer[]; interpretations: PassageEditorialLayer[] }> {
  const { data: series, error: sErr } = await db
    .from(NOTE_SERIES_TABLE)
    .select("id, note_type, editorial_class, note_lang, created_at")
    .eq("tenant_id", tenantId)
    .eq("passage_id", passageId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (sErr) throw sErr;

  const seriesRows = (series ?? []) as {
    id: string;
    note_type: string;
    editorial_class: string;
    note_lang: string;
  }[];
  if (seriesRows.length === 0) return { explanations: [], interpretations: [] };

  const { data: notes, error: nErr } = await db
    .from(NOTES_TABLE)
    .select(
      "id, note_series_id, revision, note_text, author_name, creation_method, status, review_status",
    )
    .eq("tenant_id", tenantId)
    .in(
      "note_series_id",
      seriesRows.map((s) => s.id),
    )
    .order("revision", { ascending: false });
  if (nErr) throw nErr;

  // Seri başına en güncel (en yüksek revision) not.
  const latestBySeries = new Map<string, (typeof notes)[number]>();
  for (const n of (notes ?? []) as {
    id: string;
    note_series_id: string;
    revision: number;
    note_text: string;
    author_name: string | null;
    creation_method: string;
    status: string;
    review_status: string;
  }[]) {
    if (!latestBySeries.has(n.note_series_id)) latestBySeries.set(n.note_series_id, n);
  }

  const explanations: PassageEditorialLayer[] = [];
  const interpretations: PassageEditorialLayer[] = [];
  for (const s of seriesRows) {
    const note = latestBySeries.get(s.id);
    if (!note) continue; // henüz metin revizyonu yoksa katman göstermeyiz
    const layer: PassageEditorialLayer = {
      id: note.id as string,
      note_series_id: s.id,
      note_type: s.note_type,
      editorial_class: s.editorial_class,
      note_lang: s.note_lang,
      note_text: note.note_text as string,
      author_name: (note.author_name as string | null) ?? null,
      creation_method: note.creation_method as string,
      status: note.status as string,
      review_status: note.review_status as string,
      revision: note.revision as number,
    };
    if (s.editorial_class === "editorial_interpretation") interpretations.push(layer);
    else explanations.push(layer);
  }
  return { explanations, interpretations };
}

// ==================================================================
// ARO-010 — Rapor TOPLU okuma (N+1 fan-out azaltma).
//
// getSource + idsBy(passages) + getPassage(N) fan-out'unu, çoklu-id KÜME sorgularıyla
// birleştirir; parent→child gruplamayı bellek içinde yapar. getSource/getPassage
// tek-kayıt fonksiyonları (API detay route'ları) DEĞİŞTİRİLMEZ — bu yalnız EK yol.
// Her sorgu `.eq("tenant_id", tenantId)`; child'lar var olan kaynak/pasaj id kümesine
// bağlanır (çapraz-tenant/kayıt sızıntısı yok). Hata THROW → çağıran fail-closed indirir.
// passage_count/knowledge_record_count HEAD-sayım yerine tam-sayfalı sayımla üretilir
// (sessiz 1000-satır kesmesi yok) ve getSource ile aynı filtre kümesini kullanır.
// ==================================================================

const REPORT_IN_CHUNK = 500; // .in(...) küme boyutu — EXPORT_READ_CHUNK ile hizalı
const REPORT_READ_PAGE = 1000; // child .in okumalarında sessiz kesmeyi önleyen aralık sayfası

type SourceCore = Omit<SourceDetail, "passage_count" | "knowledge_record_count">;
type OrderCol = { col: string; asc: boolean };

function chunkIds<T>(arr: T[], size = REPORT_IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = r[key] as string;
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

/** Parent-id kümesine göre TÜM child satırlarını (tenant-scoped, chunk'lı + sayfalı) çeker; sessiz kesme YOK. */
async function fetchChildrenIn(
  db: SupabaseClient,
  tenantId: string,
  table: string,
  cols: string,
  parentCol: string,
  parentIds: string[],
  order: OrderCol[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const ch of chunkIds(parentIds)) {
    if (ch.length === 0) continue;
    let from = 0;
    for (;;) {
      let q = db.from(table).select(cols).eq("tenant_id", tenantId).in(parentCol, ch);
      for (const o of order) q = q.order(o.col, { ascending: o.asc });
      const { data, error } = await q.range(from, from + REPORT_READ_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      out.push(...rows);
      if (rows.length < REPORT_READ_PAGE) break;
      from += REPORT_READ_PAGE;
    }
  }
  return out;
}

/** parentCol kümesine göre tam-sayfalı satır sayımı (HEAD-sayımın toplu, kesme-güvenli eşi). */
async function groupedCount(
  db: SupabaseClient,
  tenantId: string,
  table: string,
  parentCol: string,
  parentIds: string[],
): Promise<Map<string, number>> {
  const rows = await fetchChildrenIn(db, tenantId, table, parentCol, parentCol, parentIds, [{ col: "id", asc: true }]);
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r[parentCol] as string;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** TOPLU kaynak detayları — getSource ile eşdeğer çıktı, `ids` sırasını korur, bulunamayanı atlar. */
export async function getSourcesByIds(
  db: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<SourceDetail[]> {
  if (ids.length === 0) return [];
  const byId = new Map<string, SourceCore>();
  for (const ch of chunkIds(ids)) {
    if (ch.length === 0) continue;
    const { data, error } = await db.from(SOURCES_TABLE).select(SOURCE_DETAIL_COLS).eq("tenant_id", tenantId).in("id", ch);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as SourceCore[]) byId.set(row.id, row);
  }
  const present = Array.from(byId.keys());
  if (present.length === 0) return [];

  const passageCounts = await groupedCount(db, tenantId, PASSAGES_TABLE, "source_id", present);
  const krCounts = await groupedCount(db, tenantId, CLAIM_SOURCES_TABLE, "source_id", present);

  const out: SourceDetail[] = [];
  for (const id of ids) {
    const core = byId.get(id);
    if (!core) continue;
    out.push({ ...core, passage_count: passageCounts.get(id) ?? 0, knowledge_record_count: krCounts.get(id) ?? 0 });
  }
  return out;
}

/**
 * TOPLU pasaj detayları, kaynak id kümesine göre gruplu. Her pasaj getPassage ile
 * eşdeğer (özgün + sadık çeviriler + editoryal açıklama/yorum katmanları). Kaynak başına
 * sıra sort_key asc (getPassage'i besleyen idsBy sırası ile aynı).
 */
export async function getPassagesBySourceIds(
  db: SupabaseClient,
  tenantId: string,
  sourceIds: string[],
): Promise<Map<string, PassageDetail[]>> {
  const map = new Map<string, PassageDetail[]>();
  if (sourceIds.length === 0) return map;

  const coreRows = await fetchChildrenIn(
    db,
    tenantId,
    PASSAGES_TABLE,
    "id, source_id, locator_label, passage_kind, original_lang, rights_status, rights_note, status, original_text, created_at, updated_at",
    "source_id",
    sourceIds,
    [
      { col: "source_id", asc: true },
      { col: "sort_key", asc: true },
      { col: "id", asc: true },
    ],
  );
  const passageIds = coreRows.map((r) => r.id as string);
  if (passageIds.length === 0) return map;

  // Sadık çeviriler (getPassage sırası: target_lang asc, revision desc, id asc).
  const translationsByPassage = groupBy(
    await fetchChildrenIn(
      db,
      tenantId,
      TRANSLATIONS_TABLE,
      "id, passage_id, target_lang, source_lang, translated_text, fidelity, translation_method, translation_source, translator_name, status, review_status, revision",
      "passage_id",
      passageIds,
      [
        { col: "target_lang", asc: true },
        { col: "revision", asc: false },
        { col: "id", asc: true },
      ],
    ),
    "passage_id",
  );

  // Editoryal seriler (created_at asc, id asc) + serilere göre en güncel not.
  const seriesRows = await fetchChildrenIn(
    db,
    tenantId,
    NOTE_SERIES_TABLE,
    "id, passage_id, note_type, editorial_class, note_lang, created_at",
    "passage_id",
    passageIds,
    [
      { col: "created_at", asc: true },
      { col: "id", asc: true },
    ],
  );
  const seriesByPassage = groupBy(seriesRows, "passage_id");
  const seriesIds = seriesRows.map((s) => s.id as string);
  const latestNoteBySeries = new Map<string, Record<string, unknown>>();
  if (seriesIds.length > 0) {
    // revision desc küresel sıra → her seri için ilk görülen = o serinin en yüksek revizyonu.
    const noteRows = await fetchChildrenIn(
      db,
      tenantId,
      NOTES_TABLE,
      "id, note_series_id, revision, note_text, author_name, creation_method, status, review_status",
      "note_series_id",
      seriesIds,
      [
        { col: "revision", asc: false },
        { col: "id", asc: true },
      ],
    );
    for (const n of noteRows) {
      const sid = n.note_series_id as string;
      if (!latestNoteBySeries.has(sid)) latestNoteBySeries.set(sid, n);
    }
  }

  for (const core of coreRows) {
    const pid = core.id as string;
    const series = seriesByPassage.get(pid) ?? [];
    const explanations: PassageEditorialLayer[] = [];
    const interpretations: PassageEditorialLayer[] = [];
    for (const s of series) {
      const note = latestNoteBySeries.get(s.id as string);
      if (!note) continue;
      const layer: PassageEditorialLayer = {
        id: note.id as string,
        note_series_id: s.id as string,
        note_type: s.note_type as string,
        editorial_class: s.editorial_class as string,
        note_lang: s.note_lang as string,
        note_text: note.note_text as string,
        author_name: (note.author_name as string | null) ?? null,
        creation_method: note.creation_method as string,
        status: note.status as string,
        review_status: note.review_status as string,
        revision: note.revision as number,
      };
      if ((s.editorial_class as string) === "editorial_interpretation") interpretations.push(layer);
      else explanations.push(layer);
    }
    const detail: PassageDetail = {
      id: core.id as string,
      source_id: core.source_id as string,
      locator_label: core.locator_label as string,
      passage_kind: core.passage_kind as string,
      original_lang: core.original_lang as string,
      rights_status: core.rights_status as string,
      rights_note: (core.rights_note as string | null) ?? null,
      status: core.status as string,
      original_text: (core.original_text as string | null) ?? null,
      created_at: core.created_at as string,
      updated_at: core.updated_at as string,
      translations: (translationsByPassage.get(pid) ?? []).map((t) => ({
        id: t.id as string,
        target_lang: t.target_lang as string,
        source_lang: t.source_lang as string,
        translated_text: t.translated_text as string,
        fidelity: t.fidelity as string,
        translation_method: t.translation_method as string,
        translation_source: t.translation_source as string,
        translator_name: (t.translator_name as string | null) ?? null,
        status: t.status as string,
        review_status: t.review_status as string,
        revision: t.revision as number,
      })),
      editorial_explanations: explanations,
      editorial_interpretations: interpretations,
    };
    const sid = core.source_id as string;
    const l = map.get(sid);
    if (l) l.push(detail);
    else map.set(sid, [detail]);
  }
  return map;
}
