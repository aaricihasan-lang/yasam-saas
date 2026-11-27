/**
 * Şifa Rehberi F3 — SAYAÇ DOĞRULUĞU: gerçek route + gerçek PostgreSQL (ağ / sır / production YOK).
 *
 * Owner kararı (26.11.2026): Şifa Rehberi tamamen kişisel kütüphane. Sayaç = kişinin ÇÖPTE OLMAYAN
 * ANA konuları (ekranda "Araştırma Kütüphanem"de görünenler). V1 healing_guides artık sayılmaz.
 *   - GET /api/dashboard/summary           (ana ekran; oturum uzmanı)
 *   - GET /api/admin/expert-stats/modules  (Yönetim paneli; hedef uzman)
 * Gerçek V2 core + görsel yaşam döngüsü + F3 migration'ları; Şifa verisi GERÇEK kayıt servisiyle
 * (saveChangeset) yazılır; route'lar test-only PostgREST shim'i üzerinden `SET ROLE service_role` ile okur
 * (grant'lar gerçekten sınanır). Kullanıcı/oturum/usage altyapısı Usage360 2C harness'iyle AYNI
 * (DDL o dosyadan okunur, migration listesi aynı).
 *
 * Çalıştır: npx tsx scripts/sifa-rehberi-f3/counters.pg.mts   (FAIL → exit 1)
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import Module from "node:module";
import { readFileSync, rmSync } from "node:fs";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../usage360/pgrestShim";
import { loadWorkspace, saveChangeset, type Scope } from "@/lib/sifa-rehberi-v2/server/service";
import { pgDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";

const moduleWithResolve = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const origResolve = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return path.join(process.cwd(), "scripts/usage360/fixtures/server-only-stub.cjs");
  return origResolve.call(this, request, ...rest);
};

let pass = 0;
let fail = 0;
function ok(cond: unknown, label: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`); }
}
const section = (n: string) => console.log(`\n${n}`);

const ROOT = process.cwd();
const MIG = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
// Usage360 2C harness'inin kullanıcı/oturum/iş tablosu DDL'i — aynı ortam (kopya değil, kaynaktan okunur).
const U360 = readFileSync(path.join(ROOT, "scripts/usage360/admin360-route-integration.harness.ts"), "utf8");
const DDL = /const DDL = `([\s\S]*?)`;/.exec(U360)?.[1];
if (!DDL) throw new Error("Usage360 DDL bulunamadı");
const U360_MIGS = ["20270110000000_expert_stats_session_indexes.sql", "20270111000000_user_sessions_client_channel.sql", "20270112000000_expert_usage_events.sql",
  "20270113000000_expert_storage_usage_rpc.sql", "20270115000000_expert_stats_read_rpcs.sql", "20270129000200_user_sessions_expiry_touch.sql",
  "20270205000000_usage360_telemetry_core.sql", "20270206000000_usage360_admin_read_rpcs.sql"];

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const TA = "a0a0a0a0-0000-4000-8000-00000000000a";
const U1: Scope = { tenantId: T1, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const U2: Scope = { tenantId: T1, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const U3: Scope = { tenantId: T2, userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
const TOK: Record<string, string> = { [ADMIN]: "zz-f3-tok-admin", [U1.userId]: "zz-f3-tok-u1", [U2.userId]: "zz-f3-tok-u2", [U3.userId]: "zz-f3-tok-u3" };
const id = () => crypto.randomUUID();
const topic = (o: Record<string, unknown>) => ({ parent_id: null, sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...o });
const para = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

const PORT = await new Promise<number>((res) => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => { const { port } = srv.address() as net.AddressInfo; srv.close(() => res(port)); });
});
const DATA_DIR = path.join(os.tmpdir(), `sifa-f3-counters-${process.pid}`);
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* temiz */ }
const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: "testpw", port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
await epg.initialise();
await epg.start();
const su = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
await su.connect();
const pool = new pg.Pool({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres", max: 12 });
const db = pgDb(su);
let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;

/** Bir uzmanın kişisel kütüphanesine kayıt servisiyle (gerçek SQL) yazar. */
async function save(s: Scope, body: Record<string, unknown>) {
  const r = await saveChangeset(db, s, { topics: [], blocks: [], links_add: [], links_remove: [], ...body });
  if (!r.ok) throw new Error(`kayıt reddedildi: ${r.status} ${r.code} ${r.error}`);
}
/** Ana konu + hazır başlık (grup + konu) + kendi alt başlığı + not → kök dışı düğümler sayılmamalı. */
async function mainTopic(s: Scope, title: string, sort: string): Promise<string> {
  const root = id(), grp = id(), konu = id(), own = id();
  await save(s, {
    topics: [
      topic({ id: root, title, sort_key: sort }),
      topic({ id: grp, parent_id: root, title: "Belirtiler / Sebepler", template_key: "grup:belirtiler", sort_key: "a" }),
      topic({ id: konu, parent_id: grp, title: "Tıbbi Nedenler", template_key: "konu:tibbi", sort_key: "a" }),
      topic({ id: own, parent_id: root, title: "Kendi başlığım", sort_key: "b" }),
    ],
    blocks: [{ id: id(), topic_id: own, title: "Not", content_json: para("metin"), content_text: "metin", classification: null, sort_key: "m", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }],
  });
  return root;
}
/** Ana konuyu (ve altını) çöpe atar — ekrandaki çöpe atma ile aynı küme. */
async function trash(s: Scope, rootId: string) {
  const rows = (await su.query(
    `with recursive t as (select * from public.sifa_topics where id = $1 union all select c.* from public.sifa_topics c join t on c.parent_id = t.id) select * from t`, [rootId])).rows;
  const bt = id();
  await save(s, { topics: rows.map((r) => topic({ id: r.id, parent_id: r.parent_id, title: r.title, sort_key: r.sort_key, template_key: r.template_key, base_version: r.version, deleted_at: new Date().toISOString(), delete_batch_id: bt })) });
}
async function restore(s: Scope, rootId: string) {
  const rows = (await su.query(
    `with recursive t as (select * from public.sifa_topics where id = $1 union all select c.* from public.sifa_topics c join t on c.parent_id = t.id) select * from t`, [rootId])).rows;
  await save(s, { topics: rows.map((r) => topic({ id: r.id, parent_id: r.parent_id, title: r.title, sort_key: r.sort_key, template_key: r.template_key, base_version: r.version })) });
}
/** Ekranın gördüğü ana konu sayısı (sifa_v2_load → kök, çöpte değil). */
async function screenCount(s: Scope): Promise<number> {
  const r = await loadWorkspace(db, s, s.userId);
  if (!r.ok) throw new Error(r.error);
  return r.value.nodes.filter((n) => n.parentId === null && !n.deletedAt).length;
}

type Handler = (req: NextRequest) => Promise<Response>;
async function call(h: Handler, url: string, headers: Record<string, string>) {
  const res = await h(new NextRequest(`http://localhost${url}`, { headers: { ...headers, "user-agent": "Mozilla/5.0 Chrome/129.0" } }));
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

try {
  section("A) Kurulum (gerçek migration'lar)");
  await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
                  grant usage on schema public to anon, authenticated, service_role;`);
  await su.query(DDL);
  await su.query(`alter table public.users add column if not exists trial_kind text, add column if not exists trial_status text;`);
  for (const m of U360_MIGS) await su.query(MIG(m));
  for (const m of ["20280110000000_sifa_rehberi_v2_core.sql", "20280124000000_sifa_v2_asset_lifecycle.sql", "20280130000200_sifa_rehberi_f3.sql"]) await su.query(MIG(m));
  // Diğer sayaçların kaynak tabloları (asgari şema) — DEĞİŞMEDİKLERİ kanıtlansın.
  await su.query(`create table public.stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, stone_name text, created_at timestamptz default now());
    create table public.dogaltas_inventory (id uuid primary key default gen_random_uuid(), tenant_id uuid, created_at timestamptz default now());
    create table public.personal_archives (id uuid primary key default gen_random_uuid(), tenant_id uuid, title text, created_at timestamptz default now());
    grant select, insert, update, delete on public.users, public.user_sessions, public.clients, public.healing_guides, public.stones,
      public.dogaltas_inventory, public.personal_archives to service_role;`);
  ok(true, "V2 core + LC + F3 + Usage360 migration'ları kuruldu");
  const priv = (await su.query(`select has_table_privilege('service_role','public.sifa_topics','SELECT') s, has_table_privilege('service_role','public.sifa_topics','UPDATE') u,
    has_table_privilege('anon','public.sifa_topics','SELECT') a`)).rows[0];
  ok(priv.s === true && priv.u === false && priv.a === false, "sayaç okuması mevcut yetkiyle: service_role SELECT var; UPDATE yok; tarayıcı rolü yok (yetki DEĞİŞMEDİ)", priv);

  const perms = JSON.stringify({ stones: true, sifa_rehberi: true, personal_archive: true, clients: true });
  const noSifa = JSON.stringify({ stones: true, sifa_rehberi: false, personal_archive: true });
  await su.query(`insert into public.users(id, full_name, email, role, tenant_id, module_permissions, package_type, plan, membership_status, subscription_status, approved_at) values
    ($1,'Yönetici','zz-adm@example.test','admin',$2,'{}','premium','premium','active','active', now()),
    ($3,'ZZ Uzman Bir','zz-u1@example.test','expert',$4,$7,'premium','premium','active','active', now()),
    ($5,'ZZ Uzman İki','zz-u2@example.test','expert',$4,$7,'premium','premium','active','active', now()),
    ($6,'ZZ Uzman Üç','zz-u3@example.test','expert',$8,$9,'premium','premium','active','active', now())`,
  [ADMIN, TA, U1.userId, T1, U2.userId, U3.userId, perms, T2, noSifa]);
  for (const [u, t] of Object.entries(TOK)) await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [u, t]);

  section("B) Veri (gerçek kayıt servisi)");
  const u1Roots: string[] = [];
  for (const [i, t] of ["Akciğer", "Migren", "Bronşit", "Eklem", "Uyku"].entries()) u1Roots.push(await mainTopic(U1, t, `${i + 1}m`));
  await trash(U1, u1Roots[3]); // Eklem → çöpte
  await trash(U1, u1Roots[4]); // Uyku → çöpe → geri
  await restore(U1, u1Roots[4]);
  await mainTopic(U2, "Astım", "1m");
  await mainTopic(U2, "Sinüzit", "2m");
  await mainTopic(U3, "Gastrit", "1m");
  // Kurum kaydı (eski V2 aktarım yolu) — kişisel sayaca girmemeli.
  await su.query("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, '[]'::jsonb)", [T1, JSON.stringify({ topics: [topic({ id: id(), title: "Kurum kaydı" })], blocks: [] })]);
  // V1 kayıtları — artık ekranda yok; sayılmamalı.
  await su.query(`insert into public.healing_guides(tenant_id, name) select $1, 'V1 test ' || g from generate_series(1,6) g`, [T1]);
  for (const sql of [
    "insert into public.stones(tenant_id, stone_name) select $1, 'Taş ' || g from generate_series(1,7) g",
    "insert into public.dogaltas_inventory(tenant_id) select $1 from generate_series(1,4)",
    "insert into public.personal_archives(tenant_id, title) select $1, 'Arşiv ' || g from generate_series(1,2) g",
    "insert into public.clients(tenant_id, ad, full_name) values ($1, 'ZZ', 'ZZ Danışan')",
  ]) await su.query(sql, [T1]);
  const raw = (await su.query(`select count(*) filter (where owner_key = $1) u1_tum, count(*) filter (where owner_key = $1 and parent_id is null) u1_kok,
     count(*) filter (where scope = 'kurum') kurum from public.sifa_topics`, [U1.userId])).rows[0];
  ok(Number(raw.u1_tum) === 20 && Number(raw.u1_kok) === 5 && Number(raw.kurum) >= 1, "U1: 5 ana konu (1 çöpte, 1 çöpten geri) + hazır/alt başlıklar; T1 kurum kaydı; 6 V1 kaydı", raw);
  const exp = { u1: await screenCount(U1), u2: await screenCount(U2), u3: await screenCount(U3) };
  ok(exp.u1 === 4 && exp.u2 === 2 && exp.u3 === 1, "ekranın gördüğü ana konu sayısı (sifa_v2_load): U1=4, U2=2, U3=1", exp);

  shim = await startPgrestShim(pool);
  process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "zz-test-publishable";
  const summary = (await import("../../app/api/dashboard/summary/route")).GET as unknown as Handler;
  const modules = (await import("../../app/api/admin/expert-stats/modules/route")).GET as unknown as Handler;
  const asUser = (s: Scope) => ({ "x-user-id": s.userId, "x-session-token": TOK[s.userId] });

  section("C) Ana ekran sayacı — /api/dashboard/summary");
  const d1 = await call(summary, "/api/dashboard/summary", asUser(U1));
  const c1 = (d1.json?.counts ?? {}) as Record<string, number | null>;
  ok(d1.status === 200 && c1.sifa_rehberi === exp.u1, `U1: Şifa = ekrandaki ana konu sayısı (${exp.u1}); çöpteki sayılmaz, çöpten geri dönen sayılır`, c1);
  ok(c1.sifa_rehberi !== 6 && c1.sifa_rehberi !== Number(raw.u1_tum), "V1 kayıtları (6) ve hazır/alt başlıklar sayılmaz");
  const d2 = await call(summary, "/api/dashboard/summary", asUser(U2));
  ok((d2.json?.counts as Record<string, number>)?.sifa_rehberi === exp.u2, `U2 (aynı kurum): yalnız KENDİ ana konuları (${exp.u2}); U1'inkiler ve kurum kaydı sayılmaz`, d2.json?.counts);
  const d3 = await call(summary, "/api/dashboard/summary", asUser(U3));
  ok((d3.json?.counts as Record<string, number | null>)?.sifa_rehberi === null, "U3: Şifa izni yok → null (izin kapısı korunur)", d3.json?.counts);
  ok(c1.stones === 7 && c1.stok === 4 && c1.digital_content === 2, "diğer sayaçlar DEĞİŞMEDİ (taş 7, stok 4, arşiv 2 — kurum bazlı)", c1);
  const spoof = await call(summary, "/api/dashboard/summary?tenant_id=" + T2, { "x-user-id": U2.userId, "x-session-token": TOK[U1.userId] });
  ok(spoof.status === 403, "başkasının oturumuyla istek → 403 (oturum bağı korunur)", spoof.status);

  section("D) Yönetim paneli sayacı — /api/admin/expert-stats/modules");
  const asAdmin = { "x-admin-id": ADMIN, "x-session-token": TOK[ADMIN] };
  const sifaRow = async (s: Scope) => {
    const r = await call(modules, `/api/admin/expert-stats/modules?userId=${s.userId}`, asAdmin);
    const rows = ((r.json?.data as Record<string, unknown>)?.modules ?? []) as Array<Record<string, unknown>>;
    return { status: r.status, sifa: rows.find((m) => m.key === "sifa_rehberi"), clients: rows.find((m) => m.key === "clients") };
  };
  const m1 = await sifaRow(U1);
  const v = (x: unknown) => (x as { value?: unknown; status?: string } | undefined);
  ok(m1.status === 200 && v(m1.sifa?.existingRecordCount)?.value === exp.u1 && v(m1.sifa?.existingRecordCount)?.status === "derived", `U1: mevcut kayıt = ${exp.u1} (kişisel ana konu)`, m1.sifa?.existingRecordCount);
  const m2 = await sifaRow(U2);
  ok(v(m2.sifa?.existingRecordCount)?.value === exp.u2, `U2: mevcut kayıt = ${exp.u2} (aynı kurumdaki U1 sayılmaz)`, m2.sifa?.existingRecordCount);
  const m3 = await sifaRow(U3);
  ok(v(m3.sifa?.existingRecordCount)?.value === exp.u3, `U3 (başka kurum): mevcut kayıt = ${exp.u3}`, m3.sifa?.existingRecordCount);
  ok(v(m1.clients?.existingRecordCount)?.value === 1 && v(m2.clients?.existingRecordCount)?.value === 1, "diğer modül sayacı DEĞİŞMEDİ (danışan: kurum bazlı 1)", [m1.clients?.existingRecordCount, m2.clients?.existingRecordCount]);
  const deny = await call(modules, `/api/admin/expert-stats/modules?userId=${U1.userId}`, { "x-admin-id": U1.userId, "x-session-token": TOK[U1.userId] });
  ok(deny.status === 401 || deny.status === 403, "uzman token'ı yönetim paneli sayacını okuyamaz", deny.status);

  section("E) Canlı değişim");
  await trash(U1, u1Roots[0]);
  const after = (await call(summary, "/api/dashboard/summary", asUser(U1))).json?.counts as Record<string, number>;
  const afterAdmin = v((await sifaRow(U1)).sifa?.existingRecordCount)?.value;
  ok(after?.sifa_rehberi === exp.u1 - 1 && afterAdmin === exp.u1 - 1 && (await screenCount(U1)) === exp.u1 - 1, "ana konu çöpe atılınca iki sayaç ve ekran birlikte 1 azalır", { after: after?.sifa_rehberi, afterAdmin });
  const noRaw = JSON.stringify([d1.json, m1]);
  ok(!/Akciğer|Migren|Belirtiler/.test(noRaw), "yanıtlarda Şifa içerik/başlık metni yok (yalnız sayı)");
} catch (e) {
  fail++;
  console.log(`  ✗ BEKLENMEYEN: ${(e as Error).stack ?? e}`);
} finally {
  await shim?.close?.();
  await pool.end().catch(() => {});
  await su.end().catch(() => {});
  await epg.stop().catch(() => {});
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* temiz */ }
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
