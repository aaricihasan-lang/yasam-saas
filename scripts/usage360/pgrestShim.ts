/**
 * USAGE360 2B — test-only PostgREST uyumlu HTTP shim (genişletilmiş).
 *
 * scripts/uye-yonetimi-faz1/pgrestShim.ts temel alınmıştır (o dosya DEĞİŞTİRİLMEZ; başka
 * harness'ler kullanır). Modül route'larının ihtiyacı için eklenenler: DELETE, `or=(…)`,
 * `not.<op>`, like/ilike, `on_conflict` upsert (merge/ignore), `.single()` nesne yanıtı
 * (PGRST116/406), `limit`/`order` alt kümesi. Her istek `SET ROLE service_role` ile çalışır →
 * grant/EXECUTE gerçekten sınanır. Yalnız 127.0.0.1. Production'a SIFIR temas.
 */
import http from "node:http";
import pg from "pg";

type Pool = pg.Pool;
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

function qi(name: string): string {
  if (!IDENT_RE.test(name)) throw Object.assign(new Error(`geçersiz tanımlayıcı: ${name}`), { code: "PGRST100" });
  return `"${name}"`;
}

/** select=a,b,rel(x) → yalnız düz kolonlar (gömülü ilişki desteklenmez → hata). */
function parseSelect(raw: string | null): string {
  if (!raw || raw.trim() === "*" || raw.trim() === "") return "*";
  const cols: string[] = [];
  let depth = 0, cur = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { cols.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) cols.push(cur);
  return cols.map((c) => c.trim()).filter(Boolean).map((c) => {
    if (c === "*") return "*";
    const alias = c.includes(":") ? c.split(":")[1] : c;
    return qi(alias.replace(/::\w+$/, ""));
  }).join(", ");
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function parseInList(v: string): string[] {
  const inner = v.replace(/^\(/, "").replace(/\)$/, "");
  if (inner === "") return [];
  return splitTop(inner).map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
}

/** Kolon veya JSON yolu (a->b->>c) → güvenli SQL ifadesi. */
function colExpr(col: string): string {
  const m = col.split(/(->>|->)/);
  if (m.length === 1) return qi(col);
  let sql = qi(m[0]);
  for (let i = 1; i < m.length; i += 2) {
    const key = m[i + 1];
    if (!/^[A-Za-z0-9_]+$/.test(key)) throw Object.assign(new Error(`geçersiz json anahtarı: ${key}`), { code: "PGRST100" });
    sql += `${m[i]}'${key}'`;
  }
  return sql;
}

function cond(col: string, raw: string, values: unknown[]): string {
  const c = colExpr(col);
  let neg = false;
  let expr = raw;
  if (expr.startsWith("not.")) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const v = expr.slice(dot + 1);
  let sql: string;
  switch (op) {
    case "eq": values.push(v); sql = `${c} = $${values.length}`; break;
    case "neq": values.push(v); sql = `${c} <> $${values.length}`; break;
    case "gt": values.push(v); sql = `${c} > $${values.length}`; break;
    case "gte": values.push(v); sql = `${c} >= $${values.length}`; break;
    case "lt": values.push(v); sql = `${c} < $${values.length}`; break;
    case "lte": values.push(v); sql = `${c} <= $${values.length}`; break;
    case "like": values.push(v.replace(/\*/g, "%")); sql = `${c}::text LIKE $${values.length}`; break;
    case "ilike": values.push(v.replace(/\*/g, "%")); sql = `${c}::text ILIKE $${values.length}`; break;
    case "in": values.push(parseInList(v)); sql = `${c}::text = ANY($${values.length}::text[])`; break;
    case "is":
      if (v === "null") sql = `${c} IS NULL`;
      else if (v === "true") sql = `${c} IS TRUE`;
      else if (v === "false") sql = `${c} IS FALSE`;
      else throw Object.assign(new Error(`desteklenmeyen is.${v}`), { code: "PGRST100" });
      break;
    default:
      throw Object.assign(new Error(`desteklenmeyen filtre: ${op}`), { code: "PGRST100" });
  }
  return neg ? `NOT (${sql})` : sql;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function buildWhere(params: URLSearchParams, values: unknown[]): string {
  const parts: string[] = [];
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue;
    if (key === "or" || key === "and") {
      const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
      const subs = splitTop(inner).map((item) => {
        const d = item.indexOf(".");
        return cond(item.slice(0, d), item.slice(d + 1), values);
      });
      parts.push(`(${subs.join(key === "or" ? " OR " : " AND ")})`);
      continue;
    }
    parts.push(cond(key, raw, values));
  }
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

function buildOrder(raw: string | null): string {
  if (!raw) return "";
  const items = raw.split(",").map((it) => {
    const [col, dir, nulls] = it.split(".");
    let s = qi(col);
    if (dir === "desc") s += " DESC";
    else if (dir === "asc") s += " ASC";
    if (nulls === "nullslast") s += " NULLS LAST";
    if (nulls === "nullsfirst") s += " NULLS FIRST";
    return s;
  });
  return ` ORDER BY ${items.join(", ")}`;
}

function toParam(v: unknown): unknown {
  if (v !== null && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

function pgErrorBody(e: unknown) {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  return { code: err.code ?? "XX000", message: err.message ?? "error", details: err.detail ?? null, hint: err.hint ?? null };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export type ShimStats = { requests: number; errors: number; unsupported: string[] };

export async function startPgrestShim(pool: Pool, port = 0): Promise<{ url: string; close: () => Promise<void>; stats: ShimStats }> {
  const stats: ShimStats = { requests: 0, errors: 0, unsupported: [] };
  const fnArgCache = new Map<string, { args: Map<string, string>; setof: boolean }>();

  async function fnArgs(client: pg.PoolClient, fn: string) {
    const cached = fnArgCache.get(fn);
    if (cached) return cached;
    const r = await client.query(
      `select p.proargnames as names, p.proretset as setof, (select array_agg(format_type(t, null) order by i)
                from unnest(p.proargtypes) with ordinality as a(t, i)) as types
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    if (r.rowCount !== 1) throw Object.assign(new Error(`rpc bulunamadı/aşırı yüklü: ${fn}`), { code: "PGRST202" });
    const names: string[] = r.rows[0].names ?? [];
    const types: string[] = r.rows[0].types ?? [];
    const m = new Map<string, string>();
    names.forEach((n, i) => m.set(n, types[i]));
    const entry = { args: m, setof: r.rows[0].setof === true };
    fnArgCache.set(fn, entry);
    return entry;
  }

  const server = http.createServer(async (req, res) => {
    stats.requests++;
    const accept = String(req.headers["accept"] ?? "");
    const wantObject = accept.includes("vnd.pgrst.object");
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const sendRows = (status: number, rows: unknown[], headers: Record<string, string> = {}) => {
      if (!wantObject) return send(status, rows, headers);
      if (rows.length !== 1) {
        return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `Results contain ${rows.length} rows`, hint: null });
      }
      return send(status, rows[0], headers);
    };
    const client = await pool.connect();
    try {
      await client.query("SET ROLE service_role");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const path = url.pathname.replace(/^\/rest\/v1\//, "");
      const prefer = String(req.headers["prefer"] ?? "");
      const method = req.method ?? "GET";

      if (path.startsWith("rpc/")) {
        const fn = path.slice(4);
        if (!IDENT_RE.test(fn)) return send(404, { code: "PGRST202", message: "fn" });
        const raw = await readBody(req);
        const args = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const { args: sig, setof } = await fnArgs(client, fn);
        const values: unknown[] = [];
        const parts: string[] = [];
        for (const [k, v] of Object.entries(args)) {
          const t = sig.get(k);
          if (!t) return send(404, { code: "PGRST202", message: `arg yok: ${k}`, details: null, hint: null });
          values.push(t === "jsonb" || t === "json" ? JSON.stringify(v) : v);
          parts.push(`${qi(k)} => $${values.length}::${t}`);
        }
        if (setof) {
          const r = await client.query(`select * from public.${qi(fn)}(${parts.join(", ")})`, values);
          return sendRows(200, r.rows);
        }
        const r = await client.query(`select public.${qi(fn)}(${parts.join(", ")}) as result`, values);
        return send(200, r.rows[0]?.result ?? null);
      }

      const table = qi(path);
      const values: unknown[] = [];
      if (method === "GET" || method === "HEAD") {
        const where = buildWhere(url.searchParams, values);
        const wantCount = /count=exact/.test(prefer);
        let total: number | null = null;
        if (wantCount) {
          const c = await client.query(`select count(*)::int as n from public.${table}${where}`, values);
          total = c.rows[0].n;
        }
        if (method === "HEAD") return send(200, undefined, { "content-range": `*/${total ?? 0}` });
        let sql = `select ${parseSelect(url.searchParams.get("select"))} from public.${table}${where}${buildOrder(url.searchParams.get("order"))}`;
        const limit = url.searchParams.get("limit");
        const offset = url.searchParams.get("offset");
        if (limit != null) sql += ` LIMIT ${Math.max(0, Number(limit) | 0)}`;
        if (offset != null) sql += ` OFFSET ${Math.max(0, Number(offset) | 0)}`;
        const r = await client.query(sql, values);
        return sendRows(200, r.rows, wantCount ? { "content-range": `0-${Math.max(0, r.rowCount! - 1)}/${total}` } : {});
      }

      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const returning = /return=representation/.test(prefer);
      const sel = parseSelect(url.searchParams.get("select"));

      if (method === "POST") {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
        const onConflict = url.searchParams.get("on_conflict");
        const merge = /resolution=merge-duplicates/.test(prefer);
        const ignore = /resolution=ignore-duplicates/.test(prefer);
        const out: unknown[] = [];
        for (const row of rows) {
          const cols = Object.keys(row);
          const vals = cols.map((c) => toParam(row[c]));
          let conflictSql = "";
          if (merge || ignore) {
            const target = onConflict ? `(${onConflict.split(",").map((c) => qi(c.trim())).join(", ")})` : "";
            const updates = cols.filter((c) => !(onConflict ?? "").split(",").map((x) => x.trim()).includes(c));
            conflictSql = ignore || updates.length === 0
              ? ` on conflict ${target} do nothing`
              : ` on conflict ${target} do update set ${updates.map((c) => `${qi(c)} = excluded.${qi(c)}`).join(", ")}`;
          }
          const r = await client.query(
            `insert into public.${table} (${cols.map(qi).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})${conflictSql} returning ${sel}`,
            vals,
          );
          out.push(...r.rows);
        }
        return returning ? sendRows(201, out) : send(201, undefined);
      }

      if (method === "PATCH") {
        const cols = Object.keys(payload as Record<string, unknown>);
        for (const c of cols) values.push(toParam((payload as Record<string, unknown>)[c]));
        const setSql = cols.map((c, i) => `${qi(c)} = $${i + 1}`).join(", ");
        const where = buildWhere(url.searchParams, values);
        const r = await client.query(`update public.${table} set ${setSql}${where} returning ${sel}`, values);
        return returning ? sendRows(200, r.rows) : send(204, undefined);
      }

      if (method === "DELETE") {
        const where = buildWhere(url.searchParams, values);
        const r = await client.query(`delete from public.${table}${where} returning ${sel}`, values);
        const wantCount = /count=exact/.test(prefer);
        const headers: Record<string, string> = wantCount ? { "content-range": `*/${r.rowCount ?? 0}` } : {};
        return returning ? sendRows(200, r.rows, headers) : send(204, undefined, headers);
      }

      return send(405, { code: "PGRST000", message: `method ${method}` });
    } catch (e) {
      stats.errors++;
      const body = pgErrorBody(e);
      if (body.code === "PGRST100") stats.unsupported.push(body.message);
      const status = body.code === "42501" ? 403 : body.code === "PGRST202" ? 404 : body.code === "23505" ? 409 : 400;
      try { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); } catch { /* yazıldı */ }
    } finally {
      try { await client.query("RESET ROLE"); } catch { /* düştü */ }
      client.release();
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, stats, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
