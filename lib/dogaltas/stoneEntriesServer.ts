/**
 * Doğaltaş bilgi kaydı modeli — SUNUCU yardımcıları (service_role db + oturum tenant'ı).
 * Tenant: her sorgu `.eq("tenant_id", tenantId)` → başka uzmanın kaydı id ile bile okunamaz/yazılamaz.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";

type PgErr = { code?: string; message?: string } | null | undefined;

/** Migration henüz uygulanmamış (tablo/kolon yok) → kayıt yok sayılır (eski davranış), çökme yok. */
export function isEntriesSchemaMissing(err: PgErr): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204" || code === "PGRST202" || code === "42883" ||
    (/stone_entries|entries_text|dogaltas_stone_legacy_entry/.test(msg) && /does not exist|could not find|schema cache/i.test(msg));
}

export const STONE_ENTRIES_SELECT = "id, tenant_id, stone_id, field_key, content, source_name, sort_order, legacy_origin, created_at, updated_at";

/** Tek taşın kayıtları (sıralı). Tablo yoksa { rows: [], schemaMissing: true }. */
export async function loadStoneEntryRows(
  db: SupabaseClient,
  tenantId: string,
  stoneId: string,
): Promise<{ ok: true; rows: Record<string, unknown>[]; schemaMissing: boolean } | { ok: false; error: unknown }> {
  const { data, error } = await db.from("stone_entries").select(STONE_ENTRIES_SELECT)
    .eq("tenant_id", tenantId).eq("stone_id", stoneId)
    .order("field_key", { ascending: true }).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    if (isEntriesSchemaMissing(error)) return { ok: true, rows: [], schemaMissing: true };
    return { ok: false, error };
  }
  return { ok: true, rows: (data ?? []) as Record<string, unknown>[], schemaMissing: false };
}

/** Birden çok taşın kayıtları (Word toplu rapor). Tablo yoksa boş. */
export async function loadEntriesForStones(
  db: SupabaseClient,
  tenantId: string,
  stoneIds: readonly string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const out = new Map<string, Record<string, unknown>[]>();
  const CHUNK = 150;
  for (let i = 0; i < stoneIds.length; i += CHUNK) {
    const chunk = stoneIds.slice(i, i + CHUNK);
    const res = await fetchAllRows<Record<string, unknown>>((from, to) =>
      db.from("stone_entries").select(STONE_ENTRIES_SELECT)
        .eq("tenant_id", tenantId).in("stone_id", chunk)
        .order("stone_id", { ascending: true }).order("sort_order", { ascending: true }).order("id", { ascending: true })
        .range(from, to),
    );
    if (!res.ok) {
      if (isEntriesSchemaMissing(res.error as PgErr)) return new Map();
      throw res.error;
    }
    for (const r of res.rows) {
      const k = String(r.stone_id);
      const list = out.get(k) ?? [];
      list.push(r);
      out.set(k, list);
    }
  }
  return out;
}
