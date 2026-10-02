/**
 * Biyoenerji satış-öncesi final harness'ları için minimal PostgREST/supabase-js taklidi.
 * Desteklenen zincir: from().select(cols,{count}).eq/in/not/is/or().order().range().
 * KRİTİK: sunucu `maxRows` (Supabase varsayılanı 1000) kesmesini BİREBİR uygular — tek
 * sorguda maxRows'tan fazla satır DÖNMEZ (gerçek prod davranışı). `count:"exact"` toplamı verir.
 */
type Row = Record<string, unknown>;
type Pred = (r: Row) => boolean;

export type FakeDbOptions = {
  maxRows?: number;
  /** tablo → hata (ör. { code: "42P01" } dormant tablo) */
  tableErrors?: Record<string, { code?: string; message?: string }>;
  /** n. sorguda (0-tabanlı, tablo bazlı) hata döndür */
  failOnCall?: { table: string; call: number };
};

export function createFakeDb(tables: Record<string, Row[]>, opts: FakeDbOptions = {}) {
  const maxRows = opts.maxRows ?? 1000;
  const calls: Record<string, number> = {};
  const log: { table: string; from: number | null; to: number | null; returned: number }[] = [];

  class Q implements PromiseLike<{ data: Row[] | null; error: unknown; count: number | null }> {
    private preds: Pred[] = [];
    private orders: { col: string; asc: boolean }[] = [];
    private from_: number | null = null;
    private to_: number | null = null;
    private wantCount = false;
    constructor(private table: string) {}
    select(_cols?: string, o?: { count?: string; head?: boolean }) { this.wantCount = o?.count === "exact"; return this; }
    eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
    neq(c: string, v: unknown) { this.preds.push((r) => r[c] !== null && r[c] !== undefined && r[c] !== v); return this; }
    in(c: string, vs: unknown[]) { const set = new Set(vs); this.preds.push((r) => set.has(r[c])); return this; }
    is(c: string, v: null) { this.preds.push((r) => r[c] === v || r[c] === undefined); return this; }
    not(c: string, op: string, v: unknown) { if (op === "is" && v === null) this.preds.push((r) => r[c] !== null && r[c] !== undefined); return this; }
    or(expr: string) {
      const parts = expr.split(",").map((p) => p.trim());
      const ps: Pred[] = parts.map((p) => {
        const [col, op, ...rest] = p.split(".");
        const val = rest.join(".");
        if (op === "is" && val === "null") return (r) => r[col] === null || r[col] === undefined;
        if (op === "neq") return (r) => r[col] !== null && r[col] !== undefined && String(r[col]) !== val;
        if (op === "eq") return (r) => String(r[col]) === val;
        throw new Error("fake or: unsupported " + p);
      });
      this.preds.push((r) => ps.some((f) => f(r)));
      return this;
    }
    order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
    range(a: number, b: number) { this.from_ = a; this.to_ = b; return this; }
    limit(n: number) { this.from_ = 0; this.to_ = n - 1; return this; }
    then<T1 = { data: Row[] | null; error: unknown; count: number | null }, T2 = never>(
      onF?: ((v: { data: Row[] | null; error: unknown; count: number | null }) => T1 | PromiseLike<T1>) | null,
      onR?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.exec()).then(onF, onR);
    }
    private exec() {
      const n = (calls[this.table] = (calls[this.table] ?? -1) + 1);
      const tErr = opts.tableErrors?.[this.table];
      if (tErr) return { data: null, error: tErr, count: null };
      if (opts.failOnCall && opts.failOnCall.table === this.table && opts.failOnCall.call === n) {
        return { data: null, error: { code: "57014", message: "simulated statement timeout" }, count: null };
      }
      let rows = (tables[this.table] ?? []).filter((r) => this.preds.every((p) => p(r)));
      const total = rows.length;
      if (this.orders.length) {
        rows = [...rows].sort((x, y) => {
          for (const o of this.orders) {
            const a = x[o.col] as string | number; const b = y[o.col] as string | number;
            if (a === b) continue;
            const c = a < b ? -1 : 1;
            return o.asc ? c : -c;
          }
          return 0;
        });
      }
      const from = this.from_ ?? 0;
      const to = this.to_ ?? from + rows.length - 1;
      let out = rows.slice(from, to + 1);
      if (out.length > maxRows) out = out.slice(0, maxRows); // PostgREST max-rows
      log.push({ table: this.table, from: this.from_, to: this.to_, returned: out.length });
      return { data: out, error: null, count: this.wantCount ? total : null };
    }
  }

  return {
    db: { from: (t: string) => new Q(t) } as unknown as import("@supabase/supabase-js").SupabaseClient,
    log,
  };
}

export function harness(name: string) {
  let pass = 0;
  const fails: string[] = [];
  return {
    ok(cond: unknown, msg: string) {
      if (cond) pass += 1;
      else { fails.push(msg); console.log(`  ✗ ${msg}`); }
    },
    done() {
      console.log(`${name}: PASS ${pass}  FAIL ${fails.length}  TOTAL ${pass + fails.length}`);
      console.log(fails.length ? "OVERALL = FAIL" : "OVERALL = PASS");
      if (fails.length) process.exit(1);
    },
  };
}
