/**
 * Astroloji harness — bellek-içi sahte Supabase (yalnız test). Gerçek DB'ye BAĞLANMAZ.
 *
 * İki arayüz aynı depoyu paylaşır:
 *   1) createFakeClient(store) — supabase-js benzeri nesne API (servis birim testleri).
 *   2) installFetchShim({...}) — global fetch'i yakalar: PostgREST HTTP'yi (/rest/v1/...) bu depoya,
 *      sahte Roxy base URL'ini sahte sağlayıcıya yönlendirir → GERÇEK route handler'ları +
 *      gerçek verifyAdminRequest + gerçek getServerDb ile uçtan uca çalışır.
 *
 * Kısıtlar (migration ile aynı): astro_provider_results UNIQUE(tenant_id,owner_user_id,input_hash) + PK
 * (Aşama 7A: önbellek uzman kapsamlı); astro_provider_interpretations UNIQUE(tenant_id,result_id,
 * projection_version); profil→danışan tenant FK; revizyon iyimser kilidi; Aşama 7A sahiplik FK'leri
 * (sonuç/yorum/not → aynı uzmanın profili/sonucu). Erişim günlüğü (select kolonları dahil) tutulur.
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
  astro_provider_results: [["tenant_id", "owner_user_id", "input_hash"]],
  astro_provider_interpretations: [["tenant_id", "result_id", "projection_version"]],
  astro_birth_profile_revisions: [["tenant_id", "profile_id", "revision"]],
  // Aşama 3 (20271101000200): tekillik bağlam anahtarını da içerir (astro_en_unique_ctx).
  astro_expert_notes: [["tenant_id", "owner_user_id", "profile_id", "technique", "context_key", "section_key"]],
  astro_analyses: [["tenant_id", "save_request_id"]],
  astro_analysis_notes: [["tenant_id", "analysis_id", "section_key"]],
  astro_unmapped_fields: [["provider", "endpoint", "field_path"]],
};

/** DB kolon varsayılanları (migration DEFAULT'ları) — gerçek DB davranışını taklit eder. */
const COLUMN_DEFAULTS: Record<string, Row> = {
  astro_kb_entries: { revision: 1, tags: [], source_note: null },
  astro_expert_notes: { revision: 1, context_key: "" },
  astro_provider_results: { partner_profile_id: null, partner_profile_revision: null },
  astro_birth_profiles: { current_revision: 1 },
};

const SECTION_RE = /^(overall|[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4})$/;
const FIELD_PATH_RE = /^[A-Za-z0-9_.[\]:]{1,200}$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Migration CHECK/FK kısıtlarının taklidi (testlerin sahte biçimde yeşile dönmemesi için). */
function checkRow(store: FakeStore, table: string, row: Row): FakeErr {
  if (table === "astro_expert_notes") {
    const ck = String(row.context_key ?? "");
    if (ck !== "" && !UUID_RE.test(ck)) return { code: "23514", message: "new row violates check constraint astro_en_context_chk" };
    if (!SECTION_RE.test(String(row.section_key))) return { code: "23514", message: "new row violates check constraint astro_en_section_chk" };
  }
  // Aşama 5: KB konu anahtarı CHECK'i (astro_kb_topic_chk) — tür adında rakam YOK (ör. "d9_…" reddedilir).
  if (table === "astro_kb_entries" && !(SECTION_RE.test(String(row.topic_key)) && row.topic_key !== "overall")) {
    return { code: "23514", message: "new row violates check constraint astro_kb_topic_chk" };
  }
  if (table === "astro_provider_results") {
    const a = row.partner_profile_id ?? null;
    const b = row.partner_profile_revision ?? null;
    if ((a === null) !== (b === null)) return { code: "23514", message: "new row violates check constraint astro_pr_partner_pair_chk" };
    if (a !== null && !partnerRevisionExists(store, String(row.tenant_id), String(a), Number(b))) {
      return { code: "23503", message: "insert or update violates foreign key constraint astro_pr_partner_fk" };
    }
    // Aşama 7A: sonuç ve karşı tarafı aynı uzmanın profilleri olmalı (astro_pr_owner_fk / astro_pr_partner_owner_fk).
    if (row.owner_user_id === undefined || row.owner_user_id === null) return { code: "23502", message: "null value in column owner_user_id" };
    if (!ownedProfile(store, row, row.profile_id)) return { code: "23503", message: "insert or update violates foreign key constraint astro_pr_owner_fk" };
    if (a !== null && !ownedProfile(store, row, a)) return { code: "23503", message: "insert or update violates foreign key constraint astro_pr_partner_owner_fk" };
  }
  if (table === "astro_provider_interpretations") {
    if (row.owner_user_id === undefined || row.owner_user_id === null) return { code: "23502", message: "null value in column owner_user_id" };
    const ok = (store.tables.astro_provider_results ?? []).some((r) => r.tenant_id === row.tenant_id && r.owner_user_id === row.owner_user_id && r.id === row.result_id);
    if (!ok) return { code: "23503", message: "insert or update violates foreign key constraint astro_pi_owner_fk" };
  }
  if (table === "astro_expert_notes" && !ownedProfile(store, row, row.profile_id)) {
    return { code: "23503", message: "insert or update violates foreign key constraint astro_en_owner_fk" };
  }
  return null;
}

/** Aşama 7A bileşik FK taklidi: (tenant_id, owner_user_id, profile_id) → astro_birth_profiles. */
function ownedProfile(store: FakeStore, row: Row, profileId: unknown): boolean {
  return (store.tables.astro_birth_profiles ?? []).some((p) => p.tenant_id === row.tenant_id && p.owner_user_id === row.owner_user_id && p.id === profileId);
}

function partnerRevisionExists(store: FakeStore, tenant: string, profileId: string, revision: number): boolean {
  return (store.tables.astro_birth_profile_revisions ?? []).some((r) => r.tenant_id === tenant && r.profile_id === profileId && Number(r.revision) === revision);
}

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
      const row: Row = { id: p.id ?? genId(), ...(COLUMN_DEFAULTS[q.table] ?? {}), ...p, created_at: p.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
      if (rows.some((r) => r.id === row.id) || prepared.some((r) => r.id === row.id)) {
        return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${q.table}_pkey"` } };
      }
      const ce = checkRow(store, q.table, row);
      if (ce) return { data: null, error: ce };
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
      owner_user_id: args.p_user_id,
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
    // Aşama 7A: başka uzmanın profili = yok.
    const p = (store.tables.astro_birth_profiles ?? []).find((x) => x.id === args.p_profile_id && x.tenant_id === tenant && x.owner_user_id === args.p_user_id);
    if (!p) return { data: null, error: { code: "P0002", message: "ASTRO_PROFILE_NOT_FOUND" } };
    if (p.current_revision !== args.p_expected_revision) return { data: null, error: { code: "40001", message: "ASTRO_REVISION_CONFLICT" } };
    const next = Number(p.current_revision) + 1;
    const now = new Date().toISOString();
    store.tables.astro_birth_profile_revisions.push({ ...revisionRow(tenant, String(p.id), next, args, now), change_note: args.p_change_note ?? null });
    p.current_revision = next;
    p.updated_at = now;
    return { data: { profile_id: p.id, revision: next }, error: null };
  }
  if (fn === "astro_analysis_save" || fn === "astro_analysis_save_v2") {
    const v2 = fn === "astro_analysis_save_v2";
    const tenant = String(args.p_tenant_id);
    store.tables.astro_analyses ??= [];
    store.tables.astro_analysis_notes ??= [];
    // Aşama 7A (v2): idempotency + profil yalnız AYNI uzmanın; v1 sahiplik FK'sine takılır.
    const existing = store.tables.astro_analyses.find((a) => a.tenant_id === tenant && a.save_request_id === args.p_save_request_id && (!v2 || a.owner_user_id === args.p_user_id));
    if (existing) return { data: { analysis_id: existing.id, reused: true }, error: null };
    if (store.tables.astro_analyses.some((a) => a.tenant_id === tenant && a.save_request_id === args.p_save_request_id)) {
      return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint astro_an_request_key" } };
    }
    const prof = (store.tables.astro_birth_profiles ?? []).find((x) => x.id === args.p_profile_id && x.tenant_id === tenant && (!v2 || x.owner_user_id === args.p_user_id));
    if (!prof) return { data: null, error: { code: "P0002", message: "ASTRO_PROFILE_NOT_FOUND" } };
    if (prof.owner_user_id !== args.p_user_id) return { data: null, error: { code: "23503", message: "insert or update violates foreign key constraint astro_an_owner_fk" } };
    const partnerId = v2 ? (args.p_partner_profile_id ?? null) : null;
    const partnerRev = v2 ? (args.p_partner_profile_revision ?? null) : null;
    const resultIds = v2 ? (Array.isArray(args.p_result_ids) ? (args.p_result_ids as string[]) : []) : [];
    const params = v2 ? (args.p_technique_params ?? {}) : {};
    if (v2) {
      if ((partnerId === null) !== (partnerRev === null)) return { data: null, error: { code: "23514", message: "astro_an_partner_pair_chk" } };
      if (partnerId !== null && !partnerRevisionExists(store, tenant, String(partnerId), Number(partnerRev))) {
        return { data: null, error: { code: "23503", message: "insert or update violates foreign key constraint astro_an_partner_fk" } };
      }
      if (partnerId !== null && !ownedProfile(store, { tenant_id: tenant, owner_user_id: args.p_user_id }, partnerId)) {
        return { data: null, error: { code: "23503", message: "insert or update violates foreign key constraint astro_an_partner_owner_fk" } };
      }
      if (typeof params !== "object" || Array.isArray(params) || resultIds.length > 10) return { data: null, error: { code: "23514", message: "astro_an_params_chk" } };
    }
    const notes = Array.isArray(args.p_notes) ? (args.p_notes as { section_key: string; body: string }[]) : [];
    // Atomiklik: geçersiz not → hiçbir satır yazılmaz (DB CHECK + tek işlem davranışı).
    if (notes.some((n) => !SECTION_RE.test(String(n.section_key)) || String(n.body).length > 20000)) {
      return { data: null, error: { code: "23514", message: "new row violates check constraint astro_ann_section_chk" } };
    }
    const id = genId();
    const now = new Date().toISOString();
    const include = args.p_provider_interp_included === true;
    store.tables.astro_analyses.push({
      id,
      tenant_id: tenant,
      owner_user_id: args.p_user_id,
      profile_id: args.p_profile_id,
      profile_revision: args.p_profile_revision,
      client_id: prof.client_id ?? null,
      result_id: v2 ? (resultIds.length === 1 ? resultIds[0] : null) : (args.p_result_id ?? null),
      result_ids: [...resultIds],
      partner_profile_id: partnerId,
      partner_profile_revision: partnerRev,
      technique_params: structuredClone(params),
      technique: args.p_technique,
      title: String(args.p_title).trim(),
      event_kind: "astrology.analysis.saved",
      analysis_at: now,
      save_request_id: args.p_save_request_id,
      profile_snapshot: structuredClone(args.p_profile_snapshot),
      method_snapshot: structuredClone(args.p_method_snapshot),
      technical_snapshot: structuredClone(args.p_technical_snapshot),
      provider_interp_included: include,
      provider_interp_snapshot: include ? structuredClone(args.p_provider_interp_snapshot) : null,
      kb_snapshot: structuredClone(args.p_kb_snapshot ?? []),
      versions_snapshot: structuredClone(args.p_versions_snapshot),
      created_at: now,
    });
    for (const n of notes) store.tables.astro_analysis_notes.push({ id: genId(), tenant_id: tenant, analysis_id: id, section_key: n.section_key, body: n.body, created_at: now });
    return { data: { analysis_id: id, reused: false }, error: null };
  }
  if (fn === "astro_unmapped_touch") {
    store.tables.astro_unmapped_fields ??= [];
    const paths = (Array.isArray(args.p_paths) ? (args.p_paths as string[]) : []).slice(0, 200);
    if (paths.some((x) => !FIELD_PATH_RE.test(x))) return { data: null, error: { code: "23514", message: "astro_uf_path_chk" } };
    const now = new Date().toISOString();
    for (const x of paths) {
      const row = store.tables.astro_unmapped_fields.find((r) => r.provider === args.p_provider && r.endpoint === args.p_endpoint && r.field_path === x);
      if (row) {
        row.last_seen_at = now;
        row.seen_count = Number(row.seen_count) + 1;
      } else {
        store.tables.astro_unmapped_fields.push({ id: genId(), provider: args.p_provider, endpoint: args.p_endpoint, field_path: x, first_seen_at: now, last_seen_at: now, seen_count: 1, classification: "unclassified", classified_at: null });
      }
    }
    return { data: paths.length, error: null };
  }
  return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } };
}

function revisionRow(tenant: string, pid: string, revision: number, a: Record<string, unknown>, now: string): Row {
  return {
    id: genId(),
    tenant_id: tenant,
    owner_user_id: a.p_user_id,
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
