import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ D / D1 (yebs_traditions) SALT-OKUNUR servis katmanı.
 *
 * Sorumluluk sınırı (API-A0R):
 *   - Yalnız okuma: listTraditions + getTradition.
 *   - Bu katman admin doğrulaması YAPMAZ (route'un verifyAdminRequest sorumluluğu).
 *   - HTTP Request / NextResponse bilmez; yalnız enjekte edilen `db` (service_role)
 *     client'ını kullanır.
 *   - Ham DB hata metnini route'a taşımaz; hatayı server-side loglar ve typed union
 *     içinde yalnız stabil bir makine kodu döndürür. İstemciye gösterilecek Türkçe
 *     mesajı route üretir.
 *
 * Güvenlik: `import "server-only"` — bu modülün istemci paketine sızması build-time'da
 *   engellenir. YEBS tabloları RLS ile kilitlidir (anon/authenticated REVOKE, yalnız
 *   service_role GRANT); erişim yalnız route'un `guard.db` nesnesiyle olur.
 */

/**
 * D1 migration (20260726210017_yebs_traditions.sql) kolonları — AÇIK liste.
 * `select("*")` KULLANILMAZ (kontrat: yalnız gereken kolonlar döner).
 */
export const YEBS_TRADITION_COLUMNS =
  "id, slug, name_tr, tradition_type, native_name, native_language_tag, native_script_code, status, created_at, updated_at";

/** D1 status CHECK değer kümesi (yalnız bu dilimde okuma filtresi olarak kullanılır). */
export const YEBS_TRADITION_STATUSES = [
  "draft",
  "verified",
  "approved",
  "published",
] as const;

export type YebsTraditionStatus = (typeof YEBS_TRADITION_STATUSES)[number];

export type YebsTraditionRow = {
  id: string;
  slug: string;
  name_tr: string;
  tradition_type: string;
  native_name: string | null;
  native_language_tag: string | null;
  native_script_code: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ListTraditionsFilters = {
  limit: number;
  offset: number;
  status?: YebsTraditionStatus;
  /**
   * Arama terimi. Route tarafında trim + 100 karakter + PostgREST filtre-özel
   * karakterlerinden ( , ( ) * % ) arındırılmış olarak gelir. Katman bu ön koşula
   * güvenir; kendisi ek enjeksiyon açmaz.
   */
  q?: string;
};

export type ListTraditionsResult =
  | { ok: true; rows: YebsTraditionRow[]; count: number }
  | { ok: false; code: "YEBS_TRADITIONS_LIST_FAILED" };

export type GetTraditionResult =
  | { ok: true; row: YebsTraditionRow }
  | { ok: false; code: "YEBS_TRADITION_NOT_FOUND" | "YEBS_TRADITION_READ_FAILED" };

/**
 * Gelenek kayıtlarını salt-okunur listeler.
 *
 * Sıralama deterministiktir: created_at DESC, ardından id ASC (eşit created_at'te
 * kararlı sıralama tiebreaker'ı). Pencereleme `.range(offset, offset+limit-1)`.
 */
export async function listTraditions(
  db: SupabaseClient,
  filters: ListTraditionsFilters,
): Promise<ListTraditionsResult> {
  let query = db
    .from("yebs_traditions")
    .select(YEBS_TRADITION_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.q) {
    // filters.q ön-arındırılmıştır (route). name_tr veya slug üzerinde ilike.
    query = query.or(
      `name_tr.ilike.%${filters.q}%,slug.ilike.%${filters.q}%`,
    );
  }

  const { data, error, count } = await query.range(
    filters.offset,
    filters.offset + filters.limit - 1,
  );

  if (error) {
    // Ham DB mesajı yalnız server log'a; istemciye gitmez.
    console.error("[yebs] listTraditions failed:", error.message);
    return { ok: false, code: "YEBS_TRADITIONS_LIST_FAILED" };
  }

  return {
    ok: true,
    rows: (data ?? []) as unknown as YebsTraditionRow[],
    count: count ?? 0,
  };
}

/**
 * Tek gelenek kaydını salt-okunur getirir.
 *
 * NOT: UUID biçim doğrulaması route sorumluluğundadır (bu katman `id`'yi doğrudan
 * sorgular). Kayıt yoksa 'YEBS_TRADITION_NOT_FOUND', DB hatasında
 * 'YEBS_TRADITION_READ_FAILED' döner. Tenant/kullanıcı sahiplik filtresi YOKTUR —
 * yebs_traditions merkezî admin referans tablosudur.
 */
export async function getTradition(
  db: SupabaseClient,
  id: string,
): Promise<GetTraditionResult> {
  const { data, error } = await db
    .from("yebs_traditions")
    .select(YEBS_TRADITION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[yebs] getTradition failed:", error.message);
    return { ok: false, code: "YEBS_TRADITION_READ_FAILED" };
  }

  if (!data) {
    return { ok: false, code: "YEBS_TRADITION_NOT_FOUND" };
  }

  return { ok: true, row: data as unknown as YebsTraditionRow };
}
