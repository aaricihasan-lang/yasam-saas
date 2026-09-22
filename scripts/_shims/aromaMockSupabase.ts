// ============================================================
// Minimal in-memory mock Supabase client for Aromaterapi report readers.
//
// Supports EXACTLY the query chain the service readers use:
//   .from(table)
//   .select(cols, { count, head })
//   .eq(col, val)
//   .in(col, arr)
//   .or(str)                         // top-level comma split respecting (...)
//   .order(col, { ascending, nullsFirst })
//   .range(a, b)                     // terminal → awaitable { data, error, count }
//   .maybeSingle()                   // terminal → awaitable { data, error }
//   await builder                    // thenable → { data, error, count }
//
// Honors .eq("tenant_id", ...) and id/parent_id filtering, counts .from()
// invocations, and records a tenant-filter flag + value per executed query.
// Column projection is intentionally ignored (full row returned) — batch and
// single paths use the mock identically, so parity is unaffected.
// ============================================================

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

type Filter =
  | { t: "eq"; col: string; val: unknown }
  | { t: "in"; col: string; arr: unknown[] }
  | { t: "or"; str: string };

type QueryRecord = {
  table: string;
  tenantFilter: boolean;
  tenantValue: unknown;
  filters: Filter[];
  terminal: "then" | "range" | "maybeSingle";
};

export type MockDb = {
  from: (table: string) => MockQuery;
  __fromCount: number;
  __queries: QueryRecord[];
  __reset: () => void;
};

function clone<T>(x: T): T {
  return x === null || x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T);
}

// Split "a.eq.x,b.in.(1,2)" at top-level commas (ignore commas inside parens).
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function matchOr(row: Row, orStr: string): boolean {
  for (const token of splitTopLevel(orStr)) {
    const firstDot = token.indexOf(".");
    const secondDot = token.indexOf(".", firstDot + 1);
    if (firstDot < 0 || secondDot < 0) continue;
    const col = token.slice(0, firstDot);
    const op = token.slice(firstDot + 1, secondDot);
    const rest = token.slice(secondDot + 1);
    const v = row[col];
    if (op === "eq") {
      if (v === rest) return true;
    } else if (op === "in") {
      const inner = rest.replace(/^\(/, "").replace(/\)$/, "");
      const set = inner.split(",");
      if (typeof v === "string" && set.includes(v)) return true;
    } else if (op === "ilike") {
      const pat = rest.replace(/%/g, "").toLowerCase();
      if (typeof v === "string" && v.toLowerCase().includes(pat)) return true;
    }
  }
  return false;
}

class MockQuery {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private wantCount = false;
  private head = false;
  private cols: string[] | null = null; // null = all columns (*)

  constructor(
    private db: MockDb,
    private tables: Tables,
    private table: string,
  ) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    // Honor column projection so `{...row}` spread paths (single readers) see EXACTLY
    // the selected columns — matching the explicit-field batch readers. `*`/undefined = full row.
    if (cols && cols.trim() !== "*") {
      this.cols = cols.split(",").map((c) => c.trim()).filter(Boolean);
    }
    return this;
  }

  private project(rows: Row[]): Row[] {
    if (!this.cols) return rows;
    const cols = this.cols;
    return rows.map((r) => {
      const out: Row = {};
      for (const c of cols) if (Object.prototype.hasOwnProperty.call(r, c)) out[c] = r[c];
      return out;
    });
  }

  eq(col: string, val: unknown) {
    this.filters.push({ t: "eq", col, val });
    return this;
  }

  in(col: string, arr: unknown[]) {
    this.filters.push({ t: "in", col, arr });
    return this;
  }

  or(str: string) {
    this.filters.push({ t: "or", str });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      col,
      asc: opts?.ascending !== false,
      nullsFirst: opts?.nullsFirst === true,
    });
    return this;
  }

  private applyFilters(): Row[] {
    let rows = (this.tables[this.table] ?? []).slice();
    for (const f of this.filters) {
      if (f.t === "eq") rows = rows.filter((r) => r[f.col] === f.val);
      else if (f.t === "in") rows = rows.filter((r) => f.arr.includes(r[f.col]));
      else if (f.t === "or") rows = rows.filter((r) => matchOr(r, f.str));
    }
    return rows;
  }

  private applyOrder(rows: Row[]): Row[] {
    if (this.orders.length === 0) return rows;
    const orders = this.orders;
    return rows.slice().sort((a, b) => {
      for (const o of orders) {
        const av = a[o.col];
        const bv = b[o.col];
        const an = av === null || av === undefined;
        const bn = bv === null || bv === undefined;
        if (an && bn) continue;
        if (an) return o.nullsFirst ? -1 : 1;
        if (bn) return o.nullsFirst ? 1 : -1;
        let cmp = 0;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
        if (cmp !== 0) return o.asc ? cmp : -cmp;
      }
      return 0;
    });
  }

  private record(terminal: QueryRecord["terminal"]): void {
    const tf = this.filters.find((f) => f.t === "eq" && f.col === "tenant_id") as
      | { t: "eq"; col: string; val: unknown }
      | undefined;
    this.db.__queries.push({
      table: this.table,
      tenantFilter: !!tf,
      tenantValue: tf ? tf.val : null,
      filters: this.filters,
      terminal,
    });
  }

  private exec(terminal: QueryRecord["terminal"]): { data: Row[]; error: null; count: number | null } {
    this.record(terminal);
    const filtered = this.applyFilters();
    const count = this.wantCount ? filtered.length : null;
    const ordered = this.applyOrder(filtered);
    if (this.head) return { data: [], error: null, count };
    return { data: this.project(clone(ordered)), error: null, count };
  }

  range(a: number, b: number): Promise<{ data: Row[]; error: null; count: number | null }> {
    this.record("range");
    const filtered = this.applyFilters();
    const count = this.wantCount ? filtered.length : null;
    const ordered = this.applyOrder(filtered);
    const sliced = ordered.slice(a, b + 1);
    return Promise.resolve({ data: this.project(clone(sliced)), error: null, count });
  }

  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.record("maybeSingle");
    const filtered = this.applyOrder(this.applyFilters());
    const row = filtered.length ? this.project(clone([filtered[0]]))[0] : null;
    return Promise.resolve({ data: row, error: null });
  }

  // Thenable: awaiting the builder directly (no range/maybeSingle).
  then<TResult1 = { data: Row[]; error: null; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec("then")).then(onfulfilled, onrejected);
  }
}

export function makeMockDb(tables: Tables): MockDb {
  const db = {
    __fromCount: 0,
    __queries: [] as QueryRecord[],
  } as MockDb;
  db.from = (table: string) => {
    db.__fromCount++;
    return new MockQuery(db, tables, table);
  };
  db.__reset = () => {
    db.__fromCount = 0;
    db.__queries.length = 0;
  };
  return db;
}
