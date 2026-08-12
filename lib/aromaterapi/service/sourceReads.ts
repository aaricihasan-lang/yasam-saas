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
