import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A3 (yebs_sources) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (A3R):
 *   - Yalnız okuma: listSources + getSourceById.
 *   - Admin doğrulaması route sorumluluğu (verifyAdminRequest).
 *   - Yalnız enjekte edilen `db` (service_role); ham DB hata metni route'a taşınmaz.
 *   - Canonical row guard (fail-closed): beklenen 22 alanı taşımayan satır OKUMA
 *     HATASI olarak reddedilir; bozuk/kısmi satır istemciye gitmez.
 *   - Mutation YOK; JOIN YOK; claim/relation/junction/kullanım sayısı gömülmez.
 *   - Source = saf belge-düzeyi künye; pasaj/evidence içeriği burada yok.
 *
 * Güvenlik: `import "server-only"`.
 */

/** D5+A3 canonical kolonlar — AÇIK liste (accessed_on dahil). select("*") YOK. */
export const YEBS_SOURCE_COLUMNS =
  "id, source_type, title, language_tag, script_code, authors, organization, publisher, publication_year, dating_note, edition, doi, pmid, isbn, url, document_no, tradition_context_id, status, notes, created_at, updated_at, accessed_on";

/** A3 source_type CHECK değer kümesi (17; okuma filtresi). */
export const YEBS_SOURCE_TYPES = [
  "classical_text",
  "book",
  "journal_article",
  "regulatory_document",
  "monograph",
  "standard",
  "database_record",
  "thesis",
  "website",
  "oral_tradition_record",
  "other",
  "institutional_report",
  "archival_document",
  "media_recording",
  "interview_record",
  "field_observation_record",
  "experiential_record",
] as const;

export type YebsSourceType = (typeof YEBS_SOURCE_TYPES)[number];

/** D5 status CHECK değer kümesi (5). */
export const YEBS_SOURCE_STATUSES = [
  "draft",
  "verified",
  "approved",
  "published",
  "archived",
] as const;

export type YebsSourceStatus = (typeof YEBS_SOURCE_STATUSES)[number];

export type YebsSourceRow = {
  id: string;
  source_type: string;
  title: string;
  language_tag: string;
  script_code: string | null;
  authors: string | null;
  organization: string | null;
  publisher: string | null;
  publication_year: number | null;
  dating_note: string | null;
  edition: string | null;
  doi: string | null;
  pmid: string | null;
  isbn: string | null;
  url: string | null;
  document_no: string | null;
  tradition_context_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  accessed_on: string | null;
};

export type ListSourcesFilters = {
  limit: number;
  offset: number;
  /** Route tarafında trim + 100 + PostgREST özel karakter arındırma yapılmış. */
  q?: string;
  sourceType?: YebsSourceType;
  status?: YebsSourceStatus;
  languageTag?: string;
  author?: string;
  publisher?: string;
  publicationYear?: number;
  hasDoi?: boolean;
  hasPmid?: boolean;
  hasIsbn?: boolean;
  hasUrl?: boolean;
  traditionContextId?: string;
};

export type ListSourcesResult =
  | { ok: true; rows: YebsSourceRow[]; count: number }
  | { ok: false; code: "YEBS_SOURCES_LIST_FAILED" };

export type GetSourceResult =
  | { ok: true; row: YebsSourceRow }
  | { ok: false; code: "YEBS_SOURCE_NOT_FOUND" | "YEBS_SOURCE_READ_FAILED" };

/** Canonical row guard (fail-closed): 22 alanın exact tip sözleşmesi. */
function isCanonicalSourceRow(value: unknown): value is YebsSourceRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  const isNumOrNull = (x: unknown): boolean => x === null || typeof x === "number";
  return (
    isStr(o.id) &&
    isStr(o.source_type) &&
    isStr(o.title) &&
    isStr(o.language_tag) &&
    isStrOrNull(o.script_code) &&
    isStrOrNull(o.authors) &&
    isStrOrNull(o.organization) &&
    isStrOrNull(o.publisher) &&
    isNumOrNull(o.publication_year) &&
    isStrOrNull(o.dating_note) &&
    isStrOrNull(o.edition) &&
    isStrOrNull(o.doi) &&
    isStrOrNull(o.pmid) &&
    isStrOrNull(o.isbn) &&
    isStrOrNull(o.url) &&
    isStrOrNull(o.document_no) &&
    isStrOrNull(o.tradition_context_id) &&
    isStr(o.status) &&
    isStrOrNull(o.notes) &&
    isStr(o.created_at) &&
    isStr(o.updated_at) &&
    isStrOrNull(o.accessed_on)
  );
}

/**
 * Kaynak kayıtlarını salt-okunur listeler.
 * Deterministik sıra: created_at DESC, id DESC. JOIN yok; canonical 22 alan.
 */
export async function listSources(
  db: SupabaseClient,
  filters: ListSourcesFilters,
): Promise<ListSourcesResult> {
  let query = db
    .from("yebs_sources")
    .select(YEBS_SOURCE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.sourceType) query = query.eq("source_type", filters.sourceType);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.languageTag) query = query.eq("language_tag", filters.languageTag);
  if (filters.author) query = query.ilike("authors", `%${filters.author}%`);
  if (filters.publisher) query = query.ilike("publisher", `%${filters.publisher}%`);
  if (filters.publicationYear !== undefined) {
    query = query.eq("publication_year", filters.publicationYear);
  }
  if (filters.traditionContextId) {
    query = query.eq("tradition_context_id", filters.traditionContextId);
  }

  // has_* → NULL / NOT NULL varlık filtreleri.
  if (filters.hasDoi !== undefined) {
    query = filters.hasDoi ? query.not("doi", "is", null) : query.is("doi", null);
  }
  if (filters.hasPmid !== undefined) {
    query = filters.hasPmid ? query.not("pmid", "is", null) : query.is("pmid", null);
  }
  if (filters.hasIsbn !== undefined) {
    query = filters.hasIsbn ? query.not("isbn", "is", null) : query.is("isbn", null);
  }
  if (filters.hasUrl !== undefined) {
    query = filters.hasUrl ? query.not("url", "is", null) : query.is("url", null);
  }

  if (filters.q) {
    // filters.q ön-arındırılmıştır (route). 9 künye alanında ilike OR.
    const q = filters.q;
    query = query.or(
      [
        `title.ilike.%${q}%`,
        `authors.ilike.%${q}%`,
        `organization.ilike.%${q}%`,
        `publisher.ilike.%${q}%`,
        `doi.ilike.%${q}%`,
        `pmid.ilike.%${q}%`,
        `isbn.ilike.%${q}%`,
        `document_no.ilike.%${q}%`,
        `url.ilike.%${q}%`,
      ].join(","),
    );
  }

  const { data, error, count } = await query.range(
    filters.offset,
    filters.offset + filters.limit - 1,
  );

  if (error) {
    console.error("[yebs] listSources failed:", error.message);
    return { ok: false, code: "YEBS_SOURCES_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalSourceRow)) {
    console.error("[yebs] listSources: canonical row guard failed");
    return { ok: false, code: "YEBS_SOURCES_LIST_FAILED" };
  }

  return { ok: true, rows: rows as YebsSourceRow[], count: count ?? 0 };
}

/**
 * Tek kaynak kaydını salt-okunur getirir. UUID doğrulaması route sorumluluğu.
 * Kayıt yoksa NOT_FOUND, DB/bozuk satırda READ_FAILED. JOIN yok.
 */
export async function getSourceById(
  db: SupabaseClient,
  id: string,
): Promise<GetSourceResult> {
  const { data, error } = await db
    .from("yebs_sources")
    .select(YEBS_SOURCE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getSourceById failed:", error.message);
    return { ok: false, code: "YEBS_SOURCE_READ_FAILED" };
  }
  if (!data) {
    return { ok: false, code: "YEBS_SOURCE_NOT_FOUND" };
  }
  if (!isCanonicalSourceRow(data)) {
    console.error("[yebs] getSourceById: canonical row guard failed");
    return { ok: false, code: "YEBS_SOURCE_READ_FAILED" };
  }
  return { ok: true, row: data };
}
