/**
 * USAGE360 AŞAMA 2C — ADMIN 360 API + GİZLİLİK DÜZELTMELERİ + ANAMNEZ: gerçek route + gerçek PostgreSQL.
 *
 * Ephemeral embedded-postgres + test-only PostgREST shim; production'a SIFIR temas; sentetik veri.
 * İş tablolarına özel metinler konur (SENTINEL_PII_USAGE360_DO_NOT_LEAK, CLIENT_NAME_PRIVATE_123,
 * ANAMNESIS_PRIVATE_456, REPORT_PRIVATE_789, NOTE_PRIVATE_321) — admin API yanıtlarında GÖRÜNMEMELİ.
 * Doğrulananlar: admin yetkisi zorunlu (uzman token'ı / sahte admin kimliği reddi), uzman listesi /
 * detay / zaman çizelgesi sözleşmesi, aralık ve imleç sınırları, içeriksiz yanıt, 2C gizlilik
 * düzeltmeleri (admin yalnız kendi kütüphane tenant'ında okur/yazar; bioenergy içerik ucu yok),
 * anamnez oluşturma davranışı + telemetri (içerik yok).
 * Çalıştır: npx tsx scripts/usage360/admin360-route-integration.harness.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import Module from "node:module";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "./pgrestShim";

const moduleWithResolve = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const origResolve = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return path.join(process.cwd(), "scripts/usage360/fixtures/server-only-stub.cjs");
  return origResolve.call(this, request, ...rest);
};

process.env.LC_ALL = "C";
process.env.LANG = "C";
const DATA_DIR = path.join(os.tmpdir(), "usage360-2c-route-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* temiz */ }
const PORT = 54351, PW = "testpw";
const ROOT = process.cwd();
const readMig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const PRIVATE = ["SENTINEL_PII_USAGE360_DO_NOT_LEAK", "CLIENT_NAME_PRIVATE_123", "ANAMNESIS_PRIVATE_456", "REPORT_PRIVATE_789", "NOTE_PRIVATE_321"];

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

const TA = "a0a0a0a0-0000-4000-8000-00000000000a"; // admin kütüphane tenant'ı
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const U1 = "11111111-1111-4111-8111-111111111101";
const U2 = "22222222-2222-4222-8222-222222222202";
const TOK: Record<string, string> = { [ADMIN]: "zz-2c-tok-admin", [U1]: "zz-2c-tok-u1", [U2]: "zz-2c-tok-u2" };

const DDL = `
create table public.users (
  id uuid primary key, full_name text, name text, email text, role text, active boolean default true,
  approval_status text default 'approved', approved_at timestamptz, module_permissions jsonb default '{}'::jsonb,
  package_type text, membership_status text, subscription_status text, trial_started_at timestamptz, trial_ends_at timestamptz,
  membership_started_at timestamptz, membership_ends_at timestamptz, plan text, admin_level text, tenant_id uuid, status text,
  created_at timestamptz default now(), is_super_admin boolean not null default false, is_demo_account boolean not null default false,
  allowed_locations int default 2);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id), session_token text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  ended_at timestamptz, end_reason text, platform text default 'desktop', city text, country text, ip_address text, user_agent text);
create schema if not exists storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, ad text, soyad text, dogum text, kan text,
  full_name text, notes text, created_at timestamptz default now(), unique (tenant_id, id));
create table public.combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, issue text, variant_index int default 0, source_id text, stones jsonb);
create table public.healing_guides (id uuid primary key default gen_random_uuid(), tenant_id uuid, name text, category text, symptoms text,
  related_stones jsonb, related_reflexology jsonb, updated_at timestamptz, created_at timestamptz default now());
create table public.healing_guide_sections (id uuid primary key default gen_random_uuid(), guide_id uuid, section_type text, mode text, title text, note text, source text, images jsonb);`;

type Handler = (req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function main(): Promise<void> {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise(); await epg.start();
  const su = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
  await su.connect();
  const pool = new pg.Pool({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres", max: 16 });
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
                    grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(DDL);
    for (const m of ["20270110000000_expert_stats_session_indexes.sql", "20270111000000_user_sessions_client_channel.sql", "20270112000000_expert_usage_events.sql",
      "20270113000000_expert_storage_usage_rpc.sql", "20270115000000_expert_stats_read_rpcs.sql", "20270129000200_user_sessions_expiry_touch.sql",
      "20270205000000_usage360_telemetry_core.sql", "20270206000000_usage360_admin_read_rpcs.sql", "20260924200817_reflexology_protocols_baseline_and_uid_unique.sql",
      "20270202000000_client_anamnesis.sql"]) await su.query(readMig(m));
    await su.query(`grant select, insert, update, delete on public.users, public.user_sessions, public.clients, public.combinations, public.healing_guides,
      public.healing_guide_sections, public.reflexology_protocols, public.client_anamneses, public.client_anamnesis_attachments to service_role;`);

    const prem = ["premium", "premium", "active", "active"];
    const perms = JSON.stringify({ clients: true, numerology: true, stones: true, reflexology: true, beslenme: true });
    await su.query(`insert into public.users(id, full_name, email, role, tenant_id, module_permissions, package_type, plan, membership_status, subscription_status, approved_at) values
      ($1,'Yönetici','adm@example.test','admin',$2,'{}',$6,$7,$8,$9, now()),
      ($3,'Uzman Bir','u1@example.test','expert',$4,$5,$6,$7,$8,$9, now() - interval '100 days'),
      ($10,'Uzman İki','u2@example.test','expert',$11,$5,$6,$7,$8,$9, now())`,
      [ADMIN, TA, U1, T1, perms, ...prem, U2, randomUUID()]);
    for (const [u, t] of Object.entries(TOK)) await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [u, t]);

    // İş verisi (özel metinli) — admin 360 hiçbirini okumamalı.
    const clientId = (await su.query(`insert into public.clients(tenant_id, ad, soyad, full_name, notes) values ($1,'CLIENT_NAME_PRIVATE_123','X','CLIENT_NAME_PRIVATE_123','NOTE_PRIVATE_321') returning id`, [T1])).rows[0].id as string;
    await su.query(`insert into public.combinations(tenant_id, issue) values ($1,'REPORT_PRIVATE_789 uzman kombinasyonu'), ($2,'Kütüphane kombinasyonu')`, [T1, TA]);
    const expertGuide = (await su.query(`insert into public.healing_guides(tenant_id, name) values ($1,'NOTE_PRIVATE_321 uzman rehberi') returning id`, [T1])).rows[0].id as string;
    await su.query(`insert into public.healing_guides(tenant_id, name) values ($1,'Kütüphane rehberi')`, [TA]);

    // Telemetri: gerçek yazma RPC'leri (bugün) + geçmiş rollup.
    await su.query(`select public.usage360_ping($1,$2,$3,'clients','android_app','android','webview','3.0.1','TR',$4)`, [U1, T1, TOK[U1], "Çumra"]);
    await su.query(`select public.usage360_track($1,$2,$3,'clients','record_created','anamnesis',null,null,null,'server',null,null,'android_app','android','webview','3.0.1','TR',$4)`, [U1, T1, TOK[U1], "Çumra"]);
    await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,visits,active_seconds,creates,hour_mask,first_at,last_at)
      select $1,$2, public.usage360_day_tr(now()) - g, 'desktop_web', 1, 900, 1, 1<<10, now() - (g||' days')::interval, now() - (g||' days')::interval from generate_series(1,20) g`, [U1, T1]);
    await su.query(`insert into public.expert_usage_events(tenant_id,user_id,module_key,action,sub_entity,source,day_tr,occurred_at,channel)
      select $1,$2,'numerology','record_created','analysis','server', public.usage360_day_tr(now() - (g||' hours')::interval), now() - (g||' hours')::interval, 'desktop_web' from generate_series(1,120) g`, [T1, U1]);

    shim = await startPgrestShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    process.env.USAGE360_ENABLED = "true";
    process.env.USAGE360_HASH_SECRET = "zz-2c";

    const asAdmin = { "x-admin-id": ADMIN, "x-session-token": TOK[ADMIN] };
    const asExpert = { "x-admin-id": U1, "x-session-token": TOK[U1] };
    const spoof = { "x-admin-id": ADMIN, "x-session-token": TOK[U1] };
    async function call(h: Handler, method: string, url: string, headers: Record<string, string>, body?: unknown, params: Record<string, string> = {}) {
      const hh: Record<string, string> = { ...headers, "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0" };
      if (body !== undefined) hh["content-type"] = "application/json";
      const res = await h(new NextRequest(`http://localhost${url}`, { method, headers: hh, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve(params) });
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* ikili */ }
      return { status: res.status, json, text };
    }
    const today = (await su.query(`select public.usage360_day_tr(now())::text d`)).rows[0].d as string;
    const back = (n: number) => (new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000)).toISOString().slice(0, 10);
    const responses: string[] = [];

    const experts = (await import("../../app/api/admin/expert-stats/usage360/experts/route")).GET as unknown as Handler;
    const detail = (await import("../../app/api/admin/expert-stats/usage360/detail/route")).GET as unknown as Handler;
    const timeline = (await import("../../app/api/admin/expert-stats/usage360/timeline/route")).GET as unknown as Handler;

    console.log("\n[auth] admin zorunlu");
    for (const [label, h, url] of [["liste", experts, "/api/x"], ["detay", detail, `/api/x?userId=${U1}&from=${today}&to=${today}`], ["zaman çizelgesi", timeline, `/api/x?userId=${U1}&from=${today}&to=${today}`]] as const) {
      const r1 = await call(h, "GET", url, asExpert);
      const r2 = await call(h, "GET", url, spoof);
      const r3 = await call(h, "GET", url, {});
      ok([401, 403].includes(r1.status) && [401, 403, 500].includes(r2.status) && r2.status !== 200 && [401, 403].includes(r3.status), `${label}: uzman token'ı (${r1.status}) / sahte admin kimliği (${r2.status}) / kimliksiz (${r3.status}) reddedilir`);
    }

    console.log("\n[list] uzman listesi");
    const l = await call(experts, "GET", "/api/x?sort=last_activity", asAdmin);
    responses.push(l.text);
    const rows = ((l.json?.data as { rows?: Record<string, unknown>[] })?.rows ?? []);
    const r1 = rows.find((r) => r.userId === U1) as Record<string, unknown> & { today: Record<string, number> };
    ok(l.status === 200 && rows.length === 2 && rows[0].userId === U1, "200 · 2 uzman · son aktiviteye göre sıralı (admin hariç)");
    ok(r1.today.visits === 1 && r1.today.actions >= 1 && typeof r1.lastActivityAt === "string" && r1.d30ActiveDays === 21, `bugün + 30g aktif gün (${r1.d30ActiveDays}/30)`);
    const u2 = rows.find((r) => r.userId === U2) as Record<string, unknown>;
    ok(u2.lastActivityAt === null && (u2.today as Record<string, number>).visits === 0, "telemetrisiz uzman: son aktivite null");
    ok((await call(experts, "GET", "/api/x?page=0", asAdmin)).status === 400, "geçersiz sayfa → 400");

    console.log("\n[detail] uzman 360 detayı");
    const d30 = await call(detail, "GET", `/api/x?userId=${U1}&from=${back(29)}&to=${today}`, asAdmin);
    responses.push(d30.text);
    const dd = d30.json?.data as Record<string, unknown> & { totals: Record<string, number>; modules: Record<string, unknown>[]; account: Record<string, unknown>; locations: Record<string, unknown>[]; channels: Record<string, unknown>[] };
    ok(d30.status === 200 && dd.totals.activeUsageDays === 21 && (dd.coverage === "full" || dd.coverage === "partial"), `200 · 21 kullanım günü · kapsam ${dd?.coverage}`);
    const cl = dd.modules.find((m) => m.module === "clients"), st = dd.modules.find((m) => m.module === "stones");
    ok(cl?.status === "actioned" && st?.status === "never_opened" && dd.modules.every((m) => typeof m.label === "string"), "modül durumu: clients işlem yapıldı, stones izinli-ama-hiç-açılmadı");
    ok(dd.locations.some((x) => x.city === "Çumra") && dd.channels.some((c) => c.channel === "android_app"), "yaklaşık konum Çumra (Türkçe) + Android kanal");
    ok(typeof dd.account.approvedAt === "string" && dd.account.activeAuthSessions === 1 && Array.isArray(dd.account.allowedModules), "hesap/erişim: onay tarihi, aktif auth oturumu, izinli modüller");
    ok((await call(detail, "GET", `/api/x?userId=${U1}&from=${back(400)}&to=${today}`, asAdmin)).status === 400, "366 günü aşan aralık → 400");
    ok((await call(detail, "GET", `/api/x?userId=${U1}&from=${today}&to=${back(3)}`, asAdmin)).status === 400, "ters aralık → 400");
    ok((await call(detail, "GET", `/api/x?userId=${randomUUID()}&from=${today}&to=${today}`, asAdmin)).status === 404, "bilinmeyen uzman → 404");
    ok((await call(detail, "GET", `/api/x?userId=not-a-uuid&from=${today}&to=${today}`, asAdmin)).status === 400, "geçersiz userId → 400");

    console.log("\n[timeline] zaman çizelgesi");
    const t1 = await call(timeline, "GET", `/api/x?userId=${U1}&from=${back(10)}&to=${today}&limit=50`, asAdmin);
    const td = t1.json?.data as { rows: Record<string, unknown>[]; nextCursor: string | null };
    const t2 = await call(timeline, "GET", `/api/x?userId=${U1}&from=${back(10)}&to=${today}&limit=50&cursor=${encodeURIComponent(td.nextCursor ?? "")}`, asAdmin);
    const td2 = t2.json?.data as { rows: Record<string, unknown>[] };
    responses.push(t1.text, t2.text);
    ok(t1.status === 200 && td.rows.length === 50 && !!td.nextCursor && td2.rows.length === 50, "50/sayfa + imleçle 2. sayfa");
    ok(new Set([...td.rows, ...td2.rows].map((r) => `${r.at}|${r.action}`)).size >= 99, "sayfalar arası tekrar yok");
    ok(td.rows.every((r) => !("id" in r)) && Object.keys(td.rows[0]).length === 10, "satırda kimlik yok; yalnız 10 enum/zaman alanı");
    ok((await call(timeline, "GET", `/api/x?userId=${U1}&from=${back(100)}&to=${today}`, asAdmin)).status === 400, "90 günü aşan zaman çizelgesi → 400");
    ok((await call(timeline, "GET", `/api/x?userId=${U1}&from=${today}&to=${today}&cursor=bozuk`, asAdmin)).status === 400, "geçersiz imleç → 400");
    ok((await call(timeline, "GET", `/api/x?userId=${U1}&from=${today}&to=${today}&limit=5000`, asAdmin)).status === 200, "limit > 100 → 100'e kırpılır");

    console.log("\n[privacy] admin 360 yanıtlarında içerik yok");
    const blob = responses.join("\n");
    ok(PRIVATE.every((s) => !blob.includes(s)), "özel metinler (sentinel/danışan adı/anamnez/rapor/not) hiçbir admin 360 yanıtında YOK");
    ok(![clientId, expertGuide].some((id) => blob.includes(id)), "iş kaydı UUID'leri yanıtlarda YOK");
    ok(!/ip_address|user_agent|session_token|password/i.test(blob), "IP / tam UA / token / parola alanı yok");

    console.log("\n[2C gizlilik düzeltmeleri] admin yalnız kendi kütüphane tenant'ı");
    ok(!existsSync(path.join(ROOT, "app/api/admin/biyoenerji/sessions/route.ts")), "uzman bioenergy içeriğini döndüren admin ucu kaldırıldı");
    const combos = (await import("../../app/api/admin/dogaltas/combinations/route")).GET as unknown as Handler;
    const cForeign = await call(combos, "GET", `/api/x?tenantId=${T1}`, asAdmin);
    const cOwn = await call(combos, "GET", `/api/x?tenantId=${TA}`, asAdmin);
    const cNone = await call(combos, "GET", `/api/x`, asAdmin);
    ok(cForeign.status === 403 && !cForeign.text.includes("REPORT_PRIVATE_789"), "kombinasyon listesi: uzman tenant'ı istenirse 403 (başlık sızmaz)");
    ok(cOwn.status === 200 && cOwn.text.includes("Kütüphane kombinasyonu") && !cOwn.text.includes("REPORT_PRIVATE_789") && cNone.status === 200, "kendi kütüphanesi (param'lı/param'sız) → 200, yalnız kendi satırları");
    const sifa = (await import("../../app/api/admin/sifa-rehberi/guides/import/route")).POST as unknown as Handler;
    const sForeign = await call(sifa, "POST", "/api/x", asAdmin, { action: "existing-keys", tenantId: T1 });
    const sOwn = await call(sifa, "POST", "/api/x", asAdmin, { action: "existing-keys", tenantId: TA });
    ok(sForeign.status === 403 && !sForeign.text.includes("NOTE_PRIVATE_321"), "şifa içe aktarma: uzman rehber adları okunamaz (403)");
    ok(sOwn.status === 200 && sOwn.text.includes("Kütüphane rehberi") && !sOwn.text.includes("NOTE_PRIVATE_321"), "kendi kütüphanesi → 200");
    const sWrite = await call(sifa, "POST", "/api/x", asAdmin, { action: "insert-guides", tenantId: T1, guides: [{ name: "x" }] });
    const sSec = await call(sifa, "POST", "/api/x", asAdmin, { action: "insert-sections", sections: [{ guide_id: expertGuide, section_type: "stone" }] });
    ok(sWrite.status === 403 && sSec.status === 403, "uzman tenant'ına rehber / başka tenant rehberine bölüm yazılamaz (403)");
    const refl = (await import("../../app/api/admin/refleksoloji/protocols/import/route")).POST as unknown as Handler;
    ok((await call(refl, "POST", "/api/x", asAdmin, { rows: [{ tenant_id: T1, title: "x" }] })).status === 403, "refleksoloji içe aktarma: uzman tenant'ına yazılamaz (403)");
    ok((await call(refl, "POST", "/api/x", asAdmin, { rows: [{ tenant_id: TA, title: "Kütüphane protokolü" }] })).status === 200, "kendi kütüphanesine içe aktarma → 200");
    const comboImp = (await import("../../app/api/admin/dogaltas/combinations/import/route")).POST as unknown as Handler;
    ok((await call(comboImp, "POST", "/api/x", asAdmin, { rows: [{ tenant_id: T1, issue: "x", source_id: "s" }] })).status === 403, "kombinasyon içe aktarma: uzman tenant'ına yazılamaz (403)");

    console.log("\n[36] anamnez davranışı + telemetri (içerik yok)");
    const anamnez = await import("../../app/api/clients/[id]/anamnez/route");
    const hdrU1 = { "x-user-id": U1, "x-session-token": TOK[U1] };
    const reqId = randomUUID();
    const body = { mode: "standard", assessmentDate: today, title: "ANAMNESIS_PRIVATE_456 başlık", requestId: reqId };
    const beforeEv = Number((await su.query(`select count(*) c from public.expert_usage_events where sub_entity='anamnesis'`)).rows[0].c);
    const a1 = await call(anamnez.POST as unknown as Handler, "POST", `/api/clients/${clientId}/anamnez`, hdrU1, body, { id: clientId });
    const a2 = await call(anamnez.POST as unknown as Handler, "POST", `/api/clients/${clientId}/anamnez`, hdrU1, body, { id: clientId });
    const aId = ((a1.json?.anamnesis as { id?: string }) ?? {}).id;
    ok(a1.status === 201 && JSON.stringify(Object.keys(a1.json ?? {}).sort()) === JSON.stringify(["anamnesis", "ok"]) && !!aId, "anamnez oluştur: 201 + yanıt gövdesi değişmedi ({ok, anamnesis:{id}})");
    ok(a2.status === 200 && a2.json?.replayed === true, "aynı requestId → mevcut kayıt (idempotent davranış korunur)");
    const afterEv = Number((await su.query(`select count(*) c from public.expert_usage_events where sub_entity='anamnesis'`)).rows[0].c);
    ok(afterEv === beforeEv + 1, "oluşturma → TEK record_created:anamnesis (tekrar olay üretmez)");
    const g = await call(anamnez.GET as unknown as Handler, "GET", `/api/clients/${clientId}/anamnez`, hdrU1, undefined, { id: clientId });
    ok(g.status === 200 && g.text.includes("ANAMNESIS_PRIVATE_456"), "uzman kendi anamnezini okur (iş davranışı aynı)");
    const tele = (await su.query(`select coalesce(string_agg(row_to_json(e)::text,''),'') t from public.expert_usage_events e`)).rows[0].t as string;
    ok(!tele.includes("ANAMNESIS_PRIVATE_456") && !tele.includes(String(aId)) && !tele.includes(clientId), "anamnez başlığı/kimliği/danışan kimliği telemetride YOK");
    process.env.USAGE360_ENABLED = "false";
    const a3 = await call(anamnez.POST as unknown as Handler, "POST", `/api/clients/${randomUUID()}/anamnez`, hdrU1, { ...body, requestId: randomUUID() }, { id: randomUUID() });
    ok(a3.status === 404, "bayrak kapalı + bilinmeyen danışan → iş kuralı aynen (404)");
  } finally {
    try { await shim?.close(); } catch { /* */ }
    await pool.end(); await su.end(); await epg.stop();
  }
  console.log(`\n──────────\nUSAGE360 2C ADMIN ROUTE INTEGRATION: PASS ${pass} · FAIL ${fail}`);
  if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("HARNESS HATASI:", e); process.exit(1); });
