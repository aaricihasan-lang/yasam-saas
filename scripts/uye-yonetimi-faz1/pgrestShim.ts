/**
 * ÜYE YÖNETİMİ FAZ 1 — test-only, minimal PostgREST uyumlu HTTP shim.
 *
 * Amaç: gerçek Next route handler'larını (supabase-js service-role client dahil) HİÇBİR
 * mock olmadan, ephemeral yerel PostgreSQL'e karşı uçtan uca çalıştırmak. Production'a
 * SIFIR temas; yalnız 127.0.0.1'e bağlanır. Bu route'ların kullandığı alt küme desteklenir:
 *   GET/HEAD  /rest/v1/<table>?select=…&col=eq.v|neq|in.(…)|gte|lte|gt|lt|is.null&order=…&limit&offset
 *   POST      /rest/v1/<table>            (insert; Prefer: return=representation)
 *   PATCH     /rest/v1/<table>?filters    (update; Prefer: return=representation)
 *   POST      /rest/v1/rpc/<fn>           (named-arg çağrı; arg tipleri pg_proc'tan)
 * Her istek `SET ROLE service_role` bağlantısında çalışır → EXECUTE/tablo grant'leri
 * gerçekten doğrulanır. Hata gövdesi PostgREST biçimi: {code,message,details,hint}.
 */
import http from "node:http";
import pg from "pg";

type Pool = pg.Pool;

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

function qi(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`geçersiz tanımlayıcı: ${name}`);
  return `"${name}"`;
}

function parseSelect(raw: string | null): string {
  if (!raw || raw.trim() === "*" || raw.trim() === "") return "*";
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map(qi)
    .join(", ");
}

function parseInList(v: string): string[] {
  const inner = v.replace(/^\(/, "").replace(/\)$/, "");
  if (inner === "") return [];
  return inner.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function buildWhere(params: URLSearchParams, values: unknown[]): string {
  const parts: string[] = [];
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue;
    const col = qi(key);
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const v = raw.slice(dot + 1);
    switch (op) {
      case "eq": values.push(v); parts.push(`${col} = $${values.length}`); break;
      case "neq": values.push(v); parts.push(`${col} <> $${values.length}`); break;
      case "gt": values.push(v); parts.push(`${col} > $${values.length}`); break;
      case "gte": values.push(v); parts.push(`${col} >= $${values.length}`); break;
      case "lt": values.push(v); parts.push(`${col} < $${values.length}`); break;
      case "lte": values.push(v); parts.push(`${col} <= $${values.length}`); break;
      case "in": values.push(parseInList(v)); parts.push(`${col} = ANY($${values.length})`); break;
      case "is":
        if (v === "null") parts.push(`${col} IS NULL`);
        else if (v === "true") parts.push(`${col} IS TRUE`);
        else if (v === "false") parts.push(`${col} IS FALSE`);
        else throw new Error(`desteklenmeyen is.${v}`);
        break;
      default:
        throw new Error(`desteklenmeyen filtre: ${op}`);
    }
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

function pgErrorBody(e: unknown): { code: string; message: string; details: string | null; hint: string | null } {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  return {
    code: err.code ?? "XX000",
    message: err.message ?? "error",
    details: err.detail ?? null,
    hint: err.hint ?? null,
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export type ShimStats = { requests: number; errors: number };

export async function startPgrestShim(pool: Pool): Promise<{ url: string; close: () => Promise<void>; stats: ShimStats }> {
  const stats: ShimStats = { requests: 0, errors: 0 };
  const fnArgCache = new Map<string, Map<string, string>>();

  async function fnArgs(client: pg.PoolClient, fn: string): Promise<Map<string, string>> {
    const cached = fnArgCache.get(fn);
    if (cached) return cached;
    const r = await client.query(
      `select p.proargnames as names, (select array_agg(format_type(t, null) order by i)
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
    fnArgCache.set(fn, m);
    return m;
  }

  const server = http.createServer(async (req, res) => {
    stats.requests++;
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
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
        const sig = await fnArgs(client, fn);
        const values: unknown[] = [];
        const parts: string[] = [];
        for (const [k, v] of Object.entries(args)) {
          const t = sig.get(k);
          if (!t) return send(404, { code: "PGRST202", message: `arg yok: ${k}`, details: null, hint: null });
          values.push(t === "jsonb" || t === "json" ? JSON.stringify(v) : v);
          parts.push(`${qi(k)} => $${values.length}::${t}`);
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
        if (method === "HEAD") {
          return send(200, undefined, { "content-range": `*/${total ?? 0}` });
        }
        let sql = `select ${parseSelect(url.searchParams.get("select"))} from public.${table}${where}${buildOrder(url.searchParams.get("order"))}`;
        const limit = url.searchParams.get("limit");
        const offset = url.searchParams.get("offset");
        if (limit != null) sql += ` LIMIT ${Math.max(0, Number(limit) | 0)}`;
        if (offset != null) sql += ` OFFSET ${Math.max(0, Number(offset) | 0)}`;
        const r = await client.query(sql, values);
        return send(200, r.rows, wantCount ? { "content-range": `0-${Math.max(0, r.rowCount! - 1)}/${total}` } : {});
      }

      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const returning = /return=representation/.test(prefer);
      const sel = parseSelect(url.searchParams.get("select"));

      if (method === "POST") {
        const rows = Array.isArray(payload) ? payload : [payload];
        const out: unknown[] = [];
        for (const row of rows as Record<string, unknown>[]) {
          const cols = Object.keys(row);
          const vals = cols.map((c) => toParam(row[c]));
          const r = await client.query(
            `insert into public.${table} (${cols.map(qi).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning ${sel}`,
            vals,
          );
          out.push(...r.rows);
        }
        return returning ? send(201, out) : send(201, undefined);
      }

      if (method === "PATCH") {
        const cols = Object.keys(payload as Record<string, unknown>);
        for (const c of cols) values.push(toParam((payload as Record<string, unknown>)[c]));
        const setSql = cols.map((c, i) => `${qi(c)} = $${i + 1}`).join(", ");
        const where = buildWhere(url.searchParams, values);
        const r = await client.query(`update public.${table} set ${setSql}${where} returning ${sel}`, values);
        return returning ? send(200, r.rows) : send(204, undefined);
      }

      return send(405, { code: "PGRST000", message: `method ${method}` });
    } catch (e) {
      stats.errors++;
      const body = pgErrorBody(e);
      const status = body.code === "42501" ? 403 : body.code === "PGRST202" ? 404 : 400;
      try { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); } catch { /* yanıt yazıldı */ }
    } finally {
      try { await client.query("RESET ROLE"); } catch { /* bağlantı düştü */ }
      client.release();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    stats,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
