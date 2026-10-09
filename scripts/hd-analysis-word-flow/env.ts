/**
 * HD analiz→Word akışı — ortak test ortamı (API harness'i + gerçek tarayıcı testi).
 * Geçici embedded-postgres + PostgREST shim + Storage emülatörü; yalnız 127.0.0.1, PRODUCTION'A SIFIR TEMAS.
 * Gerçek Roxy anahtarı bu süreçte ASLA kullanılmaz.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";

const ROOT = process.cwd();
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
// Gerçek (ücretli) anahtar bu süreçte ASLA kullanılmaz.
process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
delete process.env.ROXY_API_BASE_URL;

export const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
export const FIXTURE = src("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json");
const JOURNEY_MIGRATION = src("supabase/migrations/20271010000100_hd_client_journey_link.sql");
export const HD_BUCKET = "hd-chart-images";

// Eski veri (migration/uygulama değişikliği ÖNCESİ yazılmış gibi) — birebir korunmalı.
export const TA = "0a0a0a0a-0000-4000-8000-00000000000a";
export const TB = "0b0b0b0b-0000-4000-8000-00000000000b";
export const LEGACY_CLIENT = "0a0a0a0a-0000-4000-8000-0000000000c1";
export const LEGACY_MANUAL_CHART = "0a0a0a0a-0000-4000-8000-0000000000d1";
export const LEGACY_REPORT = "0a0a0a0a-0000-4000-8000-0000000000e1";
export const LEGACY_V1_REPORT = "0a0a0a0a-0000-4000-8000-0000000000e2";

const HD_DDL = `
create table public.human_design_clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, name text not null,
  birth_date date, birth_time text, birth_place text, chart_image_url text, external_chart_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  birth_location_id text, birth_location_label text, birth_timezone text, birth_latitude double precision, birth_longitude double precision
);
create table public.human_design_charts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null, client_name text,
  birth_date date, birth_time text, birth_place text, external_chart_url text, chart_image_url text,
  type_code text, authority_code text, profile_code text, definition_code text,
  active_centers jsonb not null default '[]', open_centers jsonb not null default '[]', gates jsonb not null default '[]', channels jsonb not null default '[]',
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  timezone text, source text default 'manual', input jsonb, computed_result jsonb, engine_version text, contract_version text,
  location_id text, provider text, provider_raw jsonb, input_hash text
);
create unique index hd_charts_tenant_input_hash_uidx on public.human_design_charts (tenant_id, input_hash) where input_hash is not null;
create table public.human_design_reports (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null,
  chart_id uuid references public.human_design_charts(id) on delete set null,
  title text not null default '', selected_codes text[] not null default '{}', generated_content text, edited_content text,
  report_file_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  report_kind text, snapshot jsonb, canonical_provenance jsonb, report_version int, schema_version text
);
create table public.human_design_knowledge_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, category text, title text, code text, content text,
  keywords jsonb default '[]', related_gates jsonb default '[]', related_channels jsonb default '[]', related_centers jsonb default '[]', tags jsonb default '[]',
  sort_order int default 0, is_active boolean default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  expert_notes text, origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz
);
-- "Kayıt başarısız" simülasyonu: bu isimli danışanın hesaplanmış haritası yazılamaz.
create function public.zz_fail_chart_insert() returns trigger language plpgsql as $$
begin
  if new.client_name = 'ZZ Kayıt Hatası' and new.source = 'computed' then
    raise exception 'zz simulated insert failure';
  end if;
  return new;
end $$;
create trigger zz_fail_chart_insert before insert on public.human_design_charts for each row execute function public.zz_fail_chart_insert();
insert into public.tenants(id, name) values ('${TA}', 'ZZ_FLOW_A'), ('${TB}', 'ZZ_FLOW_B');
insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ('${LEGACY_CLIENT}', '${TA}', 'ZZ Eski Manuel', '1980-01-01', '10:00');
insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, type_code, profile_code) values ('${LEGACY_MANUAL_CHART}', '${TA}', '${LEGACY_CLIENT}', 'ZZ Eski Manuel', 'manual', 'generator', '2/4');
insert into public.human_design_reports(id, tenant_id, client_id, chart_id, title, report_kind, generated_content) values ('${LEGACY_REPORT}', '${TA}', '${LEGACY_CLIENT}', '${LEGACY_MANUAL_CHART}', 'ZZ Eski Rapor', 'legacy', 'eski içerik');
insert into storage.buckets(id, name, public) values ('${HD_BUCKET}', '${HD_BUCKET}', false) on conflict do nothing;
`;
const GRANTS = `grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports, public.human_design_knowledge_records to service_role;`;

// ─── Geçerli BodyGraph PNG (renderer çıktısı oranında; sunucu doğrulamasından geçer) ───
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(b: Buffer): number { let c = 0xffffffff; for (const x of b) c = CRC_T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function makePng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0xff);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  // Ortada koyu bir blok (boş görsel değil).
  for (let y = 700; y < 1100; y++) for (let x = 400; x < 870; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 40; raw[o + 1] = 40; raw[o + 2] = 120; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
export const BODYGRAPH = `data:image/png;base64,${makePng(1271, 1800).toString("base64")}`;

export type Auth = { id?: string; token?: string };
export type Json = Record<string, unknown>;
export type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;


/** Test ortamını başlatır; uygulama ortam değişkenlerini shim'e yönlendirir. */
export async function startHdFlowEnv(opts: { port: number; dirName: string; httpPort?: number }): Promise<TestEnv> {
  const env = await startAnamnezTestEnv({
    port: opts.port,
    dirName: opts.dirName,
    httpPort: opts.httpPort,
    extraSql: [src("supabase/migrations/20270129000300_clients_create_request_id.sql"), HD_DDL, JOURNEY_MIGRATION, GRANTS],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_LOCATION_REF_SECRET = "zz-hd-flow-test-secret";
  return env;
}

export async function mkUser(su: TestEnv["su"], label: string, tenant: string, perms: Record<string, boolean>): Promise<Auth> {
  const id = randomUUID();
  const token = `zz-hdflow-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,false)`,
    [id, `ZZ_HDFLOW_${label}`, `zz.hdflow.${label.toLowerCase()}@example.test`, JSON.stringify(perms), tenant],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token };
}

/** GERÇEK route handler çağrısı (Next sunucusu olmadan). */
export async function callRoute(handler: unknown, method: string, auth: Auth, body?: unknown, query = "") {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (auth.id) headers["x-user-id"] = auth.id;
  if (auth.token) headers["x-session-token"] = auth.token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const res = await (handler as Handler)(req, { params: Promise.resolve({}) });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) return { status: res.status, json: (await res.json()) as Json, buf: null as Buffer | null, headers: res.headers };
  return { status: res.status, json: {} as Json, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

/**
 * Süreç içi dış ağ kilidi: yalnız 127.0.0.1/localhost ve sahte Roxy bodygraph (fixture, sayılır).
 * Başka her dış istek reddedilir ve `external` listesine yazılır.
 */
export function installFakeRoxy() {
  const state = { calls: 0, fail: "none" as "none" | "network", external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    if (/roxyapi\.com\/.*human-design\/bodygraph/.test(u)) {
      const key = new Headers(init?.headers).get("x-api-key") ?? new Headers(init?.headers).get("authorization") ?? "";
      if (!key.includes("zz-harness-fake-roxy-key")) state.external.push(`GERÇEK ANAHTAR?! ${u}`);
      state.calls++;
      if (state.fail === "network") throw new TypeError("fetch failed");
      return new Response(FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    }
    state.external.push(u);
    throw new Error("harness: dış ağ çağrısı yasak");
  }) as typeof fetch;
  return { state, restore: () => { globalThis.fetch = realFetch; } };
}
