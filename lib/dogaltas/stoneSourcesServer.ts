/**
 * Doğaltaş çoklu kaynak (WT9) — SUNUCU yardımcıları (service_role db + oturum tenant'ı).
 *
 * Tenant: her sorgu `.eq("tenant_id", tenantId)` ile; taş da aynı tenant'tan okunur → başka uzmanın
 * taşının/kaynağının id'si bilinse bile okunamaz/yazılamaz (merkezî kütüphane YOK).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";
import { buildStoneSourcesView, type StoneSourceView } from "@/lib/dogaltas/stoneSources";

type PgErr = { code?: string; message?: string } | null | undefined;

/** Migration henüz uygulanmamış (tablo/kolon yok) → eski tek-kaynak davranışına düşülür, çökme yok. */
export function isSourcesSchemaMissing(err: PgErr): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  return (
    code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204" ||
    /stone_sources|primary_source_name|extra_sources_text/.test(msg) && /does not exist|could not find|schema cache/i.test(msg)
  );
}

/** Aynı-kaynak (UNIQUE / tetikleyici 23505) çakışması. */
export function isDuplicateSourceError(err: PgErr): boolean {
  return String(err?.code ?? "") === "23505";
}

export const STONE_SOURCES_SELECT =
  "id, tenant_id, stone_id, source_name, sort_order, short_description, general_info, source_note, physical_effects, spiritual_effects, other_effects, feng_shui, meditation, care, application, warning_text, chakras, created_at, updated_at";

export type StoneSourcesLoad =
  | { ok: true; stone: Record<string, unknown>; sources: StoneSourceView[]; schemaMissing: boolean }
  | { ok: false; status: 404 | 500; error: unknown };

/** Kendi tenant'ındaki taş + kaynakları (birincil ilk). */
export async function loadStoneSources(db: SupabaseClient, tenantId: string, stoneId: string): Promise<StoneSourcesLoad> {
  const { data: stone, error } = await db.from("stones").select("*").eq("id", stoneId).eq("tenant_id", tenantId).maybeSingle();
  if (error) return { ok: false, status: 500, error };
  if (!stone) return { ok: false, status: 404, error: null };
  const { data: extras, error: e2 } = await db
    .from("stone_sources").select(STONE_SOURCES_SELECT)
    .eq("tenant_id", tenantId).eq("stone_id", stoneId)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (e2 && !isSourcesSchemaMissing(e2)) return { ok: false, status: 500, error: e2 };
  const rows = (e2 ? [] : (extras ?? [])) as Record<string, unknown>[];
  return { ok: true, stone: stone as Record<string, unknown>, sources: buildStoneSourcesView(stone as Record<string, unknown>, rows), schemaMissing: Boolean(e2) };
}

/** Birden çok taşın EK kaynakları (Word toplu rapor). Tablo yoksa boş. */
export async function loadExtraSourcesForStones(
  db: SupabaseClient,
  tenantId: string,
  stoneIds: readonly string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const out = new Map<string, Record<string, unknown>[]>();
  const CHUNK = 150;
  for (let i = 0; i < stoneIds.length; i += CHUNK) {
    const chunk = stoneIds.slice(i, i + CHUNK);
    const res = await fetchAllRows<Record<string, unknown>>((from, to) =>
      db.from("stone_sources").select(STONE_SOURCES_SELECT)
        .eq("tenant_id", tenantId).in("stone_id", chunk)
        .order("stone_id", { ascending: true }).order("sort_order", { ascending: true }).order("id", { ascending: true })
        .range(from, to),
    );
    if (!res.ok) {
      if (isSourcesSchemaMissing(res.error as PgErr)) return new Map();
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
