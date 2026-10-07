/**
 * Astroloji harness — bellek-içi sahte Supabase (yalnız test). Gerçek DB'ye BAĞLANMAZ.
 *
 * İki arayüz aynı depoyu paylaşır:
 *   1) createFakeClient(store) — supabase-js benzeri nesne API (servis birim testleri).
 *   2) installFetchShim({...}) — global fetch'i yakalar: PostgREST HTTP'yi (/rest/v1/...) bu depoya,
 *      sahte Roxy base URL'ini sahte sağlayıcıya yönlendirir → GERÇEK route handler'ları +
 *      gerçek verifyAdminRequest + gerçek getServerDb ile uçtan uca çalışır.
 *
 * Kısıtlar (migration ile aynı): astro_provider_results UNIQUE(tenant_id,input_hash) + PK;
 * astro_provider_interpretations UNIQUE(tenant_id,result_id,projection_version); profil→danışan
 * tenant FK; revizyon iyimser kilidi. Erişim günlüğü (select kolonları dahil) tutulur.
 */

type Row = Record<string, unknown>;
export type FakeErr = { code: string; message: string } | null;

export type QueryLog = { table: string; op: string; select: string; via: "client" | "http" };

export type FakeStore = {
  tables: Record<string, Row[]>;
  sessions: Map<string, string>; // token → user_id
  rateCounters: Map<string, number>;
  log: QueryLog[];
  /** Bu tablo/kolon seçildiğinde hata simülasyonu (ör. is_super_admin kolonu yok). */
  failSelect?: (table: string, select: string) => FakeErr;
  /** Rate limit RPC'sini tamamen devre dışı bırak (yarış testleri). */
  disableRateLimit?: boolean;
};

export function createStore(seed: Record<string, Row[]> = {}): FakeStore {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  return { tables, sessions: new Map(), rateCounters: new Map(), log: [] };
}

type Filter = { col: string; op: "eq" | "in"; val: unknown };

type Query = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  select: string;
  filters: Filter[];
  orderBy?: { col: string; asc: boolean };
  limit?: number;
  payload?: Row | Row[];
  mode: "many" | "single" | "maybe";
};

let idSeq = 0;
function genId(): string {
  idSeq += 1;
  const h = idSeq.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
}

function matches(r: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.op === "eq") return String(r[f.col]) === String(f.val);
    return (f.val as unknown[]).map(String).includes(String(r[f.col]));
  });
}

function project(r: Row, select: string): Row {
  if (!select || select.trim() === "*") return { ...r };
  const out: Row = {};
  for (const c of select.split(",").map((x) => x.trim()).filter(Boolean)) out[c] = r[c] ?? null;
  return out;
}

const UNIQUE_KEYS: Record<string, string[][]> = {
  astro_provider_results: [["tenant_id", "input_hash"]],
  astro_provider_interpretations: [["tenant_id", "result_id", "projection_version"]],
  astro_birth_profile_revisions: [["tenant_id", "profile_id", "revision"]],
};

export function execQuery(store: FakeStore, q: Query, via: "client" | "http"): { data: unknown; error: FakeErr } {
  store.log.push({ table: q.table, op: q.op, select: q.select, via });
  store.tables[q.table] ??= [];
  const rows = store.tables[q.table];
  if (q.op === "select" && store.failSelect) {
    const e = store.failSelect(q.table, q.select);
    if (e) return { data: null, error: e };
  }
  if (q.op === "insert") {
    const list = Array.isArray(q.payload) ? q.payload : [q.payload as Row];
    const prepared: Row[] = [];
    for (const p of list) {
      const row: Row = { id: p.id ?? genId(), ...p, created_at: p.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
      if (rows.some((r) => r.id === row.id) || prepared.some((r) => r.id === row.id)) {
        return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${q.table}_pkey"` } };
      }
      for (const key of UNIQUE_KEYS[q.table] ?? []) {
        if (rows.some((r) => key.every((k) => String(r[k]) === String(row[k])))) {
          return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint (${key.join(",")})` } };
        }
      }
      prepared.push(row);
    }
    rows.push(...prepared);
    const out = prepared.map((r) => project(r, q.select));
    return { data: q.mode === "many" ? out : out[0] ?? null, error: null };
  }
  if (q.op === "update") {
    const hit = rows.filter((r) => matches(r, q.filters));
    for (const r of hit) Object.assign(r, q.payload as Row, { updated_at: new Date().toISOString() });
    return { data: hit.map((r) => project(r, q.select)), error: null };
  }
  if (q.op === "delete") {
    const keep = rows.filter((r) => !matches(r, q.filters));
    const del = rows.filter((r) => matches(r, q.filters));
    store.tables[q.table] = keep;
    return { data: del.map((r) => project(r, q.select)), error: null };
  }
  let found = rows.filter((r) => matches(r, q.filters));
  if (q.orderBy) {
    const { col, asc } = q.orderBy;
    found = [...found].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
  }
  if (q.limit !== undefined) found = found.slice(0, q.limit);
  const out = found.map((r) => project(r, q.select));
  if (q.mode === "maybe") {
    if (out.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
    return { data: out[0] ?? null, error: null };
  }
  if (q.mode === "single") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: "PGRST116", message: "not single" } };
  return { data: out, error: null };
}

// ─── RPC'ler ─────────────────────────────────────────────────────────────────

export function execRpc(store: FakeStore, fn: string, args: Record<string, unknown>): { data: unknown; error: FakeErr } {
  store.log.push({ table: `rpc:${fn}`, op: "rpc", select: "", via: "client" });
  if (fn === "touch_active_session") {
    const uid = store.sessions.get(String(args.p_token ?? ""));
    return { data: uid ?? null, error: null };
  }
  if (fn === "auth_rate_limit_hit") {
    if (store.disableRateLimit) return { data: { allowed: true, retry_after: 0 }, error: null };
    const b = String(args.p_bucket);
    const n = (store.rateCounters.get(b) ?? 0) + 1;
    store.rateCounters.set(b, n);
    const allowed = n <= Number(args.p_limit);
    return { data: { allowed, retry_after: allowed ? 0 : 10 }, error: null };
  }
  if (fn === "astro_profile_create") {
    const tenant = String(args.p_tenant_id);
    if (args.p_client_id) {
      const ok = (store.tables.clients ?? []).some((c) => c.id === args.p_client_id && c.tenant_id === tenant);
      if (!ok) return { data: null, error: { code: "23503", message: "insert or update violates foreign key constraint astro_bp_client_fk" } };
    }
    const pid = genId();
    store.tables.astro_birth_profiles ??= [];
    store.tables.astro_birth_profile_revisions ??= [];
    const now = new Date().toISOString();
    store.tables.astro_birth_profiles.push({
      id: pid,
      tenant_id: tenant,
      client_id: args.p_client_id ?? null,
      label: String(args.p_label).trim(),
      current_revision: 1,
      created_by_user_id: args.p_user_id,
      created_at: now,
      updated_at: now,
    });
    store.tables.astro_birth_profile_revisions.push(revisionRow(tenant, pid, 1, args, now));
    return { data: { profile_id: pid, revision: 1 }, error: null };
  }
  if (fn === "astro_profile_append_revision") {
    const tenant = String(args.p_tenant_id);
    const p = (store.tables.astro_birth_profiles ?? []).find((x) => x.id === args.p_profile_id && x.tenant_id === tenant);
    if (!p) return { data: null, error: { code: "P0002", message: "ASTRO_PROFILE_NOT_FOUND" } };
    if (p.current_revision !== args.p_expected_revision) return { data: null, error: { code: "40001", message: "ASTRO_REVISION_CONFLICT" } };
    const next = Number(p.current_revision) + 1;
    const now = new Date().toISOString();
    store.tables.astro_birth_profile_revisions.push({ ...revisionRow(tenant, String(p.id), next, args, now), change_note: args.p_change_note ?? null });
    p.current_revision = next;
    p.updated_at = now;
    return { data: { profile_id: p.id, revision: next }, error: null };
  }
  return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } };
}

function revisionRow(tenant: string, pid: string, revision: number, a: Record<string, unknown>, now: string): Row {
  return {
    id: genId(),
    tenant_id: tenant,
    profile_id: pid,
    revision,
    birth_date: a.p_birth_date,
    birth_time: a.p_birth_time ?? null,
    time_known: a.p_time_known,
    time_accuracy: a.p_time_accuracy,
    location_id: a.p_location_id ?? null,
    location_label: a.p_location_label,
    latitude: a.p_latitude,
    longitude: a.p_longitude,
    timezone: a.p_timezone,
    dst_choice: a.p_dst_choice,
    utc_offset_seconds: a.p_utc_offset_seconds,
    birth_utc: a.p_birth_utc,
    change_note: null,
    created_by_user_id: a.p_user_id,
    created_at: now,
  };
}

// ─── 1) Nesne API (servis testleri) ──────────────────────────────────────────

export function createFakeClient(store: FakeStore) {
  function from(table: string) {
    const q: Query = { table, op: "select", select: "*", filters: [], mode: "many" };
    const b = {
      select(cols?: string) {
        if (cols) q.select = cols;
        return b;
      },
      insert(p: Row | Row[]) {
        q.op = "insert";
        q.payload = p;
        q.select = "";
        return b;
      },
      update(p: Row) {
        q.op = "update";
        q.payload = p;
        return b;
      },
      delete() {
        q.op = "delete";
        return b;
      },
      eq(col: string, val: unknown) {
        q.filters.push({ col, op: "eq", val });
        return b;
      },
      in(col: string, vals: unknown[]) {
        q.filters.push({ col, op: "in", val: vals });
        return b;
      },
      order(col: string, o?: { ascending?: boolean }) {
        q.orderBy = { col, asc: o?.ascending !== false };
        return b;
      },
      limit(n: number) {
        q.limit = n;
        return b;
      },
      maybeSingle() {
        q.mode = "maybe";
        return b;
      },
      single() {
        q.mode = "single";
        return b;
      },
      then<T>(res: (v: { data: unknown; error: FakeErr }) => T, rej?: (e: unknown) => T) {
        try {
          return Promise.resolve(execQuery(store, q, "client")).then(res, rej);
        } catch (e) {
          return rej ? Promise.resolve(rej(e)) : Promise.reject(e);
        }
      },
    };
    return b;
  }
  const rpc = (fn: string, args: Record<string, unknown>) => Promise.resolve(execRpc(store, fn, args));
  return { from, rpc } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// ─── 2) HTTP (PostgREST + sahte Roxy) fetch shim'i ───────────────────────────

export type FakeRoxyHandler = (req: { url: string; headers: Headers; body: Record<string, unknown> }) => Promise<Response> | Response;

function parseInList(v: string): string[] {
  const inner = v.replace(/^\(/, "").replace(/\)$/, "");
  return inner.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
}

function headerGet(h: HeadersInit | undefined, name: string): string | null {
  if (!h) return null;
  return new Headers(h).get(name);
}

export function installFetchShim(opts: { store: FakeStore; supabaseUrl: string; roxyBase: string; roxy: FakeRoxyHandler }) {
  const original = globalThis.fetch;
  const shim = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined));
    const method = (init.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    const bodyText = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";

    if (urlStr.startsWith(opts.roxyBase)) {
      return opts.roxy({ url: urlStr, headers, body: bodyText ? JSON.parse(bodyText) : {} });
    }
    if (!urlStr.startsWith(opts.supabaseUrl)) {
      throw new Error(`fetch shim: beklenmeyen dış istek engellendi (${new URL(urlStr).host})`);
    }
    return handlePostgrest(opts.store, urlStr, method, headers, bodyText);
  };
  globalThis.fetch = shim as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** PostgREST HTTP isteğini depoya uygular (fetch shim + yerel geliştirme sunucusu ortak). */
export function handlePostgrest(store: FakeStore, urlStr: string, method: string, headers: Headers, bodyText: string): Response {
  const opts = { store };
  const u = new URL(urlStr);
  const path = u.pathname.replace(/^\/rest\/v1\//, "");
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  if (path.startsWith("rpc/")) {
    const r = execRpc(opts.store, path.slice(4), bodyText ? JSON.parse(bodyText) : {});
    opts.store.log[opts.store.log.length - 1].via = "http";
    if (r.error) return json(400, r.error);
    return json(200, r.data);
  }

  const table = path;
  const q: Query = { table, op: "select", select: u.searchParams.get("select") ?? "*", filters: [], mode: "many" };
  for (const [k, v] of u.searchParams.entries()) {
    if (k === "select" || k === "columns") continue;
    if (k === "order") {
      const [col, dir] = v.split(".");
      q.orderBy = { col, asc: dir !== "desc" };
      continue;
    }
    if (k === "limit") {
      q.limit = Number(v);
      continue;
    }
    if (v.startsWith("eq.")) q.filters.push({ col: k, op: "eq", val: v.slice(3) });
    else if (v.startsWith("in.")) q.filters.push({ col: k, op: "in", val: parseInList(v.slice(3)) });
    else throw new Error(`fetch shim: desteklenmeyen filtre ${k}=${v}`);
  }
  if (method === "POST") {
    q.op = "insert";
    q.payload = JSON.parse(bodyText);
  } else if (method === "PATCH") {
    q.op = "update";
    q.payload = JSON.parse(bodyText);
  } else if (method === "DELETE") {
    q.op = "delete";
  }
  const wantsObject = (headerGet(headers, "Accept") ?? "").includes("vnd.pgrst.object+json");
  if (q.op === "insert") q.mode = "many";
  const r = execQuery(opts.store, q, "http");
  if (r.error) return json(r.error.code === "23505" ? 409 : r.error.code === "PGRST116" ? 406 : 400, r.error);
  if (wantsObject) {
    const arr = Array.isArray(r.data) ? r.data : [r.data];
    if (arr.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return json(200, arr[0]);
  }
  return json(200, r.data);
}
