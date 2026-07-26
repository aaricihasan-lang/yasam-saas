import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ D / D2 (yebs_schools) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (API-A1R):
 *   - Yalnız okuma: listSchools + getSchoolById.
 *   - Bu katman admin doğrulaması YAPMAZ (route'un verifyAdminRequest sorumluluğu).
 *   - HTTP Request / NextResponse bilmez; yalnız enjekte edilen `db` (service_role)
 *     client'ını kullanır.
 *   - Ham DB hata metnini route'a taşımaz; hatayı server-side loglar ve typed union
 *     içinde yalnız stabil bir makine kodu döndürür. İstemciye gösterilecek Türkçe
 *     mesajı route üretir.
 *   - Canonical row guard (fail-closed): DB'den dönen satır beklenen 10 canonical
 *     alanı taşımıyorsa liste/detay OKUMA HATASI olarak reddedilir; bozuk/kısmi
 *     satır istemciye gitmez.
 *   - Mutation YOK: insert/update/delete/upsert/rpc çağrısı bulunmaz; audit'e
 *     erişilmez; tradition JOIN edilmez (saf canonical yebs_schools satırı döner).
 *
 * Güvenlik: `import "server-only"` — bu modülün istemci paketine sızması build-time'da
 *   engellenir. YEBS tabloları RLS ile kilitlidir (anon/authenticated REVOKE, yalnız
 *   service_role GRANT); erişim yalnız route'un `guard.db` nesnesiyle olur.
 */

/**
 * D2 migration (20260726220031_yebs_schools.sql) kolonları — AÇIK liste.
 * `select("*")` KULLANILMAZ (kontrat: yalnız gereken kolonlar döner).
 * NOT: yebs_schools'ta tradition_type YOKTUR; bunun yerine tradition_id (FK) vardır.
 */
export const YEBS_SCHOOL_COLUMNS =
  "id, tradition_id, slug, name_tr, native_name, native_language_tag, native_script_code, status, created_at, updated_at";

/** D2 status CHECK değer kümesi (yalnız bu dilimde okuma filtresi olarak kullanılır). */
export const YEBS_SCHOOL_STATUSES = [
  "draft",
  "verified",
  "approved",
  "published",
] as const;

export type YebsSchoolStatus = (typeof YEBS_SCHOOL_STATUSES)[number];

export type YebsSchoolRow = {
  id: string;
  tradition_id: string;
  slug: string;
  name_tr: string;
  native_name: string | null;
  native_language_tag: string | null;
  native_script_code: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ListSchoolsFilters = {
  limit: number;
  offset: number;
  /** Ebeveyn gelenek filtresi. Route tarafında strict UUID doğrulanmış olarak gelir. */
  traditionId?: string;
  status?: YebsSchoolStatus;
  /**
   * Arama terimi. Route tarafında trim + 100 karakter + PostgREST filtre-özel
   * karakterlerinden ( , ( ) * % ) arındırılmış olarak gelir. Katman bu ön koşula
   * güvenir; kendisi ek enjeksiyon açmaz.
   */
  q?: string;
  /** Slug tam eşleşme filtresi (route tarafında trim edilmiş gelir). */
  slug?: string;
};

export type ListSchoolsResult =
  | { ok: true; rows: YebsSchoolRow[]; count: number }
  | { ok: false; code: "YEBS_SCHOOLS_LIST_FAILED" };

export type GetSchoolResult =
  | { ok: true; row: YebsSchoolRow }
  | { ok: false; code: "YEBS_SCHOOL_NOT_FOUND" | "YEBS_SCHOOL_READ_FAILED" };

/**
 * Canonical row guard (fail-closed). Yalnız 10 canonical alanın exact tip
 * sözleşmesini doğrular; eksik/bozuk satır false döndürür (istemciye gitmez).
 */
function isCanonicalSchoolRow(value: unknown): value is YebsSchoolRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const isStr = (x: unknown): boolean => typeof x === "string";
  const isStrOrNull = (x: unknown): boolean => x === null || typeof x === "string";
  return (
    isStr(o.id) &&
    isStr(o.tradition_id) &&
    isStr(o.slug) &&
    isStr(o.name_tr) &&
    isStrOrNull(o.native_name) &&
    isStrOrNull(o.native_language_tag) &&
    isStrOrNull(o.native_script_code) &&
    isStr(o.status) &&
    isStr(o.created_at) &&
    isStr(o.updated_at)
  );
}

/**
 * Ekol kayıtlarını salt-okunur listeler.
 *
 * Sıralama deterministiktir: created_at DESC, ardından id DESC (eşit created_at'te
 * kararlı sıralama tiebreaker'ı). Pencereleme `.range(offset, offset+limit-1)`.
 * Tradition JOIN edilmez; yalnız canonical yebs_schools kolonları döner.
 */
export async function listSchools(
  db: SupabaseClient,
  filters: ListSchoolsFilters,
): Promise<ListSchoolsResult> {
  let query = db
    .from("yebs_schools")
    .select(YEBS_SCHOOL_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.traditionId) {
    query = query.eq("tradition_id", filters.traditionId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.slug) {
    query = query.eq("slug", filters.slug);
  }

  if (filters.q) {
    // filters.q ön-arındırılmıştır (route). name_tr veya slug üzerinde ilike.
    query = query.or(`name_tr.ilike.%${filters.q}%,slug.ilike.%${filters.q}%`);
  }

  const { data, error, count } = await query.range(
    filters.offset,
    filters.offset + filters.limit - 1,
  );

  if (error) {
    // Ham DB mesajı yalnız server log'a; istemciye gitmez.
    console.error("[yebs] listSchools failed:", error.message);
    return { ok: false, code: "YEBS_SCHOOLS_LIST_FAILED" };
  }

  const rows = (data ?? []) as unknown[];
  if (!rows.every(isCanonicalSchoolRow)) {
    // Fail-closed: bozuk/kısmi canonical satır istemciye gitmez.
    console.error("[yebs] listSchools: canonical row guard failed");
    return { ok: false, code: "YEBS_SCHOOLS_LIST_FAILED" };
  }

  return {
    ok: true,
    rows: rows as YebsSchoolRow[],
    count: count ?? 0,
  };
}

/**
 * Tek ekol kaydını salt-okunur getirir.
 *
 * NOT: UUID biçim doğrulaması route sorumluluğundadır (bu katman `id`'yi doğrudan
 * sorgular). Kayıt yoksa 'YEBS_SCHOOL_NOT_FOUND', DB hatasında veya bozuk canonical
 * satırda 'YEBS_SCHOOL_READ_FAILED' döner. Tenant/kullanıcı sahiplik filtresi
 * YOKTUR — yebs_schools merkezî admin referans tablosudur.
 */
export async function getSchoolById(
  db: SupabaseClient,
  id: string,
): Promise<GetSchoolResult> {
  const { data, error } = await db
    .from("yebs_schools")
    .select(YEBS_SCHOOL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getSchoolById failed:", error.message);
    return { ok: false, code: "YEBS_SCHOOL_READ_FAILED" };
  }

  if (!data) {
    return { ok: false, code: "YEBS_SCHOOL_NOT_FOUND" };
  }

  if (!isCanonicalSchoolRow(data)) {
    // Fail-closed: bozuk canonical satır istemciye gitmez.
    console.error("[yebs] getSchoolById: canonical row guard failed");
    return { ok: false, code: "YEBS_SCHOOL_READ_FAILED" };
  }

  return { ok: true, row: data };
}
