/**
 * DD-P2 Beslenme — test-only PostgREST uyumlu HTTP shim (yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS).
 *
 * scripts/usage360/pgrestShim.ts temel alınmıştır (o dosya DEĞİŞTİRİLMEZ). Beslenme route'larının
 * gerçek okuma yolları için EK olarak:
 *   • gömülü ilişki (embed) seçimi: `alias:hedef_tablo(kolonlar)` / `hedef_tablo(kolonlar)` —
 *     FK pg_constraint'ten çözülür (çok-kolonlu/composite FK dahil). Taban → hedef FK varsa nesne
 *     (many-to-one), hedef → taban FK varsa dizi (one-to-many) döner (PostgREST semantiği).
 *   • skaler RPC dönüşü (setof değilse tek değer), tablo-dönüşlü RPC → satır dizisi.
 * Her istek `SET ROLE service_role` ile çalışır → migration'daki GRANT/REVOKE gerçekten sınanır.
 */
import http from "node:http";
import pg from "pg";

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
function qi(name: string): string {
  if (!IDENT_RE.test(name)) throw Object.assign(new Error(`geçersiz tanımlayıcı: ${name}`), { code: "PGRST100" });
  return `"${name}"`;
}
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function parseInList(v: string): string[] {
  const inner = v.replace(/^\(/, "").replace(/\)$/, "");
  if (inner === "") return [];
  return splitTop(inner).map((x) => x.replace(/^"(.*)"$/, "$1"));
}

type FkInfo = { dir: "one" | "many"; pairs: Array<[string, string]> };

async function fkBetween(client: pg.PoolClient, base: string, target: string): Promise<FkInfo> {
  const q = async (from: string, to: string) =>
    (await client.query(
      `select (select array_agg(a.attname::text order by k.i) from unnest(c.conkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as src,
              (select array_agg(a.attname::text order by k.i) from unnest(c.confkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n) as dst
         from pg_constraint c
        where c.contype = 'f' and c.conrelid = $1::regclass and c.confrelid = $2::regclass
        order by cardinality(c.conkey) desc`,
      [`public.${from}`, `public.${to}`],
    )).rows as Array<{ src: string[]; dst: string[] }>;
  const fwd = await q(base, target);
  if (fwd.length > 0) return { dir: "one", pairs: fwd[0].src.map((s, i) => [s, fwd[0].dst[i]]) };
  const rev = await q(target, base);
  if (rev.length > 0) return { dir: "many", pairs: rev[0].dst.map((d, i) => [d, rev[0].src[i]]) };
  throw Object.assign(new Error(`ilişki yok: ${base} → ${target}`), { code: "PGRST200" });
}

/** select listesi → SQL (taban tablo takma adı `_b`). Embed'ler korelasyonlu alt sorgu olur. */
async function buildSelect(client: pg.PoolClient, base: string, raw: string | null, depth = 0): Promise<string> {
  if (!raw || raw.trim() === "" || raw.trim() === "*") return depth === 0 ? "_b.*" : "*";
  const alias = depth === 0 ? "_b" : `_e${depth}`;
  const parts: string[] = [];
  for (const item of splitTop(raw)) {
    if (item === "*") { parts.push(`${alias}.*`); continue; }
    const m = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:!inner)?\(([\s\S]*)\)$/.exec(item);
    if (m) {
      const outName = m[1] ?? m[2];
      const target = m[2];
      const fk = await fkBetween(client, base, target);
      const t = `_t${depth + 1}`;
      const inner = await buildSelect(client, target, m[3], depth + 1);
      const innerCols = inner === "*" ? `${t}.*` : inner.replaceAll(`_e${depth + 1}.`, `${t}.`);
      const join = fk.pairs.map(([b, x]) => `${t}.${qi(x)} = ${alias}.${qi(b)}`).join(" and ");
      if (fk.dir === "one") {
        parts.push(`(select row_to_json(_r) from (select ${innerCols} from public.${qi(target)} ${t} where ${join} limit 1) _r) as ${qi(outName)}`);
      } else {
        parts.push(`coalesce((select json_agg(row_to_json(_r)) from (select ${innerCols} from public.${qi(target)} ${t} where ${join}) _r), '[]'::json) as ${qi(outName)}`);
      }
      continue;
    }
    const [col, as] = item.includes(":") ? [item.split(":")[1], item.split(":")[0]] : [item, item];
    const c = col.replace(/::\w+$/, "");
    parts.push(as === c ? `${alias}.${qi(c)}` : `${alias}.${qi(c)} as ${qi(as)}`);
  }
  return parts.join(", ");
}

function cond(col: string, raw: string, values: unknown[]): string {
  const c = qi(col);
  let neg = false;
  let expr = raw;
  if (expr.startsWith("not.")) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const v = expr.slice(dot + 1);
  let sql: string;
  switch (op) {
    case "eq": values.push(v); sql = `${c}::text = $${values.length}::text`; break;
    case "neq": values.push(v); sql = `${c}::text <> $${values.length}::text`; break;
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
      const subs = splitTop(raw.replace(/^\(/, "").replace(/\)$/, "")).map((it) => {
        const d = it.indexOf(".");
        return cond(it.slice(0, d), it.slice(d + 1), values);
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
  return ` ORDER BY ${raw.split(",").map((it) => {
    const [col, dir, nulls] = it.split(".");
    let s = qi(col);
    if (dir === "desc") s += " DESC";
    else if (dir === "asc") s += " ASC";
    if (nulls === "nullslast") s += " NULLS LAST";
    if (nulls === "nullsfirst") s += " NULLS FIRST";
    return s;
  }).join(", ")}`;
}
function toParam(v: unknown): unknown {
  if (v !== null && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}
async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export type ShimStats = { requests: number; errors: number; unsupported: string[] };

export async function startEmbedShim(pool: pg.Pool): Promise<{ url: string; close: () => Promise<void>; stats: ShimStats; setPool: (p: pg.Pool) => void }> {
  // Route'lar service-role client'ı süreç başına TEKİL (getServerDb) tuttuğu için URL değişmez;
  // farklı DB senaryosu (ör. yeni migration'sız şema) shim'in hedef havuzu değiştirilerek sınanır.
  let current = pool;
  const stats: ShimStats = { requests: 0, errors: 0, unsupported: [] };
  const fnCache = new Map<string, { args: Map<string, string>; setof: boolean }>();
  async function fnArgs(client: pg.PoolClient, fn: string) {
    const hit = fnCache.get(fn);
    if (hit) return hit;
    const r = await client.query(
      `select p.proargnames as names, p.proretset as setof,
              (select array_agg(format_type(t, null) order by i) from unnest(p.proargtypes) with ordinality a(t, i)) as types
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    if (r.rowCount !== 1) throw Object.assign(new Error(`rpc bulunamadı/aşırı yüklü: ${fn}`), { code: "PGRST202" });
    const names: string[] = r.rows[0].names ?? [];
    const types: string[] = r.rows[0].types ?? [];
    const m = new Map<string, string>();
    names.forEach((n, i) => m.set(n, types[i]));
    const entry = { args: m, setof: r.rows[0].setof === true };
    fnCache.set(fn, entry);
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
      if (rows.length !== 1) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `Results contain ${rows.length} rows`, hint: null });
      return send(status, rows[0], headers);
    };
    const client = await current.connect();
    try {
      await client.query("SET ROLE service_role");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const p = url.pathname.replace(/^\/rest\/v1\//, "");
      const prefer = String(req.headers["prefer"] ?? "");
      const method = req.method ?? "GET";

      if (p.startsWith("rpc/")) {
        const fn = p.slice(4);
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

      const tableName = p;
      const table = qi(tableName);
      const values: unknown[] = [];
      const sel = await buildSelect(client, tableName, url.searchParams.get("select"));
      if (method === "GET" || method === "HEAD") {
        const where = buildWhere(url.searchParams, values);
        const wantCount = /count=exact/.test(prefer);
        let total: number | null = null;
        if (wantCount) total = (await client.query(`select count(*)::int as n from public.${table} _b${where}`, values)).rows[0].n;
        if (method === "HEAD") return send(200, undefined, { "content-range": `*/${total ?? 0}` });
        let sql = `select ${sel} from public.${table} _b${where}${buildOrder(url.searchParams.get("order"))}`;
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
      if (method === "POST") {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
        const onConflict = url.searchParams.get("on_conflict");
        const merge = /resolution=merge-duplicates/.test(prefer);
        const ignore = /resolution=ignore-duplicates/.test(prefer);
        const out: unknown[] = [];
        for (const row of rows) {
          const cols = Object.keys(row);
          let conflictSql = "";
          if (merge || ignore) {
            const keys = (onConflict ?? "").split(",").map((x) => x.trim()).filter(Boolean);
            const target = keys.length ? `(${keys.map(qi).join(", ")})` : "";
            const updates = cols.filter((c) => !keys.includes(c));
            conflictSql = ignore || updates.length === 0
              ? ` on conflict ${target} do nothing`
              : ` on conflict ${target} do update set ${updates.map((c) => `${qi(c)} = excluded.${qi(c)}`).join(", ")}`;
          }
          const r = await client.query(
            `insert into public.${table} as _b (${cols.map(qi).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})${conflictSql} returning ${sel}`,
            cols.map((c) => toParam(row[c])),
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
        const r = await client.query(`update public.${table} as _b set ${setSql}${where} returning ${sel}`, values);
        return returning ? sendRows(200, r.rows) : send(204, undefined);
      }
      if (method === "DELETE") {
        const where = buildWhere(url.searchParams, values);
        if (!where) return send(400, { code: "21000", message: "DELETE requires a WHERE clause" });
        const r = await client.query(`delete from public.${table} as _b${where} returning ${sel}`, values);
        const wantCount = /count=exact/.test(prefer);
        const headers: Record<string, string> = wantCount ? { "content-range": `*/${r.rowCount ?? 0}` } : {};
        return returning ? sendRows(200, r.rows, headers) : send(204, undefined, headers);
      }
      return send(405, { code: "PGRST000", message: `method ${method}` });
    } catch (e) {
      stats.errors++;
      const err = e as { code?: string; message?: string; detail?: string; hint?: string };
      if (err.code === "PGRST100" || err.code === "PGRST200") stats.unsupported.push(String(err.message));
      const status = err.code === "42501" ? 403 : err.code === "PGRST202" ? 404 : err.code === "23505" ? 409 : 400;
      try { send(status, { code: err.code ?? "XX000", message: err.message ?? "error", details: err.detail ?? null, hint: err.hint ?? null }); } catch { /* yazıldı */ }
    } finally {
      try { await client.query("RESET ROLE"); } catch { /* düştü */ }
      client.release();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    stats,
    setPool: (np: pg.Pool) => { current = np; fnCache.clear(); },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
