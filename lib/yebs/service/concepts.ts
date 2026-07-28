import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-A2 (yebs_concepts + yebs_concept_labels) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (A2R):
 *   - Yalnız okuma: listConcepts + getConceptById + listConceptLabels.
 *   - Bu katman admin doğrulaması YAPMAZ (route'un verifyAdminRequest sorumluluğu).
 *   - HTTP Request / NextResponse bilmez; yalnız enjekte edilen `db` (service_role)
 *     client'ını kullanır.
 *   - Ham DB hata metnini route'a taşımaz; hatayı server-side loglar ve typed union
 *     içinde yalnız stabil bir makine kodu döndürür.
 *   - Canonical row guard (fail-closed): DB'den dönen satır beklenen canonical alan
 *     sözleşmesini taşımıyorsa OKUMA HATASI olarak reddedilir; bozuk/kısmi satır
 *     istemciye gitmez.
 *   - Mutation YOK: insert/update/delete/upsert/rpc çağrısı bulunmaz; audit'e
 *     erişilmez; tradition/school JOIN edilmez (saf canonical satır döner).
 *
 * Güvenlik: `import "server-only"` — bu modülün istemci paketine sızması build-time'da
 *   engellenir. YEBS tabloları RLS ile kilitlidir (anon/authenticated REVOKE, yalnız
 *   service_role GRANT); erişim yalnız route'un `guard.db` nesnesiyle olur.
 */

/* ============================================================
 * Concept (D3) — canonical 8 kolon
 * ============================================================ */

/**
 * D3 migration (20260726230043_yebs_concepts.sql) kolonları — AÇIK liste.
 * `select("*")` KULLANILMAZ (kontrat: yalnız canonical 8 kolon döner).
 */
export const YEBS_CONCEPT_COLUMNS =
  "id, tradition_id, school_id, slug, concept_type, status, created_at, updated_at";

/** D3 status CHECK değer kümesi (okuma filtresi olarak kullanılır). */
export const YEBS_CONCEPT_STATUSES = [
  "draft",
  "verified",
  "approved",
  "published",
] as const;

export type YebsConceptStatus = (typeof YEBS_CONCEPT_STATUSES)[number];

/** D3 concept_type CHECK değer kümesi (okuma filtresi olarak kullanılır). */
export const YEBS_CONCEPT_TYPES = [
  "energy_center",
  "channel",
  "vital_substance",
  "anatomy_model",
  "technique",
  "principle",
  "other",
] as const;

export type YebsConceptType = (typeof YEBS_CONCEPT_TYPES)[number];

export type YebsConceptRow = {
  id: string;
  tradition_id: string;
  school_id: string | null;
  slug: string;
  concept_type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/**
 * scope: yalnız 'tradition' — yalnızca gelenek seviyesindeki (school_id IS NULL)
 * conceptleri listeler. Route tarafında `scope=tradition` ile school_id birlikte
 * verilirse 400 döner; bu katmana ulaşmaz.
 */
export type YebsConceptScope = "tradition";

export type ListConceptsFilters = {
  limit: number;
  offset: number;
  /** Ebeveyn gelenek filtresi. Route tarafında strict UUID doğrulanmış gelir. */
  traditionId?: string;
  /** Ebeveyn school filtresi. Route tarafında strict UUID doğrulanmış gelir. */
  schoolId?: string;
  /** 'tradition' → school_id IS NULL. */
  scope?: YebsConceptScope;
  status?: YebsConceptStatus;
  conceptType?: YebsConceptType;
  /**
   * Arama terimi. Route tarafında trim + 100 karakter + PostgREST filtre-özel
   * karakterlerinden ( , ( ) * % ) arındırılmış olarak gelir. YALNIZ slug'a uygulanır.
   */
  q?: string;
  /** Slug tam eşleşme filtresi (route tarafında trim edilmiş gelir). */
  slug?: string;
};

export type ListConceptsResult =
  | { ok: true; rows: YebsConceptRow[]; count: number }
  | { ok: false; code: "YEBS_CONCEPTS_LIST_FAILED" };

export type GetConceptResult =
  | { ok: true; row: YebsConceptRow }
  | { ok: false; code: "YEBS_CONCEPT_NOT_FOUND" | "YEBS_CONCEPT_READ_FAILED" };

/** Canonical concept row guard (fail-closed): yalnız 8 alanın exact tip sözleşmesi. */
function isCanonicalConceptRow(value: unknown): value is YebsConceptRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(o.id) &&
    isStr(o.tradition_id) &&
    isStrOrNull(o.school_id) &&
    isStr(o.slug) &&
    isStr(o.concept_type) &&
    isStr(o.status) &&
    isStr(o.created_at) &&
    isStr(o.updated_at)
  );
}

/**
 * Concept kayıtlarını salt-okunur listeler.
 * Sıralama deterministik: created_at DESC, ardından id DESC (kararlı tiebreaker).
 * Tradition/school JOIN edilmez; nested labels yok; audit yok.
 */
export async function listConcepts(
  db: SupabaseClient,
  filters: ListConceptsFilters,
): Promise<ListConceptsResult> {
  let query = db
    .from("yebs_concepts")
    .select(YEBS_CONCEPT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.traditionId) {
    query = query.eq("tradition_id", filters.traditionId);
  }

  if (filters.scope === "tradition") {
    query = query.is("school_id", null);
  } else if (filters.schoolId) {
    query = query.eq("school_id", filters.schoolId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.conceptType) {
    query = query.eq("concept_type", filters.conceptType);
  }

  if (filters.slug) {
    query = query.eq("slug", filters.slug);
  }

  if (filters.q) {
    // filters.q ön-arındırılmıştır (route). YALNIZ slug üzerinde ilike.
    query = query.ilike("slug", `%${filters.q}%`);
  }

  const { data, error, count } = await query.range(
    filters.offset,
    filters.offset + filters.limit - 1,
  );

  if (error) {
    console.error("[yebs] listConcepts failed:", error.message);
    return { ok: false, code: "YEBS_CONCEPTS_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalConceptRow)) {
    console.error("[yebs] listConcepts: canonical row guard failed");
    return { ok: false, code: "YEBS_CONCEPTS_LIST_FAILED" };
  }

  return { ok: true, rows: rows as YebsConceptRow[], count: count ?? 0 };
}

/**
 * Tek concept kaydını salt-okunur getirir.
 * UUID biçim doğrulaması route sorumluluğundadır. Kayıt yoksa
 * 'YEBS_CONCEPT_NOT_FOUND', DB hatası/bozuk satırda 'YEBS_CONCEPT_READ_FAILED'.
 * Nested labels DAHİL DEĞİL (ayrı endpoint).
 */
export async function getConceptById(
  db: SupabaseClient,
  id: string,
): Promise<GetConceptResult> {
  const { data, error } = await db
    .from("yebs_concepts")
    .select(YEBS_CONCEPT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getConceptById failed:", error.message);
    return { ok: false, code: "YEBS_CONCEPT_READ_FAILED" };
  }

  if (!data) {
    return { ok: false, code: "YEBS_CONCEPT_NOT_FOUND" };
  }

  if (!isCanonicalConceptRow(data)) {
    console.error("[yebs] getConceptById: canonical row guard failed");
    return { ok: false, code: "YEBS_CONCEPT_READ_FAILED" };
  }

  return { ok: true, row: data };
}

/* ============================================================
 * Concept Label (D4) — canonical 10 kolon
 * ============================================================ */

/**
 * D4 migration (20260727000000_yebs_concept_labels.sql) kolonları — AÇIK liste.
 * `select("*")` KULLANILMAZ.
 */
export const YEBS_CONCEPT_LABEL_COLUMNS =
  "id, concept_id, language_tag, script_code, label, label_kind, transliteration_scheme, is_primary, created_at, updated_at";

/** D4 label_kind CHECK değer kümesi. */
export const YEBS_LABEL_KINDS = [
  "original",
  "transliteration",
  "faithful_translation",
  "common_name",
  "alternative",
] as const;

export type YebsLabelKind = (typeof YEBS_LABEL_KINDS)[number];

export type YebsConceptLabelRow = {
  id: string;
  concept_id: string;
  language_tag: string;
  script_code: string;
  label: string;
  label_kind: string;
  transliteration_scheme: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type ListConceptLabelsResult =
  | { ok: true; rows: YebsConceptLabelRow[] }
  | {
      ok: false;
      code: "YEBS_CONCEPT_NOT_FOUND" | "YEBS_CONCEPT_LABELS_LIST_FAILED";
    };

/** Canonical label row guard (fail-closed): yalnız 10 alanın exact tip sözleşmesi. */
function isCanonicalLabelRow(value: unknown): value is YebsConceptLabelRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(o.id) &&
    isStr(o.concept_id) &&
    isStr(o.language_tag) &&
    isStr(o.script_code) &&
    isStr(o.label) &&
    isStr(o.label_kind) &&
    isStrOrNull(o.transliteration_scheme) &&
    typeof o.is_primary === "boolean" &&
    isStr(o.created_at) &&
    isStr(o.updated_at)
  );
}

/**
 * Bir concept'in etiketlerini salt-okunur listeler.
 *
 * Parent concept varlık kontrolü ZORUNLU: concept yoksa 'YEBS_CONCEPT_NOT_FOUND'
 * (boş dizi DEĞİL) döner — böylece "concept yok" ile "concept var, etiketi yok"
 * ayrımı korunur.
 *
 * Deterministik stabil sıra:
 *   1. is_primary DESC (true önce)
 *   2. language_tag ASC
 *   3. script_code ASC
 *   4. label_kind ASC
 *   5. created_at ASC
 *   6. id ASC
 */
export async function listConceptLabels(
  db: SupabaseClient,
  conceptId: string,
): Promise<ListConceptLabelsResult> {
  // Parent concept varlık kontrolü (yalnız id yeterli).
  const { data: concept, error: conceptErr } = await db
    .from("yebs_concepts")
    .select("id")
    .eq("id", conceptId)
    .maybeSingle();

  if (conceptErr) {
    console.error("[yebs] listConceptLabels parent check failed:", conceptErr.message);
    return { ok: false, code: "YEBS_CONCEPT_LABELS_LIST_FAILED" };
  }

  if (!concept) {
    return { ok: false, code: "YEBS_CONCEPT_NOT_FOUND" };
  }

  const { data, error } = await db
    .from("yebs_concept_labels")
    .select(YEBS_CONCEPT_LABEL_COLUMNS)
    .eq("concept_id", conceptId)
    .order("is_primary", { ascending: false })
    .order("language_tag", { ascending: true })
    .order("script_code", { ascending: true })
    .order("label_kind", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("[yebs] listConceptLabels failed:", error.message);
    return { ok: false, code: "YEBS_CONCEPT_LABELS_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalLabelRow)) {
    console.error("[yebs] listConceptLabels: canonical row guard failed");
    return { ok: false, code: "YEBS_CONCEPT_LABELS_LIST_FAILED" };
  }

  return { ok: true, rows: rows as YebsConceptLabelRow[] };
}
