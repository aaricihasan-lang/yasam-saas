// ============================================================
// Supabase-js alt kümesi → PGlite adaptörü (yalnız SENTETİK test; ağ / sır / production YOK).
// backup-locale.pg.harness.mts içindeki adaptörün BİREBİR kopyasıdır (o dosya değiştirilmeden bırakıldı; 75/75
// sayımı korunur). Yeni harness'lar bu modülü içe aktarır.
// ============================================================
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Supabase-js alt kümesi (scripts/sifa-rehberi-v2/backup-v2.pg.harness.mjs ile aynı sözleşme) ──
export type Row = Record<string, unknown>;
export function makeDb(pg: PGlite): SupabaseClient {
  const ident = (s: string) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad ident ${s}`);
    return `"${s}"`;
  };
  function builder(table: string) {
    const st = {
      op: "select",
      cols: "*",
      count: false,
      head: false,
      where: [] as string[],
      params: [] as unknown[],
      order: [] as string[],
      limit: null as number | null,
      rows: null as Row[] | null,
      onConflict: "",
      returning: null as string | null,
    };
    const addParam = (v: unknown) => {
      st.params.push(v);
      return `$${st.params.length}`;
    };
    const b: Record<string, unknown> = {
      select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
        if (st.op === "upsert") {
          st.returning = cols;
          return b;
        }
        st.cols = cols;
        st.count = opts.count === "exact";
        st.head = !!opts.head;
        return b;
      },
      eq(c: string, v: unknown) {
        st.where.push(`${ident(c)}::text = ${addParam(String(v))}`);
        return b;
      },
      gt(c: string, v: unknown) {
        st.where.push(`${ident(c)}::text > ${addParam(String(v))}`);
        return b;
      },
      in(c: string, arr: unknown[]) {
        st.where.push(`${ident(c)}::text = ANY(${addParam(arr.map(String))}::text[])`);
        return b;
      },
      or(expr: string) {
        throw new Error(`desteklenmeyen or(): ${expr}`);
      },
      order(c: string, o: { ascending?: boolean } = {}) {
        st.order.push(`${ident(c)}::text ${o.ascending === false ? "DESC" : "ASC"}`);
        return b;
      },
      limit(n: number) {
        st.limit = n;
        return b;
      },
      upsert(rows: Row[], opts: { onConflict: string }) {
        st.op = "upsert";
        st.rows = rows;
        st.onConflict = opts.onConflict;
        return b;
      },
      update() {
        throw new Error("UPDATE yasak");
      },
      delete() {
        throw new Error("DELETE yasak");
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return run().then(res, rej);
      },
    };
    async function run(): Promise<{ data: unknown; count?: number | null; error: { code: string; message: string } | null }> {
      try {
        if (st.op === "upsert") {
          const rows = st.rows ?? [];
          if (!rows.length) return { data: [], error: null };
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(ident);
          const conflict = st.onConflict.split(",").map((x) => ident(x.trim())).join(", ");
          const ret = st.returning ? st.returning.split(",").map((x) => ident(x.trim())).join(", ") : "1";
          const r = await pg.query(
            `INSERT INTO ${ident(table)} (${cols.join(", ")}) SELECT ${cols.join(", ")} FROM jsonb_populate_recordset(NULL::${ident(table)}, $1::jsonb) ON CONFLICT (${conflict}) DO NOTHING RETURNING ${ret}`,
            [JSON.stringify(rows)],
          );
          return { data: r.rows, error: null };
        }
        const where = st.where.length ? ` WHERE ${st.where.join(" AND ")}` : "";
        if (st.head && st.count) {
          const r = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM ${ident(table)}${where}`, st.params);
          return { data: null, count: r.rows[0].n, error: null };
        }
        const cols = st.cols === "*" ? "*" : st.cols.split(",").map((x) => ident(x.trim())).join(", ");
        const sql = `SELECT ${cols} FROM ${ident(table)}${where}${st.order.length ? ` ORDER BY ${st.order.join(", ")}` : ""}${st.limit !== null ? ` LIMIT ${Number(st.limit)}` : ""}`;
        const r = await pg.query<Row>(sql, st.params);
        const data = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
        return { data, count: st.count ? data.length : null, error: null };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return { data: null, count: null, error: { code: err.code ?? "XX000", message: err.message ?? "" } };
      }
    }
    return b;
  }
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}
