/**
 * D3 — YALNIZ build anında kullanılan, SALT OKUNUR bellek içi Supabase sorgu taklidi.
 *
 * Gerçek HD okuma servisleri (chartPersistence, hdAnalysisList, systemReadingService, variablesService, relationService …)
 * bu taklit üzerinde çalıştırılır; böylece demo yanıtlarının biçimi ÜRETİM KODUNUN KENDİSİNDEN gelir. Desteklenmeyen her
 * sorgu biçimi ve HER yazma girişimi (insert/update/delete/upsert/rpc) fırlatır → build durur (sessiz yanlış yanıt yok).
 * Uygulama paketine girmez (scripts/).
 */
type Row = Record<string, unknown>;
type Pred = (r: Row) => boolean;
type Result = { data: unknown; error: null; count: number | null };

const cmp = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return String(a) < String(b) ? -1 : 1;
};
const likeRe = (pat: string) => new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");

function parseOrClause(clause: string): Pred {
  const preds = clause.split(",").map((part): Pred => {
    const m = /^([a-z_]+)\.(eq|neq|is|ilike|like)\.(.*)$/.exec(part.trim());
    if (!m) throw new Error(`memoryDb: desteklenmeyen or() parçası: ${part}`);
    const [, col, op, raw] = m;
    if (op === "is") {
      if (raw !== "null") throw new Error(`memoryDb: is.${raw}`);
      return (r) => r[col] === null || r[col] === undefined;
    }
    if (op === "eq") return (r) => String(r[col]) === raw;
    if (op === "neq") return (r) => String(r[col]) !== raw;
    const re = likeRe(raw);
    return (r) => typeof r[col] === "string" && re.test(r[col] as string);
  });
  return (r) => preds.some((p) => p(r));
}

class Query implements PromiseLike<Result> {
  private preds: Pred[] = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private from_: number | null = null;
  private to_: number | null = null;
  private limit_: number | null = null;
  private mode: "many" | "maybeSingle" | "single" = "many";
  private cols: string[] | null = null;
  private countMode = false;
  private head = false;

  constructor(private table: string, private rows: Row[]) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }): this {
    if (cols.includes("(")) throw new Error(`memoryDb: gömülü kaynak seçimi desteklenmiyor (${this.table}: ${cols})`);
    this.cols = cols.trim() === "*" ? null : cols.split(",").map((c) => c.trim()).filter(Boolean);
    this.countMode = !!opts?.count;
    this.head = !!opts?.head;
    return this;
  }
  eq(col: string, v: unknown): this {
    this.preds.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown): this {
    this.preds.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]): this {
    const set = new Set(vs);
    this.preds.push((r) => set.has(r[col]));
    return this;
  }
  is(col: string, v: null): this {
    if (v !== null) throw new Error("memoryDb: is() yalnız null");
    this.preds.push((r) => r[col] === null || r[col] === undefined);
    return this;
  }
  ilike(col: string, pat: string): this {
    const re = likeRe(pat);
    this.preds.push((r) => typeof r[col] === "string" && re.test(r[col] as string));
    return this;
  }
  or(clause: string): this {
    this.preds.push(parseOrClause(clause));
    return this;
  }
  gte(col: string, v: unknown): this {
    this.preds.push((r) => cmp(r[col], v) >= 0);
    return this;
  }
  lte(col: string, v: unknown): this {
    this.preds.push((r) => cmp(r[col], v) <= 0);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number): this {
    this.from_ = from;
    this.to_ = to;
    return this;
  }
  limit(n: number): this {
    this.limit_ = n;
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  // Yazma girişimleri — demo build'i hiçbir koşulda yazmaz.
  insert(): never {
    throw new Error(`memoryDb: YAZMA girişimi (insert ${this.table})`);
  }
  update(): never {
    throw new Error(`memoryDb: YAZMA girişimi (update ${this.table})`);
  }
  upsert(): never {
    throw new Error(`memoryDb: YAZMA girişimi (upsert ${this.table})`);
  }
  delete(): never {
    throw new Error(`memoryDb: YAZMA girişimi (delete ${this.table})`);
  }

  private run(): Result {
    let out = this.rows.filter((r) => this.preds.every((p) => p(r)));
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (o.asc ? cmp(a[o.col], b[o.col]) : cmp(b[o.col], a[o.col])));
    }
    const total = out.length;
    if (this.from_ !== null) out = out.slice(this.from_, (this.to_ ?? out.length - 1) + 1);
    if (this.limit_ !== null) out = out.slice(0, this.limit_);
    const project = (r: Row): Row => {
      const copy = structuredClone(r);
      if (!this.cols) return copy;
      const p: Row = {};
      for (const c of this.cols) p[c] = c in copy ? copy[c] : null;
      return p;
    };
    const count = this.countMode ? total : null;
    if (this.head) return { data: null, error: null, count };
    if (this.mode === "many") return { data: out.map(project), error: null, count };
    if (out.length > 1) throw new Error(`memoryDb: ${this.mode} birden fazla satır (${this.table})`);
    if (this.mode === "single" && out.length === 0) throw new Error(`memoryDb: single satırsız (${this.table})`);
    return { data: out[0] ? project(out[0]) : null, error: null, count };
  }

  then<T1 = Result, T2 = never>(ok?: ((v: Result) => T1 | PromiseLike<T1>) | null, bad?: ((e: unknown) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    let r: Result;
    try {
      r = this.run();
    } catch (e) {
      return Promise.reject(e).then(ok, bad);
    }
    return Promise.resolve(r).then(ok, bad);
  }
}

export type MemoryTables = Record<string, Row[]>;

/** Salt okunur taklit. Tanımsız tablo boş tablo sayılır (ör. uzmanın kişisel bilgi bankası demoda boştur). */
export function memoryDb(tables: MemoryTables): unknown {
  const reads = new Set<string>();
  const api = {
    reads,
    from(table: string) {
      reads.add(table);
      const q = new Query(table, tables[table] ?? []);
      return new Proxy(q, {
        get(target, prop, recv) {
          const v = Reflect.get(target, prop, recv);
          if (v === undefined && typeof prop === "string" && prop !== "then") throw new Error(`memoryDb: desteklenmeyen sorgu yöntemi ${prop} (${table})`);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    },
    rpc(): never {
      throw new Error("memoryDb: rpc desteklenmiyor");
    },
    storage: new Proxy({}, { get: () => { throw new Error("memoryDb: storage erişimi yok"); } }),
  };
  return api;
}
