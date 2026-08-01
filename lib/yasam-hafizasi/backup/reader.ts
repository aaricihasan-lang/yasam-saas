/**
 * BF-12B — Veri kaynağı (DbReader) portu + iki adaptör:
 *   - FixtureReader: bellek-içi sentetik veri (harness + dry-run; PII YOK).
 *   - createProductionPgReader: gerçek PostgreSQL SALT-OKUNUR adaptör (design-only;
 *     bu fazda çalıştırılmaz). `pg` runtime'da dinamik yüklenir → tsc `pg` paketi
 *     GEREKTİRMEZ; gerçek run öncesi operatör `pg` kurar (runbook).
 *
 * pg adaptör YALNIZ SELECT + pg_catalog + information_schema kullanır; hiçbir
 * INSERT/UPDATE/DELETE/DDL/RPC yoktur (forbidden-mutator taraması bunu doğrular).
 */
import type { DbReader, Row, TableSchema } from "./types";

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

function assertIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Güvensiz tanımlayıcı reddedildi: ${name}`);
  }
  return name;
}

// ─── Fixture (bellek-içi) reader ──────────────────────────────────────────────

export interface FixtureTable {
  schema: TableSchema;
  rows: Row[];
}
export type FixtureDataset = Map<string, FixtureTable>;

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : 1;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function compareTuple(a: unknown[], b: unknown[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = compareValues(a[i], b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

/** Bir satırdan sıralama anahtarı: PK varsa PK kolonları, yoksa tüm kolonların canonical'i. */
function sortKey(row: Row, pk: string[]): unknown[] {
  if (pk.length > 0) return pk.map((c) => row[c]);
  // PK yok → deterministik canonical sıralama (tüm anahtarlar alfabetik).
  return [JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]))];
}

export class FixtureReader implements DbReader {
  constructor(private readonly data: FixtureDataset) {}

  async listTables(): Promise<string[]> {
    return [...this.data.keys()].sort();
  }

  async getTableSchema(table: string): Promise<TableSchema> {
    const t = this.data.get(table);
    if (!t) throw new Error(`Fixture tablo yok: ${table}`);
    return t.schema;
  }

  async countRows(table: string): Promise<number> {
    const t = this.data.get(table);
    if (!t) throw new Error(`Fixture tablo yok: ${table}`);
    return t.rows.length;
  }

  async readPage(table: string, pageSize: number, after: unknown[] | null): Promise<Row[]> {
    const t = this.data.get(table);
    if (!t) throw new Error(`Fixture tablo yok: ${table}`);
    const pk = t.schema.primaryKey;
    const sorted = [...t.rows].sort((r1, r2) => compareTuple(sortKey(r1, pk), sortKey(r2, pk)));
    const start = after
      ? sorted.findIndex((r) => compareTuple(sortKey(r, pk), after) > 0)
      : 0;
    if (start < 0) return [];
    return sorted.slice(start, start + pageSize);
  }

  async version(): Promise<string> {
    return "fixture-postgres-emulation";
  }
  projectRef(): string | null {
    return null;
  }
  source(): "fixture" | "production" {
    return "fixture";
  }
  async close(): Promise<void> {
    /* no-op */
  }
}

// ─── Production PostgreSQL adaptör (design-only; bu fazda çalıştırılmaz) ───────

interface PgQueryResult {
  rows: Row[];
}
interface PgClientLike {
  connect(): Promise<void>;
  query(text: string, params?: unknown[]): Promise<PgQueryResult>;
  end(): Promise<void>;
}

export interface ProductionReaderConfig {
  connectionString: string;
  expectedProjectRef: string;
}

/**
 * `pg` Client'ı LAZY yükler (yalnız production reader oluşturulurken). `pg` +
 * `@types/pg` proje devDependency'sidir (package.json + lockfile) → temiz checkout +
 * normal `npm install` sonrası hazırdır; run sırasında ad-hoc kurulum YOK.
 */
async function loadPgClient(cfg: { connectionString: string }): Promise<PgClientLike> {
  const mod = (await import("pg")) as unknown as { Client: new (c: unknown) => PgClientLike };
  return new mod.Client({ connectionString: cfg.connectionString });
}

/**
 * Gerçek üretim salt-okunur reader. Bağlantı REPEATABLE READ + READ ONLY snapshot'ta
 * açılır; tüm okuma tek tutarlı snapshot'tan gelir. Yalnız `--source production` +
 * explicit onaylarla çağrılır (cli.ts). BU FAZDA ÇALIŞTIRILMAZ.
 */
export async function createProductionPgReader(
  cfg: ProductionReaderConfig,
): Promise<DbReader> {
  const client = await loadPgClient({ connectionString: cfg.connectionString });
  await client.connect();
  // Tek tutarlı, salt-okunur snapshot.
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

  const q = async (text: string, params?: unknown[]): Promise<Row[]> =>
    (await client.query(text, params)).rows;

  const reader: DbReader = {
    async listTables() {
      const rows = await q(
        `SELECT c.relname AS name
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
          ORDER BY c.relname`,
      );
      return rows.map((r) => String(r.name));
    },
    async getTableSchema(table: string): Promise<TableSchema> {
      const t = assertIdent(table);
      const cols = await q(
        `SELECT column_name AS name, data_type AS "dataType",
                (is_nullable = 'YES') AS "isNullable", column_default AS "defaultExpr"
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [t],
      );
      const pk = await q(
        `SELECT a.attname AS name
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = ('public.' || $1)::regclass AND i.indisprimary
          ORDER BY a.attnum`,
        [t],
      );
      const fks = await q(
        `SELECT con.conname,
                (SELECT array_agg(att.attname ORDER BY u.ord)
                   FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                   JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum) AS cols,
                cl.relname AS "refTable",
                (SELECT array_agg(att.attname ORDER BY u.ord)
                   FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
                   JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = u.attnum) AS "refCols",
                con.confdeltype AS ondel
           FROM pg_constraint con
           JOIN pg_class cl ON cl.oid = con.confrelid
          WHERE con.contype = 'f' AND con.conrelid = ('public.' || $1)::regclass`,
        [t],
      );
      const rls = await q(
        `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
                COALESCE((SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid), 0) AS policies
           FROM pg_class c WHERE c.oid = ('public.' || $1)::regclass`,
        [t],
      );
      const approx = await q(
        `SELECT GREATEST(reltuples, 0)::bigint AS n FROM pg_class WHERE oid = ('public.' || $1)::regclass`,
        [t],
      );
      const onDelMap: Record<string, TableSchema["foreignKeys"][number]["onDelete"]> = {
        a: "NO ACTION",
        r: "RESTRICT",
        c: "CASCADE",
        n: "SET NULL",
        d: "SET DEFAULT",
      };
      return {
        name: t,
        columns: cols.map((c) => ({
          name: String(c.name),
          dataType: String(c.dataType),
          isNullable: Boolean(c.isNullable),
          defaultExpr: c.defaultExpr === null ? null : String(c.defaultExpr),
        })),
        primaryKey: pk.map((r) => String(r.name)),
        uniqueConstraints: [],
        foreignKeys: fks.map((f) => ({
          table: t,
          columns: (f.cols as string[] | null) ?? [],
          refTable: String(f.refTable),
          refColumns: (f.refCols as string[] | null) ?? [],
          onDelete: onDelMap[String(f.ondel)] ?? "NO ACTION",
        })),
        rlsEnabled: Boolean(rls[0]?.enabled),
        rlsForced: Boolean(rls[0]?.forced),
        policyNames: [],
        approxRows: Number(rls.length ? approx[0]?.n ?? 0 : 0),
      };
    },
    async countRows(table: string) {
      const t = assertIdent(table);
      const rows = await q(`SELECT count(*)::bigint AS n FROM public."${t}"`);
      return Number(rows[0]?.n ?? 0);
    },
    async readPage(table: string, pageSize: number, after: unknown[] | null): Promise<Row[]> {
      const t = assertIdent(table);
      const schema = await reader.getTableSchema(t);
      const pk = schema.primaryKey.map(assertIdent);
      const orderCols =
        pk.length > 0 ? pk : schema.columns.map((c) => assertIdent(c.name));
      const orderBy = orderCols.map((c) => `"${c}"`).join(", ");
      if (after && pk.length > 0) {
        const tuple = pk.map((c) => `"${c}"`).join(", ");
        const params = after;
        const ph = after.map((_, i) => `$${i + 1}`).join(", ");
        const rows = await q(
          `SELECT * FROM public."${t}" WHERE (${tuple}) > (${ph}) ORDER BY ${orderBy} LIMIT ${Number(pageSize)}`,
          params,
        );
        return rows;
      }
      const rows = await q(
        `SELECT * FROM public."${t}" ORDER BY ${orderBy} LIMIT ${Number(pageSize)}`,
      );
      return rows;
    },
    async version() {
      const rows = await q("SELECT version() AS v");
      return String(rows[0]?.v ?? "unknown");
    },
    projectRef() {
      return cfg.expectedProjectRef;
    },
    source() {
      return "production";
    },
    async close() {
      try {
        await client.query("COMMIT");
      } finally {
        await client.end();
      }
    },
  };
  return reader;
}
