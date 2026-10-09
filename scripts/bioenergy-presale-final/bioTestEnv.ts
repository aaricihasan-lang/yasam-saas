/**
 * BİYOENERJİ SATIŞ-ÖNCESİ FİNAL — gerçek route + gerçek Postgres test ortamı.
 * (yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS; tüm veriler sentetik ZZ_BIO_*)
 *
 *  - Geçici embedded-postgres. Roller: anon, authenticated, service_role (bypassrls).
 *  - Şema: sentetik users/user_sessions/tenants + 6 Biyoenerji temel tablosu (kolonlar
 *    lib/biyoenerji/resourceConfig.ts + rapor SELECT'leri ile birebir; base DDL repo'da yok)
 *    + GERÇEK repo migration'ları: 20261203000000 (chakra_blocks), 20260623200000,
 *    20261001000000, 20271002000100 (BIO-17), 20271002000200 (BIO-19).
 *  - PostgREST uyumlu HTTP shim (scripts/anamnez/testEnv.ts'ten uyarlanmış; `or=(…)`, `ilike`
 *    eklendi) + PostgREST **max-rows** kesmesi (varsayılan 1000 — Supabase varsayılanı).
 *    Her istek `SET ROLE service_role` (route'lar service_role ile çalışır).
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.LC_ALL = "C";
process.env.LANG = "C";

export const SERVICE_KEY = "zz-bio-test-service-role-not-a-secret";
export const ANON_KEY = "zz-bio-test-anon-not-a-secret";
export const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

export const BIO_TABLES = [
  "bioenergy_sessions", "bioenergy_energy_bodies", "bioenergy_subconscious_causes",
  "bioenergy_imaginations", "bioenergy_symbols", "bioenergy_chakras",
] as const;

const PROV = `origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz`;
export const BASE_DDL = `
create extension if not exists pgcrypto;
create table public.tenants (id uuid primary key, name text);
create table public.users (
  id uuid primary key, full_name text, name text, email text, role text,
  active boolean default false, approval_status text default 'pending',
  module_permissions jsonb default '{}'::jsonb,
  package_type text, membership_status text, subscription_status text,
  trial_started_at timestamptz, trial_ends_at timestamptz, membership_started_at timestamptz, membership_ends_at timestamptz,
  plan text, admin_level text, tenant_id uuid, status text, created_at timestamptz default now(),
  is_super_admin boolean not null default false, is_demo_account boolean not null default false
);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  session_token text not null unique, is_active boolean not null default true,
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  ended_at timestamptz, end_reason text, platform text default 'desktop', city text, country text,
  ip_address text, user_agent text
);
create table public.bioenergy_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  title text, content text, category text, source text, note text, created_at timestamptz default now(), ${PROV});
create table public.bioenergy_energy_bodies (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  source_uid text, genel_tanim text, gorevi text, bozulma text, onerilen_taslar text, not_text text, created_at timestamptz default now(), ${PROV});
create table public.bioenergy_subconscious_causes (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  source_uid text, title text, category text, content text, note_text text, created_at timestamptz default now(), ${PROV});
create table public.bioenergy_imaginations (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  source_id text, title text, category text, text text, notes text, source text, created_at timestamptz default now(), ${PROV});
create table public.bioenergy_symbols (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  symbol text, title text, category text, meaning text, source text, created_at timestamptz default now(), ${PROV});
create table public.bioenergy_chakras (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  source_uid text, name text, organs text, glands text, color text, stones text, causes text, physical text, mental text, notes text,
  created_at timestamptz default now(), ${PROV});
`;

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
function qi(name: string): string {
  if (!IDENT_RE.test(name)) throw Object.assign(new Error(`geçersiz tanımlayıcı: ${name}`), { code: "PGRST100" });
  return `"${name}"`;
}
function parseSelect(raw: string | null): string {
  if (!raw || raw.trim() === "*" || raw.trim() === "") return "*";
  return raw.split(",").map((c) => c.trim()).filter(Boolean).map(qi).join(", ");
}
function parseInList(v: string): string[] {
  const inner = v.replace(/^\(/, "").replace(/\)$/, "");
  if (inner === "") return [];
  return inner.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
}
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function condition(col: string, rawIn: string, values: unknown[]): string {
  let raw = rawIn;
  let neg = false;
  if (raw.startsWith("not.")) { neg = true; raw = raw.slice(4); }
  const dot = raw.indexOf(".");
  const op = raw.slice(0, dot);
  const v = raw.slice(dot + 1);
  const c = qi(col);
  let expr: string;
  switch (op) {
    case "eq": values.push(v); expr = `${c}::text = $${values.length}`; break;
    case "neq": values.push(v); expr = `${c}::text <> $${values.length}`; break;
    case "gt": values.push(v); expr = `${c} > $${values.length}`; break;
    case "gte": values.push(v); expr = `${c} >= $${values.length}`; break;
    case "lt": values.push(v); expr = `${c} < $${values.length}`; break;
    case "lte": values.push(v); expr = `${c} <= $${values.length}`; break;
    case "ilike": values.push(v.replace(/\*/g, "%")); expr = `${c} ILIKE $${values.length}`; break;
    case "in": values.push(parseInList(v)); expr = `${c}::text = ANY($${values.length})`; break;
    case "is":
      if (v === "null") expr = `${c} IS NULL`;
      else if (v === "true") expr = `${c} IS TRUE`;
      else if (v === "false") expr = `${c} IS FALSE`;
      else throw new Error(`desteklenmeyen is.${v}`);
      break;
    default:
      throw Object.assign(new Error(`desteklenmeyen filtre: ${op}`), { code: "PGRST100" });
  }
  return neg ? `NOT (${expr})` : expr;
}

function buildWhere(params: URLSearchParams, values: unknown[]): string {
  const parts: string[] = [];
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue;
    if (key === "or") {
      const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
      const ors = inner.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        const d = s.indexOf(".");
        return condition(s.slice(0, d), s.slice(d + 1), values);
      });
      parts.push(`(${ors.join(" OR ")})`);
      continue;
    }
    parts.push(condition(key, raw, values));
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
function toParam(v: unknown, isArrayCol = false): unknown {
  // PostgREST gibi: dizi (ARRAY) kolonlarına JSON dizisi → native PG dizisi; diğer nesneler (jsonb) → JSON metni.
  if (isArrayCol && Array.isArray(v)) return v;
  if (v !== null && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}
const arrayColsCache = new Map<string, Set<string>>();
async function arrayCols(client: pg.PoolClient, table: string): Promise<Set<string>> {
  const hit = arrayColsCache.get(table);
  if (hit) return hit;
  const r = await client.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and data_type = 'ARRAY'",
    [table.replace(/"/g, "")],
  );
  const set = new Set<string>(r.rows.map((x: { column_name: string }) => x.column_name));
  arrayColsCache.set(table, set);
  return set;
}
async function readRaw(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export type BioTestEnv = {
  su: pg.Client;
  url: string;
  port: number;
  stats: { requests: number; errors: number; maxReturned: number; maxUrl: number; rejectedUrl: number; rpcCalls: Record<string, number>; deletes: number; storageGets?: number };
  setMaxRows: (n: number) => void;
  setStorageFile: (b: Buffer | (() => Buffer) | null) => void;
  stop: () => Promise<void>;
};

export async function startEmbeddedPg(port: number, dirName: string) {
  const dataDir = path.join(os.tmpdir(), dirName);
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temiz */ }
  const epg = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password: "testpw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
  });
  await epg.initialise();
  await epg.start();
  const su = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "testpw", database: "postgres" });
  await su.connect();
  await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
                  grant usage on schema public to anon, authenticated, service_role;`);
  return { epg, su };
}

/** Repo migration zinciri (Biyoenerji). `withLock=false` → yalnız 0623 + 20261001 (eski durum). */
export async function applyBioMigrations(su: pg.Client, opts: { withFinal: boolean }) {
  // Gerçek zincir sırası (zaman damgası): 0623 → 20261001 → 20261203 → [BIO-17, BIO-19]
  await su.query(readMig("20260623200000_bioenergy_rls_tenant_isolation.sql"));
  await su.query(readMig("20261001000000_bioenergy_lock_anon_authenticated.sql"));
  await su.query(readMig("20261203000000_bioenergy_chakra_rich_foundation.sql"));
  if (opts.withFinal) {
    await su.query(readMig("20271002000100_bioenergy_rls_final_lock.sql"));
    await su.query(readMig("20271002000200_bioenergy_tenant_indexes.sql"));
  }
  // Supabase'de service_role tablo yetkileri varsayılan olarak vardır.
  await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);
}

export async function startBioTestEnv(opts: { port: number; dirName: string; maxRows?: number; maxUrlBytes?: number }): Promise<BioTestEnv> {
  const { epg, su } = await startEmbeddedPg(opts.port, opts.dirName);
  await su.query(BASE_DDL);
  await su.query(readMig("20270129000200_user_sessions_expiry_touch.sql"));
  await applyBioMigrations(su, { withFinal: true });

  let maxRows = opts.maxRows ?? 1000;
  let storageFile: Buffer | (() => Buffer) | null = null;
  const pool = new pg.Pool({ host: "127.0.0.1", port: opts.port, user: "postgres", password: "testpw", database: "postgres", max: 16 });
  const stats = { requests: 0, errors: 0, maxReturned: 0, maxUrl: 0, rejectedUrl: 0, rpcCalls: {} as Record<string, number>, deletes: 0, storageGets: 0 as number | undefined };
  // Gerçek ağ geçidi URL sınırı (Supabase/Cloudflare önünde ~16 KB; varsayılan 8 KB = muhafazakâr).
  const maxUrlBytes = opts.maxUrlBytes ?? 8192;

  const server = http.createServer(async (req, res) => {
    stats.requests++;
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const rawUrlLen = Buffer.byteLength(req.url ?? "/", "utf8");
    stats.maxUrl = Math.max(stats.maxUrl, rawUrlLen);
    if (rawUrlLen > maxUrlBytes) {
      stats.rejectedUrl++;
      res.writeHead(414, { "Content-Type": "text/html" });
      return res.end("<html><body>414 Request-URI Too Large</body></html>");
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    // WT7: Storage indirme taklidi — setStorageFile ile verilen görsel her nesne için döner (yoksa 404).
    if (url.pathname.startsWith("/storage/v1/")) {
      stats.storageGets = (stats.storageGets ?? 0) + 1;
      if (!storageFile) return send(404, { statusCode: "404", error: "not_found", message: "Object not found" });
      const body = typeof storageFile === "function" ? storageFile() : storageFile;
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": String(body.length) });
      return res.end(body);
    }
    const client = await pool.connect();
    try {
      await client.query("SET ROLE service_role");
      const p = url.pathname.replace(/^\/rest\/v1\//, "");
      const prefer = String(req.headers["prefer"] ?? "");
      const accept = String(req.headers["accept"] ?? "");
      const method = req.method ?? "GET";
      const single = accept.includes("vnd.pgrst.object+json");
      // Oturum doğrulaması gerçek touch_active_session RPC'si ile (enforce AÇIK — prod varsayılanı).
      if (p === "rpc/touch_active_session" && req.method === "POST") {
        const rawB = (await readRaw(req)).toString("utf8");
        const a = (rawB ? JSON.parse(rawB) : {}) as Record<string, unknown>;
        const r = await client.query(
          "select public.touch_active_session(p_token => $1, p_touch_after_seconds => $2, p_idle_seconds => $3, p_enforce => $4, p_admin_idle_seconds => $5, p_admin_absolute_seconds => $6) as v",
          [a.p_token ?? null, a.p_touch_after_seconds ?? null, a.p_idle_seconds ?? null, a.p_enforce ?? null, a.p_admin_idle_seconds ?? null, a.p_admin_absolute_seconds ?? null],
        );
        return send(200, r.rows[0]?.v ?? null);
      }
      // A4-B — bioenergy_delete_rows: fonksiyon kuruluysa gerçek çağrı (gövdede uuid[]),
      // kurulu değilse PostgREST gibi 404 PGRST202 (uygulama fallback'i test edilir).
      if (p === "rpc/bioenergy_delete_rows" && req.method === "POST") {
        stats.rpcCalls[p] = (stats.rpcCalls[p] ?? 0) + 1;
        const exists = (await client.query(`select to_regprocedure('public.bioenergy_delete_rows(text, uuid, uuid[])') is not null as e`)).rows[0].e;
        if (!exists) return send(404, { code: "PGRST202", message: "Could not find the function public.bioenergy_delete_rows(p_ids, p_table, p_tenant_id) in the schema cache", details: null, hint: null });
        const rawB = (await readRaw(req)).toString("utf8");
        const a = (rawB ? JSON.parse(rawB) : {}) as Record<string, unknown>;
        const r = await client.query(
          "select public.bioenergy_delete_rows(p_table => $1, p_tenant_id => $2, p_ids => $3::uuid[]) as v",
          [a.p_table ?? null, a.p_tenant_id ?? null, a.p_ids ?? null],
        );
        return send(200, r.rows[0]?.v ?? null);
      }
      // Genel RPC (WT6): fonksiyon şemada VARSA adlandırılmış argümanlarla gerçek çağrı; yoksa PGRST202.
      if (p.startsWith("rpc/")) {
        const fn = p.slice(4);
        if (!IDENT_RE.test(fn)) return send(404, { code: "PGRST202", message: "rpc yok (test)", details: null, hint: null });
        const exists = (await client.query(`select count(*)::int as n from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn])).rows[0].n;
        if (!exists) return send(404, { code: "PGRST202", message: "rpc yok (test)", details: null, hint: null });
        const rawB = (await readRaw(req)).toString("utf8");
        const a = (rawB ? JSON.parse(rawB) : {}) as Record<string, unknown>;
        const keys = Object.keys(a).filter((k) => IDENT_RE.test(k));
        const r = await client.query(
          `select public.${qi(fn)}(${keys.map((k, i) => `${qi(k)} => $${i + 1}`).join(", ")}) as v`,
          keys.map((k) => { const v = a[k]; return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v; }),
        );
        return send(200, r.rows[0]?.v ?? null);
      }
      const table = qi(p);
      const values: unknown[] = [];
      const sel = parseSelect(url.searchParams.get("select"));
      const reply = (status: number, rows: unknown[], extra: Record<string, string> = {}) => {
        if (single) {
          if (rows.length > 1) return send(406, { code: "PGRST116", message: "multiple rows", details: null, hint: null });
          if (rows.length === 0) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null });
          return send(status, rows[0], extra);
        }
        return send(status, rows, extra);
      };
      if (method === "GET" || method === "HEAD") {
        const where = buildWhere(url.searchParams, values);
        const wantCount = /count=exact/.test(prefer);
        let total: number | null = null;
        if (wantCount) total = (await client.query(`select count(*)::int as n from public.${table}${where}`, values)).rows[0].n;
        if (method === "HEAD") return send(200, undefined, { "content-range": `*/${total ?? 0}` });
        let sql = `select ${sel} from public.${table}${where}${buildOrder(url.searchParams.get("order"))}`;
        const limitRaw = url.searchParams.get("limit");
        const offset = url.searchParams.get("offset");
        // PostgREST max-rows: istenen limit ne olursa olsun yanıt en çok maxRows satır.
        const limit = Math.min(limitRaw != null ? Math.max(0, Number(limitRaw) | 0) : maxRows, maxRows);
        sql += ` LIMIT ${limit}`;
        if (offset != null) sql += ` OFFSET ${Math.max(0, Number(offset) | 0)}`;
        const r = await client.query(sql, values);
        stats.maxReturned = Math.max(stats.maxReturned, r.rowCount ?? 0);
        return reply(200, r.rows, wantCount ? { "content-range": `${offset ?? 0}-${Math.max(0, Number(offset ?? 0) + (r.rowCount ?? 0) - 1)}/${total}` } : {});
      }
      const raw = (await readRaw(req)).toString("utf8");
      const payload = raw ? JSON.parse(raw) : {};
      const returning = /return=representation/.test(prefer);
      if (method === "POST") {
        const rows = Array.isArray(payload) ? payload : [payload];
        const out: unknown[] = [];
        // PostgREST upsert (WT6): ?on_conflict=a,b + Prefer resolution=ignore-duplicates → ON CONFLICT DO NOTHING.
        const onConflict = url.searchParams.get("on_conflict");
        const conflictSql =
          onConflict && /resolution=ignore-duplicates/.test(prefer)
            ? ` on conflict (${onConflict.split(",").map((c) => qi(c.trim())).join(", ")}) do nothing`
            : "";
        const arrCols = await arrayCols(client, table);
        for (const row of rows as Record<string, unknown>[]) {
          const cols = Object.keys(row);
          const r = await client.query(
            `insert into public.${table} (${cols.map(qi).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})${conflictSql} returning ${sel}`,
            cols.map((c) => toParam(row[c], arrCols.has(c))),
          );
          out.push(...r.rows);
        }
        return returning ? reply(201, out) : send(201, undefined);
      }
      if (method === "PATCH") {
        const cols = Object.keys(payload as Record<string, unknown>);
        const arrColsP = await arrayCols(client, table);
        for (const c of cols) values.push(toParam((payload as Record<string, unknown>)[c], arrColsP.has(c)));
        const setSql = cols.map((c, i) => `${qi(c)} = $${i + 1}`).join(", ");
        const where = buildWhere(url.searchParams, values);
        const r = await client.query(`update public.${table} set ${setSql}${where} returning ${sel}`, values);
        return returning ? reply(200, r.rows) : send(204, undefined);
      }
      if (method === "DELETE") {
        stats.deletes++;
        const where = buildWhere(url.searchParams, values);
        if (!where) return send(400, { code: "21000", message: "DELETE requires a WHERE clause" });
        const r = await client.query(`delete from public.${table}${where} returning ${sel}`, values);
        return returning ? reply(200, r.rows) : send(204, undefined);
      }
      return send(405, { code: "PGRST000", message: `method ${method}` });
    } catch (e) {
      stats.errors++;
      const err = e as { code?: string; message?: string; detail?: string; hint?: string };
      const status = err.code === "42501" ? 403 : err.code === "42P01" ? 404 : 400;
      try { send(status, { code: err.code ?? "XX000", message: err.message ?? "error", details: err.detail ?? null, hint: err.hint ?? null }); } catch { /* yazıldı */ }
    } finally {
      try { await client.query("RESET ROLE"); } catch { /* düştü */ }
      client.release();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };
  return {
    su,
    url: `http://127.0.0.1:${addr.port}`,
    port: opts.port,
    stats,
    setMaxRows: (n: number) => { maxRows = n; },
    setStorageFile: (b: Buffer | (() => Buffer) | null) => { storageFile = b; },
    stop: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await pool.end().catch(() => undefined);
      await su.end().catch(() => undefined);
      await epg.stop().catch(() => undefined);
    },
  };
}

export type BioSeed = {
  TA: string; TB: string;
  users: Record<"A" | "B" | "NOMOD" | "PENDING" | "DEMO", { id: string; token: string }>;
};

export async function seedBio(su: pg.Client): Promise<BioSeed> {
  const TA = randomUUID();
  const TB = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_BIO_TENANT_A'),($2,'ZZ_BIO_TENANT_B')`, [TA, TB]);
  const mk = async (label: string, o: { tenant: string; approval?: string; perms?: Record<string, boolean>; demo?: boolean }) => {
    const id = randomUUID();
    const token = `zz-bio-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
       values ($1,$2,$3,'expert',true,$4,$5,'premium','premium',$6,$7)`,
      [id, `ZZ_BIO_${label}`, `zz.bio.${label.toLowerCase()}@example.test`, o.approval ?? "approved",
        JSON.stringify(o.perms ?? { energy_body: true }), o.tenant, o.demo === true],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
    return { id, token };
  };
  return {
    TA, TB,
    users: {
      A: await mk("A", { tenant: TA }),
      B: await mk("B", { tenant: TB }),
      NOMOD: await mk("NOMOD", { tenant: TA, perms: { energy_body: false } }),
      PENDING: await mk("PENDING", { tenant: TA, approval: "pending" }),
      DEMO: await mk("DEMO", { tenant: TA, demo: true }),
    },
  };
}
