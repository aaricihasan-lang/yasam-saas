/**
 * SifaV2Db adaptörleri.
 *  - supabaseDb: production — mevcut sunucu istemcisi (service_role) ile RPC.
 *  - pgDb      : İZOLE TEST — doğrudan pg istemcisi (gömülü PostgreSQL). Production'da kullanılmaz.
 * İkisi de AYNI DB fonksiyonlarını aynı (adlandırılmış) argümanlarla çağırır → testler gerçek SQL'i sınar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbError, type SifaV2Db } from "@/lib/sifa-rehberi-v2/server/service";

export function supabaseDb(client: SupabaseClient): SifaV2Db {
  return {
    async rpc(fn: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new DbError(error.message, error.code ?? null, (error as { details?: string | null }).details ?? null);
      return data;
    },
  };
}

/** pg.Client / pg.Pool benzeri asgari arayüz (bağımlılığı tipte zorlamamak için). */
export type PgQueryable = { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** Fonksiyon → adlandırılmış argümanların SQL türleri (PostgREST'in yaptığı gibi). */
const SIGNATURES: Record<string, [string, string][]> = {
  sifa_v2_load: [["p_tenant", "uuid"], ["p_user", "uuid"]],
  sifa_v2_apply_changeset: [["p_tenant", "uuid"], ["p_user", "uuid"], ["p_changes", "jsonb"]],
  sifa_v2_copy_shared: [["p_tenant", "uuid"], ["p_user", "uuid"], ["p_root", "uuid"]],
  sifa_v2_register_upload: [["p_tenant", "uuid"], ["p_user", "uuid"], ["p_asset", "jsonb"]],
  sifa_v2_visible_assets: [["p_tenant", "uuid"], ["p_user", "uuid"], ["p_ids", "uuid[]"]],
  sifa_v2_trash_candidates: [["p_cutoff", "timestamptz"]],
  sifa_v2_trash_purge: [["p_cutoff", "timestamptz"], ["p_removed_assets", "uuid[]"]],
  sifa_v2_gc_candidates: [["p_cutoff", "timestamptz"], ["p_upload_cutoff", "timestamptz"], ["p_tenant", "uuid"], ["p_limit", "integer"]],
  sifa_v2_gc_purge: [["p_cutoff", "timestamptz"], ["p_tenant", "uuid"], ["p_removed_assets", "uuid[]"]],
};

export function pgDb(client: PgQueryable): SifaV2Db {
  return {
    async rpc(fn: string, args: Record<string, unknown>) {
      const sig = SIGNATURES[fn];
      if (!sig) throw new DbError(`bilinmeyen fonksiyon ${fn}`, "PGRST202");
      const values = sig.map(([k, t]) => (t === "jsonb" ? JSON.stringify(args[k] ?? null) : args[k]));
      const params = sig.map(([k, t], i) => `${k} => $${i + 1}::${t}`).join(", ");
      try {
        const r = await client.query(`select public.${fn}(${params}) as v`, values);
        return r.rows[0]?.v;
      } catch (e) {
        const err = e as { message?: string; code?: string; detail?: string };
        throw new DbError(err.message ?? String(e), err.code ?? null, err.detail ?? null);
      }
    },
  };
}
