/**
 * ANAMNEZ V1 — test ortamı (yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS).
 *
 *  - Geçici embedded-postgres. Şema: sentetik users/user_sessions + PROD ile birebir kolonlu
 *    clients / client_notes (2026-09-28 salt-okunur OpenAPI teyidi) + minimal nutrition_* +
 *    GERÇEK repo migration'ları: client_consents (20270129000900) + ANAMNEZ (20270202000000/000100).
 *  - PostgREST uyumlu HTTP shim (GET/HEAD/POST/PATCH/DELETE; eq/neq/in/is/gt/gte/lt/lte + not.*;
 *    order/limit/offset; Prefer count=exact; tekil nesne Accept). Her istek `SET ROLE service_role`.
 *  - Supabase Storage emülatörü (/storage/v1): private bucket (policy yok → yalnız service anahtarı),
 *    bucket MIME + boyut kilidi, createSignedUploadUrl / uploadToSignedUrl / download / exists /
 *    list / remove / createSignedUrl (TTL'li; süresi dolan token reddedilir).
 *  - Tarayıcı testleri için CORS açık.
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

// PostgREST gibi: DATE kolonları 'YYYY-MM-DD' METİN olarak döner (pg varsayılanı JS Date → TZ kayması).
pg.types.setTypeParser(1082, (v: string) => v);

export const SERVICE_KEY = "zz-anamnez-test-service-role-not-a-secret";
export const ANON_KEY = "zz-anamnez-test-anon-not-a-secret";

const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

const BASE_DDL = `
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
-- PROD clients kolonları (salt-okunur teyit 2026-09-28): legacy UI'sız kolonlar dahil.
create table public.clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid references public.users(id),
  name text, phone text, email text, notes text, created_at timestamptz default now(),
  ad text, soyad text, telefon text, dogum text, gorusme text, burc text, kan text, mizac text,
  saglik text, adres text, oneriler text, create_request_id uuid
);
create table public.client_notes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  saglik_notu text, adres text, oneriler text, created_at timestamptz default now(), notlar text
);
create table public.nutrition_allergens (
  id uuid primary key default gen_random_uuid(), code text not null, name_tr text not null, name_en text not null,
  aliases text[] not null default '{}', description text, is_major boolean not null default false,
  sort_order integer not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.nutrition_client_profiles (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  goal_type text, goal_note text, activity_level text, dietary_pattern text, daily_meal_count integer,
  target_weight_kg numeric, water_note text, lifestyle_note text, general_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, client_id)
);
create table public.nutrition_client_measurements (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  measured_at timestamptz not null default now(), weight_kg numeric not null, height_cm numeric,
  waist_cm numeric, hip_cm numeric, note text, created_at timestamptz not null default now()
);
create table public.nutrition_client_allergens (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  allergen_id uuid references public.nutrition_allergens(id), note text,
  created_at timestamptz not null default now(), custom_label text
);
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text,
  owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
alter table storage.objects enable row level security;
`;

// ─── PostgREST shim ──────────────────────────────────────────────────────────

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

function condExpr(col: string, raw0: string, values: unknown[]): string {
  let raw = raw0;
  let neg = false;
  if (raw.startsWith("not.")) { neg = true; raw = raw.slice(4); }
  const dot = raw.indexOf(".");
  const op = raw.slice(0, dot);
  const v = raw.slice(dot + 1);
  let expr: string;
  switch (op) {
    case "eq": values.push(v); expr = `${col} = $${values.length}`; break;
    case "neq": values.push(v); expr = `${col} <> $${values.length}`; break;
    case "gt": values.push(v); expr = `${col} > $${values.length}`; break;
    case "gte": values.push(v); expr = `${col} >= $${values.length}`; break;
    case "lt": values.push(v); expr = `${col} < $${values.length}`; break;
    case "lte": values.push(v); expr = `${col} <= $${values.length}`; break;
    case "in": values.push(parseInList(v)); expr = `${col}::text = ANY($${values.length})`; break;
    case "is":
      if (v === "null") expr = `${col} IS NULL`;
      else if (v === "true") expr = `${col} IS TRUE`;
      else if (v === "false") expr = `${col} IS FALSE`;
      else throw new Error(`desteklenmeyen is.${v}`);
      break;
    default:
      throw Object.assign(new Error(`desteklenmeyen filtre: ${op}`), { code: "PGRST100" });
  }
  return neg ? `NOT (${expr})` : expr;
}
/** PostgREST mantıksal grup: "(a.eq.1,and(b.neq.2,c.is.null))" → SQL (yalnız basit değerler). */
function logicExpr(kind: "or" | "and", inner: string, values: unknown[]): string {
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { items.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) items.push(cur);
  const parts = items.map((it) => {
    const m = /^(or|and)\((.*)\)$/.exec(it);
    if (m) return logicExpr(m[1] as "or" | "and", m[2], values);
    const d = it.indexOf(".");
    return condExpr(qi(it.slice(0, d)), it.slice(d + 1), values);
  });
  return `(${parts.join(kind === "or" ? " OR " : " AND ")})`;
}
function buildWhere(params: URLSearchParams, values: unknown[]): string {
  const parts: string[] = [];
  for (const [key, raw0] of params.entries()) {
    if (RESERVED.has(key)) continue;
    if (key === "or" || key === "and") {
      parts.push(logicExpr(key, raw0.replace(/^\(/, "").replace(/\)$/, ""), values));
      continue;
    }
    parts.push(condExpr(qi(key), raw0, values));
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
async function readRaw(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

// ─── Storage emülatörü ───────────────────────────────────────────────────────

export type StoredObject = { bytes: Buffer; contentType: string; createdAt: number };
export type StorageState = {
  buckets: Map<string, { public: boolean; sizeLimit: number | null; mimes: string[] | null }>;
  objects: Map<string, Map<string, StoredObject>>;
  uploadTokens: Map<string, { bucket: string; path: string; upsert: boolean }>;
  readTokens: Map<string, { bucket: string; path: string; expiresAt: number; expiresIn: number }>;
  signLog: Array<{ bucket: string; path: string; expiresIn: number }>;
  failRemove: boolean;
  failList: boolean;
};

function parseMultipartFile(body: Buffer, contentType: string): { bytes: Buffer; type: string } | null {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let idx = body.indexOf(boundary);
  while (idx !== -1) {
    const next = body.indexOf(boundary, idx + boundary.length);
    if (next === -1) break;
    const part = body.subarray(idx + boundary.length + 2, next - 2);
    const headEnd = part.indexOf("\r\n\r\n");
    if (headEnd !== -1) {
      const head = part.subarray(0, headEnd).toString("utf8");
      if (/filename=/i.test(head) || /name=""/.test(head)) {
        const ct = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? "application/octet-stream";
        return { bytes: Buffer.from(part.subarray(headEnd + 4)), type: ct };
      }
    }
    idx = next;
  }
  return null;
}

async function handleStorage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  state: StorageState,
  send: (status: number, body: unknown, headers?: Record<string, string>) => void,
): Promise<void> {
  const p = url.pathname.replace(/^\/storage\/v1\//, "");
  const auth = String(req.headers["authorization"] ?? "");
  const isService = auth === `Bearer ${SERVICE_KEY}`;
  const method = req.method ?? "GET";
  const splitBucket = (rest: string) => {
    const i = rest.indexOf("/");
    return { bucket: decodeURIComponent(rest.slice(0, i)), objPath: decodeURIComponent(rest.slice(i + 1)) };
  };
  const bucketMap = (b: string) => {
    if (!state.objects.has(b)) state.objects.set(b, new Map());
    return state.objects.get(b)!;
  };
  const notFoundBucket = () => send(400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });

  // Signed upload URL üret (yalnız service).
  if (method === "POST" && p.startsWith("object/upload/sign/")) {
    const { bucket, objPath } = splitBucket(p.slice("object/upload/sign/".length));
    if (!state.buckets.has(bucket)) return notFoundBucket();
    if (!isService) return send(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    const token = randomUUID();
    state.uploadTokens.set(token, { bucket, path: objPath, upsert: req.headers["x-upsert"] === "true" });
    return send(200, { url: `/object/upload/sign/${encodeURIComponent(bucket)}/${objPath}?token=${token}` });
  }
  // İmzalı URL'ye yükleme (anahtarsız; token yetkilendirir).
  if (method === "PUT" && p.startsWith("object/upload/sign/")) {
    const { bucket, objPath } = splitBucket(p.slice("object/upload/sign/".length));
    const token = url.searchParams.get("token") ?? "";
    const t = state.uploadTokens.get(token);
    const raw = await readRaw(req);
    if (!t || t.bucket !== bucket || t.path !== objPath) return send(400, { statusCode: "400", error: "InvalidJWT", message: "invalid signature" });
    const b = state.buckets.get(bucket)!;
    const ct = String(req.headers["content-type"] ?? "");
    const file = ct.startsWith("multipart/form-data") ? parseMultipartFile(raw, ct) : { bytes: raw, type: ct || "application/octet-stream" };
    if (!file) return send(400, { statusCode: "400", error: "InvalidRequest", message: "no file" });
    if (b.mimes && !b.mimes.includes(file.type)) return send(400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${file.type} is not supported` });
    if (b.sizeLimit !== null && file.bytes.length > b.sizeLimit) return send(400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    const objs = bucketMap(bucket);
    if (objs.has(objPath) && !t.upsert) return send(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    objs.set(objPath, { bytes: file.bytes, contentType: file.type, createdAt: Date.now() });
    state.uploadTokens.delete(token);
    return send(200, { Key: `${bucket}/${objPath}` });
  }
  // Okuma için imzalı URL üret (yalnız service).
  if (method === "POST" && p.startsWith("object/sign/")) {
    const { bucket, objPath } = splitBucket(p.slice("object/sign/".length));
    if (!state.buckets.has(bucket)) return notFoundBucket();
    if (!isService) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    if (!bucketMap(bucket).has(objPath)) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const body = JSON.parse((await readRaw(req)).toString("utf8") || "{}") as { expiresIn?: number };
    const expiresIn = Number(body.expiresIn ?? 0);
    const token = randomUUID();
    state.readTokens.set(token, { bucket, path: objPath, expiresAt: Date.now() + expiresIn * 1000, expiresIn });
    state.signLog.push({ bucket, path: objPath, expiresIn });
    return send(200, { signedURL: `/object/sign/${encodeURIComponent(bucket)}/${objPath}?token=${token}` });
  }
  // İmzalı URL ile okuma (anahtarsız; token + süre).
  if (method === "GET" && p.startsWith("object/sign/")) {
    const { bucket, objPath } = splitBucket(p.slice("object/sign/".length));
    const token = url.searchParams.get("token") ?? "";
    const t = state.readTokens.get(token);
    if (!t || t.bucket !== bucket || t.path !== objPath) return send(400, { statusCode: "400", error: "InvalidJWT", message: "invalid signature" });
    if (Date.now() > t.expiresAt) return send(400, { statusCode: "400", error: "InvalidJWT", message: "jwt expired" });
    const obj = bucketMap(bucket).get(objPath);
    if (!obj) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const dl = url.searchParams.get("download");
    res.writeHead(200, {
      "Content-Type": obj.contentType,
      ...(dl !== null ? { "Content-Disposition": `attachment; filename="${dl}"` } : {}),
      "Access-Control-Allow-Origin": "*",
    });
    res.end(obj.bytes);
    return;
  }
  // Public okuma: private bucket → her zaman ret.
  if (method === "GET" && p.startsWith("object/public/")) {
    const { bucket } = splitBucket(p.slice("object/public/".length));
    const b = state.buckets.get(bucket);
    if (!b || !b.public) return send(400, { statusCode: "400", error: "Bucket not public", message: "Bucket not public" });
  }
  // Listeleme.
  if (method === "POST" && p.startsWith("object/list/")) {
    const bucket = decodeURIComponent(p.slice("object/list/".length));
    if (!state.buckets.has(bucket)) return notFoundBucket();
    if (!isService) return send(200, []); // policy yok → anon/auth hiçbir şey göremez
    if (state.failList) return send(500, { statusCode: "500", error: "internal", message: "list failed (simulated)" });
    const body = JSON.parse((await readRaw(req)).toString("utf8") || "{}") as { prefix?: string };
    const prefix = (body.prefix ?? "").replace(/\/?$/, "/").replace(/^\/$/, "");
    const names = new Map<string, boolean>();
    for (const key of bucketMap(bucket).keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const seg = rest.split("/")[0];
      names.set(seg, rest.includes("/"));
    }
    return send(200, [...names.entries()].map(([name, folder]) => ({ name, id: folder ? null : randomUUID() })));
  }
  // Silme.
  if (method === "DELETE" && p.startsWith("object/")) {
    const bucket = decodeURIComponent(p.slice("object/".length));
    if (!state.buckets.has(bucket)) return notFoundBucket();
    if (!isService) return send(200, []);
    if (state.failRemove) return send(500, { statusCode: "500", error: "internal", message: "remove failed (simulated)" });
    const body = JSON.parse((await readRaw(req)).toString("utf8") || "{}") as { prefixes?: string[] };
    const removed: Array<{ name: string }> = [];
    for (const k of body.prefixes ?? []) if (bucketMap(bucket).delete(k)) removed.push({ name: k });
    return send(200, removed);
  }
  // Doğrudan (anahtarlı) okuma / var mı.
  if ((method === "GET" || method === "HEAD") && p.startsWith("object/")) {
    let rest = p.slice("object/".length);
    if (rest.startsWith("authenticated/")) rest = rest.slice("authenticated/".length);
    const { bucket, objPath } = splitBucket(rest);
    if (!state.buckets.has(bucket)) return notFoundBucket();
    const obj = isService ? bucketMap(bucket).get(objPath) : undefined;
    if (!obj) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    if (method === "HEAD") { res.writeHead(200); res.end(); return; }
    res.writeHead(200, { "Content-Type": obj.contentType });
    res.end(obj.bytes);
    return;
  }
  return send(404, { statusCode: "404", error: "not_found", message: `unsupported storage route ${method} ${p}` });
}

// ─── Başlat ──────────────────────────────────────────────────────────────────

export type TestEnv = {
  su: pg.Client;
  url: string;
  storage: StorageState;
  stats: { requests: number; errors: number };
  stop: () => Promise<void>;
};

export async function startAnamnezTestEnv(opts: {
  port: number;
  dirName: string;
  httpPort?: number;
  /**
   * PostgREST `rpc/<ad>` olarak çağrılabilecek public fonksiyonlar (varsayılan: YOK → eski
   * davranış, tüm RPC'ler 404 PGRST202). DY satış öncesi kapanış harness'ı notlar CAS RPC'si için kullanır.
   */
  rpcAllow?: string[];
  /** BASE_DDL + anamnez migration'larından SONRA çalışacak ek SQL (ör. DY tabloları/migration'ları). */
  extraSql?: string[];
}): Promise<TestEnv> {
  const rpcAllow = new Set(opts.rpcAllow ?? []);
  const dataDir = path.join(os.tmpdir(), opts.dirName);
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temiz */ }
  const epg = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password: "testpw", port: opts.port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
  });
  await epg.initialise();
  await epg.start();
  const su = new pg.Client({ host: "127.0.0.1", port: opts.port, user: "postgres", password: "testpw", database: "postgres" });
  await su.connect();
  await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
                  grant usage on schema public to anon, authenticated, service_role;`);
  await su.query(BASE_DDL);
  await su.query(readMig("20270129000900_client_consents.sql"));
  await su.query(readMig("20270202000000_client_anamnesis.sql"));
  await su.query(readMig("20270202000100_client_anamnesis_storage.sql"));
  for (const sql of opts.extraSql ?? []) await su.query(sql);
  await su.query(`grant select, insert, update, delete on public.tenants, public.users, public.user_sessions, public.clients,
                    public.client_notes, public.nutrition_allergens, public.nutrition_client_profiles,
                    public.nutrition_client_measurements, public.nutrition_client_allergens to service_role;`);

  const pool = new pg.Pool({ host: "127.0.0.1", port: opts.port, user: "postgres", password: "testpw", database: "postgres", max: 24 });
  const storage: StorageState = {
    buckets: new Map(), objects: new Map(), uploadTokens: new Map(), readTokens: new Map(), signLog: [],
    failRemove: false, failList: false,
  };
  // Bucket yapılandırmasını GERÇEK migration'ın yazdığı storage.buckets satırından al.
  for (const b of (await su.query(`select id, public, file_size_limit, allowed_mime_types from storage.buckets`)).rows) {
    storage.buckets.set(b.id, { public: b.public, sizeLimit: b.file_size_limit === null ? null : Number(b.file_size_limit), mimes: b.allowed_mime_types });
  }
  const stats = { requests: 0, errors: 0 };

  const server = http.createServer(async (req, res) => {
    stats.requests++;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Expose-Headers": "content-range",
    };
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...cors, ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/storage/v1/")) {
      try { await handleStorage(req, res, url, storage, send); } catch (e) { stats.errors++; send(500, { message: String(e) }); }
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("SET ROLE service_role");
      const p = url.pathname.replace(/^\/rest\/v1\//, "");
      const prefer = String(req.headers["prefer"] ?? "");
      const accept = String(req.headers["accept"] ?? "");
      const method = req.method ?? "GET";
      const single = accept.includes("vnd.pgrst.object+json");
      if (p.startsWith("rpc/")) {
        const fn = p.slice("rpc/".length);
        if (!rpcAllow.has(fn) || !/^[a-z_][a-z0-9_]*$/.test(fn)) {
          return send(404, { code: "PGRST202", message: `Could not find the function public.${fn} (test)`, details: null, hint: null });
        }
        const args = JSON.parse((await readRaw(req)).toString("utf8") || "{}") as Record<string, unknown>;
        const keys = Object.keys(args).filter((k) => /^[a-z_][a-z0-9_]*$/.test(k));
        const vals = keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
        try {
          const r = await client.query(`select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`, vals);
          return send(200, r.rows);
        } catch (e) {
          const pe = e as { code?: string; message?: string };
          return send(400, { code: pe.code ?? "XX000", message: pe.message ?? String(e), details: null, hint: null });
        }
      }
      const table = qi(p);
      const values: unknown[] = [];
      const sel = parseSelect(url.searchParams.get("select"));
      const reply = (status: number, rows: unknown[], extra: Record<string, string> = {}) => {
        if (single) {
          if (rows.length !== 1) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null });
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
        const limit = url.searchParams.get("limit");
        const offset = url.searchParams.get("offset");
        if (limit != null) sql += ` LIMIT ${Math.max(0, Number(limit) | 0)}`;
        if (offset != null) sql += ` OFFSET ${Math.max(0, Number(offset) | 0)}`;
        const r = await client.query(sql, values);
        return reply(200, r.rows, wantCount ? { "content-range": `0-${Math.max(0, r.rowCount! - 1)}/${total}` } : {});
      }
      const raw = (await readRaw(req)).toString("utf8");
      const payload = raw ? JSON.parse(raw) : {};
      const returning = /return=representation/.test(prefer);
      if (method === "POST") {
        const rows = Array.isArray(payload) ? payload : [payload];
        const out: unknown[] = [];
        for (const row of rows as Record<string, unknown>[]) {
          const cols = Object.keys(row);
          const r = await client.query(
            `insert into public.${table} (${cols.map(qi).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning ${sel}`,
            cols.map((c) => toParam(row[c])),
          );
          out.push(...r.rows);
        }
        return returning ? reply(201, out) : send(201, undefined);
      }
      if (method === "PATCH") {
        const cols = Object.keys(payload as Record<string, unknown>);
        for (const c of cols) values.push(toParam((payload as Record<string, unknown>)[c]));
        const setSql = cols.map((c, i) => `${qi(c)} = $${i + 1}`).join(", ");
        const where = buildWhere(url.searchParams, values);
        const r = await client.query(`update public.${table} set ${setSql}${where} returning ${sel}`, values);
        return returning ? reply(200, r.rows) : send(204, undefined);
      }
      if (method === "DELETE") {
        const where = buildWhere(url.searchParams, values);
        if (!where) return send(400, { code: "21000", message: "DELETE requires a WHERE clause" });
        const r = await client.query(`delete from public.${table}${where} returning ${sel}`, values);
        return returning ? reply(200, r.rows) : send(204, undefined);
      }
      return send(405, { code: "PGRST000", message: `method ${method}` });
    } catch (e) {
      stats.errors++;
      const err = e as { code?: string; message?: string; detail?: string; hint?: string };
      const status = err.code === "42501" ? 403 : err.code === "PGRST116" ? 406 : 400;
      try { send(status, { code: err.code ?? "XX000", message: err.message ?? "error", details: err.detail ?? null, hint: err.hint ?? null }); } catch { /* yazıldı */ }
    } finally {
      try { await client.query("RESET ROLE"); } catch { /* düştü */ }
      client.release();
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.httpPort ?? 0, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };
  return {
    su,
    url: `http://127.0.0.1:${addr.port}`,
    storage,
    stats,
    stop: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await pool.end().catch(() => undefined);
      await su.end().catch(() => undefined);
      await epg.stop().catch(() => undefined);
    },
  };
}

// ─── Tohum verisi (sentetik; ZZ_ANAMNEZ_*) ───────────────────────────────────

export type Seed = {
  TA: string; TB: string;
  users: Record<"A" | "A2" | "B" | "PENDING" | "REJECTED" | "DEMO" | "NOMOD" | "INACTIVE", { id: string; token: string }>;
  clients: { a1: string; a2: string; b1: string };
  allergen: { peanut: string; latex: string };
};

export async function seedAnamnez(su: pg.Client): Promise<Seed> {
  const TA = randomUUID();
  const TB = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_ANAMNEZ_TENANT_A'),($2,'ZZ_ANAMNEZ_TENANT_B')`, [TA, TB]);
  const mk = async (label: string, o: { tenant: string; approval?: string; active?: boolean; pkg?: string; perms?: Record<string, boolean>; demo?: boolean }) => {
    const id = randomUUID();
    const token = `zz-anamnez-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
       values ($1,$2,$3,'expert',$4,$5,$6,$7,$7,$8,$9)`,
      [id, `ZZ_ANAMNEZ_${label}`, `zz.anamnez.${label.toLowerCase()}@example.test`, o.active ?? true, o.approval ?? "approved",
        JSON.stringify(o.perms ?? { clients: true }), o.pkg ?? "premium", o.tenant, o.demo === true],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
    return { id, token };
  };
  const users = {
    A: await mk("A", { tenant: TA }),
    A2: await mk("A2", { tenant: TA }),
    B: await mk("B", { tenant: TB }),
    PENDING: await mk("PENDING", { tenant: TA, approval: "pending" }),
    REJECTED: await mk("REJECTED", { tenant: TA, approval: "rejected" }),
    DEMO: await mk("DEMO", { tenant: TA, demo: true }),
    NOMOD: await mk("NOMOD", { tenant: TA, perms: { clients: false } }),
    INACTIVE: await mk("INACTIVE", { tenant: TA, pkg: "trial" }),
  };
  const a1 = randomUUID();
  const a2 = randomUUID();
  const b1 = randomUUID();
  await su.query(
    `insert into public.clients(id, tenant_id, ad, soyad, telefon, dogum, kan, mizac, adres, saglik, email) values
     ($1,$4,'ZZ Ayşe','YILMAZ','05000000001','1990-03-21','A Rh+','safra','ZZ Adres A','LEGACY-SAGLIK-A','legacy@a.test'),
     ($2,$4,'ZZ Mehmet','KAYA','05000000002','1985-07-14',NULL,NULL,NULL,NULL,NULL),
     ($3,$5,'ZZ Bora','DEMİR','05000000003','1992-01-01','0 Rh+','dem',NULL,NULL,NULL)`,
    [a1, a2, b1, TA, TB],
  );
  await su.query(`insert into public.client_notes(tenant_id, client_id, saglik_notu, adres) values ($1,$2,'ZZ sağlık notu: referans metin','ZZ adres')`, [TA, a1]);
  const peanut = randomUUID();
  const latex = randomUUID();
  await su.query(`insert into public.nutrition_allergens(id, code, name_tr, name_en) values ($1,'peanut','Yer fıstığı','Peanut'),($2,'latex','Lateks','Latex')`, [peanut, latex]);
  await su.query(
    `insert into public.nutrition_client_profiles(tenant_id, client_id, activity_level, dietary_pattern, daily_meal_count, water_note, lifestyle_note)
     values ($1,$2,'moderate','Akdeniz tipi',3,'Günde 2 litre','Masa başı çalışıyor')`,
    [TA, a1],
  );
  await su.query(
    `insert into public.nutrition_client_measurements(tenant_id, client_id, measured_at, weight_kg, height_cm) values
     ($1,$2, now() - interval '10 days', 70, 168), ($1,$2, now() - interval '1 day', 68.5, NULL)`,
    [TA, a1],
  );
  await su.query(`insert into public.nutrition_client_allergens(tenant_id, client_id, allergen_id) values ($1,$2,$3)`, [TA, a1, peanut]);
  return { TA, TB, users, clients: { a1, a2, b1 }, allergen: { peanut, latex } };
}
