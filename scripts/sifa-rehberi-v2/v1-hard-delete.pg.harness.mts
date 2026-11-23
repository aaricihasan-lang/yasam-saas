/**
 * Şifa V1 HARD DELETE şablonunun (docs/sifa-rehberi-v2/v1-silme/03_HARD_DELETE_owner_onayli.sql) DAVRANIŞ testi.
 * Yerel GEÇİCİ PostgreSQL; production envanterinin ŞEKLİ (uzman 35/62/1 · admin 1 · demo 1) sentetik olarak kurulur.
 * ADIM 1/2/3 ve GERİ DÖNÜŞ dosyadan AYNEN alınır. Ağ / production YOK.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/v1-hard-delete.pg.harness.mts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";

const F = readFileSync(path.resolve("docs/sifa-rehberi-v2/v1-silme/03_HARD_DELETE_owner_onayli.sql"), "utf8");
const between = (a: string, b: string) => {
  const i = F.indexOf(a);
  const j = F.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`bölüm bulunamadı: ${a.slice(0, 30)}`);
  return F.slice(i, j + b.length);
};
const STEP1 = between("SELECT jsonb_build_object(\n  'toplam'", ") AS on_izleme;");
const STEP2 = between("DO $hard_delete$", "$hard_delete$;");
const STEP3 = between("SELECT jsonb_build_object(\n  'healing_guides'", ") AS son_kontrol;");
const ROLLBACK_SQL = between("-- BEGIN;\n", "-- COMMIT;").split("\n").map((l) => l.replace(/^-- ?/, "")).join("\n");
const M = (f: string) => readFileSync(path.resolve("supabase/migrations", f), "utf8");

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, x?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${x !== undefined ? ` — ${JSON.stringify(x).slice(0, 220)}` : ""}`);
};

async function fresh(opts: { mixedDemo?: boolean; extraGuide?: boolean } = {}) {
  const port = await new Promise<number>((r) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => r(p));
    });
  });
  const dir = path.join(os.tmpdir(), `v1hd-${process.pid}-${port}`);
  const epg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "x", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  await epg.initialise();
  await epg.start();
  const c = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "x", database: "postgres" });
  await c.connect();
  const q = (s: string, p?: unknown[]) => c.query(s, p);
  await q(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create extension pgcrypto; create schema storage;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    create table public.tenants (id uuid primary key, name text);
    create table public.users (id uuid primary key default gen_random_uuid(), tenant_id uuid, role text, is_super_admin boolean default false, is_demo_account boolean default false);
    create table public.user_sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
    create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid);
    create table public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid);
    create table public.yasam_hafizasi_report_snapshots (id uuid primary key default gen_random_uuid(), source_module text);
    create table public.yasam_hafizasi_index (id uuid primary key default gen_random_uuid(), source_table text);
    create table public.yasam_hafizasi_outbox (id uuid primary key default gen_random_uuid(), source_key text, status text, operation text);
    create table public.admin_library_transfer_batches (id uuid primary key default gen_random_uuid());`);
  const legacy = ["general_summary", "medical_causes", "subconscious_causes", "temperament_causes", "other_causes", "iridology_match", "hand_analysis_match", "cupping_leech", "reflexology", "diet_recommendations", "herbal_methods", "stone_recommendations", "aromatherapy", "meditation", "breathwork", "bioenergy", "massage", "daily_routine", "sleep_routine", "supportive_alternative_methods", "islamic_recommendations"];
  await q(`create table public.healing_guides (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null, category text, symptoms text,
    created_at timestamptz not null default now(), updated_at timestamptz, images jsonb default '[]'::jsonb, related_stones jsonb, related_reflexology jsonb, ${legacy.map((x) => `${x} text`).join(", ")})`);
  for (const f of ["20260520120000_healing_guide_sections.sql", "20260521120000_healing_guide_applications_section.sql", "20261201000000_lock_healing_guide_sections_anon.sql", "20261202000000_healing_guide_sections_faz2_provenance_notes.sql", "20261213000000_healing_guides_transfer_provenance.sql", "20270108000000_sifa_create_healing_guide_with_sections.sql"]) await q(M(f));
  const E = randomUUID(), A = randomUUID(), D = randomUUID();
  await q("insert into public.tenants values ($1,'uzman'),($2,'admin'),($3,'demo')", [E, A, D]);
  await q("insert into public.users (tenant_id, role, is_super_admin, is_demo_account) values ($1,'expert',false,false),($2,'admin',true,false),($3,'expert',false,true)", [E, A, D]);
  if (opts.mixedDemo) await q("insert into public.users (tenant_id, role) values ($1,'expert')", [D]);
  for (let i = 0; i < 35; i++) {
    const n = i < 27 ? 2 : 1; // 27×2 + 8×1 = 62 bölüm
    await q("select public.create_healing_guide_with_sections($1::uuid, $2::jsonb, $3::jsonb, $4::uuid)", [E, JSON.stringify({ name: `uzman ${i}` }), JSON.stringify(Array.from({ length: n }, (_, k) => ({ section_type: "reasons", mode: "genel_ozet", note: `n${k}` }))), i === 0 ? randomUUID() : null]);
  }
  await q("insert into public.healing_guides (tenant_id, name) values ($1,'admin rehberi'),($2,'DEMO rehberi')", [A, D]);
  if (opts.extraGuide) await q("insert into public.healing_guides (tenant_id, name) values ($1,'fazla')", [E]);
  await q("insert into public.clients (tenant_id) values ($1),($2)", [E, D]);
  await q("insert into public.client_stone_photos (tenant_id) values ($1)", [E]);
  await q("insert into storage.objects (bucket_id, name) values ('stone-photos','healing-guides/x/a.png'),('stone-photos','client-stones/y.png')");
  await q("insert into public.yasam_hafizasi_report_snapshots (source_module) values ('sifa_rehberi')");
  await q("insert into public.admin_library_transfer_batches default values");
  return {
    q,
    stop: async () => {
      await c.end();
      await epg.stop();
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch {
        /* Windows EBUSY: geçici klasör sonra temizlenir; test sonucunu etkilemez */
      }
    },
  };
}
const counts = async (q: (s: string) => Promise<pg.QueryResult>) =>
  (await q(`select (select count(*) from public.healing_guides)::int g, (select count(*) from public.healing_guide_sections)::int s,
    (select count(*) from public.healing_guide_create_idempotency)::int i, (select count(*) from pg_namespace where nspname='sifa_v1_silme_yedek')::int yedek`)).rows[0];
const tryQ = async (q: (s: string) => Promise<pg.QueryResult>, sql: string) => {
  try {
    await q(sql);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

try {
  console.log("1) Başarı senaryosu (production envanteri şekli)");
  let db = await fresh();
  ok(JSON.stringify(await counts(db.q)) === JSON.stringify({ g: 37, s: 62, i: 1, yedek: 0 }), "sentetik envanter 37 / 62 / 1", await counts(db.q));
  const p1 = (await db.q(STEP1)).rows[0].on_izleme as { tenantlar: { rehber: number; islem: string }[] };
  ok(p1.tenantlar.filter((t) => t.islem === "SILINECEK").length === 2 && p1.tenantlar.some((t) => t.islem === "KORUNACAK" && t.rehber === 1), "ADIM 1: 2 tenant SILINECEK, demo KORUNACAK", p1.tenantlar.map((t) => [t.rehber, t.islem]));
  let err = await tryQ(db.q, STEP2);
  ok(err === "", "ADIM 2 hatasız tamamlandı", err);
  const p3 = (await db.q(STEP3)).rows[0].son_kontrol;
  ok(p3.healing_guides === 1 && p3.kalan_rehber_demo === true, "ADIM 3: kalan rehber TAM 1 ve demo'ya ait", { g: p3.healing_guides, demo: p3.kalan_rehber_demo });
  ok(p3.healing_guide_sections === 0 && p3.healing_guide_create_idempotency === 0, "CASCADE: 62 bölüm + 1 idempotency silindi");
  ok(p3.yedek.healing_guides === 36 && p3.yedek.healing_guide_sections === 62 && p3.yedek.healing_guide_create_idempotency === 1, "yedek: 36 rehber + 62 bölüm + 1 idempotency", p3.yedek);
  const keep = (await db.q(`select (select count(*) from public.users)::int u, (select count(*) from public.clients)::int c, (select count(*) from public.client_stone_photos)::int cs,
      (select count(*) from storage.objects)::int o, (select count(*) from public.yasam_hafizasi_report_snapshots)::int r, (select count(*) from public.admin_library_transfer_batches)::int a,
      (select name from public.healing_guides) demo`)).rows[0];
  ok(keep.u === 3 && keep.c === 2 && keep.cs === 1 && keep.o === 2 && keep.r === 1 && keep.a === 1 && keep.demo === "DEMO rehberi", "kapsam dışı veri, demo rehberi ve Storage AYNEN", keep);
  const acl = (await db.q(`select has_schema_privilege('anon','sifa_v1_silme_yedek','USAGE') a, has_table_privilege('authenticated','sifa_v1_silme_yedek.yedek_20261122','SELECT') b`)).rows[0];
  ok(!acl.a && !acl.b, "yedek şeması / tablosu tarayıcı rollerine KAPALI", acl);
  err = await tryQ(db.q, STEP2);
  ok(/DUR: toplamlar envanterden farklı/.test(err) && (await counts(db.q)).g === 1, "ikinci çalıştırma DURUR (değişiklik yok)", err.slice(0, 80));
  err = await tryQ(db.q, ROLLBACK_SQL);
  const after = await counts(db.q);
  ok(err === "" && after.g === 37 && after.s === 62 && after.i === 1, "GERİ DÖNÜŞ SQL'i yedekten 37 / 62 / 1'e döndürdü", { err: err.slice(0, 80), after });
  await db.stop();

  console.log("2) Demo tenant'ında demo olmayan hesap → DURUR");
  db = await fresh({ mixedDemo: true });
  err = await tryQ(db.q, STEP2);
  ok(/demo tenantında 1 demo olmayan hesap/.test(err) && JSON.stringify(await counts(db.q)) === JSON.stringify({ g: 37, s: 62, i: 1, yedek: 0 }), "geri alındı: veri aynı, yedek şeması da oluşmadı", err.slice(0, 90));
  await db.stop();

  console.log("3) Envanter değişmiş (fazla rehber) → DURUR");
  db = await fresh({ extraGuide: true });
  err = await tryQ(db.q, STEP2);
  const c3 = await counts(db.q);
  ok(/DUR: toplamlar envanterden farklı/.test(err) && c3.g === 38 && c3.yedek === 0, "geri alındı: 38 rehber aynen, yedek şeması yok", err.slice(0, 90));
  await db.stop();
} catch (e) {
  fail++;
  console.log(String((e as Error).stack ?? e).slice(0, 600));
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
