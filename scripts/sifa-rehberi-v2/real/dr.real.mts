/**
 * 12. aşama — FELAKET KURTARMA provası (kaynak: test projesi, SALT-OKUNUR pg_dump; hedef: yerel GEÇİCİ PostgreSQL).
 * Belgelenen sıra (docs/sifa-rehberi-v2/felaket-kurtarma.md):
 *   1 roller + eklentiler → 2 YH çekirdek migration'ları → 3 V2 çekirdek migration'ı → 4 YH sahiplik migration'ı
 *   → 5 YALNIZ-VERİ geri yükleme (tetikleyiciler kapalı) → 6 doğrulama (özet, FK, tetikleyici, yetki/RLS)
 *   → 7 YH indeks mutabakatı (aktivasyon + yh_sifa_v2_replay_enqueue). Storage nesneleri: backup-files.real.ts.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/dr.real.mts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { connectTestDb, loadTestTarget, pgConfig, redact } from "./guard";

/** pg_dump / pg_restore (PostgreSQL 17+). SIFA_V2_PGBIN verilmezse PATH'teki araçlar kullanılır. */
const PGBIN = process.env.SIFA_V2_PGBIN ?? "";
const pgTool = (n: string) => (PGBIN ? path.join(PGBIN, process.platform === "win32" ? `${n}.exe` : n) : n);
const TABLES = ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets", "sifa_legacy_import_map"];
const YH_CORE = ["20260710000000_yasam_hafizasi_index.sql", "20260712000000_yasam_hafizasi_lexical_infra.sql", "20260724000000_yh_search_candidates_rpc.sql", "20260815000000_yasam_hafizasi_outbox.sql", "20260901000000_yasam_hafizasi_reconcile_enqueue.sql", "20260927000000_yh_source_activation_control.sql"];
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 260)}` : ""}`);
};
async function digest(c: pg.Client) {
  await c.query("SET TimeZone = 'UTC'");
  const o: Record<string, string> = {};
  for (const t of TABLES) {
    const r = await c.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.${t} x`);
    o[t] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  return o;
}

const T = loadTestTarget();
const cfg = pgConfig(T);
const src = await connectTestDb();
const work = mkdtempSync(path.join(os.tmpdir(), "sifa-v2-dr-"));
const dump = path.join(work, "data.dump");
let epg: EmbeddedPostgres | null = null;
let dst: pg.Client | null = null;
try {
  console.log("0) Kaynak (test projesi) — salt-okunur özet + YALNIZ-VERİ pg_dump");
  await src.query("BEGIN READ ONLY");
  const before = await digest(src);
  await src.query("ROLLBACK");
  const args = ["-h", String(cfg.host), "-p", String(cfg.port), "-U", String(cfg.user), "-d", "postgres", "-Fc", "--data-only", "-f", dump];
  for (const t of [...TABLES, "users", "tenants"]) args.push("-t", `public.${t}`);
  execFileSync(pgTool("pg_dump"), args, { env: { ...process.env, PGPASSWORD: T.dbPassword, PGSSLMODE: "require" }, stdio: ["ignore", "ignore", "pipe"] });
  ok(true, "yalnız-veri dökümü alındı (V2 tabloları + kullanıcı/tenant kimlik tabloları)");

  console.log("1-4) Hedef: roller + eklentiler → YH çekirdeği → V2 çekirdeği → YH sahiplik (migration'lardan)");
  const port = await new Promise<number>((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => res(p));
    });
  });
  epg = new EmbeddedPostgres({ databaseDir: path.join(work, "pg"), user: "postgres", password: "x", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  await epg.initialise();
  await epg.start();
  dst = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "x", database: "postgres" });
  await dst.connect();
  await dst.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema extensions; create extension unaccent with schema extensions; create extension pgcrypto;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    create table public.tenants (id uuid primary key, name text);
    create table public.users (id uuid primary key, full_name text, name text, email text, role text, active boolean default false, approval_status text default 'pending',
      module_permissions jsonb default '{}'::jsonb, package_type text, membership_status text, subscription_status text, trial_started_at timestamptz, trial_ends_at timestamptz,
      membership_started_at timestamptz, membership_ends_at timestamptz, plan text, admin_level text, tenant_id uuid, status text, created_at timestamptz default now(),
      is_super_admin boolean not null default false, is_demo_account boolean not null default false, trial_kind text, trial_status text, allowed_locations integer);
    create table public.stone_exclusions (tenant_id text, stone_id uuid);`);
  for (const f of YH_CORE) await dst.query(readFileSync(path.resolve("supabase/migrations", f), "utf8"));
  await dst.query(readFileSync(path.resolve("supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql"), "utf8"));
  await dst.query(readFileSync(path.resolve("supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql"), "utf8"));
  ok(true, "şema migration'lardan kuruldu (YH çekirdeği 6 + V2 çekirdeği + YH sahiplik)");

  console.log("5) Yalnız-veri geri yükleme (tetikleyiciler kapalı → geri yükleme YH kuyruğunu doldurmaz)");
  try {
    execFileSync(pgTool("pg_restore"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "--data-only", "--disable-triggers", "--exit-on-error", dump], { env: { ...process.env, PGPASSWORD: "x" }, stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    throw new Error(`pg_restore: ${String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 500)}`);
  }
  const after = await digest(dst);
  for (const t of TABLES) ok(after[t] === before[t], `${t}: satır + md5 birebir`, after[t].split(":")[0] + " satır");
  ok(Number((await dst.query("select count(*)::int n from public.yasam_hafizasi_outbox")).rows[0].n) === 0, "geri yükleme sırasında YH kuyruğuna olay düşmedi (tetikleyiciler kapalıydı)");

  console.log("6) Bütünlük + tetikleyici + yetki/RLS");
  const fk = (await dst.query(`select count(*)::int n from pg_constraint c join pg_class t on t.oid = c.conrelid where t.relname like 'sifa_%' and c.contype = 'f' and c.convalidated`)).rows[0].n;
  ok(fk === 6, "6 bileşik FK geçerli", fk);
  const orphan = (await dst.query(`select (select count(*) from public.sifa_topic_blocks b where not exists (select 1 from public.sifa_topics t where t.id = b.topic_id and t.owner_key = b.owner_key))::int b`)).rows[0].b;
  ok(orphan === 0, "yetim kutu yok", orphan);
  const trg = (await dst.query("select string_agg(tgname, ',' order by tgname) s from pg_trigger where not tgisinternal and tgrelid::regclass::text like '%sifa_%'")).rows[0].s;
  ok(/yh_cdc_sifa_v2_blocks_delete_trg/.test(trg) && /yh_cdc_sifa_v2_blocks_upsert_trg/.test(trg) && /yh_cdc_sifa_v2_topic_trash_trg/.test(trg) && /sifa_topics_guard_tree_trg/.test(trg), "V2 + YH tetikleyicileri yerinde", trg);
  const priv = (await dst.query(`select bool_and(not has_table_privilege('anon', c.oid, 'SELECT') and not has_table_privilege('authenticated', c.oid, 'SELECT')) tarayici_yok,
      bool_and(not has_table_privilege('service_role', c.oid, 'UPDATE') and not has_table_privilege('service_role', c.oid, 'DELETE')) svc_yazma_yok,
      bool_and(c.relrowsecurity) rls from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'sifa_%' and c.relkind = 'r'`)).rows[0];
  ok(priv.tarayici_yok && priv.svc_yazma_yok && priv.rls, "yetki/RLS: tarayıcı rolleri yok, service_role UPDATE/DELETE yok, RLS açık", priv);

  console.log("7) YH indeks mutabakatı (aktivasyon + replay → kuyruk; worker gerçek ortamda indeksler)");
  await dst.query("insert into public.yh_source_activation (source_key, is_active) values ('sifa_rehberi_v2:notes', true)");
  const tenants = (await dst.query("select distinct tenant_id from public.sifa_topic_blocks where scope = 'kisisel'")).rows.map((r) => r.tenant_id);
  let enq = 0;
  for (const t of tenants) enq += Number((await dst.query("select public.yh_sifa_v2_replay_enqueue($1) n", [t])).rows[0].n);
  const kisisel = Number((await dst.query("select count(*)::int n from public.sifa_topic_blocks where scope = 'kisisel'")).rows[0].n);
  const ob = Number((await dst.query("select count(*)::int n from public.yasam_hafizasi_outbox where source_key = 'sifa_rehberi_v2:notes'")).rows[0].n);
  ok(enq === kisisel && ob === kisisel, "replay: her kişisel kutu için TEK kuyruk olayı (kurum kutusu yok)", { enq, kisisel, ob });
} catch (e) {
  fail++;
  console.log(`  ✗ ${redact((e as Error).message)}`);
} finally {
  await src.end().catch(() => {});
  await dst?.end().catch(() => {});
  await epg?.stop().catch(() => {});
  rmSync(work, { recursive: true, force: true });
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
