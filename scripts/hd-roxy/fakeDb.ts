/**
 * HD Roxy harness — bellek-içi sahte Supabase (yalnız harness'te kullanılan alt küme).
 * Gerçek DB'ye BAĞLANMAZ. Desteklenen: from().select/insert/delete/update + eq/or/in/order/limit
 * + maybeSingle/single + PK ve (tenant_id,input_hash) tekilliği + "eksik kolon" simülasyonu.
 */

type Row = Record<string, unknown>;
type Err = { code: string; message: string } | null;

export type FakeDbOptions = {
  /** Bu kolonlar "yok" sayılır (migration uygulanmamış simülasyonu). */
  missingColumns?: string[];
};

function parseOr(expr: string): ((r: Row) => boolean)[] {
  return expr.split(",").map((part) => {
    const [col, op, ...rest] = part.split(".");
    const val = rest.join(".");
    if (op === "is" && val === "null") return (r: Row) => r[col] === null || r[col] === undefined;
    if (op === "eq") return (r: Row) => String(r[col]) === val;
    throw new Error(`fakeDb: desteklenmeyen or ifadesi ${part}`);
  });
}

export function createFakeDb(seed: Record<string, Row[]> = {}, opts: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const missing = new Set(opts.missingColumns ?? []);
  const log: { table: string; op: string; filters: [string, unknown][] }[] = [];

  function missingErr(cols: string[]): Err {
    const m = cols.find((c) => missing.has(c));
    return m ? { code: "42703", message: `column human_design_charts.${m} does not exist` } : null;
  }

  function from(table: string) {
    tables[table] ??= [];
    let op = "";
    let payload: Row | Row[] | null = null;
    let selectCols = "*";
    const filters: [string, unknown][] = [];
    const ors: ((r: Row) => boolean)[][] = [];
    const ins: [string, unknown[]][] = [];
    let mode: "many" | "single" | "maybe" = "many";

    const match = (r: Row) =>
      filters.every(([c, v]) => r[c] === v) &&
      ors.every((alts) => alts.some((f) => f(r))) &&
      ins.every(([c, vs]) => vs.includes(r[c]));

    function project(r: Row): Row {
      if (selectCols.trim() === "*") return { ...r };
      const out: Row = {};
      for (const c of selectCols.split(",").map((x) => x.trim())) out[c] = r[c] ?? null;
      return out;
    }

    function exec(): { data: unknown; error: Err } {
      log.push({ table, op: op || "select", filters: [...filters] });
      const rows = tables[table];
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload as Row];
        for (const p of list) {
          const me = missingErr(Object.keys(p));
          if (me) return { data: null, error: { code: "PGRST204", message: `Could not find the '${me.message.split(".").pop()}' column` } };
          if (p.id !== undefined && rows.some((r) => r.id === p.id)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          if (p.input_hash && rows.some((r) => r.tenant_id === p.tenant_id && r.input_hash === p.input_hash)) {
            return { data: null, error: { code: "23505", message: "duplicate key (tenant_id,input_hash)" } };
          }
        }
        const inserted = list.map((p) => ({ id: p.id ?? `gen-${Math.random().toString(36).slice(2)}`, ...p, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
        rows.push(...inserted);
        const out = inserted.map(project);
        return { data: mode === "many" ? out : out[0] ?? null, error: null };
      }
      const me = missingErr(selectCols === "*" ? [] : selectCols.split(",").map((c) => c.trim()));
      if (me) return { data: null, error: me };
      if (op === "delete") {
        const del = rows.filter(match);
        tables[table] = rows.filter((r) => !match(r));
        return { data: del.map(project), error: null };
      }
      if (op === "update") {
        const upd = rows.filter(match);
        for (const r of upd) Object.assign(r, payload);
        return { data: upd.map(project), error: null };
      }
      const found = rows.filter(match).map(project);
      if (mode === "maybe") {
        if (found.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
        return { data: found[0] ?? null, error: null };
      }
      if (mode === "single") {
        return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { code: "PGRST116", message: "not single" } };
      }
      return { data: found, error: null };
    }

    const b = {
      select(cols?: string) {
        if (!op) op = "select";
        if (cols) selectCols = cols;
        return b;
      },
      insert(p: Row | Row[]) {
        op = "insert";
        payload = p;
        return b;
      },
      update(p: Row) {
        op = "update";
        payload = p;
        return b;
      },
      delete() {
        op = "delete";
        return b;
      },
      eq(c: string, v: unknown) {
        filters.push([c, v]);
        return b;
      },
      or(expr: string) {
        ors.push(parseOr(expr));
        return b;
      },
      in(c: string, vs: unknown[]) {
        ins.push([c, vs]);
        return b;
      },
      order() {
        return b;
      },
      limit() {
        return b;
      },
      maybeSingle() {
        mode = "maybe";
        return b;
      },
      single() {
        mode = "single";
        return b;
      },
      then<T>(res: (v: { data: unknown; error: Err }) => T, rej?: (e: unknown) => T) {
        try {
          return Promise.resolve(exec()).then(res, rej);
        } catch (e) {
          return rej ? Promise.resolve(rej(e)) : Promise.reject(e);
        }
      },
    };
    return b;
  }

  return { db: { from } as unknown as import("@supabase/supabase-js").SupabaseClient, tables, log };
}
