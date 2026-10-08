/**
 * AŞAMA 3C — Human Design ↔ merkezî Danışan Yolculuğu entegrasyon harness'i.
 *
 * Çalıştırma: npx tsx scripts/hd-central-client/harness.ts   (npm run hd:central-client:harness)
 *
 * Ortam: geçici embedded-postgres + PostgREST shim + Storage emülatörü (scripts/anamnez/testEnv —
 * yalnız 127.0.0.1, PRODUCTION'A SIFIR TEMAS). HD tabloları prod kolonlarıyla kurulur; AŞAMA 3C
 * migration'ı (20271010000100) GERÇEK SQL olarak uygulanır. Gerçek route handler'ları çağrılır.
 * RoxyAPI ÇAĞRILMAZ (fixture + mock callRoxy; global fetch roxyapi.com'a giderse FAIL).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_KEY, ANON_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";

const ROOT = process.cwd();

// "server-only" yalnız bu süreçte boş modüle yönlendirilir (Next dışı çalıştırma; anamnez harness deseni).
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MIGRATION = src("supabase/migrations/20271010000100_hd_client_journey_link.sql");
const FIXTURE = JSON.parse(src("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json")) as Record<string, unknown>;
const HD_BUCKET = "hd-chart-images";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : "");
  }
}
const section = (s: string) => console.log(`\n[${s}]`);

// Sabit "eski veri" tenant'ı (migration ÖNCESİ yazılır → migration sonrası birebir korunmalı).
const TL = "0e0e0e0e-0000-4000-8000-00000000000a";
const LEGACY_A = "0e0e0e0e-0000-4000-8000-0000000000a1";
const LEGACY_NULL = "0e0e0e0e-0000-4000-8000-0000000000a2";

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
  -- TEST NOTU: prod'da text[]/int[]; PostgREST shim JSON dizisini PG dizisine çeviremediği için burada jsonb.
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
insert into public.tenants(id, name) values ('${TL}', 'ZZ_HD_LEGACY_TENANT');
insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values
  ('${LEGACY_A}', '${TL}', 'ZZ Eski Profil', '1980-01-01', '10:00'),
  ('${LEGACY_NULL}', NULL, 'ZZ Tenantsız Eski Profil', '1981-02-02', '11:00');
insert into public.human_design_charts(tenant_id, client_id, client_name, source, type_code) values ('${TL}', '${LEGACY_A}', 'ZZ Eski Profil', 'manual', 'generator');
insert into storage.buckets(id, name, public) values ('${HD_BUCKET}', '${HD_BUCKET}', false) on conflict do nothing;
`;
const GRANTS = `grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports to service_role;`;

type Auth = { id?: string; token?: string };
type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function main() {
  // Hiçbir dış (Roxy) ağ çağrısı olmamalı — shim (127.0.0.1) dışı fetch reddedilir ve sayılır.
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) {
      external.push(u);
      throw new Error("harness: dış ağ çağrısı yasak");
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const env: TestEnv = await startAnamnezTestEnv({ port: 54396, dirName: "hd-central-client-pgdata", extraSql: [src("supabase/migrations/20270129000300_clients_create_request_id.sql"), HD_DDL, MIGRATION, GRANTS] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_LOCATION_REF_SECRET = "zz-hd-central-test-secret";
  const su = env.su;
  const db: SupabaseClient = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  console.log(`embedded-postgres + PostgREST shim + Storage emülatörü hazır (${env.url}).`);

  try {
    // ── Seed ──────────────────────────────────────────────────────────────────
    const TA = randomUUID();
    const TB = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_HD_A'),($2,'ZZ_HD_B')`, [TA, TB]);
    const mk = async (label: string, tenant: string, perms: Record<string, boolean>, o: { role?: string; demo?: boolean } = {}) => {
      const id = randomUUID();
      const token = `zz-hdcc-${label.toLowerCase()}-${id.slice(0, 8)}`;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
         values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7)`,
        [id, `ZZ_HDCC_${label}`, `zz.hdcc.${label.toLowerCase()}@example.test`, o.role ?? "expert", JSON.stringify(perms), tenant, o.demo === true],
      );
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token } as Auth;
    };
    const U = {
      A: await mk("A", TA, { human_design: true, clients: true }),
      HDONLY: await mk("HDONLY", TA, { human_design: true }),
      NOHD: await mk("NOHD", TA, { clients: true }),
      B: await mk("B", TB, { human_design: true, clients: true }),
      DEMO: await mk("DEMO", TA, { human_design: true, clients: true }, { demo: true }),
      ADMIN: await mk("ADMIN", TA, {}, { role: "admin" }),
    };
    const ins = async (t: string, ad: string, soyad: string, dogum: string | null, telefon = "05000000000") =>
      (await su.query(`insert into public.clients(tenant_id, ad, soyad, dogum, telefon) values ($1,$2,$3,$4,$5) returning id`, [t, ad, soyad, dogum, telefon])).rows[0].id as string;
    const cAli = await ins(TA, "Ali Kaan", "Arıcı", "1990-05-10");
    const cMehmet1 = await ins(TA, "Mehmet", "Yılmaz", "1985-03-03");
    const cMehmet2 = await ins(TA, "Mehmet", "Yılmaz", "1992-08-08");
    const cNoDate = await ins(TA, "Zeynep", "Demir", null);
    const cB = await ins(TB, "Ali Kaan", "Arıcı", "1990-05-10");

    const routes = {
      picker: await import("../../app/api/hd/journey-clients/route"),
      journey: await import("../../app/api/hd/clients/journey/route"),
      hdClients: await import("../../app/api/hd/clients/route"),
      charts: await import("../../app/api/hd/charts/route"),
      upload: await import("../../app/api/hd/upload-chart-image/route"),
      cascade: await import("../../app/api/clients/[id]/cascade-delete/route"),
      preview: await import("../../app/api/clients/[id]/delete-preview/route"),
    };
    async function call(handler: unknown, method: string, auth: Auth, body?: unknown, query = "", params: Record<string, string> = {}, rawBody?: string) {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost/api/test${query}`, { method, headers, body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined) });
      const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
      let json: Json = {};
      try {
        json = (await res.clone().json()) as Json;
      } catch {
        json = {};
      }
      return { status: res.status, json };
    }
    const act = (auth: Auth, body: Json) => call(routes.journey.POST, "POST", auth, body);
    const hdRow = async (id: string) => (await su.query(`select * from public.human_design_clients where id=$1`, [id])).rows[0];
    const count = async (sql: string, p: unknown[] = []) => Number((await su.query(sql, p)).rows[0].n);

    // ── A) MIGRATION PROVASI ───────────────────────────────────────────────────
    section("A. Migration provası (gerçek SQL)");
    const leg = await hdRow(LEGACY_A);
    ok(!!leg && leg.name === "ZZ Eski Profil" && leg.journey_client_id === null, "A1 migration öncesi HD satırı aynen duruyor, journey_client_id NULL (backfill yok)");
    ok((await count(`select count(*) n from public.human_design_clients where journey_client_id is not null`)) === 0, "A2 hiçbir mevcut satıra otomatik bağlantı yazılmadı");
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1`, [LEGACY_A])) === 1, "A3 mevcut eski harita korunuyor");
    const cols = (await su.query(`select is_nullable, data_type from information_schema.columns where table_name='human_design_clients' and column_name='journey_client_id'`)).rows[0];
    ok(cols?.is_nullable === "YES" && cols?.data_type === "uuid", "A4 journey_client_id uuid NULL kabul ediyor");
    const tryUpd = async (sql: string, p: unknown[]) => {
      try {
        await su.query(sql, p);
        return "ok";
      } catch (e) {
        return (e as { code?: string }).code ?? "err";
      }
    };
    const tmpA = (await su.query(`insert into public.human_design_clients(tenant_id, name) values ($1,'ZZ tmp') returning id`, [TA])).rows[0].id as string;
    ok((await tryUpd(`update public.human_design_clients set journey_client_id=$1 where id=$2`, [cMehmet1, tmpA])) === "ok", "A5 aynı tenant'ın merkezî danışanı bağlanıyor");
    const tmpA2 = (await su.query(`insert into public.human_design_clients(tenant_id, name) values ($1,'ZZ tmp2') returning id`, [TA])).rows[0].id as string;
    ok((await tryUpd(`update public.human_design_clients set journey_client_id=$1 where id=$2`, [cMehmet1, tmpA2])) === "23505", "A6 aynı merkezî danışana ikinci HD profili → UNIQUE ihlali (23505)");
    ok((await tryUpd(`update public.human_design_clients set journey_client_id=$1 where id=$2`, [cB, tmpA2])) === "23503", "A7 başka tenant'ın danışanı → FK ihlali (23503)");
    ok((await tryUpd(`update public.human_design_clients set journey_client_id=$1 where id=$2`, [cAli, LEGACY_NULL])) === "23514", "A8 tenant_id NULL eski profil bağlanamaz (CHECK 23514)");
    ok((await tryUpd(`update public.human_design_clients set journey_client_id=null where id=$1`, [tmpA])) === "ok", "A9 bağlantı kaldırılabiliyor");
    await su.query(`delete from public.human_design_clients where id in ($1,$2)`, [tmpA, tmpA2]);
    ok((await tryUpd(MIGRATION, [])) === "ok", "A10 migration tekrar çalıştırılabilir (idempotent)");
    // Rollback provası (transaction içinde, sonra geri al)
    await su.query("BEGIN");
    const rollbackSql = MIGRATION.split("\n").filter((l) => /^--   (DROP|ALTER)/.test(l)).map((l) => l.replace(/^--\s+/, "")).join("\n");
    await su.query(rollbackSql);
    const gone = (await su.query(`select count(*) n from information_schema.columns where table_name='human_design_clients' and column_name='journey_client_id'`)).rows[0].n;
    await su.query("ROLLBACK");
    ok(Number(gone) === 0 && rollbackSql.includes("DROP COLUMN IF EXISTS journey_client_id"), "A11 geri alma SQL'i (başlıktaki) çalışıyor; kolon kaldırılabiliyor");
    ok(!/^\s*(UPDATE|DELETE\s+FROM\s+public\.human_design_clients|DROP TABLE|TRUNCATE)/im.test(MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/^--.*$/gm, "")), "A12 migration yalnız ekleme (UPDATE/DROP TABLE/TRUNCATE yok; DELETE yalnız trigger gövdesinde)");
    const schema = src("lib/backup/schema.generated.ts");
    ok(/human_design_clients:[^\n]*"journey_client_id"/.test(schema) && /fk\("journey_client_id", "clients", true\)/.test(src("lib/backup/registry.ts")), "A13 yedek şeması + kayıt defteri (isteğe bağlı FK) uyumlu");
    // Trigger guard: BAĞSIZ profil (tüm mevcut prod profilleri) uygulama DIŞINDAN doğrudan silinse bile
    // davranış migration öncesiyle aynı → rapor + harita SİLİNMEZ, yalnız client_id NULL (20260926000100).
    const gUn = (await su.query(`insert into public.human_design_clients(tenant_id, name) values ($1,'ZZ guard bağsız') returning id`, [TA])).rows[0].id as string;
    const gUnChart = (await su.query(`insert into public.human_design_charts(tenant_id, client_id, source) values ($1,$2,'manual') returning id`, [TA, gUn])).rows[0].id as string;
    const gUnRep = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, chart_id, title) values ($1,$2,$3,'R') returning id`, [TA, gUn, gUnChart])).rows[0].id as string;
    await su.query(`delete from public.human_design_clients where id=$1`, [gUn]);
    const gUnRows = (await su.query(`select (select client_id from public.human_design_reports where id=$1) r, (select client_id from public.human_design_charts where id=$2) c,
      (select count(*) from public.human_design_reports where id=$1)::int rn, (select count(*) from public.human_design_charts where id=$2)::int cn`, [gUnRep, gUnChart])).rows[0];
    ok(gUnRows.rn === 1 && gUnRows.cn === 1 && gUnRows.r === null && gUnRows.c === null, "A14 bağsız profil doğrudan silindi → rapor + harita KORUNDU (yalnız client_id NULL; migration öncesiyle aynı)");
    // BAĞLI profil doğrudan silinince trigger devrede → profile ait rapor + harita silinir.
    const gCli = (await su.query(`insert into public.clients(tenant_id, ad, soyad, dogum, telefon) values ($1,'ZZ','Guard','1999-09-09','05000000000') returning id`, [TA])).rows[0].id as string;
    const gLn = (await su.query(`insert into public.human_design_clients(tenant_id, name, journey_client_id) values ($1,'ZZ guard bağlı',$2) returning id`, [TA, gCli])).rows[0].id as string;
    const gLnChart = (await su.query(`insert into public.human_design_charts(tenant_id, client_id, source) values ($1,$2,'manual') returning id`, [TA, gLn])).rows[0].id as string;
    const gLnRep = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, title) values ($1,$2,'R') returning id`, [TA, gLn])).rows[0].id as string;
    await su.query(`delete from public.human_design_clients where id=$1`, [gLn]);
    ok((await count(`select count(*) n from public.human_design_reports where id=$1`, [gLnRep])) === 0 && (await count(`select count(*) n from public.human_design_charts where id=$1`, [gLnChart])) === 0
      && (await count(`select count(*) n from public.clients where id=$1`, [gCli])) === 1, "A15 bağlı profil silindi → profile ait rapor + harita silindi; merkezî danışan DURUR");
    await su.query(`delete from public.human_design_reports where id=$1`, [gUnRep]);
    await su.query(`delete from public.human_design_charts where id=$1`, [gUnChart]);
    await su.query(`delete from public.clients where id=$1`, [gCli]);

    // ── B) MERKEZÎ DANIŞAN SEÇİCİ ─────────────────────────────────────────────
    section("B. Merkezî danışan seçici");
    ok((await call(routes.picker.GET, "GET", {}, undefined, "?search=Ali")).status === 401, "B1 kimliksiz → 401");
    ok((await call(routes.picker.GET, "GET", U.NOHD, undefined, "?search=Ali")).status === 403, "B2 human_design kapalı → 403");
    const pHd = await call(routes.picker.GET, "GET", U.HDONLY, undefined, "?search=ali kaan");
    ok(pHd.status === 200, "B3 yalnız human_design izni yeterli (DY izni gerekmez) → 200");
    const rowsHd = pHd.json.rows as Json[];
    ok(rowsHd.length === 1 && rowsHd[0].id === cAli, "B4 çok kelimeli Türkçe arama doğru danışanı bulur; başka tenant'ın aynı isimli danışanı LİSTELENMEZ", rowsHd);
    ok(Object.keys(rowsHd[0]).sort().join(",") === "ad,dogum,hd_client_id,id,soyad", "B5 DTO yalnız id/ad/soyad/dogum/hd_client_id (telefon yok)", Object.keys(rowsHd[0]));
    ok((await call(routes.picker.GET, "GET", U.ADMIN, undefined, "?search=Mehmet")).json.rows instanceof Array, "B6 admin erişebilir");
    const pB = await call(routes.picker.GET, "GET", U.B, undefined, "?search=Mehmet");
    ok(pB.status === 200 && (pB.json.rows as Json[]).length === 0, "B7 tenant B, A'nın danışanlarını göremez");
    ok((await call(routes.picker.GET, "GET", U.A, undefined, `?search=Ali&tenant_id=${TB}`)).json.rows instanceof Array && !((await call(routes.picker.GET, "GET", U.A, undefined, `?search=Ali&tenant_id=${TB}`)).json.rows as Json[]).some((r) => r.id === cB), "B8 istemciden tenant_id kabul edilmez");
    ok((await call(routes.picker.GET, "GET", U.DEMO, undefined, "?search=Ali")).status === 200, "B9 demo salt okuma yapabilir");
    ok((await call(routes.picker.GET, "GET", U.A, undefined, "?search=%27%3B%20drop%20table")).status === 200, "B10 zararlı arama metni güvenli");

    // ── C) YENİ DANIŞAN + HD PROFİLİ ───────────────────────────────────────────
    section("C. Yeni danışan + HD profili (create_new)");
    const base = { action: "create_new", ad: "Ayşe", soyad: "Kaya", dogum: "1991-04-04", birth_time: "09:30", birth_location_ref: "tr-42-konya" };
    ok((await act({}, base)).status === 401, "C1 kimliksiz → 401");
    ok((await act(U.NOHD, base)).status === 403, "C2 human_design kapalı → 403");
    ok((await act(U.DEMO, base)).status === 403, "C3 demo yazamaz → 403");
    ok((await call(routes.journey.POST, "POST", U.A, undefined, "", {}, "{bozuk")).status === 400, "C4 bozuk JSON → 400");
    ok((await act(U.A, { action: "yok" })).status === 400, "C5 bilinmeyen işlem → 400");
    ok((await act(U.A, { ...base, ad: "" })).status === 400, "C6 ad zorunlu");
    ok((await act(U.A, { ...base, soyad: "  " })).status === 400, "C7 soyad zorunlu");
    ok((await act(U.A, { ...base, dogum: "" })).status === 400, "C8 doğum tarihi zorunlu");
    ok((await act(U.A, { ...base, dogum: "2999-01-01" })).status === 400, "C9 gelecek tarih reddedilir");
    ok((await act(U.A, { ...base, birth_time: "" })).status === 400 && (await act(U.A, { ...base, birth_time: "25:99" })).status === 400, "C10 doğum saati zorunlu/geçerli");
    ok((await act(U.A, { ...base, birth_location_ref: "" })).status === 400 && (await act(U.A, { ...base, birth_location_ref: "rx1.sahte.imza" })).status === 400, "C11 doğum yeri listeden seçilmeli (sahte referans reddedilir)");
    const clientsBefore = await count(`select count(*) n from public.clients where tenant_id=$1`, [TA]);
    const rid = randomUUID();
    const c1 = await act(U.A, { ...base, request_id: rid, tenant_id: TB });
    ok(c1.status === 200 && typeof c1.json.hd_client_id === "string" && typeof c1.json.journey_client_id === "string", "C12 merkezî danışan + HD profili oluştu", c1.json);
    const newJ = String(c1.json.journey_client_id);
    const newH = String(c1.json.hd_client_id);
    const jr = (await su.query(`select * from public.clients where id=$1`, [newJ])).rows[0];
    ok(jr.tenant_id === TA && jr.ad === "Ayşe" && jr.soyad === "Kaya" && jr.dogum === "1991-04-04" && !!jr.burc, "C13 merkezî kayıt tenant A'da (gövdedeki tenant_id YOK SAYILDI), ad/soyad/dogum/burç doğru");
    const hr = await hdRow(newH);
    ok(hr.tenant_id === TA && hr.journey_client_id === newJ && hr.name === "Ayşe Kaya" && hr.birth_time === "09:30" && hr.birth_timezone === "Europe/Istanbul" && hr.birth_location_id === "tr-42-konya", "C14 HD profili bağlı; ad = 'Ad Soyad'; tz/konum sunucuda çözüldü", hr);
    const c1b = await act(U.A, { ...base, request_id: rid });
    ok(c1b.status === 200 && c1b.json.hd_client_id === newH && c1b.json.journey_client_id === newJ, "C15 aynı request_id tekrarı → aynı kayıt (çift danışan yok)");
    const rid2 = randomUUID();
    const conc = await Promise.all([1, 2, 3].map(() => act(U.A, { ...base, ad: "Eşzamanlı", request_id: rid2 })));
    const ids = new Set(conc.map((r) => r.json.hd_client_id));
    ok(conc.every((r) => r.status === 200) && ids.size === 1, "C16 eşzamanlı 3 aynı istek → tek profil", conc.map((r) => r.json));
    ok((await count(`select count(*) n from public.clients where tenant_id=$1`, [TA])) === clientsBefore + 2, "C17 toplam 2 yeni merkezî danışan (tekrarlar ek kayıt üretmedi)");

    // ── D) MEVCUT MERKEZÎ DANIŞAN İÇİN PROFİL ──────────────────────────────────
    section("D. Mevcut danışan için HD profili (create_for_existing)");
    const fe = { action: "create_for_existing", journey_client_id: cAli, birth_time: "14:15", birth_location_ref: "tr-34-istanbul" };
    const d1 = await act(U.HDONLY, fe);
    ok(d1.status === 200 && d1.json.journey_client_id === cAli, "D1 DY izni olmadan (yalnız HD) profil oluşturulabilir", d1.json);
    const hAli = String(d1.json.hd_client_id);
    const hAliRow = await hdRow(hAli);
    ok(hAliRow.birth_date === "1990-05-10" && hAliRow.name === "Ali Kaan Arıcı", "D2 doğum tarihi + ad merkezî kayıttan");
    ok((await su.query(`select dogum, telefon from public.clients where id=$1`, [cAli])).rows[0].dogum === "1990-05-10", "D3 merkezî kayıt değişmedi");
    const d4 = await act(U.A, fe);
    ok(d4.status === 409 && d4.json.hd_client_id === hAli, "D4 ikinci profil → 409 + mevcut profil kimliği");
    ok((await act(U.A, { ...fe, journey_client_id: cB })).status === 404, "D5 başka tenant'ın danışanı → 404 (varlık sızmaz)");
    ok((await act(U.A, { ...fe, journey_client_id: "not-a-uuid" })).status === 400, "D6 bozuk kimlik → 400");
    ok((await act(U.A, { ...fe, journey_client_id: cNoDate })).status === 400, "D7 merkezî doğum tarihi yoksa formdan istenir");
    const d8 = await act(U.A, { ...fe, journey_client_id: cNoDate, birth_date: "1995-06-06" });
    ok(d8.status === 200 && (await su.query(`select dogum from public.clients where id=$1`, [cNoDate])).rows[0].dogum === null, "D8 formdaki tarih yalnız HD'ye yazılır; merkezî kayda YAZILMAZ");

    // ── E) ESKİ HD PROFİLİ BAĞLAMA ─────────────────────────────────────────────
    section("E. Eski HD profili bağlama (otomatik eşleştirme YOK)");
    const legacy1 = (await su.query(`insert into public.human_design_clients(tenant_id, name, birth_date, birth_time) values ($1,'Mehmet Yılmaz','1985-03-03','08:00') returning id`, [TA])).rows[0].id as string;
    const legacy2 = (await su.query(`insert into public.human_design_clients(tenant_id, name, birth_date, birth_time) values ($1,'Tek Kelime','1970-01-01','08:00') returning id`, [TA])).rows[0].id as string;
    const legacy3 = (await su.query(`insert into public.human_design_clients(tenant_id, name, birth_date) values ($1,'Yarış Bir','1970-01-01') returning id`, [TA])).rows[0].id as string;
    const legacy4 = (await su.query(`insert into public.human_design_clients(tenant_id, name, birth_date) values ($1,'Yarış İki','1970-01-01') returning id`, [TA])).rows[0].id as string;
    const legacyB = (await su.query(`insert into public.human_design_clients(tenant_id, name, birth_date) values ($1,'ZZ B Profil','1970-01-01') returning id`, [TB])).rows[0].id as string;
    await su.query(`insert into public.human_design_charts(tenant_id, client_id, client_name, source) values ($1,$2,'Mehmet Yılmaz','manual')`, [TA, legacy1]);
    const g1 = await call(routes.hdClients.GET, "GET", U.A, undefined, `?id=${legacy1}`);
    const sug = g1.json.journey_suggestions as Json[];
    ok(g1.status === 200 && g1.json.journey === null && sug.length === 1 && sug[0].id === cMehmet1, "E1 birebir ad+soyad+doğum eşleşmesi yalnız ÖNERİ (aynı isimli diğer Mehmet önerilmez)", g1.json);
    ok((await hdRow(legacy1)).journey_client_id === null, "E2 öneri OTOMATİK bağlanmadı");
    ok((await call(routes.hdClients.GET, "GET", U.A, undefined, `?id=${legacy2}`)).json.journey_suggestions instanceof Array, "E3 bağlanmamış eski profil çalışmaya devam ediyor (okunuyor)");
    ok((await act(U.A, { action: "link_existing", hd_client_id: legacy1, journey_client_id: cB })).status === 404, "E4 başka tenant'ın danışanına bağlanamaz → 404");
    ok((await act(U.A, { action: "link_existing", hd_client_id: legacyB, journey_client_id: cMehmet1 })).status === 404, "E5 başka tenant'ın HD profili → 404");
    ok((await act(U.DEMO, { action: "link_existing", hd_client_id: legacy1, journey_client_id: cMehmet1 })).status === 403, "E6 demo bağlayamaz");
    const e7 = await act(U.A, { action: "link_existing", hd_client_id: legacy1, journey_client_id: cMehmet1 });
    ok(e7.status === 200 && (await hdRow(legacy1)).journey_client_id === cMehmet1, "E7 uzman onayıyla bağlandı");
    ok((await act(U.A, { action: "link_existing", hd_client_id: legacy1, journey_client_id: cMehmet1 })).status === 200, "E8 aynı bağlantı tekrarı idempotent");
    ok((await act(U.A, { action: "link_existing", hd_client_id: legacy2, journey_client_id: cMehmet1 })).status === 409, "E9 başka profile bağlı danışana bağlama → 409");
    ok((await act(U.A, { action: "link_existing", hd_client_id: legacy1, journey_client_id: cMehmet2 })).status === 409, "E10 zaten bağlı profil başka danışana bağlanamaz → 409");
    const race = await Promise.all([legacy3, legacy4].map((h) => act(U.A, { action: "link_existing", hd_client_id: h, journey_client_id: cMehmet2 })));
    ok(race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 1, "E11 eşzamanlı çift bağlama → biri 200, diğeri 409 (DB UNIQUE)", race.map((r) => r.status));
    const raceErr = race.find((r) => r.status === 409)!;
    ok(!/duplicate|constraint|violates|23505/i.test(String(raceErr.json.error)), "E12 ham DB hatası kullanıcıya dönmez", raceErr.json);
    ok((await act(U.A, { action: "link_new", hd_client_id: legacy2, ad: "Tek", soyad: "" })).status === 400, "E13 yeni merkezî danışan: soyad zorunlu");
    const e14 = await act(U.A, { action: "link_new", hd_client_id: legacy2, ad: "Tek", soyad: "Kelime", request_id: randomUUID() });
    const l2 = await hdRow(legacy2);
    const nj = (await su.query(`select * from public.clients where id=$1`, [l2.journey_client_id])).rows[0];
    ok(e14.status === 200 && nj && nj.ad === "Tek" && nj.soyad === "Kelime" && nj.dogum === "1970-01-01" && nj.tenant_id === TA, "E14 eski profil için yeni merkezî danışan; doğum tarihi profilden");
    const nullTen = await call(routes.hdClients.GET, "GET", U.A, undefined, `?id=${LEGACY_NULL}`);
    ok(nullTen.status === 404 && (await act(U.A, { action: "link_existing", hd_client_id: LEGACY_NULL, journey_client_id: cNoDate })).status === 404, "E15 tenant_id NULL eski profil: görünmez/bağlanamaz (anlaşılır 404, veri değişmez)");
    ok((await hdRow(LEGACY_NULL)).journey_client_id === null && (await hdRow(LEGACY_NULL)).name === "ZZ Tenantsız Eski Profil", "E16 NULL-tenant satır aynen korunuyor");
    const e17 = await act(U.A, { action: "unlink", hd_client_id: legacy1 });
    ok(e17.status === 200 && (await hdRow(legacy1)).journey_client_id === null && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [legacy1])) === 1, "E17 bağlantı kaldırma HD analizini SİLMEZ");
    await act(U.A, { action: "link_existing", hd_client_id: legacy1, journey_client_id: cMehmet1 });

    // ── F) DOĞUM TARİHİ UYUŞMAZLIĞI ────────────────────────────────────────────
    section("F. Doğum tarihi uyuşmazlığı (merkezî → HD, tek yön)");
    await su.query(`update public.human_design_clients set birth_date='1985-03-04' where id=$1`, [legacy1]);
    const chartBefore = (await su.query(`select birth_date from public.human_design_charts where client_id=$1`, [legacy1])).rows[0];
    const g2 = await call(routes.hdClients.GET, "GET", U.A, undefined, `?id=${legacy1}`);
    ok((g2.json.journey as Json).dogum === "1985-03-03" && (g2.json.row as Json).birth_date === "1985-03-04", "F1 GET iki tarihi de döndürür (uyarı için)");
    ok((await hdRow(legacy1)).birth_date === "1985-03-04", "F2 kullanıcı onayı olmadan HD tarihi DEĞİŞMEZ");
    const f3 = await act(U.A, { action: "sync_birth_date", hd_client_id: legacy1 });
    ok(f3.status === 200 && f3.json.birth_date === "1985-03-03" && (await hdRow(legacy1)).birth_date === "1985-03-03", "F3 'HD bilgisini güncelle' → HD tarihi merkezî tarihle güncellendi");
    ok((await su.query(`select dogum from public.clients where id=$1`, [cMehmet1])).rows[0].dogum === "1985-03-03", "F4 merkezî kayıt DEĞİŞMEDİ");
    ok(JSON.stringify((await su.query(`select birth_date from public.human_design_charts where client_id=$1`, [legacy1])).rows[0]) === JSON.stringify(chartBefore), "F5 mevcut analiz (hesap anı kaydı) DEĞİŞMEDİ");
    ok((await act(U.A, { action: "sync_birth_date", hd_client_id: legacy4 })).status !== 500, "F6 bağlantısız profil senkronu güvenli hata");
    const unlinkedOne = (await hdRow(legacy3)).journey_client_id ? legacy4 : legacy3;
    ok((await act(U.A, { action: "sync_birth_date", hd_client_id: unlinkedOne })).status === 409, "F7 bağlı olmayan profilde senkron → 409");

    // ── G) ROXY REGRESYONU (mock; gerçek çağrı yok) ────────────────────────────
    section("G. Roxy regresyonu (idempotency korunur)");
    const { computeRoxyChart } = await import("../../lib/human-design/api/roxyChartService");
    const { getChartSystemReading } = await import("../../lib/human-design/api/systemReadingService");
    const calls: unknown[] = [];
    const deps = {
      config: { apiKey: "zz-not-a-real-key", baseUrl: "https://roxyapi.com/api/v2" },
      callRoxy: async (_c: unknown, body: unknown) => {
        calls.push(body);
        return { ok: true as const, raw: JSON.parse(JSON.stringify(FIXTURE)) };
      },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      sleep: async () => undefined,
      log: () => undefined,
    };
    const ctx = { db, tenantId: TA, userId: U.A.id!, isDemo: false };
    const g1r = await computeRoxyChart(ctx, { client_id: newH, location_id: "client" }, deps as never);
    ok(g1r.status === 200 && (g1r.body as Json).reused === false && calls.length === 1, "G1 yeni merkezî danışanın HD profili: ilk hesap = 1 sağlayıcı çağrısı", g1r);
    const g2r = await computeRoxyChart(ctx, { client_id: newH, location_id: "client" }, deps as never);
    ok((g2r.body as Json).reused === true && calls.length === 1, "G2 aynı profil + aynı girdi → 0 yeni çağrı (input_hash korunuyor)");
    const chartId = String((g1r.body as Json).id);
    const chartRow = (await su.query(`select provider, provider_raw is not null as has_raw, client_id, client_name from public.human_design_charts where id=$1`, [chartId])).rows[0];
    ok(chartRow.provider === "roxyapi" && chartRow.has_raw === true && chartRow.client_id === newH && chartRow.client_name === "Ayşe Kaya", "G3 harita kaydı + provider_raw + profil bağı");
    const sr = await getChartSystemReading(db, TA, chartId);
    ok(sr.status === 200 && "available" in sr.body && sr.body.available === true, "G4 Sistem Yorumu kayıtlı veriden (0 çağrı)");
    ok(calls.length === 1, "G5 Sistem Yorumu sonrası çağrı sayısı değişmedi");
    await su.query(`update public.clients set dogum='1991-04-05' where id=$1`, [newJ]);
    await act(U.A, { action: "sync_birth_date", hd_client_id: newH });
    const g6 = await computeRoxyChart(ctx, { client_id: newH, location_id: "client" }, deps as never);
    ok((g6.body as Json).reused === false && calls.length === 2 && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [newH])) === 2, "G6 doğum tarihi güncellenince yeni girdi → yeni analiz; eski analiz KORUNUR");
    ok(external.length === 0, "G7 hiçbir dış ağ (Roxy) çağrısı yapılmadı", external);

    // ── H) MANUEL KAPANIŞ ─────────────────────────────────────────────────────
    section("H. Manuel Human Design yeni üretimin kapatılması");
    const h1 = await call(routes.charts.POST, "POST", U.A, { client_id: newH, type_code: "generator" }, "?scope=manual");
    ok(h1.status === 410 && h1.json.code === "MANUAL_CHART_CLOSED", "H1 manuel harita POST → 410");
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1 and source='manual'`, [newH])) === 0, "H2 manuel satır oluşmadı");
    ok((await call(routes.upload.POST, "POST", {}, undefined)).status === 401, "H3 görsel yükleme: kimliksiz → 401 (kapanış bilgisi sızmaz)");
    ok((await call(routes.upload.POST, "POST", U.A, {})).status === 410, "H4 yeni manuel görsel yükleme → 410");
    ok((await call(routes.hdClients.POST, "POST", U.A, { name: "Tek Alan" })).status === 410, "H5 eski tek-alanlı HD danışanı oluşturma → 410");
    const h6 = await call(routes.charts.GET, "GET", U.A, undefined, "?scope=manual");
    ok(h6.status === 200 && Array.isArray(h6.json.rows) && (h6.json.rows as Json[]).some((r) => r.client_id === legacy1), "H6 eski manuel kayıtlar okunmaya devam ediyor");

    // ── I) DY HUMAN DESIGN SEKMESİ ─────────────────────────────────────────────
    section("I. Danışan Yolculuğu Human Design sekmesi");
    const i1 = await call(routes.journey.GET, "GET", U.A, undefined, `?journey_client_id=${newJ}`);
    const an = i1.json.analyses as Json[];
    ok(i1.status === 200 && (i1.json.profile as Json).id === newH && an.length === 2 && an.every((a) => a.kind === "roxy"), "I1 bağlı profilin birden fazla analizi listelenir", i1.json);
    ok(String(an[0].created_at) >= String(an[1].created_at), "I2 tarih sırası (yeni → eski)");
    ok(!JSON.stringify(i1.json).includes("provider_raw") && !JSON.stringify(i1.json).includes("computed_result") && !JSON.stringify(i1.json).includes("latitude"), "I3 özet: provider_raw/computed_result/koordinat YOK");
    ok((await call(routes.journey.GET, "GET", U.A, undefined, `?journey_client_id=${cMehmet2}`)).status === 200, "I4 bağlı danışan (eski profil) erişilebilir");
    const i5 = await call(routes.journey.GET, "GET", U.A, undefined, `?journey_client_id=${(await ins(TA, "Boş", "Danışan", "2000-01-01"))}`);
    ok(i5.status === 200 && i5.json.profile === null, "I5 HD'si olmayan danışan → profile null");
    ok((await call(routes.journey.GET, "GET", U.A, undefined, `?journey_client_id=${cB}`)).status === 404, "I6 başka tenant → 404");
    ok((await call(routes.journey.GET, "GET", U.NOHD, undefined, `?journey_client_id=${newJ}`)).status === 403, "I7 human_design izni yok → 403");
    const tabs = src("lib/danisan/clientDetailTabs.ts");
    ok(/id: "humandesign", labelKey: "humandesign"[^}]*requiresModule: "human_design"/.test(tabs), "I8 sekme yalnız human_design izniyle görünür");

    // ── J) KALICI DANIŞAN SİLME ────────────────────────────────────────────────
    section("J. Kalıcı danışan silme (HD verisi dahil)");
    const X = await ins(TA, "Silinecek", "Kişi", "1980-01-01");
    const Y = await ins(TA, "Kalacak", "Kişi", "1981-01-01");
    const Z = await ins(TB, "Diğer", "Tenant", "1982-01-01");
    const prof = async (t: string, j: string | null, name: string) =>
      (await su.query(`insert into public.human_design_clients(tenant_id, name, birth_date, journey_client_id, chart_image_url) values ($1,$2,'1980-01-01',$3,$4) returning id`, [t, name, j, null])).rows[0].id as string;
    const PX = await prof(TA, X, "Silinecek Kişi");
    const PY = await prof(TA, Y, "Kalacak Kişi");
    const PZ = await prof(TB, Z, "Diğer Tenant");
    const PL = await prof(TA, null, "Bağlantısız");
    const chart = async (t: string, c: string, raw: boolean) =>
      (await su.query(`insert into public.human_design_charts(tenant_id, client_id, client_name, source, provider, provider_raw) values ($1,$2,'x',$3,$4,$5) returning id`, [t, c, raw ? "computed" : "manual", raw ? "roxyapi" : null, raw ? JSON.stringify({ typeDescription: "kişisel" }) : null])).rows[0].id as string;
    const cx1 = await chart(TA, PX, true);
    await chart(TA, PX, false);
    await chart(TA, PY, true);
    await chart(TB, PZ, true);
    await chart(TA, PL, true);
    const snapPath = `${TA}/report-snapshots/${randomUUID()}.png`;
    await su.query(`insert into public.human_design_reports(tenant_id, client_id, chart_id, title, report_kind, snapshot) values ($1,$2,$3,'R','canonical',$4)`, [TA, PX, cx1, JSON.stringify({ chartImage: { storagePath: snapPath } })]);
    await su.query(`insert into public.human_design_reports(tenant_id, client_id, title) values ($1,$2,'RY')`, [TA, PY]);
    const bucket = env.storage.objects.get(HD_BUCKET) ?? new Map();
    env.storage.objects.set(HD_BUCKET, bucket);
    const put = (p: string) => bucket.set(p, { bytes: Buffer.from("x"), contentType: "image/png", createdAt: Date.now() });
    [`${TA}/${PX}/a.png`, snapPath, `${TA}/${PY}/b.png`, `${TB}/${PZ}/c.png`, `${TA}/${PL}/d.png`].forEach(put);

    const pv = await call(routes.preview.GET, "GET", U.A, undefined, "", { id: X });
    const pc = Object.fromEntries((pv.json.counts as { key: string; count: number }[]).map((c) => [c.key, c.count]));
    ok(pv.status === 200 && pc.hdProfiles === 1 && pc.hdCharts === 2 && pc.hdReports === 1, "J1 ön izleme bağlı HD sayılarını doğru gösterir", pc);
    ok(!(pv.json.unlinkedModules as string[]).includes("Human Design"), "J2 ön izleme artık HD'yi 'bağlı değil' saymıyor");
    const tr = JSON.parse(src("messages/tr/clients.detail.json")).clients.detail;
    ok(tr.delete.hdWarning === "Bu danışana bağlı Human Design profili ve Human Design analizleri de kalıcı olarak silinecek." && src("app/dashboard/clients/[id]/page.tsx").includes('t("delete.hdWarning")'), "J3 onay metninde açık HD uyarısı");
    ok(/requireText: clientName \|\| "SİL"/.test(src("app/dashboard/clients/[id]/page.tsx")), "J4 isim yazarak onay katmanı KORUNDU");
    ok((await call(routes.cascade.DELETE, "DELETE", U.HDONLY, undefined, "", { id: X })).status === 403, "J5 DY izni olmayan kalıcı silemez");
    ok((await call(routes.cascade.DELETE, "DELETE", U.B, undefined, "", { id: X })).status === 403, "J6 başka tenant silemez");
    ok((await call(routes.cascade.DELETE, "DELETE", U.DEMO, undefined, "", { id: X })).status !== 200, "J7 demo silemez");
    env.storage.failList = true;
    const failClosed = await call(routes.cascade.DELETE, "DELETE", U.A, undefined, "", { id: X });
    env.storage.failList = false;
    ok(failClosed.status === 502 && (await count(`select count(*) n from public.clients where id=$1`, [X])) === 1 && !!(await hdRow(PX)), "J8 HD storage doğrulanamazsa FAIL-CLOSED (hiçbir şey silinmez)");
    const del = await call(routes.cascade.DELETE, "DELETE", U.A, undefined, "", { id: X });
    ok(del.status === 200 && del.json.ok === true, "J9 kalıcı silme başarılı", del.json);
    ok((await count(`select count(*) n from public.clients where id=$1`, [X])) === 0 && !(await hdRow(PX)), "J10 merkezî danışan + bağlı HD profili silindi");
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1 or id=$2`, [PX, cx1])) === 0, "J11 profile ait TÜM analizler (provider_raw dahil) silindi — sahipsiz kalmadı");
    ok((await count(`select count(*) n from public.human_design_reports where client_id=$1 or chart_id=$2`, [PX, cx1])) === 0 && (await count(`select count(*) n from public.human_design_reports where client_id is null and title='R'`)) === 0, "J12 profile ait rapor silindi (SET NULL ile yetim kalmadı)");
    ok(!bucket.has(`${TA}/${PX}/a.png`) && !bucket.has(snapPath), "J13 profil görseli + rapor snapshot görseli storage'dan silindi");
    ok(!!(await hdRow(PY)) && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [PY])) === 1 && (await count(`select count(*) n from public.human_design_reports where client_id=$1`, [PY])) === 1 && bucket.has(`${TA}/${PY}/b.png`), "J14 aynı tenant'taki BAŞKA danışanın HD verisi dokunulmadı");
    ok(!!(await hdRow(PZ)) && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [PZ])) === 1 && bucket.has(`${TB}/${PZ}/c.png`), "J15 başka tenant'ın HD verisi dokunulmadı");
    ok(!!(await hdRow(PL)) && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [PL])) === 1 && bucket.has(`${TA}/${PL}/d.png`), "J16 bağlantısız HD profili dokunulmadı");
    const noHd = await ins(TA, "HDsiz", "Danışan", "1999-01-01");
    ok((await call(routes.cascade.DELETE, "DELETE", U.A, undefined, "", { id: noHd })).status === 200, "J17 HD'si olmayan danışan silme aynen çalışıyor");

    // ── K) MEVCUT HD DANIŞAN SİLME AKIŞI KORUNDU ──────────────────────────────
    section("K. Mevcut HD danışan silme (raporlar korunur)");
    const { deleteHdClient } = await import("../../lib/human-design/api/clientPersistence");
    await su.query(`insert into public.human_design_reports(tenant_id, client_id, title) values ($1,$2,'KORU')`, [TA, PY]);
    const k1 = await deleteHdClient(db, TA, PY);
    ok(k1.ok === true && !(await hdRow(PY)), "K1 HD profili silindi", k1);
    ok((await count(`select count(*) n from public.human_design_reports where title in ('KORU','RY') and client_id is null`)) === 2, "K2 raporlar KORUNDU (bağ koparıldı) — trigger bu akışı bozmadı");
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1`, [PY])) === 0, "K3 profilin haritaları silindi (önceki davranış)");
    ok((await count(`select count(*) n from public.clients where id=$1`, [Y])) === 1, "K4 merkezî danışan HD profili silinince SİLİNMEZ");

    // ── L) STATİK / KAPSAM ─────────────────────────────────────────────────────
    section("L. Statik kontroller / kapsam kilidi");
    const hub = src("app/human-design/page.tsx");
    const cards = [...hub.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    ok(cards.join("|") === "Human Design Hesaplama|Bilgi Bankası", "L1 hub yalnız iki çalışma alanı", cards);
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const hubCode = strip(hub);
    const hubMods = strip(src("app/human-design/components/HdHubModules.tsx"));
    const hrefs = [...hubCode.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    ok(hrefs.join("|") === "/human-design/danisanlar|/human-design/bilgi-bankasi" && !hubMods.includes("/human-design/kayitli-haritalar") && !hubMods.includes("adminOnly"), "L2 eski üst şerit / Rapor Oluştur / Kayıtlı Haritalar / Kayıtlı Raporlar kartları kaldırıldı", hrefs);
    const live = [
      "app/human-design/danisanlar/page.tsx",
      "app/human-design/danisanlar/[id]/HdDanisanDetayContent.tsx",
      "app/human-design/danisanlar/components/HdClientListesi.tsx",
      "app/human-design/danisanlar/components/HdAnalysisHistory.tsx",
      "app/human-design/kayitli-haritalar/page.tsx",
      "app/human-design/kayitli-haritalar/[id]/HdHaritaDetayContent.tsx",
      "app/human-design/kayitli-raporlar/components/HdRaporListesi.tsx",
    ].map(src).join("\n").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
    ok(!/href=\{?[`"]\/human-design\/harita-kaydi/.test(live) && !/href=\{?[`"]\/human-design\/rapor-olustur\?clientId/.test(live), "L3 canlı ekranlarda yeni manuel kayıt / Rapor Oluştur bağlantısı yok");
    ok(src("app/human-design/harita-kaydi/page.tsx").includes("Yeni manuel Human Design kaydı artık kullanılmıyor."), "L4 /harita-kaydi deep-link 404 değil, açıklayıcı mesaj");
    let roxyDiff = "x";
    try {
      // AŞAMA 4B: profesyonel Word (lib/human-design/reporting) bilinçli olarak genişletildi →
      // bu koruma Roxy hesabı / motor / harita görünümü dosyalarını kapsar. HdRoxyBodygraph'ta
      // yalnız yükleyicinin export edilmesine izin verilir (aşağıda ayrıca doğrulanır).
      roxyDiff = execSync("git diff --name-only origin/main -- lib/human-design/providers lib/human-design/api/roxyChartService.ts lib/human-design/engine app/human-design/kayitli-haritalar/components/HdComputedChartView.tsx app/human-design/kayitli-haritalar/components/HdChartInfoPanel.tsx app/human-design/kayitli-haritalar/components/HdSystemReadingPanel.tsx", { cwd: ROOT }).toString().trim();
      // HdAutoCalcPanel: owner onaylı yeniden-hesap onayı (10-08) dışında hesap akışı AYNEN korunur.
      const ac = src("app/human-design/danisanlar/components/HdAutoCalcPanel.tsx");
      if (!/const r = await computeRoxyChart\(clientId, state\.location\.id\);/.test(ac) || !/state\.kind === "changed"[\s\S]{0,120}await confirm\(/.test(ac)) roxyDiff += "\nHdAutoCalcPanel: hesap akışı beklenmedik biçimde değişti";
      const bgDiff = execSync("git diff -U0 origin/main -- app/human-design/kayitli-haritalar/components/HdRoxyBodygraph.tsx", { cwd: ROOT }).toString();
      const changed = bgDiff.split("\n").filter((l) => /^[-+](?![-+])/.test(l));
      if (!(changed.length === 0 || (changed.length === 2 && changed.every((l) => /function loadRoxyBodygraph\(\): Promise<void> \{$/.test(l))))) roxyDiff += `\nHdRoxyBodygraph: ${changed.join(" | ")}`;
    } catch {
      roxyDiff = "git-unavailable";
    }
    ok(roxyDiff === "", "L5 Roxy/engine/Word/profesyonel harita/AutoCalc dosyaları DEĞİŞMEDİ", roxyDiff);
    const trJ = JSON.parse(src("messages/tr/clients.detail.json")).clients.detail;
    const enJ = JSON.parse(src("messages/en/clients.detail.json")).clients.detail;
    ok(Object.keys(trJ.hd).sort().join() === Object.keys(enJ.hd).sort().join() && !!trJ.tab.humandesign && !!enJ.tab.humandesign && ["hdProfiles", "hdCharts", "hdReports"].every((k) => trJ.deletePreview.table[k] && enJ.deletePreview.table[k]), "L6 TR/EN metin anahtarları eşit");
    const clientFiles = ["lib/human-design/api/journeyClient.ts", "app/dashboard/clients/[id]/components/HumanDesignTab.tsx", "app/human-design/danisanlar/components/HdJourneyPanel.tsx", "app/human-design/danisanlar/components/HdJourneyClientPicker.tsx", "app/human-design/danisanlar/components/HdClientForm.tsx", "app/human-design/danisanlar/components/HdAnalysisHistory.tsx"].map(src).join("\n");
    ok(!clientFiles.includes("ROXY_API_KEY") && !clientFiles.includes("provider_raw") && !clientFiles.includes("SUPABASE_SERVICE_ROLE"), "L7 istemci dosyalarında anahtar / provider_raw yok");
    ok(!/numerolog|astrolog/i.test(execSync("git diff --name-only origin/main", { cwd: ROOT }).toString()), "L8 Numeroloji/Astroloji dosyası değişmedi");
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }

  console.log(`\n${passed} PASS / ${failed} FAIL`);
  if (failed) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
